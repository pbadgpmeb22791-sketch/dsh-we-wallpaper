/**
 * High-definition animated fallback for Wallpaper Engine scene packages.
 *
 * Workshop GIF previews are often 160x160.  They cannot look sharp at full
 * screen.  Wallpaper Engine scenes also cannot be exported directly because
 * they have no fixed timeline, so this module records a short native render
 * once with Windows.Graphics.Capture (wcap) and caches the resulting H.264
 * loop.  Harness then plays it through the same <video> path as a normal
 * video wallpaper.
 */
import type { WallpaperEntry, WeInstall } from './we-scanner.ts';
export declare const SCENE_VIDEO_VERSION = 1;
export declare const SCENE_VIDEO_SECONDS = 12;
export declare const SCENE_VIDEO_WIDTH = 1920;
export declare const SCENE_VIDEO_HEIGHT = 1080;
export type SceneVideoPhase = 'idle' | 'capturing' | 'ready' | 'error';
export interface SceneVideoStatus {
    id: string;
    phase: SceneVideoPhase;
    progress: number;
    file: string | null;
    width: number;
    height: number;
    duration: number;
    error: string | null;
    startedAt: string | null;
    updatedAt: string;
}
export declare function sceneVideoCachePath(id: string, home?: string): string;
export declare function getSceneVideoStatus(entry: WallpaperEntry): SceneVideoStatus;
/** The deterministic recorder configuration written beside the runtime exe. */
export declare function wcapIni(outputFolder: string, seconds?: number): string;
/** Start a capture in the background or return the existing cache/job. */
export declare function requestSceneVideo(entry: WallpaperEntry, install: WeInstall): SceneVideoStatus;
/** Stop a running recorder and close its temporary WE window on plugin unload. */
export declare function disposeSceneVideoCapture(): void;
