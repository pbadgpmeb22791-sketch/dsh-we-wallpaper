/**
 * Wallpaper Engine library scanner — the framework-free core of the host half.
 *
 * Discovers the Wallpaper Engine install (env override -> Steam registry ->
 * libraryfolders.vdf -> well-known defaults), enumerates the workshop
 * (steamapps/workshop/content/431960/<id>) plus local projects
 * (projects/myprojects, projects/defaultprojects), and reads each
 * `project.json` into a flat wallpaper entry list.
 *
 * Everything here is pure node:fs — no cordis, no web server — so the scan
 * and discovery logic are unit-testable with throwaway directories.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Steam workshop app id of Wallpaper Engine. */
export const WORKSHOP_APP_ID = '431960'

/** Env override pointing straight at the WE install dir. */
export const WE_DIR_ENV = 'DSH_WE_DIR'

/** What a wallpaper's media can be. */
export type WallpaperKind = 'video' | 'web' | 'scene' | 'image' | 'audio' | 'other'

/** One wallpaper, as surfaced to the GUI. */
export interface WallpaperEntry {
  /** Stable id used in API URLs (the workshop id, or `local-<dir>`). */
  id: string
  /** Human title from project.json (falls back to the dir name). */
  title: string
  /** Normalized media kind. */
  type: WallpaperKind
  /** project.json `file` — the main media / entry file name. */
  file: string
  /** project.json `preview` — the preview file name (may be empty). */
  preview: string
  /** Absolute wallpaper directory. */
  dir: string
  /** Where the wallpaper lives. */
  source: 'workshop' | 'myprojects' | 'defaultprojects'
  /** Numeric workshop id when the wallpaper came from the workshop. */
  workshopId: string | null
  /** Whether WE currently runs this wallpaper on the desktop. */
  activeOnDesktop: boolean
}

/** A discovered Wallpaper Engine install. */
export interface WeInstall {
  /** WE root dir (contains wallpaper64.exe / config.json / projects). */
  root: string
  /** Every library folder's workshop content dir for app 431960. */
  workshops: string[]
  /** Local-project dirs under the WE root. */
  projects: {
    myprojects: string
    defaultprojects: string
  }
}

/** Registry query seam (injectable for tests). */
export type RegQuery = (key: string, name: string) => string | null

/** Spawn `reg.exe` and read one value; null when the key/value is absent. */
export function regQueryDefault(key: string, name: string): string | null {
  try {
    const out = spawnSync('reg', ['query', key, '/v', name], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    if (out.status !== 0) return null
    const match = /REG_SZ\s+(.+?)\s*$/.exec(out.stdout ?? '')
    return match !== null ? match[1].trim() : null
  } catch {
    return null
  }
}

/** Parse steamapps/libraryfolders.vdf `"path" "..."` entries. */
export function parseLibraryFolders(vdf: string): string[] {
  const out: string[] = []
  for (const match of vdf.matchAll(/"path"\s*"([^"]+)"/g)) {
    out.push(match[1].replace(/\\\\/g, '\\'))
  }
  return out
}

/** Whether a directory looks like a Wallpaper Engine root. */
export function looksLikeWeRoot(dir: string): boolean {
  return existsSync(join(dir, 'wallpaper64.exe'))
    || existsSync(join(dir, 'config.json'))
    || existsSync(join(dir, 'projects'))
}

/**
 * The candidate Steam roots: registry (HKCU + HKLM), every library folder
 * listed in libraryfolders.vdf, and the well-known default install dirs.
 * @param opts - injectable env / registry seam (tests).
 */
export function steamRootCandidates(opts: { env?: NodeJS.ProcessEnv; queryReg?: RegQuery } = {}): string[] {
  const env = opts.env ?? process.env
  const query = opts.queryReg ?? regQueryDefault
  const roots = new Set<string>()
  for (const [key, name] of [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
  ] as const) {
    const value = query(key, name)
    if (value !== null && value !== '') roots.add(value)
  }
  // Expand every vdf-listed library folder (the registry path itself may be
  // one of them; reading it once covers the whole set).
  for (const root of [...roots]) {
    const vdfPath = join(root, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdfPath)) continue
    try {
      for (const folder of parseLibraryFolders(readFileSync(vdfPath, 'utf8'))) {
        if (folder !== '') roots.add(folder)
      }
    } catch {
      // Unreadable vdf: keep going with what we have.
    }
  }
  const pf = env.ProgramFiles ?? 'C:\\Program Files'
  const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  roots.add(join(pf86, 'Steam'))
  roots.add(join(pf, 'Steam'))
  return [...roots]
}

