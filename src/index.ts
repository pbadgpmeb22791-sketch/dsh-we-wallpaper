/**
 * dsh-we-wallpaper host half: mounts the `/api/we-wallpaper/*` route family
 * that serves the Wallpaper Engine library (previews, media files, web
 * wallpaper assets) plus the plugin's persisted state (`~/.dsh/
 * we-wallpaper.json` — the selection survives reloads and restarts without
 * depending on the web settings allowlist, the same pattern dsh-pet uses).
 *
 * Route failures are logged, never thrown — the web shell fails the whole
 * boot when a plugin apply throws, and this plugin must not take the GUI
 * down.
 * @module dsh-we-wallpaper
 */

import { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the dsh-host-webserver service seat (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { disposeSceneVideoCapture } from './scene-video.ts'
import { makeWeWallpaperRoutes, WE_API_PREFIX } from './routes.ts'

export { makeWeWallpaperRoutes, WE_API_PREFIX } from './routes.ts'
export {
  disposeSceneVideoCapture,
  getSceneVideoStatus,
  requestSceneVideo,
  sceneVideoCachePath,
  wcapIni,
} from './scene-video.ts'
export { readState, writeState, normalizeState, DEFAULT_STATE, stateFilePath } from './state.ts'
export {
  extractBackgroundPng,
  extractBackgroundWithDiagnostics,
  findSceneBackgroundTextures,
  parsePackage,
  findTexCandidates,
  decodeTexEntry,
  lz4BlockDecode,
  rgbaToPng,
} from './pkg-tex.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'we-wallpaper'

/**
 * Settings namespace this plugin owns. dsh 2.x renders a settings card only
 * when its slot key names a settings namespace the Host actually serves, so
 * the namespace below is both the card's slot key (client half) and a real
 * registration here.
 */
export const SETTINGS_NAMESPACE = settingsNamespace('we-wallpaper')

/** Schema backing the settings namespace (mirrors the card's display options). */
const WALLPAPER_SETTINGS_SCHEMA = z.object({
  scrim: z.number().default(25),
  translucency: z.number().default(50),
  fit: z.string().default('cover'),
  sharpen: z.number().default(40),
  sceneMode: z.string().default('animated-first'),
  animatedPreviews: z.boolean().default(true),
  repkgPath: z.string().default(''),
})

/** Services required before the plugin can mount its routes. */
export const inject = ['webServer', 'settings']

/**
 * Register the API routes.
 * @param ctx - cordis context.
 */
export function apply(ctx: Context): void {
  try {
    ctx.settings.register(SETTINGS_NAMESPACE, WALLPAPER_SETTINGS_SCHEMA)
  } catch (error) {
    console.error('[we-wallpaper] settings namespace registration failed:', error)
  }
  const routes = makeWeWallpaperRoutes()
  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const route of routes) disposers.push(ctx.webServer.register(route))
      } catch (error) {
        // Roll back whatever registered before the failure so a partial mount
        // never leaves half a route family live; the outer catch logs.
        for (const dispose of disposers) dispose()
        throw error
      }
      return () => {
        for (const dispose of disposers) dispose()
        // Never leave the temporary recorder or WE capture window alive when
        // the host unloads or restarts this plugin.
        disposeSceneVideoCapture()
      }
    }, 'we-wallpaper: routes')
  } catch (error) {
    console.error('[we-wallpaper] route registration failed:', error)
  }
}
