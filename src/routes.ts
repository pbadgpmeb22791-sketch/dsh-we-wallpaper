/**
 * dsh-we-wallpaper HTTP routes — the browser half talks to the host through
 * plain same-origin endpoints:
 *
 *   GET  /api/we-wallpaper/list          — wallpaper library (id/title/type/source)
 *   GET  /api/we-wallpaper/state         — persisted selection + options
 *   POST /api/we-wallpaper/state         — persist selection + options
 *   GET  /api/we-wallpaper/preview/<id>  — the local wallpaper preview image
 *   GET  /api/we-wallpaper/hd/<id>       — the Steam workshop HD preview (cached)
 *   GET  /api/we-wallpaper/media/<id>    — the main media file (video/image/audio)
 *   GET  /api/we-wallpaper/web/<id>/<path> — static files of a web wallpaper
 *
 * The selection persists in `~/.dsh/we-wallpaper.json` (src/state.ts).
 * Every route rejects cross-site requests (Sec-Fetch-Site / Origin fence) so
 * a malicious webpage cannot probe local files through a localhost CSRF
 * request; ids are resolved against the scan map (never used as raw paths)
 * and web-file paths are traversal-guarded.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { resolveHdPreview } from './steam-preview.ts'
import { readState, writeState } from './state.ts'
import {
  discoverWeInstall,
  scanWallpapers,
  type WallpaperEntry,
  type WeInstall,
} from './we-scanner.ts'

/** Browser-facing base path of the plugin API. */
export const WE_API_PREFIX = '/api/we-wallpaper'

/** Common preview fallback names when project.json names none (or a missing file). */
const PREVIEW_FALLBACKS = ['preview.jpg', 'preview.png', 'preview.gif', 'preview.webp', 'preview.jpeg']

/** Extension -> content type. */
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pkg': 'application/octet-stream',
  '.mpkg': 'application/octet-stream',
  '.exe': 'application/octet-stream',
}

/** Content type for a file path. */
export function mimeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** The cached scan result (invalidated by install/workshop mtime changes). */
interface ScanResult {
  install: WeInstall | null
  wallpapers: WallpaperEntry[]
  byId: Map<string, WallpaperEntry>
}

let scanCache: { key: string; result: ScanResult } | null = null

/** Fingerprint of everything the scan reads (mtimeMs of the roots). */
function scanKey(install: WeInstall | null): string {
  if (install === null) return 'none'
  const parts = [install.root]
  for (const dir of [...install.workshops, install.projects.myprojects, install.projects.defaultprojects]) {
    const stat = statSync(dir, { throwIfNoEntry: false })
    parts.push(`${dir}:${stat?.mtimeMs ?? -1}`)
  }
  return parts.join('|')
}

/** Scan with a mtime-keyed cache; never throws (WE absent = empty library). */
export function loadScan(): ScanResult {
  const install = discoverWeInstall()
  const key = scanKey(install)
  if (scanCache !== null && scanCache.key === key) return scanCache.result
  const wallpapers = install !== null ? scanWallpapers(install) : []
  const byId = new Map<string, WallpaperEntry>()
  for (const wallpaper of wallpapers) byId.set(wallpaper.id, wallpaper)
  const result: ScanResult = { install, wallpapers, byId }
  scanCache = { key, result }
  return result
}

// --- http helpers --------------------------------------------------------

