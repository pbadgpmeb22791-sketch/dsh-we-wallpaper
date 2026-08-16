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

import type { WallpaperListItem } from './layer-types.ts'
import type { WallpaperStateStore, WeState } from './state.ts'
import { BODY_ATTR, LAYER_ID } from './styles.ts'

const API = '/api/we-wallpaper'

/** The shell surface tokens the translucency veil remaps. */
const SURFACE_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-bg-mask-2',
  '--dsw-alias-bg-mask-3',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-bg-multi-select',
  '--dsw-alias-bg-overlay',
  '--dsw-specific-sidebar-fill',
  '--dsw-specific-menu',
  '--dsw-specific-selector',
] as const

/** Parse a hex / rgb() / rgba() color into [r, g, b, a]; null when unsupported. */
export function parseColor(value: string): [number, number, number, number] | null {
  const text = value.trim().toLowerCase()
  let match: RegExpMatchArray | null

  if ((match = /^#([0-9a-f]{3,4})$/.exec(text)) !== null) {
    const hex = match[1]
    const expand = (index: number): number => parseInt(hex[index] + hex[index], 16)
    const alpha = hex.length === 4 ? expand(3) / 255 : 1
    return [expand(0), expand(1), expand(2), alpha]
  }
  if ((match = /^#([0-9a-f]{6,8})$/.exec(text)) !== null) {
    const hex = match[1]
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), alpha]
  }
  if ((match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text)) !== null) {
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
  }
  return null
}

/** Serialize rgba back to a css color string. */
export function toRgba(parts: [number, number, number, number], alpha: number): string {
  return `rgba(${Math.round(parts[0])}, ${Math.round(parts[1])}, ${Math.round(parts[2])}, ${alpha})`
}

/**
 * The background layer controller. Mount once (plugin apply); it follows the
 * shared state store for its whole life and retracts everything on dispose.
 */
export class WallpaperLayer {
  private readonly store: WallpaperStateStore
  private root: HTMLDivElement | null = null
  private media: HTMLElement | null = null
  private scrimEl: HTMLDivElement | null = null
  private tokensTag: HTMLStyleElement | null = null
  private tokenBase: Record<string, string> | null = null
  private metas: Map<string, WallpaperListItem> | null = null
  private readonly disposers: Array<() => void> = []
  private darkObserver: MutationObserver | null = null

  /** @param store - the shared wallpaper state store. */
  constructor(store: WallpaperStateStore) {
    this.store = store
  }

  /** Mount the layer: body attribute, DOM, store subscription, theme flip watch. */
  mount(): void {
    document.body.setAttribute(BODY_ATTR, '')

    const root = document.createElement('div')
    root.id = LAYER_ID
    const scrim = document.createElement('div')
    scrim.style.position = 'absolute'
    scrim.style.inset = '0'
    scrim.style.pointerEvents = 'none'
    root.appendChild(scrim)
    this.scrimEl = scrim
    document.body.appendChild(root)
    this.root = root

    this.disposers.push(this.store.subscribe(() => { void this.render() }))
    this.darkObserver = new MutationObserver(() => this.refreshTokens())
    this.darkObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    void this.render()
  }

