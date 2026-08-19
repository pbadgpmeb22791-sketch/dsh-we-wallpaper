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
 *   POST /api/we-wallpaper/scene-video/generate/<id> — build cached HD loop
 *   GET  /api/we-wallpaper/scene-video/status/<id>   — generation status
 *   GET  /api/we-wallpaper/scene-video/media/<id>    — cached HD loop
 *
 * The selection persists in `~/.dsh/we-wallpaper.json` (src/state.ts).
 * Every route rejects cross-site requests (Sec-Fetch-Site / Origin fence) so
 * a malicious webpage cannot probe local files through a localhost CSRF
 * request; ids are resolved against the scan map (never used as raw paths)
 * and web-file paths are traversal-guarded.
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type WallpaperEntry, type WeInstall } from './we-scanner.ts';
/** Browser-facing base path of the plugin API. */
export declare const WE_API_PREFIX = "/api/we-wallpaper";
/** Content type for a file path. */
export declare function mimeFor(file: string): string;
/** The cached scan result (invalidated by install/workshop mtime changes). */
interface ScanResult {
    install: WeInstall | null;
    wallpapers: WallpaperEntry[];
    byId: Map<string, WallpaperEntry>;
}
/** Scan with a mtime-keyed cache; never throws (WE absent = empty library). */
export declare function loadScan(): ScanResult;
/**
 * Resolve a web-wallpaper request path inside its wallpaper dir. Returns the
 * absolute target file when every segment stays inside `base` (defaulting to
 * index.html), null on traversal.
 * @param base - the wallpaper dir (absolute).
 * @param segments - decoded path segments after the wallpaper id.
 */
export declare function resolveWebTarget(base: string, segments: string[]): string | null;
/**
 * Build the route family.
 * @returns the WebRoute list (register each with ctx.webServer).
 */
export declare function makeWeWallpaperRoutes(): WebRoute[];
export {};
