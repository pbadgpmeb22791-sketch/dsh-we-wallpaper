/**
 * Browser-side mirror of the plugin state: reads and writes
 * `/api/we-wallpaper/state` (the host persists it to ~/.dsh/
 * we-wallpaper.json). Both the background layer and the settings card share
 * one store instance per plugin fiber, so a selection made in the card
 * re-renders the layer instantly and survives page reloads.
 */
/** The persisted wallpaper state (mirrors src/state.ts). */
export interface WeState {
    selectedId: string;
    scrim: number;
    translucency: number;
    fit: 'cover' | 'contain';
    sharpen: number;
    sceneMode: 'animated-first' | 'static-hd';
    repkgPath: string;
    /** Deprecated host compatibility field. */
    animatedPreviews: boolean;
}
/** Defaults when the host has no state yet. */
export declare const DEFAULT_STATE: WeState;
/** Shared store: snapshot + subscribe + optimistic writes through the host. */
export declare class WallpaperStateStore {
    private state;
    private readonly listeners;
    private loaded;
    getSnapshot(): WeState;
    subscribe(listener: () => void): () => void;
    /** Fetch the persisted state once (idempotent; retried on next call when it failed). */
    load(): Promise<void>;
    /** Apply a wallpaper ('' = official background) — immediate write. */
    select(id: string): void;
    /** Option writes are debounced: a slider drag coalesces into one POST. */
    setScrim(value: number): void;
    setTranslucency(value: number): void;
    setFit(fit: 'cover' | 'contain'): void;
    setSharpen(value: number): void;
    setSceneMode(value: 'animated-first' | 'static-hd'): void;
    setRePkgPath(value: string): void;
    /** Trailing-edge debounce state for option writes. */
    private pendingTimer;
    private pendingPatch;
    /**
     * Apply optimistically (live preview) and coalesce the host write: rapid
     * option changes during one drag produce exactly one POST.
     * @param patch - the option patch.
     * @param delay - trailing delay in ms.
     */
    private writeSoon;
    /** Optimistic local apply, then persist through the host. */
    private write;
    private publish;
}
/** Clamp/coerce one raw section (mirrors the host normalizeState). */
export declare function normalize(raw: WeState): WeState;
