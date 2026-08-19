/**
 * Unit tests for the scene.pkg extraction cache (src/pkg-preview.ts):
 * extract-on-miss, cache hit without re-parsing, and graceful failure.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cachedFilePath,
  clearPkgPreview,
  findScenePkg,
  readCacheMeta,
  resolvePkgPreview,
  resolvePkgPreviewDetailed,
  runRePkgExtractor,
} from '../src/pkg-preview.ts'
import { buildPkg, buildTex, rgbaToPngFixture } from './pkg-helpers.ts'

let home: string
let workshopDir: string
const ID = '3000925581'

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-we-wallpaper-pkg-'))
  workshopDir = join(home, 'workshop', 'content', '431960')
  mkdirSync(workshopDir, { recursive: true })
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

/** Write a fake scene wallpaper with an embedded-PNG background texture. */
function writeScenePkg(workshopId = ID): void {
  const png = rgbaToPngFixture(16, 9, new Uint8Array(16 * 9 * 4).fill(128))
  const pkg = buildPkg(buildTex({
    format: 0,
    textureWidth: 16,
    textureHeight: 9,
    imageWidth: 16,
    imageHeight: 9,
    imageFormat: 13, // FIF_PNG
    data: png,
  }), 'materials/background.tex')
  const dir = join(workshopDir, workshopId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'scene.pkg'), pkg)
}

describe('findScenePkg', () => {
  it('locates the package across library folders', () => {
    writeScenePkg('111111')
    expect(findScenePkg('111111', [workshopDir])).toBe(join(workshopDir, '111111', 'scene.pkg'))
    expect(findScenePkg('222222', [workshopDir])).toBeNull()
  })
})

describe('resolvePkgPreview', () => {
  it('extracts on cache miss and serves from cache afterwards', () => {
    writeScenePkg()
    const first = resolvePkgPreview(ID, [workshopDir], { home })
    expect(first).not.toBeNull()
    expect(first?.mime).toBe('image/png')
    expect(first?.width).toBe(16)
    expect(first?.height).toBe(9)
    expect(existsSync(cachedFilePath(ID, home))).toBe(true)
    expect(readCacheMeta(ID, home)).toMatchObject({ mime: 'image/png', width: 16, height: 9 })

    // Cache hit: the unchanged package must not be decoded again.
    const second = resolvePkgPreview(ID, [workshopDir], { home })
    expect(second?.file).toBe(first?.file)
    expect(second?.cacheHit).toBe(true)
  })

  it('returns null when the package is missing or undecodable', () => {
    expect(resolvePkgPreview('999999', [workshopDir], { home })).toBeNull()
    // Corrupt pkg present.
    const dir = join(workshopDir, ID)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'scene.pkg'), 'not a package')
    expect(resolvePkgPreview(ID, [workshopDir], { home })).toBeNull()
  })

  it('clearPkgPreview removes bytes and meta', () => {
    writeScenePkg()
    resolvePkgPreview(ID, [workshopDir], { home })
    clearPkgPreview(ID, home)
    expect(readCacheMeta(ID, home)).toBeNull()
    expect(existsSync(cachedFilePath(ID, home))).toBe(false)
  })

  it('serves the cached bytes verbatim (valid PNG)', () => {
    writeScenePkg()
    const preview = resolvePkgPreview(ID, [workshopDir], { home })
    const bytes = readFileSync(preview!.file)
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50)
  })

  it('reports RePKG missing, failed and timed out without throwing', () => {
    writeScenePkg()
    const pkgPath = join(workshopDir, ID, 'scene.pkg')
    const output = join(home, 'repkg-output')
    expect(runRePkgExtractor('', pkgPath, output, null).reason).toBe('repkg-not-configured')
    expect(runRePkgExtractor(join(home, 'missing.exe'), pkgPath, output, null).reason)
      .toBe('repkg-executable-not-found')

    const fakeExe = join(home, 'RePKG.exe')
    writeFileSync(fakeExe, '')
    expect(runRePkgExtractor(fakeExe, pkgPath, output, null, () => ({ status: 2 })).reason)
      .toBe('repkg-extract-failed')
    expect(runRePkgExtractor(fakeExe, pkgPath, output, null, () => ({
      status: null,
      error: new Error('operation timeout'),
    })).reason).toBe('repkg-timeout')
  })

  it('passes RePKG arguments without a shell and prefers the scene texture name', () => {
    writeScenePkg()
    const pkgPath = join(workshopDir, ID, 'scene.pkg')
    const output = join(home, 'repkg-success')
    const fakeExe = join(home, 'RePKG.exe')
    writeFileSync(fakeExe, '')
    let commandSeen = ''
    let argsSeen: string[] = []
    const result = runRePkgExtractor(fakeExe, pkgPath, output, 'materials/背景.tex', (command, args) => {
      commandSeen = command
      argsSeen = args
      const outputIndex = args.indexOf('-o')
      const outputDir = args[outputIndex + 1]
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(join(outputDir, '背景.png'), rgbaToPngFixture(16, 9, new Uint8Array(16 * 9 * 4)))
      writeFileSync(join(outputDir, 'larger-foreground.png'), rgbaToPngFixture(64, 64, new Uint8Array(64 * 64 * 4)))
      return { status: 0 }
    })
    expect(commandSeen).toBe(fakeExe)
    expect(argsSeen).toEqual(['extract', '-e', 'tex', '-s', '-o', output, '--overwrite', pkgPath])
    expect(result).toMatchObject({ selectedTex: 'materials/背景.tex', reason: null })
    expect(result.image).toMatchObject({ width: 16, height: 9, mime: 'image/png' })
  })

  it('diagnoses the built-in heuristic fallback', () => {
    writeScenePkg()
    const result = resolvePkgPreviewDetailed(ID, [workshopDir], { home, sceneMode: 'animated-first' })
    expect(result.preview?.source).toBe('heuristic')
    expect(result.diagnostics.fallbackReason).toContain('repkg-not-configured')
    expect(result.diagnostics.cacheHit).toBe(false)
  })
})
