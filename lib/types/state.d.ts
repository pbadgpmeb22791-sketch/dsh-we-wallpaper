/**
 * Plugin-owned state: the wallpaper selection + display options, persisted in
 * `~/.dsh/we-wallpaper.json` (DSH_HOME aware), the same pattern dsh-pet uses
 * for pet.json. The web settings seam (dsh-host-apiproxy) only exposes a
 * hardcoded namespace allowlist, so a plugin cannot rely on it — its own
 * state file is the single source of truth for the selection, surviving page
 * reloads and dsh restarts.
 */
/** The persisted wallpaper state. */
export interface WeState {
    /** The selected wallpaper id ('' = official background). */
    selectedId: string;
    /** Dark occlusion 0-100 over the wallpaper. */
    scrim: number;
    /** Surface translucency 0-90 (0 = opaque official panes). */
    translucency: number;
    /** Media fit. */
    fit: 'cover' | 'contain';
    /** Preview sharpen 0-100 (scene previews are small; sharpening helps). */
    sharpen: number;
    /** Scene wallpaper rendering preference. */
    sceneMode: 'animated-first' | 'static-hd';
    /** Optional absolute path to a user-installed RePKG executable. */
    repkgPath: string;
    /** Deprecated compatibility mirror for older clients. */
    animatedPreviews: boolean;
}
/** Defaults when no state file exists. */
export declare const DEFAULT_STATE: WeState;
/** The dsh home dir (DSH_HOME env wins; overridable for tests). */
export declare function dshHome(home?: string): string;
/** The state file path. */
export declare function stateFilePath(home?: string): string;
/** Clamp/coerce one raw section into a valid WeState (unknown fields dropped). */
export declare function normalizeState(raw: unknown): WeState;
/** Read the persisted state (defaults when absent or unreadable). */
export declare function readState(home?: string): WeState;
/**
 * Merge a partial section into the persisted state (atomic replace) and
 * return the next full state. Unknown fields are dropped; invalid values
 * clamp to the schema bounds.
 */
export declare function writeState(section: unknown, home?: string): WeState;
