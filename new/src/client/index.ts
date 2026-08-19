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

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the `settings.plugin.item` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { WallpaperCard, WallpaperCardController, type WallpaperCardFace } from './WallpaperCard.tsx'
import { WallpaperLayer } from './layer.ts'
import { en, zh, type WeWallpaperKey } from './locales.ts'
import { WallpaperStateStore } from './state.ts'
import { BODY_ATTR, CARD_CSS, LAYER_CSS, LAYER_ID } from './styles.ts'

export type { WallpaperCardProps } from './WallpaperCard.tsx'

/** Locale namespace owned by this plugin. */
export const NS = 'weWallpaper'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dynamic-wallpaper card's copy. */
    weWallpaper: WeWallpaperKey
  }
}

/** Required services: slots + locale (card). The layer itself needs no services. */
export const inject = ['slots', 'locale']

/** Inject one plugin-owned style tag (idempotent per session). */
function injectStyle(id: string, css: string): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return existing
  const tag = document.createElement('style')
  tag.dataset.pluginCss = id
  tag.textContent = css
  document.head.appendChild(tag)
  return tag
}

/**
 * Register the dictionaries, the background layer, and the plugin card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'we-wallpaper: dictionaries')

  // Static styles: layer chrome + card chrome. Removed with the plugin.
  ctx.effect(() => {
    const styles = [injectStyle('we-wallpaper-layer', LAYER_CSS), injectStyle('we-wallpaper-card', CARD_CSS)]
    return () => { for (const tag of styles) tag.remove() }
  }, 'we-wallpaper: styles')

  // The background layer follows the shared state store for its whole life.
  const store = new WallpaperStateStore()
  void store.load()
  const layer = new WallpaperLayer(store)
  ctx.effect(() => {
    try {
      layer.mount()
    } catch (error) {
      // DOM failures degrade the wallpaper, never the GUI.
      console.error('[we-wallpaper] layer mount failed:', error)
    }
    return () => layer.dispose()
  }, 'we-wallpaper: layer')

  // The card: live state + actions over the same store.
  const card = new WallpaperCardController(store)
  void card.refresh()
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'we-wallpaper',
    order: 120,
    locale: NS,
    inject: (): WallpaperCardFace => card.inject(),
  }, WallpaperCard))
}

export { LAYER_ID, BODY_ATTR }
