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
/** Steam workshop app id of Wallpaper Engine. */
export declare const WORKSHOP_APP_ID = "431960";
/** Env override pointing straight at the WE install dir. */
export declare const WE_DIR_ENV = "DSH_WE_DIR";
/** What a wallpaper's media can be. */
export type WallpaperKind = 'video' | 'web' | 'scene' | 'image' | 'audio' | 'other';
/** One wallpaper, as surfaced to the GUI. */
export interface WallpaperEntry {
    /** Stable id used in API URLs (the workshop id, or `local-<dir>`). */
    id: string;
    /** Human title from project.json (falls back to the dir name). */
    title: string;
    /** Normalized media kind. */
    type: WallpaperKind;
    /** project.json `file` — the main media / entry file name. */
    file: string;
    /** project.json `preview` — the preview file name (may be empty). */
    preview: string;
    /** Absolute wallpaper directory. */
    dir: string;
    /** Where the wallpaper lives. */
    source: 'workshop' | 'myprojects' | 'defaultprojects';
    /** Numeric workshop id when the wallpaper came from the workshop. */
    workshopId: string | null;
    /** Whether WE currently runs this wallpaper on the desktop. */
    activeOnDesktop: boolean;
}
/** A discovered Wallpaper Engine install. */
export interface WeInstall {
    /** WE root dir (contains wallpaper64.exe / config.json / projects). */
    root: string;
    /** Every library folder's workshop content dir for app 431960. */
    workshops: string[];
    /** Local-project dirs under the WE root. */
    projects: {
        myprojects: string;
        defaultprojects: string;
    };
}
/** Registry query seam (injectable for tests). */
export type RegQuery = (key: string, name: string) => string | null;
/** Spawn `reg.exe` and read one value; null when the key/value is absent. */
export declare function regQueryDefault(key: string, name: string): string | null;
/** Parse steamapps/libraryfolders.vdf `"path" "..."` entries. */
export declare function parseLibraryFolders(vdf: string): string[];
/** Whether a directory looks like a Wallpaper Engine root. */
export declare function looksLikeWeRoot(dir: string): boolean;
/**
 * The candidate Steam roots: registry (HKCU + HKLM), every library folder
 * listed in libraryfolders.vdf, and the well-known default install dirs.
 * @param opts - injectable env / registry seam (tests).
 */
export declare function steamRootCandidates(opts?: {
    env?: NodeJS.ProcessEnv;
    queryReg?: RegQuery;
}): string[];
/**
 * The workshop content dir for app 431960 under one Steam library root.
 * @param steamRoot - one library folder.
 */
export declare function workshopDirOf(steamRoot: string): string;
/**
 * Locate the Wallpaper Engine install.
 *
 * Resolution order: `DSH_WE_DIR` env override, then every Steam root's
 * `steamapps/common/wallpaper_engine`. The workshop dirs come from every
 * library folder (WE and its workshop content may live on different disks).
 * @param opts - injectable env / registry seam / steam roots (tests).
 */
export declare function discoverWeInstall(opts?: {
    env?: NodeJS.ProcessEnv;
    queryReg?: RegQuery;
    steamRoots?: string[];
}): WeInstall | null;
/** Normalize a raw project.json type into a media kind. */
export declare function normalizeKind(raw: string): WallpaperKind;
/** Parse one project.json into the fields the GUI needs. Null = not a wallpaper. */
export declare function parseProjectJson(text: string): {
    title: string;
    type: WallpaperKind;
    file: string;
    preview: string;
    workshopid: string | null;
} | null;
/**
 * The absolute dirs WE currently runs on the desktop, read from the root
 * config.json (newer UI) and config/config.json (classic UI). Matching is
 * case-insensitive (Windows paths).
 * @param weRoot - the WE install root.
 */
export declare function activeOnDesktopDirs(weRoot: string): Set<string>;
/**
 * Enumerate every wallpaper of an install: workshop content + local projects.
 * Entries are deduped by id; missing/broken project.json files are skipped.
 * @param install - the discovered install.
 * @param activeDirs - active-on-desktop dir set (from {@link activeOnDesktopDirs});
 *   defaults to reading the WE config.
 */
export declare function scanWallpapers(install: WeInstall, activeDirs?: Set<string>): WallpaperEntry[];