/**
 * The workshop content dir for app 431960 under one Steam library root.
 * @param steamRoot - one library folder.
 */
export function workshopDirOf(steamRoot: string): string {
  return join(steamRoot, 'steamapps', 'workshop', 'content', WORKSHOP_APP_ID)
}

/**
 * Locate the Wallpaper Engine install.
 *
 * Resolution order: `DSH_WE_DIR` env override, then every Steam root's
 * `steamapps/common/wallpaper_engine`. The workshop dirs come from every
 * library folder (WE and its workshop content may live on different disks).
 * @param opts - injectable env / registry seam / steam roots (tests).
 */
export function discoverWeInstall(opts: {
  env?: NodeJS.ProcessEnv
  queryReg?: RegQuery
  steamRoots?: string[]
} = {}): WeInstall | null {
  const env = opts.env ?? process.env
  const override = (env[WE_DIR_ENV] ?? '').trim()

  let root: string | null = null
  let steamRoots: string[]
  if (override !== '') {
    if (looksLikeWeRoot(override)) root = override
    steamRoots = []
  } else {
    steamRoots = opts.steamRoots ?? steamRootCandidates({ env, queryReg: opts.queryReg })
    for (const steam of steamRoots) {
      const candidate = join(steam, 'steamapps', 'common', 'wallpaper_engine')
      if (looksLikeWeRoot(candidate)) {
        root = candidate
        break
      }
    }
  }
  if (root === null) return null

  const workshops = new Set<string>()
  for (const steam of steamRoots) {
    const ws = workshopDirOf(steam)
    if (existsSync(ws)) workshops.add(ws)
  }
  if (override !== '') {
    // Derive the library folder from the WE root layout and probe it too.
    const derived = dirname(dirname(dirname(root)))
    const ws = workshopDirOf(derived)
    if (existsSync(ws)) workshops.add(ws)
  }

  return {
    root,
    workshops: [...workshops],
    projects: {
      myprojects: join(root, 'projects', 'myprojects'),
      defaultprojects: join(root, 'projects', 'defaultprojects'),
    },
  }
}

/** Normalize a raw project.json type into a media kind. */
export function normalizeKind(raw: string): WallpaperKind {
  const type = raw.trim().toLowerCase()
  if (type === 'video' || type === 'videowallpaper') return 'video'
  if (type === 'web' || type === 'webwallpaper') return 'web'
  if (type === 'scene' || type === 'scenewallpaper') return 'scene'
  if (type === 'image' || type === 'imagewallpaper') return 'image'
  if (type === 'audio' || type === 'audioreactive') return 'audio'
  return 'other'
}

/** Parse one project.json into the fields the GUI needs. Null = not a wallpaper. */
export function parseProjectJson(text: string): {
  title: string
  type: WallpaperKind
  file: string
  preview: string
  workshopid: string | null
} | null {
  try {
    // WE writes UTF-8 with a BOM on some locales; JSON.parse rejects it.
    const raw: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const record = raw as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const file = typeof record.file === 'string' ? record.file.trim() : ''
    const preview = typeof record.preview === 'string' ? record.preview.trim() : ''
    const workshopid = typeof record.workshopid === 'string' ? record.workshopid.trim() : null
    return {
      title: title !== '' ? title : '(untitled)',
      type: normalizeKind(typeof record.type === 'string' ? record.type : ''),
      file,
      preview,
      workshopid: workshopid !== '' ? workshopid : null,
    }
  } catch {
    return null
  }
}

/**
 * The absolute dirs WE currently runs on the desktop, read from the root
 * config.json (newer UI) and config/config.json (classic UI). Matching is
 * case-insensitive (Windows paths).
 * @param weRoot - the WE install root.
 */
