/**
 * The wallpaper background layer, browser half. Reads the shared
 * WallpaperStateStore (selection + scrim + translucency + fit, persisted by
 * the host) and renders a fixed full-viewport layer behind the app:
 *
 *   video wallpapers  -> <video autoplay muted loop> served by the host
 *   web wallpapers    -> sandboxed <iframe> over /api/we-wallpaper/web/<id>/
 *   image wallpapers  -> <img> of the media file
 *   scenes / others   -> the (possibly animated) preview image
 *
 * Translucency works by snapshotting the shell's surface tokens
 * (--dsw-alias-*) once, then re-declaring them as rgba() at the chosen alpha
 * in a plugin-owned <style> tag, plus making [id='root'] transparent — the
 * same visual contract the skins use, driven from the theme's own palette so
 * light/dark both work. The snapshot refreshes when the theme flips.
 */
import type { WallpaperStateStore } from './state.ts';
/** The plugin-owned sharpen filter id (referenced by --dsh-we-filter). */
export declare const SHARPEN_FILTER_ID = "dsh-we-sharpen";
/** CSS variable carrying the active filter (none when sharpen = 0). */
export declare const FILTER_VAR = "--dsh-we-filter";
/** Parse a hex / rgb() / rgba() color into [r, g, b, a]; null when unsupported. */
export declare function parseColor(value: string): [number, number, number, number] | null;
/** Serialize rgba back to a css color string. */
export declare function toRgba(parts: [number, number, number, number], alpha: number): string;
/**
 * The background layer controller. Mount once (plugin apply); it follows the
 * shared state store for its whole life and retracts everything on dispose.
 */
export declare class WallpaperLayer {
    private readonly store;
    private root;
    private media;
    private scrimEl;
    private tokensTag;
    private tokenBase;
    private metas;
    private readonly disposers;
    private darkObserver;
    private kernelEl;
    /** @param store - the shared wallpaper state store. */
    constructor(store: WallpaperStateStore);
    /** Mount the layer: body attribute, DOM, store subscription, theme flip watch. */
    mount(): void;
    /** Retract everything this controller wrote. */
    dispose(): void;
    /** The resolved state (already clamped by the store). */
    private read;
    /** Monotonic render sequence: a superseded async render must not touch the DOM. */
    private renderSeq;
    /** The wallpaper + scene mode key the current media element plays. */
    private mediaId;
    /**
     * Apply the state to the layer. Option changes (scrim / translucency /
     * sharpen) are pure CSS updates; the media element is only (re)created when
     * the selected wallpaper actually changes — recreating a <video> on every
     * slider tick would spawn a new decode pipeline per event (memory churn).
     */
    private render;
    /** Fetch the library (cached per mount); returns the current map. */
    private ensureMetas;
    /**
     * Swap in the media element for one wallpaper (only called on id change).
     * Animated-first uses the local GIF/video-like preview and loads the exact
     * scene.pkg background only if that preview fails. Static-HD loads the
     * extracted background immediately, keeping the preview underneath.
     */
    private renderMedia;
    /** Play (or generate once) the cached high-resolution animated scene loop. */
    private renderSceneVideo;
    /**
     * Tear the media element down and release its decode resources promptly:
     * pausing + clearing the src + calling load() on a <video> drops the
     * decoder immediately instead of waiting for GC (avoids the memory spike
     * of stacked 4K decode pipelines when switching wallpapers). Every media
     * child goes (scene wallpapers stack a GIF + HD img pair).
     */
    private clearMedia;
    /** Re-snapshot the base tokens after a theme flip and re-apply. */
    private refreshTokens;
    /** Snapshot the shell's surface tokens (once per theme). */
    private ensureTokenBase;
    /** Re-declare the surface tokens at the chosen alpha (0 = official look). */
    private applyTranslucency;
    /**
     * Drive the sharpen filter: an unsharp-style 3x3 convolution
     * ([0 -s 0; -s 1+4s -s; 0 -s 0] — identity + s * (identity - blur)).
     * Scene previews are tiny (often 150-256px) and get upscaled to the full
     * viewport; the mild kernel recovers perceived edge crispness. 0 disables
     * the filter entirely (--dsh-we-filter: none).
     * @param sharpen - 0-100 strength.
     */
    private applySharpen;
}
