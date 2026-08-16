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

    // Cache hit: removing the source package must not break the second read.
    rmSync(join(workshopDir, ID), { recursive: true, force: true })
    const second = resolvePkgPreview(ID, [workshopDir], { home })
    expect(second?.file).toBe(first?.file)
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
})
