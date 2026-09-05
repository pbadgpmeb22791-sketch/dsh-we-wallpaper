/**
 * The dynamic-wallpaper settings card, registered into the official plugin
 * configuration section (`settings.plugin.item`). Lists the local Wallpaper
 * Engine library with live previews, applies a selection through the
 * `we-wallpaper` settings scope, and drives the layer options (scrim /
 * translucency / fit).
 *
 * The card is a thin React view over the WallpaperCardController: the
 * injected face carries a HostObservable (bound to the `useWallpaper`
 * selector hook by the slot machinery) plus action callbacks.
 */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WallpaperListItem } from './layer-types.ts';
import { WallpaperStateStore } from './state.ts';
/** The card's live state. */
export interface WallpaperCardState {
    /** Whether the library is still loading. */
    loading: boolean;
    /** Whether a Wallpaper Engine install was found. */
    found: boolean;
    /** The WE install root (display only). */
    root: string | null;
    /** The library entries. */
    wallpapers: WallpaperListItem[];
    /** Currently selected wallpaper id ('' = off). */
    activeId: string;
    /** The applied display options. */
    scrim: number;
    translucency: number;
    fit: 'cover' | 'contain';
    sharpen: number;
    /** Scene wallpaper rendering preference. */
    sceneMode: 'animated-first' | 'static-hd';
    /** Optional local RePKG executable path. */
    repkgPath: string;
    /** Last load error (display only). */
    error: string | null;
}
/** The face injected into the card's slot registration. */
export interface WallpaperCardFace {
    /** Live card state (becomes the `useWallpaper` selector hook). */
    hooks: {
        wallpaper: HostObservable<WallpaperCardState>;
    };
    /** Apply a wallpaper ('' clears the selection). */
    select: (id: string) => void;
    /** Re-scan the library. */
    refresh: () => void;
    /** Set the scrim 0-100. */
    setScrim: (value: number) => void;
    /** Set the panel translucency 0-90. */
    setTranslucency: (value: number) => void;
    /** Set the media fit. */
    setFit: (fit: 'cover' | 'contain') => void;
    /** Set the preview sharpening 0-100. */
    setSharpen: (value: number) => void;
    /** Set scene wallpaper rendering preference. */
    setSceneMode: (value: 'animated-first' | 'static-hd') => void;
    /** Set the optional local RePKG executable path. */
    setRePkgPath: (value: string) => void;
}
/** Controller: owns the state, talks to the shared store and the host API. */
export declare class WallpaperCardController implements HostObservable<WallpaperCardState> {
    private state;
    private readonly listeners;
    private readonly store;
    /** @param store - the shared wallpaper state store. */
    constructor(store: WallpaperStateStore);
    /** The face handed to the slot registration. */
    inject(): WallpaperCardFace;
    getSnapshot(): WallpaperCardState;
    subscribe(listener: () => void): () => void;
    private publish;
    private resyncFromStore;
    /** Apply a wallpaper through the shared store ('' = official background). */
    private select;
    /** Re-fetch the library from the host. */
    refresh(): Promise<void>;
}
/** Props the renderer binds for the card. */
export type WallpaperCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'weWallpaper'> & InjectFace<WallpaperCardFace>;
/**
 * Render the card.
 * @param props - locale copy, the live state hook, and the action callbacks.
 */
export declare function WallpaperCard(props: WallpaperCardProps): import("react").JSX.Element;