  /** Retract everything this controller wrote. */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.darkObserver?.disconnect()
    this.darkObserver = null
    this.media?.remove()
    this.media = null
    this.root?.remove()
    this.root = null
    this.scrimEl = null
    this.tokensTag?.remove()
    this.tokensTag = null
    document.body.removeAttribute(BODY_ATTR)
  }

  /** The resolved state (already clamped by the store). */
  private read(): WeState {
    return this.store.getSnapshot()
  }

  /** Re-render everything from the store. */
  private async render(): Promise<void> {
    const settings = this.read()
    if (this.scrimEl !== null) {
      this.scrimEl.style.background = `rgba(0, 0, 0, ${settings.scrim / 100})`
    }
    this.applyTranslucency(settings.translucency)
    if (settings.selectedId === '') {
      this.clearMedia()
      return
    }
    let metas = await this.ensureMetas()
    let meta = metas?.get(settings.selectedId)
    // The selection may predate this session's scan; one refetch covers
    // wallpapers added after the card first loaded.
    if (meta === undefined && metas !== null) {
      this.metas = null
      metas = await this.ensureMetas()
      meta = metas?.get(settings.selectedId)
    }
    if (meta === undefined) {
      this.clearMedia()
      return
    }
    this.renderMedia(meta, settings.fit)
  }

  /** Fetch the library (cached per mount); returns the current map. */
  private async ensureMetas(): Promise<Map<string, WallpaperListItem> | null> {
    if (this.metas !== null) return this.metas
    try {
      const response = await fetch(`${API}/list`)
      const data = (await response.json()) as { ok?: boolean; wallpapers?: WallpaperListItem[] }
      if (data.ok === true && Array.isArray(data.wallpapers)) {
        this.metas = new Map(data.wallpapers.map((wallpaper) => [wallpaper.id, wallpaper]))
      }
    } catch {
      // Offline / host not reachable: keep the layer empty.
    }
    return this.metas
  }

  /** Swap in the media element for one wallpaper. */
  private renderMedia(meta: WallpaperListItem, fit: 'cover' | 'contain'): void {
    this.clearMedia()
    const root = this.root
    if (root === null) return
    root.style.setProperty('--dsw-we-fit', fit)
    const id = encodeURIComponent(meta.id)
    let element: HTMLElement

    if (meta.type === 'video') {
      const video = document.createElement('video')
      video.src = `${API}/media/${id}`
      video.autoplay = true
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.poster = `${API}/preview/${id}`
      video.disablePictureInPicture = true
      element = video
    } else if (meta.type === 'web') {
      const frame = document.createElement('iframe')
      frame.src = `${API}/web/${id}/`
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
      frame.setAttribute('scrolling', 'no')
      frame.setAttribute('allow', 'autoplay')
      frame.setAttribute('tabindex', '-1')
      frame.setAttribute('aria-hidden', 'true')
      element = frame
    } else if (meta.type === 'image') {
      const image = document.createElement('img')
      image.src = `${API}/media/${id}`
      image.alt = meta.title
      element = image
    } else {
      const image = document.createElement('img')
      image.src = `${API}/preview/${id}`
      image.alt = meta.title
      element = image
    }

    root.appendChild(element)
    this.media = element
  }

  private clearMedia(): void {
    this.media?.remove()
    this.media = null
  }

  /** Re-snapshot the base tokens after a theme flip and re-apply. */
  private refreshTokens(): void {
    this.tokenBase = null
    this.applyTranslucency(this.read().translucency)
  }

  /** Snapshot the shell's surface tokens (once per theme). */
  private ensureTokenBase(): void {
    if (this.tokenBase !== null) return
    const computed = getComputedStyle(document.body)
    const base: Record<string, string> = {}
    for (const token of SURFACE_TOKENS) {
      const value = computed.getPropertyValue(token).trim()
      if (value !== '') base[token] = value
    }
    this.tokenBase = base
  }

  /** Re-declare the surface tokens at the chosen alpha (0 = official look). */
  private applyTranslucency(translucency: number): void {
    this.tokensTag?.remove()
    this.tokensTag = null
    const alpha = Math.max(0, Math.min(90, translucency)) / 100
    if (alpha <= 0) return
    this.ensureTokenBase()
    if (this.tokenBase === null) return

    const rules: string[] = [`body[${BODY_ATTR}] [id='root'] { background: transparent; }`]
    for (const [token, raw] of Object.entries(this.tokenBase)) {
      const parts = parseColor(raw)
      if (parts === null) continue
      rules.push(`body[${BODY_ATTR}] { ${token}: ${toRgba(parts, parts[3] * alpha)}; }`)
    }
    const tag = document.createElement('style')
    tag.dataset.pluginCss = 'we-wallpaper-tokens'
    tag.textContent = rules.join('\n')
    document.head.appendChild(tag)
    this.tokensTag = tag
  }
}