export function activeOnDesktopDirs(weRoot: string): Set<string> {
  // Espoir (new UI) selects FILES inside the wallpaper dir; the classic
  // config lists DIRECTORY paths — track the two shapes separately.
  const files = new Set<string>()
  const dirs = new Set<string>()
  for (const configPath of [join(weRoot, 'config.json'), join(weRoot, 'config', 'config.json')]) {
    if (!existsSync(configPath)) continue
    try {
      const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''))
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
      const record = raw as Record<string, unknown>
      // Newer UI: config.json -> Espoir.general.wallpaperconfig.selectedwallpapers.
      // Classic UI: config/config.json -> wallpapers entries with a `directory`.
      const espoir = record.Espoir
      const espoirGeneral = (typeof espoir === 'object' && espoir !== null)
        ? (espoir as Record<string, unknown>).general
        : undefined
      const wallpaperConfig = (typeof espoirGeneral === 'object' && espoirGeneral !== null)
        ? (espoirGeneral as Record<string, unknown>).wallpaperconfig
        : undefined
      const selected = (typeof wallpaperConfig === 'object' && wallpaperConfig !== null)
        ? (wallpaperConfig as Record<string, unknown>).selectedwallpapers
        : undefined
      if (typeof selected === 'object' && selected !== null) {
        for (const monitor of Object.values(selected as Record<string, unknown>)) {
          const file = (typeof monitor === 'object' && monitor !== null)
            ? (monitor as Record<string, unknown>).file
            : undefined
          if (typeof file === 'string' && file !== '') files.add(file)
        }
      }
      const classicWallpapers = record.wallpapers
      if (Array.isArray(classicWallpapers)) {
        for (const entry of classicWallpapers) {
          const directory = (typeof entry === 'object' && entry !== null)
            ? (entry as Record<string, unknown>).directory
            : undefined
          if (typeof directory === 'string' && directory !== '') dirs.add(directory)
        }
      }
    } catch {
      // Unreadable config: the "active" markers are simply absent.
    }
  }
  const out = new Set<string>()
  for (const file of files) {
    // The selected file may be a scene.pkg / mp4 inside the wallpaper dir.
    out.add(dirname(file.replace(/\\/g, '/')).toLowerCase())
  }
  for (const dir of dirs) {
    out.add(dir.replace(/\\/g, '/').toLowerCase())
  }
  return out
}

/** Safe readdir: [] on any failure. */
function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Whether a path is an existing directory. */
function isDir(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * Enumerate every wallpaper of an install: workshop content + local projects.
 * Entries are deduped by id; missing/broken project.json files are skipped.
 * @param install - the discovered install.
 * @param activeDirs - active-on-desktop dir set (from {@link activeOnDesktopDirs});
 *   defaults to reading the WE config.
 */
export function scanWallpapers(
  install: WeInstall,
  activeDirs: Set<string> = activeOnDesktopDirs(install.root),
): WallpaperEntry[] {
  const entries: WallpaperEntry[] = []
  const seen = new Set<string>()

  const add = (dir: string, source: WallpaperEntry['source'], workshopId: string | null): void => {
    const projectPath = join(dir, 'project.json')
    if (!existsSync(projectPath)) return
    let meta: ReturnType<typeof parseProjectJson>
    try {
      meta = parseProjectJson(readFileSync(projectPath, 'utf8'))
    } catch {
      return
    }
    if (meta === null) return
    const id = workshopId ?? `local-${basename(dir)}`
    if (seen.has(id)) return
    seen.add(id)
    entries.push({
      id,
      title: meta.title,
      type: meta.type,
      file: meta.file,
      preview: meta.preview,
      dir,
      source,
      workshopId,
      // activeOnDesktopDirs normalizes to forward slashes + lowercase.
      activeOnDesktop: activeDirs.has(dir.replace(/\\/g, '/').toLowerCase()),
    })
  }

  for (const workshop of install.workshops) {
    for (const sub of readdirSafe(workshop)) {
      add(join(workshop, sub), 'workshop', sub)
    }
  }
  for (const [base, source] of [
    [install.projects.myprojects, 'myprojects'],
    [install.projects.defaultprojects, 'defaultprojects'],
  ] as const) {
    for (const sub of readdirSafe(base)) {
      const dir = join(base, sub)
      if (!isDir(dir)) continue
      add(dir, source, null)
    }
  }

  entries.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
  return entries
}
