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

/** SVG namespace for the sharpen filter defs. */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** The plugin-owned sharpen filter id (referenced by --dsh-we-filter). */
export const SHARPEN_FILTER_ID = 'dsh-we-sharpen'

/** CSS variable carrying the active filter (none when sharpen = 0). */
export const FILTER_VAR = '--dsh-we-filter'

/** Max sharpen strength (kernel off-center magnitude at 100). */
const MAX_SHARPEN = 0.8

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
  private kernelEl: SVGFEConvolveMatrixElement | null = null

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

    // The sharpen filter: an SVG feConvolveMatrix whose kernel the plugin
    // owns (strength follows the `sharpen` setting). The media elements
    // reference it through --dsh-we-filter, so 0 disables it entirely.
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.id = SHARPEN_FILTER_ID
    const kernel = document.createElementNS(SVG_NS, 'feConvolveMatrix')
    kernel.setAttribute('order', '3')
    kernel.setAttribute('preserveAlpha', 'true')
    filter.appendChild(kernel)
    svg.appendChild(filter)
    document.body.appendChild(svg)
    this.kernelEl = kernel

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
    this.clearMedia()
    this.root?.remove()
    this.root = null
    this.scrimEl = null
    this.tokensTag?.remove()
    this.tokensTag = null
    this.kernelEl?.ownerSVGElement?.remove()
    this.kernelEl = null
    document.body.removeAttribute(BODY_ATTR)
  }

  /** The resolved state (already clamped by the store). */
  private read(): WeState {
    return this.store.getSnapshot()
  }

  /** Monotonic render sequence: a superseded async render must not touch the DOM. */
  private renderSeq = 0

  /** The wallpaper id the current media element plays ('' = none). */
  private mediaId = ''

  /**
   * Apply the state to the layer. Option changes (scrim / translucency /
   * sharpen) are pure CSS updates; the media element is only (re)created when
   * the selected wallpaper actually changes — recreating a <video> on every
   * slider tick would spawn a new decode pipeline per event (memory churn).
   */
  private async render(): Promise<void> {
    const seq = ++this.renderSeq
    const settings = this.read()
    if (this.scrimEl !== null) {
      this.scrimEl.style.background = `rgba(0, 0, 0, ${settings.scrim / 100})`
    }
    this.applyTranslucency(settings.translucency)
    this.applySharpen(settings.sharpen)
    if (this.root !== null) {
      this.root.style.setProperty('--dsw-we-fit', settings.fit)
    }

    if (settings.selectedId === '') {
      if (this.mediaId !== '') this.clearMedia()
      return
    }
    // Same wallpaper: keep the running element (no re-stream, no re-decode).
    if (this.mediaId === settings.selectedId && this.media !== null) return

    let metas = await this.ensureMetas()
    let meta = metas?.get(settings.selectedId)
    // The selection may predate this session's scan; one refetch covers
    // wallpapers added after the card first loaded.
    if (meta === undefined && metas !== null) {
      this.metas = null
      metas = await this.ensureMetas()
      meta = metas?.get(settings.selectedId)
    }
    if (seq !== this.renderSeq) return // superseded while awaiting
    if (meta === undefined) {
      if (this.mediaId !== '') this.clearMedia()
      return
    }
    this.renderMedia(meta)
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

  /**
   * Swap in the media element for one wallpaper (only called on id change).
   * The `animatedPreviews` option only affects scene/application wallpapers:
   * the tiny local GIF is the loading + offline fallback layer, and the sharp
   * Steam workshop preview (when the host can fetch it) renders on top.
   */
  private renderMedia(meta: WallpaperListItem): void {
    this.clearMedia()
    const root = this.root
    if (root === null) return
    const id = encodeURIComponent(meta.id)
    const animated = this.store.getSnapshot().animatedPreviews
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
      // Scene / application / other: the GIF preview is the base layer.
      const gif = document.createElement('img')
      gif.src = `${API}/preview/${id}`
      gif.alt = meta.title
      root.appendChild(gif)
      this.media = gif
      this.mediaId = meta.id

      // Extracted scene.pkg background on top (workshop items only): the
      // host decodes the sharpest landscape texture from scene.pkg into a
      // PNG/JPEG and caches it; on error the GIF underneath keeps showing.
      if (!animated && meta.workshopId !== null) {
        const hd = document.createElement('img')
        hd.src = `${API}/pkg/${id}`
        hd.alt = meta.title
        hd.addEventListener('error', () => { hd.remove() })
        hd.addEventListener('load', () => {
          // Once the sharp frame is in, the blurry GIF adds nothing.
          if (gif.isConnected) gif.style.display = 'none'
        })
        root.appendChild(hd)
      }
      return
    }

    root.appendChild(element)
    this.media = element
    this.mediaId = meta.id
  }

  /**
   * Tear the media element down and release its decode resources promptly:
   * pausing + clearing the src + calling load() on a <video> drops the
   * decoder immediately instead of waiting for GC (avoids the memory spike
   * of stacked 4K decode pipelines when switching wallpapers). Every media
   * child goes (scene wallpapers stack a GIF + HD img pair).
   */
  private clearMedia(): void {
    const media = this.media
    this.media = null
    this.mediaId = ''
    const root = this.root
    if (root !== null) {
      for (const child of [...root.children]) {
        if (child === this.scrimEl) continue
        child.remove()
      }
    }
    if (media === null) return
    if (media instanceof HTMLVideoElement) {
      media.pause()
      media.removeAttribute('src')
      media.load()
    }
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

  /**
   * Drive the sharpen filter: an unsharp-style 3x3 convolution
   * ([0 -s 0; -s 1+4s -s; 0 -s 0] — identity + s * (identity - blur)).
   * Scene previews are tiny (often 150-256px) and get upscaled to the full
   * viewport; the mild kernel recovers perceived edge crispness. 0 disables
   * the filter entirely (--dsh-we-filter: none).
   * @param sharpen - 0-100 strength.
   */
  private applySharpen(sharpen: number): void {
    if (this.root === null) return
    const s = Math.max(0, Math.min(100, sharpen)) / 100 * MAX_SHARPEN
    if (s <= 0) {
      this.root.style.setProperty(FILTER_VAR, 'none')
      return
    }
    this.root.style.setProperty(FILTER_VAR, `url(#${SHARPEN_FILTER_ID})`)
    const center = 1 + 4 * s
    const kernel = `0 ${-s.toFixed(3)} 0 ${-s.toFixed(3)} ${center.toFixed(3)} ${-s.toFixed(3)} 0 ${-s.toFixed(3)} 0`
    this.kernelEl?.setAttribute('kernelMatrix', kernel)
  }
}
