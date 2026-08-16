/**
 * Steam workshop HD previews for scene wallpapers. The local preview WE
 * ships is a tiny GIF (often 150-256px, see scripts/survey-pkg.mjs) while
 * the author uploads a full-size preview image to the Steam workshop page.
 *
 * The Steam community API endpoint `GetPublishedFileDetails` answers
 * without an API key (one item per call) and returns the item's `preview_url`
 * — the same asset the workshop page shows. We download it once and cache it
 * under `~/.dsh/we-wallpaper-cache/`, so the browser gets a sharp background
 * for scene wallpapers and the tiny GIF stays as the loading/offline
 * fallback.
 *
 * Everything here is injectable (fetch + cache dir) so the pure logic is
 * unit-testable; network failures degrade to `null` and callers fall back to
 * the local preview.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Cache root dir name under the dsh home. */
const CACHE_DIR_NAME = 'we-wallpaper-cache'

/** A downloaded HD preview. */
export interface HdPreview {
  /** Absolute cached file path. */
  file: string
  /** 'image' | 'video' — derived from the preview URL. */
  kind: 'image' | 'video'
  /** The Steam preview_url. */
  url: string
}

/** Persisted cache meta next to the downloaded bytes. */
interface CacheMeta {
  url: string
  kind: 'image' | 'video'
  fetchedAt: number
}

/** The Steam API endpoint (unauthenticated GetPublishedFileDetails). */
export const STEAM_API_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'

/** Freshness window: re-fetch after 30 days. */
const FRESH_MS = 30 * 24 * 3600 * 1000

/** Max bytes to accept from the preview CDN. */
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024

/** Fetch seam (tests inject a stub). */
export type FetchLike = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status?: number
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
}>

/** Default fetch: the host's global fetch with a hard timeout. */
export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await globalThis.fetch(url, { signal: controller.signal })
  } finally {
    globalThis.clearTimeout(timer)
  }
}

/** The cache dir (DSH_HOME aware, like src/state.ts). */
export function cacheDir(home: string = ''): string {
  const base = home !== '' ? home : (process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  return join(base, CACHE_DIR_NAME)
}

/** The cached file path for one workshop id. */
export function cachedFilePath(workshopId: string, home: string = ''): string {
  return join(cacheDir(home), workshopId)
}

/** The cache meta path for one workshop id. */
function cachedMetaPath(workshopId: string, home: string = ''): string {
  return join(cacheDir(home), `${workshopId}.json`)
}

/** Derive the preview kind from a URL (video URLs end in a video extension). */
export function kindFromUrl(url: string): 'image' | 'video' {
  const path = url.split('?')[0].toLowerCase()
  return /\.(mp4|webm|m4v|mov)$/.test(path) ? 'video' : 'image'
}

/** Read the cached meta; null when absent/corrupt. */
export function readCacheMeta(workshopId: string, home: string = ''): CacheMeta | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(cachedMetaPath(workshopId, home), 'utf8'))
    if (typeof raw !== 'object' || raw === null) return null
    const record = raw as Record<string, unknown>
    if (typeof record.url !== 'string' || record.url === '') return null
    const kind = record.kind === 'video' ? 'video' : 'image'
    const fetchedAt = typeof record.fetchedAt === 'number' ? record.fetchedAt : 0
    return { url: record.url, kind, fetchedAt }
  } catch {
    return null
  }
}

/**
 * Resolve the HD preview for a workshop wallpaper: cached bytes when fresh,
 * else a fetch from the Steam API + preview CDN, then persist. Returns null
 * on any failure (offline, no preview, bad response) — callers fall back to
 * the local preview.
 * @param workshopId - the numeric workshop id.
 * @param opts - injectable fetch / home / clock (tests).
 */
export async function resolveHdPreview(workshopId: string, opts: {
  fetch?: FetchLike
  home?: string
  now?: number
} = {}): Promise<HdPreview | null> {
  const fetchLike: FetchLike = opts.fetch ?? (async (url: string) => fetchWithTimeout(url, 20000))
  const home = opts.home ?? ''
  const now = opts.now ?? Date.now()

  // 1. Fresh cache hit.
  const meta = readCacheMeta(workshopId, home)
  if (meta !== null && now - meta.fetchedAt < FRESH_MS) {
    const file = cachedFilePath(workshopId, home)
    if (existsSync(file)) return { file, kind: meta.kind, url: meta.url }
  }

  // 2. Ask the Steam API for the item's preview URL.
  let previewUrl: string | null = null
  try {
    const response = await fetchLike(STEAM_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `itemcount=1&publishedfileids[0]=${encodeURIComponent(workshopId)}`,
    })
    if (response.ok) {
      const data = (await response.json()) as {
        response?: { publishedfiledetails?: Array<{ preview_url?: unknown }> }
      }
      const url = data.response?.publishedfiledetails?.[0]?.preview_url
      if (typeof url === 'string' && url !== '') previewUrl = url
    }
  } catch {
    // Offline / API failure: fall through to stale-cache or null.
  }

  // 3. Stale cache still beats nothing.
  if (previewUrl === null && meta !== null) {
    const file = cachedFilePath(workshopId, home)
    if (existsSync(file)) return { file, kind: meta.kind, url: meta.url }
  }

  // 4. Download the preview (bounded) and persist.
  if (previewUrl !== null) {
    try {
      const download = await fetchLike(previewUrl)
      if (download.ok) {
        const bytes = new Uint8Array(await download.arrayBuffer())
        if (bytes.length > 0 && bytes.length <= MAX_PREVIEW_BYTES) {
          const kind = kindFromUrl(previewUrl)
          const dir = cacheDir(home)
          mkdirSync(dir, { recursive: true })
          const file = cachedFilePath(workshopId, home)
          const tmp = `${file}.tmp-${process.pid}`
          writeFileSync(tmp, bytes)
          renameSync(tmp, file)
          const nextMeta: CacheMeta = { url: previewUrl, kind, fetchedAt: now }
          writeFileSync(cachedMetaPath(workshopId, home), JSON.stringify(nextMeta), 'utf8')
          return { file, kind, url: previewUrl }
        }
      }
    } catch {
      // Download failure: fall through to null.
    }
  }

  return null
}

/** Drop the cached preview + meta for one workshop id (tests / maintenance). */
export function clearHdPreview(workshopId: string, home: string = ''): void {
  for (const file of [cachedFilePath(workshopId, home), cachedMetaPath(workshopId, home)]) {
    try {
      rmSync(file, { force: true })
    } catch {
      // Ignore removal failures.
    }
  }
}
