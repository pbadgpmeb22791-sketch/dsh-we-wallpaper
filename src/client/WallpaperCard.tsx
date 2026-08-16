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

import { useMemo, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WallpaperListItem } from './layer-types.ts'
import type { WeWallpaperKey } from './locales.ts'
import { WallpaperStateStore } from './state.ts'

/** The card's live state. */
export interface WallpaperCardState {
  /** Whether the library is still loading. */
  loading: boolean
  /** Whether a Wallpaper Engine install was found. */
  found: boolean
  /** The WE install root (display only). */
  root: string | null
  /** The library entries. */
  wallpapers: WallpaperListItem[]
  /** Currently selected wallpaper id ('' = off). */
  activeId: string
  /** The applied display options. */
  scrim: number
  translucency: number
  fit: 'cover' | 'contain'
  sharpen: number
  /** Last load error (display only). */
  error: string | null
}

/** The face injected into the card's slot registration. */
export interface WallpaperCardFace {
  /** Live card state (becomes the `useWallpaper` selector hook). */
  hooks: {
    wallpaper: HostObservable<WallpaperCardState>
  }
  /** Apply a wallpaper ('' clears the selection). */
  select: (id: string) => void
  /** Re-scan the library. */
  refresh: () => void
  /** Set the scrim 0-100. */
  setScrim: (value: number) => void
  /** Set the panel translucency 0-90. */
  setTranslucency: (value: number) => void
  /** Set the media fit. */
  setFit: (fit: 'cover' | 'contain') => void
  /** Set the preview sharpening 0-100. */
  setSharpen: (value: number) => void
}

/** Controller: owns the state, talks to the shared store and the host API. */
export class WallpaperCardController implements HostObservable<WallpaperCardState> {
  private state: WallpaperCardState = {
    loading: true,
    found: false,
    root: null,
    wallpapers: [],
    activeId: '',
    scrim: 25,
    translucency: 50,
    fit: 'cover',
    sharpen: 40,
    error: null,
  }
  private readonly listeners = new Set<() => void>()
  private readonly store: WallpaperStateStore

  /** @param store - the shared wallpaper state store. */
  constructor(store: WallpaperStateStore) {
    this.store = store
    store.subscribe(() => {
      this.resyncFromStore()
      this.publish()
    })
    this.resyncFromStore()
  }

  /** The face handed to the slot registration. */
  inject(): WallpaperCardFace {
    return {
      hooks: { wallpaper: this },
      select: (id) => this.select(id),
      refresh: () => { void this.refresh() },
      setScrim: (value) => this.store.setScrim(value),
      setTranslucency: (value) => this.store.setTranslucency(value),
      setFit: (fit) => this.store.setFit(fit),
      setSharpen: (value) => this.store.setSharpen(value),
    }
  }

