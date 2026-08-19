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
import { Context } from '@deepseek-ai/cordis';
export { makeWeWallpaperRoutes, WE_API_PREFIX } from './routes.ts';
export { disposeSceneVideoCapture, getSceneVideoStatus, requestSceneVideo, sceneVideoCachePath, wcapIni, } from './scene-video.ts';
export { readState, writeState, normalizeState, DEFAULT_STATE, stateFilePath } from './state.ts';
export { extractBackgroundPng, extractBackgroundWithDiagnostics, findSceneBackgroundTextures, parsePackage, findTexCandidates, decodeTexEntry, lz4BlockDecode, rgbaToPng, } from './pkg-tex.ts';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "we-wallpaper";
/** Services required before the plugin can mount its routes. */
export declare const inject: string[];
/**
 * Register the API routes.
 * @param ctx - cordis context.
 */
export declare function apply(ctx: Context): void;
