/**
 * Unit tests for the framework-free scanner core (src/we-scanner.ts) and the
 * route helpers (src/routes.ts). Everything runs against throwaway
 * directories — no Wallpaper Engine, Steam, or web server required.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  activeOnDesktopDirs,
  discoverWeInstall,
  normalizeKind,
  parseLibraryFolders,
  parseProjectJson,
  scanWallpapers,
  steamRootCandidates,
  type RegQuery,
  type WeInstall,
} from '../src/we-scanner.ts'
import { mimeFor, resolveWebTarget } from '../src/routes.ts'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dsh-we-wallpaper-test-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

/** One fake wallpaper dir with the given project.json content. */
function writeWallpaper(dir: string, projectJson: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'project.json'), projectJson)
}

const PROJECT_VIDEO = JSON.stringify({ title: '明日香', type: 'video', file: 'a.mp4', preview: 'preview.jpg' })
const PROJECT_SCENE = JSON.stringify({ title: 'Miku', type: 'Scene', file: 'scene.json', preview: 'preview.gif' })
const PROJECT_WEB = JSON.stringify({ title: 'Rain', type: 'web', file: 'index.html', preview: 'preview.png' })

describe('parseProjectJson', () => {
  it('parses a plain project.json', () => {
    const meta = parseProjectJson(PROJECT_VIDEO)
    expect(meta).not.toBeNull()
    expect(meta?.title).toBe('明日香')
    expect(meta?.type).toBe('video')
    expect(meta?.file).toBe('a.mp4')
    expect(meta?.preview).toBe('preview.jpg')
  })

  it('tolerates a UTF-8 BOM (Chinese WE locales write one)', () => {
    expect(parseProjectJson(`\uFEFF${PROJECT_SCENE}`)?.type).toBe('scene')
  })

  it('returns null for invalid JSON and non-objects', () => {
    expect(parseProjectJson('{not json')).toBeNull()
    expect(parseProjectJson('[]')).toBeNull()
    expect(parseProjectJson('"str"')).toBeNull()
  })

  it('normalizes case-insensitively and falls back to untitled', () => {
    expect(parseProjectJson('{"type":"VideoWallpaper"}')?.type).toBe('video')
    expect(parseProjectJson('{}')?.title).toBe('(untitled)')
    expect(parseProjectJson('{}')?.type).toBe('other')
  })
})

describe('normalizeKind', () => {
  it('maps every known WE type', () => {
    expect(normalizeKind('video')).toBe('video')
    expect(normalizeKind('videowallpaper')).toBe('video')
    expect(normalizeKind('Scene')).toBe('scene')
    expect(normalizeKind('web')).toBe('web')
    expect(normalizeKind('image')).toBe('image')
    expect(normalizeKind('audio')).toBe('audio')
    expect(normalizeKind('application')).toBe('other')
    expect(normalizeKind('')).toBe('other')
  })
})

describe('parseLibraryFolders', () => {
  it('extracts vdf paths and unescapes backslashes', () => {
    const vdf = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"D:\\\\Steam"',
      '\t\t"label"\t\t""',
      '\t}',
      '\t"1"',
      '\t{',
      '\t\t"path"\t\t"C:/Games"',
      '\t}',
      '}',
    ].join('\n')
    expect(parseLibraryFolders(vdf)).toEqual(['D:\\Steam', 'C:/Games'])
  })
})

