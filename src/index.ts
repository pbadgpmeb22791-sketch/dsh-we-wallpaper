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
import { makeWeWallpaperRoutes, WE_API_PREFIX } from './routes.ts'

export { makeWeWallpaperRoutes, WE_API_PREFIX } from './routes.ts'
export { readState, writeState, normalizeState, DEFAULT_STATE, stateFilePath } from './state.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'we-wallpaper'

/** Services required before the plugin can mount its routes. */
export const inject = ['webServer']

/**
 * Register the API routes.
 * @param ctx - cordis context.
 */
export function apply(ctx: Context): void {
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
      return () => { for (const dispose of disposers) dispose() }
    }, 'we-wallpaper: routes')
  } catch (error) {
    console.error('[we-wallpaper] route registration failed:', error)
  }
}
