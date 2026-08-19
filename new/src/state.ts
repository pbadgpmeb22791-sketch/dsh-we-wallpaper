/**
 * Plugin-owned state: the wallpaper selection + display options, persisted in
 * `~/.dsh/we-wallpaper.json` (DSH_HOME aware), the same pattern dsh-pet uses
 * for pet.json. The web settings seam (dsh-host-apiproxy) only exposes a
 * hardcoded namespace allowlist, so a plugin cannot rely on it — its own
 * state file is the single source of truth for the selection, surviving page
 * reloads and dsh restarts.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** The persisted wallpaper state. */
export interface WeState {
  /** The selected wallpaper id ('' = official background). */
  selectedId: string
  /** Dark occlusion 0-100 over the wallpaper. */
  scrim: number
  /** Surface translucency 0-90 (0 = opaque official panes). */
  translucency: number
  /** Media fit. */
  fit: 'cover' | 'contain'
  /** Preview sharpen 0-100 (scene previews are small; sharpening helps). */
  sharpen: number
  /** Scene wallpaper rendering preference. */
  sceneMode: 'animated-first' | 'static-hd'
  /** Optional absolute path to a user-installed RePKG executable. */
  repkgPath: string
  /** Deprecated compatibility mirror for older clients. */
  animatedPreviews: boolean
}

/** Defaults when no state file exists. */
export const DEFAULT_STATE: WeState = {
  selectedId: '',
  scrim: 25,
  translucency: 50,
  fit: 'cover',
  sharpen: 40,
  sceneMode: 'animated-first',
  repkgPath: '',
  animatedPreviews: true,
}

/** The dsh home dir (DSH_HOME env wins; overridable for tests). */
export function dshHome(home: string = ''): string {
  if (home !== '') return home
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** The state file path. */
export function stateFilePath(home: string = ''): string {
  return join(dshHome(home), 'we-wallpaper.json')
}

/** Clamp/coerce one raw section into a valid WeState (unknown fields dropped). */
export function normalizeState(raw: unknown): WeState {
  const record = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}
  const selectedId = typeof record.selectedId === 'string' ? record.selectedId : DEFAULT_STATE.selectedId
  const scrim = typeof record.scrim === 'number' && Number.isFinite(record.scrim)
    ? Math.max(0, Math.min(100, Math.round(record.scrim)))
    : DEFAULT_STATE.scrim
  const translucency = typeof record.translucency === 'number' && Number.isFinite(record.translucency)
    ? Math.max(0, Math.min(90, Math.round(record.translucency)))
    : DEFAULT_STATE.translucency
  const fit = record.fit === 'contain' ? 'contain' : 'cover'
  const sharpen = typeof record.sharpen === 'number' && Number.isFinite(record.sharpen)
    ? Math.max(0, Math.min(100, Math.round(record.sharpen)))
    : DEFAULT_STATE.sharpen
  const sceneMode = record.sceneMode === 'static-hd'
    ? 'static-hd'
    : record.sceneMode === 'animated-first'
      ? 'animated-first'
      : record.animatedPreviews === false
        ? 'static-hd'
        : 'animated-first'
  const repkgPath = typeof record.repkgPath === 'string'
    ? record.repkgPath.trim().slice(0, 2048)
    : DEFAULT_STATE.repkgPath
  return {
    selectedId,
    scrim,
    translucency,
    fit,
    sharpen,
    sceneMode,
    repkgPath,
    animatedPreviews: sceneMode === 'animated-first',
  }
}

/** Read the persisted state (defaults when absent or unreadable). */
export function readState(home: string = ''): WeState {
  const file = stateFilePath(home)
  if (!existsSync(file)) return { ...DEFAULT_STATE }
  try {
    return normalizeState(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')))
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/**
 * Merge a partial section into the persisted state (atomic replace) and
 * return the next full state. Unknown fields are dropped; invalid values
 * clamp to the schema bounds.
 */
export function writeState(section: unknown, home: string = ''): WeState {
  const patch = (typeof section === 'object' && section !== null ? section : {}) as Record<string, unknown>
  // Older clients only know animatedPreviews. Translate that write before
  // merging so the persisted sceneMode does not mask the compatibility key.
  const compatibility = patch.sceneMode === undefined && typeof patch.animatedPreviews === 'boolean'
    ? { sceneMode: patch.animatedPreviews ? 'animated-first' : 'static-hd' }
    : {}
  const next = normalizeState({ ...readState(home), ...patch, ...compatibility })
  const file = stateFilePath(home)
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  renameSync(tmp, file)
  return next
}
