/**
 * Unit tests for the Steam HD preview cache (src/steam-preview.ts): kind
 * detection, fresh/stale cache hits, API fetch + download persistence, and
 * graceful failure — all against a throwaway HOME with an injected fetch.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cachedFilePath,
  clearHdPreview,
  kindFromUrl,
  readCacheMeta,
  resolveHdPreview,
  STEAM_API_URL,
  type FetchLike,
} from '../src/steam-preview.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-we-wallpaper-hd-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

/** A fetch stub recording calls. */
function stubFetch(routes: Record<string, () => Promise<{ body: Uint8Array; json?: unknown }>>): {
  fetch: FetchLike
  calls: string[]
} {
  const calls: string[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    const route = routes[url]
    if (route === undefined) throw new Error(`unexpected fetch: ${url}`)
    const result = await route()
    return {
      ok: true,
      arrayBuffer: async () => result.body.buffer as ArrayBuffer,
      json: async () => result.json ?? {},
    }
  }
  return { fetch, calls }
}

describe('kindFromUrl', () => {
  it('detects video previews by extension', () => {
    expect(kindFromUrl('https://x/items/431960/abc/preview.jpg')).toBe('image')
    expect(kindFromUrl('https://x/items/431960/abc/preview.mp4?x=1')).toBe('video')
    expect(kindFromUrl('https://x/items/431960/abc/preview.webm')).toBe('video')
  })
})

describe('resolveHdPreview', () => {
  const ID = '3000925581'
  const previewUrl = 'https://cdn.example/items/431960/abc/preview.jpg'
  const bytes = new Uint8Array([1, 2, 3, 4, 5])

  it('serves a fresh cache without any fetch', async () => {
    // Seed the cache with a working fetch first.
    await resolveHdPreview(ID, {
      fetch: stubFetch({
        [STEAM_API_URL]: async () => ({
          json: { response: { publishedfiledetails: [{ preview_url: previewUrl }] } },
          body: new Uint8Array(0),
        }),
        [previewUrl]: async () => ({ body: bytes }),
      }).fetch,
      home,
      now: 1000,
    })
    // Fresh cache: the fetch stub must never be called.
    const { fetch, calls } = stubFetch({})
    const result = await resolveHdPreview(ID, { fetch, home, now: 2000 })
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('image')
    expect(result?.url).toBe(previewUrl)
    expect(existsSync(result!.file)).toBe(true)
    expect(calls).toEqual([])
  })

  it('fetches the API + preview on cache miss and persists', async () => {
    const { fetch, calls } = stubFetch({
      [STEAM_API_URL]: async () => ({
        json: { response: { publishedfiledetails: [{ preview_url: previewUrl }] } },
        body: new Uint8Array(0),
      }),
      [previewUrl]: async () => ({ body: bytes }),
    })
    const result = await resolveHdPreview(ID, { fetch, home, now: 1000 })
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('image')
    expect(calls).toEqual([`POST ${STEAM_API_URL}`, `GET ${previewUrl}`])
    // Persisted meta + bytes.
    expect(readCacheMeta(ID, home)).toMatchObject({ url: previewUrl, kind: 'image', fetchedAt: 1000 })
    expect(new Uint8Array(readFileSync(cachedFilePath(ID, home)))).toEqual(bytes)
  })

  it('falls back to a stale cache when the API is unreachable', async () => {
    // Seed a stale cache entry.
    await resolveHdPreview(ID, {
      fetch: stubFetch({
        [STEAM_API_URL]: async () => ({
          json: { response: { publishedfiledetails: [{ preview_url: previewUrl }] } },
          body: new Uint8Array(0),
        }),
        [previewUrl]: async () => ({ body: bytes }),
      }).fetch,
      home,
      now: 1000,
    })
    const failing = stubFetch({})
    const result = await resolveHdPreview(ID, { fetch: failing.fetch, home, now: 1000 + 40 * 24 * 3600 * 1000 })
    expect(result).not.toBeNull()
    expect(result?.url).toBe(previewUrl)
  })

  it('returns null on total failure (offline, no cache)', async () => {
    const failing = stubFetch({})
    const result = await resolveHdPreview(ID, { fetch: failing.fetch, home })
    expect(result).toBeNull()
  })

  it('does not retry a failed item within the cooldown window', async () => {
    const failing = stubFetch({})
    await resolveHdPreview(ID, { fetch: failing.fetch, home, now: 1000 })
    // Same session, shortly after: the fetch stub must stay untouched.
    const { fetch, calls } = stubFetch({})
    const result = await resolveHdPreview(ID, { fetch, home, now: 60_000 })
    expect(result).toBeNull()
    expect(calls).toEqual([])
  })

  it('drops oversized downloads', async () => {
    const big = new Uint8Array(51 * 1024 * 1024)
    const { fetch } = stubFetch({
      [STEAM_API_URL]: async () => ({
        json: { response: { publishedfiledetails: [{ preview_url: previewUrl }] } },
        body: new Uint8Array(0),
      }),
      [previewUrl]: async () => ({ body: big }),
    })
    expect(await resolveHdPreview(ID, { fetch, home })).toBeNull()
  })

  it('clearHdPreview removes cache and meta', async () => {
    await resolveHdPreview(ID, {
      fetch: stubFetch({
        [STEAM_API_URL]: async () => ({
          json: { response: { publishedfiledetails: [{ preview_url: previewUrl }] } },
          body: new Uint8Array(0),
        }),
        [previewUrl]: async () => ({ body: bytes }),
      }).fetch,
      home,
    })
    clearHdPreview(ID, home)
    expect(readCacheMeta(ID, home)).toBeNull()
    expect(existsSync(cachedFilePath(ID, home))).toBe(false)
  })
})