/** One JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require GET/HEAD (plus an optional extra method) or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, extra?: string): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === extra) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Same-origin fence (ported from the skin-center route family). */
function isSameOriginRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const host = req.headers.host
    if (typeof host !== 'string' || host === '') return false
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/** Reject cross-site requests with 403. */
function requireSameOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (isSameOriginRequest(req)) return true
  json(res, 403, { ok: false, error: 'cross-site-request-rejected' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolveBody({})
        return
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

/** Decode the id path segment; null when it is not a plain segment. */
function decodeIdSegment(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded === '' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

/**
 * Resolve a web-wallpaper request path inside its wallpaper dir. Returns the
 * absolute target file when every segment stays inside `base` (defaulting to
 * index.html), null on traversal.
 * @param base - the wallpaper dir (absolute).
 * @param segments - decoded path segments after the wallpaper id.
 */
export function resolveWebTarget(base: string, segments: string[]): string | null {
  const resolvedBase = resolve(base)
  const target = resolve(join(resolvedBase, ...(segments.length > 0 ? segments : ['index.html'])))
  if (target !== resolvedBase && !target.startsWith(resolvedBase + sep)) return null
  return target
}

/**
 * Stream a local file with single-range support (video seeking needs it).
 * @param req - the request (Range header read when present).
 * @param res - the response.
 * @param abs - absolute file path.
 * @param cacheControl - cache directive (default no-cache).
 */
function serveFile(req: IncomingMessage, res: ServerResponse, abs: string, cacheControl = 'no-cache'): void {
  const stat = statSync(abs, { throwIfNoEntry: false })
  if (stat === undefined || !stat.isFile()) {
    json(res, 404, { ok: false, error: 'file-not-found' })
    return
  }
  const total = stat.size
  const headers: Record<string, string> = {
    'content-type': mimeFor(abs),
    'accept-ranges': 'bytes',
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'content-length': String(total) })
    res.end()
    return
  }
  const range = req.headers.range
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match !== null) {
      let start = match[1] === '' ? undefined : Number(match[1])
      let end = match[2] === '' ? undefined : Number(match[2])
      if (start === undefined && end !== undefined) {
        // Suffix range: last N bytes.
        start = Math.max(0, total - end)
        end = total - 1
      } else {
        start = start ?? 0
        end = end === undefined ? total - 1 : Math.min(end, total - 1)
      }
      if (start > end || start >= total) {
        res.writeHead(416, { 'content-range': `bytes */${total}` })
        res.end()
        return
      }
      res.writeHead(206, {
        ...headers,
        'content-range': `bytes ${start}-${end}/${total}`,
        'content-length': String(end - start + 1),
      })
      createReadStream(abs, { start, end }).pipe(res)
      return
    }
  }
  res.writeHead(200, { ...headers, 'content-length': String(total) })
  createReadStream(abs).pipe(res)
}

// --- routes --------------------------------------------------------------

/** A GET route wrapping one handler, fenced to same-origin requests. */
function getRoute(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req, res) => {
      if (!requireMethod(req, res)) return
      if (!requireSameOrigin(req, res)) return
      handler(req, res)
    },
  }
}

/** Resolve one wallpaper id to its entry; answers 404 when unknown. */
function resolveEntry(req: IncomingMessage, res: ServerResponse, rawId: string): WallpaperEntry | null {
  const id = decodeIdSegment(rawId)
  if (id === null) {
    json(res, 400, { ok: false, error: 'invalid-wallpaper-id' })
    return null
  }
  const entry = loadScan().byId.get(id)
  if (entry === undefined) {
    json(res, 404, { ok: false, error: 'wallpaper-not-found' })
    return null
  }
  return entry
}

/** Resolve the preview file of an entry (project.json preview or fallbacks). */
function previewFileOf(entry: WallpaperEntry): string | null {
  const candidates = entry.preview !== '' ? [entry.preview, ...PREVIEW_FALLBACKS] : PREVIEW_FALLBACKS
  for (const name of candidates) {
    if (name.includes('/') || name.includes('\\')) continue
    const abs = join(entry.dir, name)
    if (existsSync(abs)) return abs
  }
  return null
}

/**
 * Build the route family.
 * @returns the WebRoute list (register each with ctx.webServer).
 */
