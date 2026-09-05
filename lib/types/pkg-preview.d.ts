/**
 * Safe scene.pkg background extraction and cache. Resolution order:
 * scene graph -> optional user-installed RePKG -> built-in heuristic.
 */
import { type BackgroundImage } from './pkg-tex.ts';
export type SceneMode = 'animated-first' | 'static-hd';
export type PreviewSource = 'scene-graph' | 'repkg' | 'heuristic';
export interface CacheMeta {
    version: number;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
    at: number;
    pkgMtimeMs: number;
    pkgSize: number;
    sceneMode: SceneMode;
    source: PreviewSource;
    selectedTex: string | null;
    packageMagic: string | null;
    fallbackReason: string | null;
}
export interface PkgPreview {
    file: string;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
    source: PreviewSource;
    selectedTex: string | null;
    packageMagic: string | null;
    fallbackReason: string | null;
    cacheHit: boolean;
}
export interface PkgPreviewResolution {
    preview: PkgPreview | null;
    diagnostics: {
        workshopId: string;
        pkgFound: boolean;
        pkgPath: string | null;
        pkgSize: number | null;
        pkgMtimeMs: number | null;
        repkgConfigured: boolean;
        repkgUsable: boolean;
        source: PreviewSource | null;
        selectedTex: string | null;
        packageMagic: string | null;
        fallbackReason: string | null;
        cacheHit: boolean;
    };
}
type SpawnResult = {
    status: number | null;
    error?: Error;
};
export type RePkgSpawn = (command: string, args: string[], options: {
    encoding: 'utf8';
    windowsHide: boolean;
    timeout: number;
    maxBuffer: number;
}) => SpawnResult;
export declare function cacheDir(home?: string): string;
export declare function cachedFilePath(workshopId: string, home?: string): string;
export declare function readCacheMeta(workshopId: string, home?: string): CacheMeta | null;
export declare function findScenePkg(workshopId: string, workshopDirs: string[], _home?: string): string | null;
export declare function runRePkgExtractor(repkgPath: string, pkgPath: string, outputDir: string, preferredTex: string | null, spawnImpl?: RePkgSpawn): {
    image: BackgroundImage | null;
    selectedTex: string | null;
    reason: string | null;
};
export declare function resolvePkgPreviewDetailed(workshopId: string, workshopDirs: string[], opts?: {
    home?: string;
    now?: number;
    sceneMode?: SceneMode;
    repkgPath?: string;
    spawnImpl?: RePkgSpawn;
}): PkgPreviewResolution;
export declare function resolvePkgPreview(workshopId: string, workshopDirs: string[], opts?: {
    home?: string;
    now?: number;
    sceneMode?: SceneMode;
    repkgPath?: string;
    spawnImpl?: RePkgSpawn;
}): PkgPreview | null;
export declare function clearPkgPreview(workshopId: string, home?: string): void;
export {};