  getSnapshot(): WallpaperCardState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }

  private resyncFromStore(): void {
    const state = this.store.getSnapshot()
    this.state = {
      ...this.state,
      activeId: state.selectedId,
      scrim: state.scrim,
      translucency: state.translucency,
      fit: state.fit,
      sharpen: state.sharpen,
    }
  }

  /** Apply a wallpaper through the shared store ('' = official background). */
  private select(id: string): void {
    this.store.select(id)
  }

  /** Re-fetch the library from the host. */
  async refresh(): Promise<void> {
    this.state = { ...this.state, loading: true, error: null }
    this.publish()
    try {
      const response = await fetch('/api/we-wallpaper/list')
      const data = (await response.json()) as {
        ok?: boolean
        found?: boolean
        root?: string | null
        wallpapers?: WallpaperListItem[]
        error?: string
      }
      if (data.ok !== true) {
        this.state = {
          ...this.state,
          loading: false,
          error: data.error ?? 'unknown-error',
        }
      } else {
        this.state = {
          ...this.state,
          loading: false,
          found: data.found === true,
          root: data.root ?? null,
          wallpapers: Array.isArray(data.wallpapers) ? data.wallpapers : [],
          error: null,
        }
      }
    } catch (error) {
      this.state = {
        ...this.state,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    this.publish()
  }
}

/** Props the renderer binds for the card. */
export type WallpaperCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'weWallpaper'>
  & InjectFace<WallpaperCardFace>

/** The type-badge key of one wallpaper. */
function typeKey(type: WallpaperListItem['type']): WeWallpaperKey {
  return `type.${type}` as WeWallpaperKey
}

/** The source-badge key of one wallpaper. */
function sourceKey(source: WallpaperListItem['source']): WeWallpaperKey {
  return `source.${source}` as WeWallpaperKey
}

/**
 * Render the card.
 * @param props - locale copy, the live state hook, and the action callbacks.
 */
export function WallpaperCard(props: WallpaperCardProps) {
  const { t } = props
  const state = props.useWallpaper(snapshot => snapshot)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return state.wallpapers
    return state.wallpapers.filter((wallpaper) =>
      wallpaper.title.toLowerCase().includes(needle)
      || wallpaper.id.toLowerCase().includes(needle))
  }, [state.wallpapers, query])

  return (
    <div className="dsh-we-card">
      <div className="dsh-we-card-head">
        <strong>{t('card.title')}</strong>
        <button type="button" onClick={props.refresh}>{t('card.refresh')}</button>
        <button type="button" onClick={() => props.select('')} title={t('card.clearHint')}>
          {t('card.clear')}
        </button>
      </div>
      <div className="dsh-we-card-status">
        {state.error !== null
          ? t('card.error', { error: state.error })
          : state.found
            ? t('card.found', { root: state.root ?? '' })
            : t('card.notFound')}
      </div>

      <div className="dsh-we-card-controls">
        <div className="dsh-we-card-control">
          <label htmlFor="dsh-we-scrim">
            {t('card.option.scrim')}: {state.scrim}%
          </label>
          <input
            id="dsh-we-scrim"
            type="range"
            min={0}
            max={100}
            step={5}
            value={state.scrim}
            onChange={(event) => props.setScrim(Number(event.target.value))}
          />
        </div>
        <div className="dsh-we-card-control">
          <label htmlFor="dsh-we-translucency">
            {t('card.option.translucency')}: {state.translucency}%
          </label>
          <input
            id="dsh-we-translucency"
            type="range"
            min={0}
            max={90}
            step={5}
            value={state.translucency}
            onChange={(event) => props.setTranslucency(Number(event.target.value))}
          />
        </div>
        <div className="dsh-we-card-control">
          <label htmlFor="dsh-we-fit">{t('card.option.fit')}</label>
          <select
            id="dsh-we-fit"
            value={state.fit}
            onChange={(event) => props.setFit(event.target.value as 'cover' | 'contain')}
          >
            <option value="cover">{t('card.option.fit.cover')}</option>
            <option value="contain">{t('card.option.fit.contain')}</option>
          </select>
        </div>
        <div className="dsh-we-card-control">
          <label htmlFor="dsh-we-sharpen" title={t('card.option.sharpenHint')}>
            {t('card.option.sharpen')}: {state.sharpen}%
          </label>
          <input
            id="dsh-we-sharpen"
            type="range"
            min={0}
            max={100}
            step={5}
            value={state.sharpen}
            onChange={(event) => props.setSharpen(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="dsh-we-card-search">
        <input
          type="search"
          value={query}
          placeholder={t('card.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {state.loading && state.wallpapers.length === 0
        ? <div className="dsh-we-card-empty">{t('card.loading')}</div>
        : filtered.length === 0
          ? <div className="dsh-we-card-empty">
            {state.wallpapers.length === 0 ? t('card.libraryEmpty') : t('card.empty')}
          </div>
          : (
            <div className="dsh-we-card-grid">
              {filtered.map((wallpaper) => {
                const active = wallpaper.id === state.activeId
                return (
                  <div
                    key={wallpaper.id}
                    className="dsh-we-card-item"
                    data-active={active}
                    role="button"
                    tabIndex={0}
                    title={`${wallpaper.title} (${t(typeKey(wallpaper.type))})`}
                    onClick={() => props.select(wallpaper.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        props.select(wallpaper.id)
                      }
                    }}
                  >
                    <img
                      className="dsh-we-card-thumb"
                      loading="lazy"
                      alt={wallpaper.title}
                      src={`/api/we-wallpaper/preview/${encodeURIComponent(wallpaper.id)}`}
                      onError={(event) => {
                        // Broken preview: hide the img and put a placeholder
                        // SIBLING in (never replace the img node — React owns
                        // it and would throw on its next reconciliation).
                        const img = event.currentTarget
                        if (img.dataset.fallback === 'true') return
                        img.dataset.fallback = 'true'
                        img.style.display = 'none'
                        const holder = document.createElement('div')
                        holder.className = 'dsh-we-card-thumb-empty'
                        holder.textContent = wallpaper.title
                        img.insertAdjacentElement('afterend', holder)
                      }}
                    />
                    <div className="dsh-we-card-meta">
                      <div className="dsh-we-card-title">{wallpaper.title}</div>
                      <div className="dsh-we-card-badges">
                        <span className="dsh-we-card-badge">{t(typeKey(wallpaper.type))}</span>
                        <span className="dsh-we-card-badge">{t(sourceKey(wallpaper.source))}</span>
                        {active && <span className="dsh-we-card-badge">{t('card.active')}</span>}
                        {wallpaper.activeOnDesktop && (
                          <span className="dsh-we-card-badge" data-hot="true">{t('card.desktop')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}