export function makeWeWallpaperRoutes(): WebRoute[] {
  return [
    // --- persisted state (selection + options) ---------------------------
    // One route handles GET/HEAD (read) and POST (write) — the webserver
    // forbids two registrations of the same (kind, path), so a single
    // handler dispatches on the method.
    {
      kind: 'exact',
      path: `${WE_API_PREFIX}/state`,
      handler: (req, res) => {
        if (!requireMethod(req, res, 'POST')) return Promise.resolve()
        if (!requireSameOrigin(req, res)) return Promise.resolve()
        if (req.method === 'GET' || req.method === 'HEAD') {
          const body = JSON.stringify({ ok: true, state: readState() })
          if (req.method === 'HEAD') {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end()
          } else {
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': String(Buffer.byteLength(body)),
            })
            res.end(body)
          }
          return Promise.resolve()
        }
        return readJsonBody(req).then(
          (body) => {
            const next = writeState(body)
            json(res, 200, { ok: true, state: next })
          },
          (error) => {
            json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          },
        )
      },
    },

    // --- library ---------------------------------------------------------
    getRoute(`${WE_API_PREFIX}/list`, (_req, res) => {
      const { install, wallpapers } = loadScan()
      json(res, 200, {
        ok: true,
        found: install !== null,
        root: install?.root ?? null,
        count: wallpapers.length,
        wallpapers: wallpapers.map((entry) => ({
          id: entry.id,
          title: entry.title,
          type: entry.type,
          source: entry.source,
          workshopId: entry.workshopId,
          activeOnDesktop: entry.activeOnDesktop,
        })),
      })
    }),

    // --- preview image ---------------------------------------------------
    {
      kind: 'prefix',
      path: `${WE_API_PREFIX}/preview`,
      handler: (req, res) => {
        if (!requireMethod(req, res)) return
        if (!requireSameOrigin(req, res)) return
        const rawId = req.url?.slice(`${WE_API_PREFIX}/preview/`.length).split('?')[0] ?? ''
        const entry = resolveEntry(req, res, rawId)
        if (entry === null) return
        const file = previewFileOf(entry)
        if (file === null) {
          json(res, 404, { ok: false, error: 'preview-not-found' })
          return
        }
        serveFile(req, res, file, 'public, max-age=300')
      },
    },

    // --- main media file (video/image/audio) -----------------------------
    {
      kind: 'prefix',
      path: `${WE_API_PREFIX}/media`,
      handler: (req, res) => {
        if (!requireMethod(req, res)) return
        if (!requireSameOrigin(req, res)) return
        const rawId = req.url?.slice(`${WE_API_PREFIX}/media/`.length).split('?')[0] ?? ''
        const entry = resolveEntry(req, res, rawId)
        if (entry === null) return
        if (entry.file === '' || entry.file.includes('/') || entry.file.includes('\\')) {
          json(res, 400, { ok: false, error: 'wallpaper-has-no-media-file' })
          return
        }
        const abs = join(entry.dir, entry.file)
        if (!existsSync(abs)) {
          json(res, 404, { ok: false, error: 'media-file-not-found' })
          return
        }
        serveFile(req, res, abs)
      },
    },

    // --- Steam workshop HD preview (scene wallpapers) ---------------------
    {
      kind: 'prefix',
      path: `${WE_API_PREFIX}/hd`,
      handler: async (req, res) => {
        if (!requireMethod(req, res)) return
        if (!requireSameOrigin(req, res)) return
        const rawId = req.url?.slice(`${WE_API_PREFIX}/hd/`.length).split('?')[0] ?? ''
        const entry = resolveEntry(req, res, rawId)
        if (entry === null) return
        // Only workshop items have a Steam community page.
        if (entry.workshopId === null) {
          json(res, 404, { ok: false, error: 'no-workshop-preview' })
          return
        }
        const preview = await resolveHdPreview(entry.workshopId)
        if (preview === null || !existsSync(preview.file)) {
          json(res, 404, { ok: false, error: 'hd-preview-unavailable' })
          return
        }
        const mime = preview.kind === 'video' ? 'video/mp4' : mimeFor(preview.file)
        res.writeHead(200, {
          'content-type': mime,
          'content-length': String(statSync(preview.file).size),
          'cache-control': 'public, max-age=2592000',
          'x-we-preview-kind': preview.kind,
        })
        createReadStream(preview.file).pipe(res)
      },
    },

    // --- web wallpaper static files --------------------------------------
    {
      kind: 'prefix',
      path: `${WE_API_PREFIX}/web`,
      handler: (req, res) => {
        if (!requireMethod(req, res)) return
        if (!requireSameOrigin(req, res)) return
        const rest = req.url?.slice(`${WE_API_PREFIX}/web/`.length).split('?')[0] ?? ''
        const [rawId, ...rawSegments] = rest.split('/')
        const entry = resolveEntry(req, res, rawId)
        if (entry === null) return
        const segments: string[] = []
        for (const raw of rawSegments) {
          if (raw === '') continue
          try {
            const decoded = decodeURIComponent(raw)
            if (decoded.includes('\0')) throw new Error('nul')
            segments.push(decoded)
          } catch {
            json(res, 400, { ok: false, error: 'invalid-path' })
            return
          }
        }
        // Traversal guard: the resolved path must stay inside the wallpaper dir.
        const target = resolveWebTarget(entry.dir, segments)
        if (target === null) {
          json(res, 403, { ok: false, error: 'path-outside-wallpaper' })
          return
        }
        if (!existsSync(target)) {
          json(res, 404, { ok: false, error: 'file-not-found' })
          return
        }
        serveFile(req, res, target)
      },
    },
  ]
}
