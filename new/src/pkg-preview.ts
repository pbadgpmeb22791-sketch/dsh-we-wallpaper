/**
 * Safe scene.pkg background extraction and cache. Resolution order:
 * scene graph -> optional user-installed RePKG -> built-in heuristic.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import {
  extractBackgroundWithDiagnostics,
  findSceneBackgroundTextures,
  parsePackage,
  type BackgroundExtraction,
  type BackgroundImage,
} from './pkg-tex.ts'

const CACHE_DIR_NAME = 'we-wallpaper-cache'
const CACHE_VERSION = 2
const MAX_PKG_BYTES = 1024 * 1024 * 1024
const MAX_EXTRACTED_IMAGE_BYTES = 256 * 1024 * 1024
const REPKG_TIMEOUT_MS = 30_000

export type SceneMode = 'animated-first' | 'static-hd'
export type PreviewSource = 'scene-graph' | 'repkg' | 'heuristic'

export interface CacheMeta {
  version: number
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
  at: number
  pkgMtimeMs: number
  pkgSize: number
  sceneMode: SceneMode
  source: PreviewSource
  selectedTex: string | null
  packageMagic: string | null
  fallbackReason: string | null
}

export interface PkgPreview {
  file: string
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
  source: PreviewSource
  selectedTex: string | null
  packageMagic: string | null
  fallbackReason: string | null
  cacheHit: boolean
}

export interface PkgPreviewResolution {
  preview: PkgPreview | null
  diagnostics: {
    workshopId: string
    pkgFound: boolean
    pkgPath: string | null
    pkgSize: number | null
    pkgMtimeMs: number | null
    repkgConfigured: boolean
    repkgUsable: boolean
    source: PreviewSource | null
    selectedTex: string | null
    packageMagic: string | null
    fallbackReason: string | null
    cacheHit: boolean
  }
}

type SpawnResult = { status: number | null; error?: Error }
export type RePkgSpawn = (command: string, args: string[], options: {
  encoding: 'utf8'
  windowsHide: boolean
  timeout: number
  maxBuffer: number
}) => SpawnResult

export function cacheDir(home: string = ''): string {
  const base = home !== '' ? home : (process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  return join(base, CACHE_DIR_NAME)
}

export function cachedFilePath(workshopId: string, home: string = ''): string {
  return join(cacheDir(home), workshopId)
}

function cachedMetaPath(workshopId: string, home: string = ''): string {
  return join(cacheDir(home), `${workshopId}.json`)
}

export function readCacheMeta(workshopId: string, home: string = ''): CacheMeta | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(cachedMetaPath(workshopId, home), 'utf8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const record = raw as Record<string, unknown>
    if (record.version !== CACHE_VERSION) return null
    const mime = record.mime === 'image/jpeg' ? 'image/jpeg' : record.mime === 'image/png' ? 'image/png' : null
    const source = record.source === 'scene-graph' || record.source === 'repkg' || record.source === 'heuristic'
      ? record.source
      : null
    const sceneMode = record.sceneMode === 'static-hd' || record.sceneMode === 'animated-first'
      ? record.sceneMode
      : null
    if (mime === null || source === null || sceneMode === null) return null
    const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0
    return {
      version: CACHE_VERSION,
      mime,
      width: number(record.width),
      height: number(record.height),
      at: number(record.at),
      pkgMtimeMs: number(record.pkgMtimeMs),
      pkgSize: number(record.pkgSize),
      sceneMode,
      source,
      selectedTex: typeof record.selectedTex === 'string' ? record.selectedTex : null,
      packageMagic: typeof record.packageMagic === 'string' ? record.packageMagic : null,
      fallbackReason: typeof record.fallbackReason === 'string' ? record.fallbackReason : null,
    }
  } catch {
    return null
  }
}

export function findScenePkg(workshopId: string, workshopDirs: string[], _home: string = ''): string | null {
  if (!/^\d+$/.test(workshopId)) return null
  for (const dir of workshopDirs) {
    const candidate = join(dir, workshopId, 'scene.pkg')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function imageInfo(bytes: Uint8Array, extension: string): Pick<BackgroundImage, 'mime' | 'width' | 'height'> | null {
  if (extension === '.png' && bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) }
  }
  if ((extension === '.jpg' || extension === '.jpeg') && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) { pos++; continue }
      const marker = bytes[pos + 1]
      const length = (bytes[pos + 2] << 8) | bytes[pos + 3]
      if (length < 2 || pos + 2 + length > bytes.length) break
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          mime: 'image/jpeg',
          height: (bytes[pos + 5] << 8) | bytes[pos + 6],
          width: (bytes[pos + 7] << 8) | bytes[pos + 8],
        }
      }
      pos += 2 + length
    }
  }
  return null
}

function listImageFiles(dir: string): string[] {
  const out: string[] = []
  const visit = (current: string, depth: number): void => {
    if (depth > 3 || out.length >= 4096) return
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const abs = join(current, entry.name)
      if (entry.isDirectory()) visit(abs, depth + 1)
      else if (['.png', '.jpg', '.jpeg'].includes(extname(entry.name).toLowerCase())) out.push(abs)
      if (out.length >= 4096) return
    }
  }
  visit(dir, 0)
  return out
}

function baseTextureName(value: string): string {
  return basename(value.replace(/\\/g, '/')).replace(/\.(tex|png|jpe?g)$/i, '').toLowerCase()
}

function isUsableRePkg(value: string): boolean {
  if (value === '' || !isAbsolute(value)) return false
  try { return statSync(value, { throwIfNoEntry: false })?.isFile() === true } catch { return false }
}

export function runRePkgExtractor(
  repkgPath: string,
  pkgPath: string,
  outputDir: string,
  preferredTex: string | null,
  spawnImpl: RePkgSpawn = spawnSync as unknown as RePkgSpawn,
): { image: BackgroundImage | null; selectedTex: string | null; reason: string | null } {
  const executable = repkgPath.trim()
  if (executable === '') return { image: null, selectedTex: null, reason: 'repkg-not-configured' }
  if (!isAbsolute(executable)) return { image: null, selectedTex: null, reason: 'repkg-path-not-absolute' }
  if (!isUsableRePkg(executable)) {
    return { image: null, selectedTex: null, reason: 'repkg-executable-not-found' }
  }
  mkdirSync(outputDir, { recursive: true })
  let result: SpawnResult
  try {
    result = spawnImpl(executable, [
      'extract', '-e', 'tex', '-s', '-o', outputDir, '--overwrite', pkgPath,
    ], {
      encoding: 'utf8', windowsHide: true, timeout: REPKG_TIMEOUT_MS, maxBuffer: 1024 * 1024,
    })
  } catch {
    return { image: null, selectedTex: null, reason: 'repkg-launch-failed' }
  }
  if (result.error?.message.toLowerCase().includes('timeout')) {
    return { image: null, selectedTex: null, reason: 'repkg-timeout' }
  }
  if (result.error !== undefined || result.status !== 0) {
    return { image: null, selectedTex: null, reason: 'repkg-extract-failed' }
  }

  const preferredName = preferredTex === null ? null : baseTextureName(preferredTex)
  let best: { file: string; info: Pick<BackgroundImage, 'mime' | 'width' | 'height'>; score: number } | null = null
  for (const file of listImageFiles(outputDir)) {
    const stat = statSync(file, { throwIfNoEntry: false })
    if (stat === undefined || !stat.isFile() || stat.size <= 0 || stat.size > MAX_EXTRACTED_IMAGE_BYTES) continue
    let bytes: Uint8Array
    try { bytes = readFileSync(file) } catch { continue }
    const info = imageInfo(bytes, extname(file).toLowerCase())
    if (info === null || info.width <= 0 || info.height <= 0) continue
    const exact = preferredName !== null && baseTextureName(file) === preferredName
    const ratio = info.width / info.height
    const aspectScore = Math.max(0, 1 - Math.abs(ratio - 16 / 9) / 1.2)
    const score = (exact ? Number.MAX_SAFE_INTEGER / 2 : 0) + info.width * info.height * aspectScore
    if (best === null || score > best.score) best = { file, info, score }
  }
  if (best === null) return { image: null, selectedTex: null, reason: 'repkg-produced-no-image' }
  return {
    image: { bytes: readFileSync(best.file), mime: best.info.mime, width: best.info.width, height: best.info.height },
    selectedTex: preferredTex ?? basename(best.file),
    reason: null,
  }
}

function previewFromMeta(workshopId: string, meta: CacheMeta, home: string, cacheHit: boolean): PkgPreview {
  return {
    file: cachedFilePath(workshopId, home), mime: meta.mime, width: meta.width, height: meta.height,
    source: meta.source, selectedTex: meta.selectedTex, packageMagic: meta.packageMagic,
    fallbackReason: meta.fallbackReason, cacheHit,
  }
}

export function resolvePkgPreviewDetailed(workshopId: string, workshopDirs: string[], opts: {
  home?: string
  now?: number
  sceneMode?: SceneMode
  repkgPath?: string
  spawnImpl?: RePkgSpawn
} = {}): PkgPreviewResolution {
  const home = opts.home ?? ''
  const now = opts.now ?? Date.now()
  const sceneMode = opts.sceneMode ?? 'static-hd'
  const repkgPath = opts.repkgPath?.trim() ?? ''
  const pkgPath = findScenePkg(workshopId, workshopDirs, home)
  const baseDiagnostics: PkgPreviewResolution['diagnostics'] = {
    workshopId, pkgFound: pkgPath !== null, pkgPath, pkgSize: null, pkgMtimeMs: null,
    repkgConfigured: repkgPath !== '',
    repkgUsable: isUsableRePkg(repkgPath),
    source: null, selectedTex: null, packageMagic: null,
    fallbackReason: pkgPath === null ? 'scene-package-not-found' : null, cacheHit: false,
  }
  if (pkgPath === null) return { preview: null, diagnostics: baseDiagnostics }
  const pkgStat = statSync(pkgPath, { throwIfNoEntry: false })
  if (pkgStat === undefined || !pkgStat.isFile() || pkgStat.size <= 0 || pkgStat.size > MAX_PKG_BYTES) {
    return { preview: null, diagnostics: { ...baseDiagnostics, fallbackReason: 'scene-package-size-invalid' } }
  }
  baseDiagnostics.pkgSize = pkgStat.size
  baseDiagnostics.pkgMtimeMs = pkgStat.mtimeMs

  const meta = readCacheMeta(workshopId, home)
  const file = cachedFilePath(workshopId, home)
  if (meta !== null && existsSync(file) && meta.pkgMtimeMs === pkgStat.mtimeMs
    && meta.pkgSize === pkgStat.size && meta.sceneMode === sceneMode) {
    const preview = previewFromMeta(workshopId, meta, home, true)
    return {
      preview,
      diagnostics: {
        ...baseDiagnostics, source: preview.source, selectedTex: preview.selectedTex,
        packageMagic: preview.packageMagic, fallbackReason: preview.fallbackReason, cacheHit: true,
      },
    }
  }

  let buf: Uint8Array
  try { buf = readFileSync(pkgPath) } catch {
    return { preview: null, diagnostics: { ...baseDiagnostics, fallbackReason: 'scene-package-read-failed' } }
  }
  const pkg = parsePackage(buf)
  if (pkg === null) {
    return { preview: null, diagnostics: { ...baseDiagnostics, fallbackReason: 'scene-package-unsupported' } }
  }
  let extraction: BackgroundExtraction | null = extractBackgroundWithDiagnostics(buf, { heuristic: false })
  let source: PreviewSource | null = extraction?.source ?? null
  let selectedTex = extraction?.selectedTex ?? findSceneBackgroundTextures(buf, pkg)[0] ?? null
  let fallbackReason: string | null = extraction === null ? 'scene-graph-texture-unavailable' : null
  let image: BackgroundImage | null = extraction

  const repkgTmp = join(cacheDir(home), `.repkg-${workshopId}-${process.pid}-${now}`)
  if (image === null) {
    try {
      const repkg = runRePkgExtractor(repkgPath, pkgPath, repkgTmp, selectedTex, opts.spawnImpl)
      if (repkg.image !== null) {
        image = repkg.image
        source = 'repkg'
        selectedTex = repkg.selectedTex ?? selectedTex
      } else {
        fallbackReason = `${fallbackReason};${repkg.reason ?? 'repkg-failed'}`
      }
    } finally {
      try { rmSync(repkgTmp, { recursive: true, force: true }) } catch { /* created temp only */ }
    }
  }

  if (image === null) {
    extraction = extractBackgroundWithDiagnostics(buf)
    if (extraction !== null) {
      image = extraction
      source = extraction.source
      selectedTex = extraction.selectedTex
      fallbackReason = `${fallbackReason};heuristic-fallback`
    }
  }
  if (image === null || source === null) {
    return {
      preview: null,
      diagnostics: {
        ...baseDiagnostics, packageMagic: pkg.magic, selectedTex,
        fallbackReason: `${fallbackReason};no-decodable-background`,
      },
    }
  }

  const nextMeta: CacheMeta = {
    version: CACHE_VERSION, mime: image.mime, width: image.width, height: image.height, at: now,
    pkgMtimeMs: pkgStat.mtimeMs, pkgSize: pkgStat.size, sceneMode, source, selectedTex,
    packageMagic: pkg.magic, fallbackReason,
  }
  try {
    const dir = cacheDir(home)
    mkdirSync(dir, { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, image.bytes)
    renameSync(tmp, file)
    writeFileSync(cachedMetaPath(workshopId, home), JSON.stringify(nextMeta), 'utf8')
    const preview = previewFromMeta(workshopId, nextMeta, home, false)
    return {
      preview,
      diagnostics: {
        ...baseDiagnostics, source, selectedTex, packageMagic: pkg.magic, fallbackReason, cacheHit: false,
      },
    }
  } catch {
    return { preview: null, diagnostics: { ...baseDiagnostics, fallbackReason: 'cache-write-failed' } }
  }
}

export function resolvePkgPreview(workshopId: string, workshopDirs: string[], opts: {
  home?: string
  now?: number
  sceneMode?: SceneMode
  repkgPath?: string
  spawnImpl?: RePkgSpawn
} = {}): PkgPreview | null {
  return resolvePkgPreviewDetailed(workshopId, workshopDirs, opts).preview
}

export function clearPkgPreview(workshopId: string, home: string = ''): void {
  for (const file of [cachedFilePath(workshopId, home), cachedMetaPath(workshopId, home)]) {
    try { rmSync(file, { force: true }) } catch { /* ignore */ }
  }
}
