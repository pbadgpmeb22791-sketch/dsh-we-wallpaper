/**
 * dsh-we-wallpaper browser half: registers the locale dictionaries, mounts
 * the wallpaper background layer (follows the shared state store for its
 * whole life), and contributes the Dynamic Wallpapers card into the
 * official plugin configuration section (`settings.plugin.item`, declared by
 * dsh-client-ui-settings-plugins).
 *
 * Failure policy: DOM/style failures are contained per effect — the web
 * shell fails the whole boot when a plugin apply throws, and this plugin
 * must not take the GUI down.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type WeWallpaperKey } from './locales.ts';
import { BODY_ATTR, LAYER_ID } from './styles.ts';
export type { WallpaperCardProps } from './WallpaperCard.tsx';
/** Locale namespace owned by this plugin. */
export declare const NS = "weWallpaper";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The dynamic-wallpaper card's copy. */
        weWallpaper: WeWallpaperKey;
    }
}
/** Required services: slots + locale (card). The layer itself needs no services. */
export declare const inject: string[];
/**
 * Register the dictionaries, the background layer, and the plugin card.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
export { LAYER_ID, BODY_ATTR };