describe('steamRootCandidates', () => {
  it('merges registry, vdf expansion and defaults', () => {
    const library = join(tmp, 'lib')
    mkdirSync(join(library, 'steamapps'), { recursive: true })
    writeFileSync(
      join(library, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "D:\\\\Steam" } }`,
    )
    const query: RegQuery = (key) => {
      if (key.includes('HKCU')) return library
      return null
    }
    const roots = steamRootCandidates({
      env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
      queryReg: query,
    })
    expect(roots).toContain(library)
    expect(roots).toContain('D:\\Steam')
    expect(roots).toContain(join('C:\\Program Files (x86)', 'Steam'))
  })
})

describe('discoverWeInstall', () => {
  function fakeSteamLayout(): { steam: string; we: string } {
    const steam = join(tmp, 'steam')
    const we = join(steam, 'steamapps', 'common', 'wallpaper_engine')
    mkdirSync(we, { recursive: true })
    writeFileSync(join(we, 'wallpaper64.exe'), '')
    return { steam, we }
  }

  it('finds WE under a steam root and derives the workshop dir', () => {
    const { steam, we } = fakeSteamLayout()
    const workshop = join(steam, 'steamapps', 'workshop', 'content', '431960')
    mkdirSync(workshop, { recursive: true })
    const install = discoverWeInstall({ steamRoots: [steam] })
    expect(install).not.toBeNull()
    expect(install?.root).toBe(we)
    expect(install?.workshops).toEqual([workshop])
  })

  it('honors the DSH_WE_DIR override (workshop probed from the derived library)', () => {
    const { steam, we } = fakeSteamLayout()
    const workshop = join(steam, 'steamapps', 'workshop', 'content', '431960')
    mkdirSync(workshop, { recursive: true })
    const install = discoverWeInstall({ env: { DSH_WE_DIR: we } })
    expect(install?.root).toBe(we)
    expect(install?.workshops).toContain(workshop)
  })

  it('returns null when nothing looks like WE', () => {
    expect(discoverWeInstall({ steamRoots: [join(tmp, 'nope')] })).toBeNull()
  })
})

describe('activeOnDesktopDirs', () => {
  it('reads the Espoir selectedwallpapers from the root config.json', () => {
    const we = join(tmp, 'we')
    mkdirSync(we, { recursive: true })
    writeFileSync(join(we, 'config.json'), JSON.stringify({
      Espoir: {
        general: {
          wallpaperconfig: {
            selectedwallpapers: {
              Monitor0: { file: 'D:/Steam/steamapps/workshop/content/431960/111111/scene.pkg' },
              Monitor1: { file: 'D:/Steam/steamapps/workshop/content/431960/222222/a.mp4' },
            },
          },
        },
      },
    }))
    const dirs = activeOnDesktopDirs(we)
    expect(dirs.has('d:/steam/steamapps/workshop/content/431960/111111')).toBe(true)
    expect(dirs.has('d:/steam/steamapps/workshop/content/431960/222222')).toBe(true)
    expect(dirs.size).toBe(2)
  })

  it('reads the classic wallpapers array from config/config.json', () => {
    const we = join(tmp, 'we')
    mkdirSync(join(we, 'config'), { recursive: true })
    writeFileSync(join(we, 'config', 'config.json'), JSON.stringify({
      wallpapers: [{ directory: 'D:/Steam/steamapps/workshop/content/431960/333333' }],
    }))
    expect(activeOnDesktopDirs(we).has('d:/steam/steamapps/workshop/content/431960/333333')).toBe(true)
  })
})

describe('scanWallpapers', () => {
  function fakeInstall(): WeInstall {
    const we = join(tmp, 'we')
    const workshop = join(tmp, 'steam', 'steamapps', 'workshop', 'content', '431960')
    const myprojects = join(we, 'projects', 'myprojects')
    const defaultprojects = join(we, 'projects', 'defaultprojects')
    mkdirSync(workshop, { recursive: true })
    mkdirSync(myprojects, { recursive: true })
    mkdirSync(defaultprojects, { recursive: true })
    return { root: we, workshops: [workshop], projects: { myprojects, defaultprojects } }
  }

  it('merges workshop + local projects, dedupes by id and marks the active one', () => {
    const install = fakeInstall()
    writeWallpaper(join(install.workshops[0], '111111'), PROJECT_VIDEO)
    writeWallpaper(join(install.workshops[0], '222222'), PROJECT_SCENE)
    writeWallpaper(join(install.workshops[0], 'no-json'), 'no project.json here')
    writeWallpaper(join(install.projects.myprojects, 'My Cool WP'), PROJECT_WEB)
    writeWallpaper(join(install.projects.defaultprojects, 'stock'), PROJECT_VIDEO)
    // Duplicate local id on purpose: the second one must be dropped.
    writeWallpaper(join(install.projects.defaultprojects, 'My Cool WP'), PROJECT_SCENE)

    const active = new Set([join(install.workshops[0], '111111').replace(/\\/g, '/').toLowerCase()])
    const entries = scanWallpapers(install, active)

    expect(entries).toHaveLength(4)
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    expect(byId.get('111111')?.title).toBe('明日香')
    expect(byId.get('111111')?.type).toBe('video')
    expect(byId.get('111111')?.activeOnDesktop).toBe(true)
    expect(byId.get('222222')?.type).toBe('scene')
    expect(byId.get('222222')?.source).toBe('workshop')
    expect(byId.get('local-My Cool WP')?.type).toBe('web')
    expect(byId.get('local-My Cool WP')?.source).toBe('myprojects')
    expect(byId.get('local-stock')?.source).toBe('defaultprojects')
    // Sorted by title (locale-aware).
    const titles = entries.map((entry) => entry.title)
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
  })

  it('returns an empty list for an empty library', () => {
    expect(scanWallpapers(fakeInstall())).toEqual([])
  })
})

describe('route helpers', () => {
  it('maps content types by extension', () => {
    expect(mimeFor('a.mp4')).toBe('video/mp4')
    expect(mimeFor('preview.gif')).toBe('image/gif')
    expect(mimeFor('index.html')).toBe('text/html; charset=utf-8')
    expect(mimeFor('scene.pkg')).toBe('application/octet-stream')
    expect(mimeFor('unknown.xyz')).toBe('application/octet-stream')
  })

  it('resolves web-wallpaper paths inside the wallpaper dir', () => {
    const base = join(tmp, 'wp')
    expect(resolveWebTarget(base, [])).toBe(join(base, 'index.html'))
    expect(resolveWebTarget(base, ['js', 'app.js'])).toBe(join(base, 'js', 'app.js'))
    expect(resolveWebTarget(base, ['..', 'secret.txt'])).toBeNull()
    expect(resolveWebTarget(base, ['..'])).toBeNull()
    expect(resolveWebTarget(base, ['a', '..', '..', 'x'])).toBeNull()
    expect(resolveWebTarget(base, ['a', '..', 'b.txt'])).toBe(join(base, 'b.txt'))
  })
})
