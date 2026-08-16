/**
 * Browser-side mirror of the plugin state: reads and writes
 * `/api/we-wallpaper/state` (the host persists it to ~/.dsh/
 * we-wallpaper.json). Both the background layer and the settings card share
 * one store instance per plugin fiber, so a selection made in the card
 * re-renders the layer instantly and survives page reloads.
 */

/** The persisted wallpaper state (mirrors src/state.ts). */
export interface WeState {
  selectedId: string
  scrim: number
  translucency: number
  fit: 'cover' | 'contain'
}

/** Defaults when the host has no state yet. */
export const DEFAULT_STATE: WeState = {
  selectedId: '',
  scrim: 25,
  translucency: 50,
  fit: 'cover',
}

const API = '/api/we-wallpaper'

/** Shared store: snapshot + subscribe + optimistic writes through the host. */
export class WallpaperStateStore {
  private state: WeState = { ...DEFAULT_STATE }
  private readonly listeners = new Set<() => void>()
  private loaded = false

  getSnapshot(): WeState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Fetch the persisted state once (idempotent; retried on next call when it failed). */
  async load(): Promise<void> {
    try {
      const response = await fetch(`${API}/state`)
      const data = (await response.json()) as { ok?: boolean; state?: WeState }
      if (data.ok === true && typeof data.state === 'object' && data.state !== null) {
        this.state = normalize(data.state)
        this.loaded = true
        this.publish()
      }
    } catch {
      // Host unreachable: keep the defaults; the next write retries.
    }
  }

  /** Apply a wallpaper ('' = official background). */
  select(id: string): void {
    void this.write({ selectedId: id })
  }

  setScrim(value: number): void {
    void this.write({ scrim: value })
  }

  setTranslucency(value: number): void {
    void this.write({ translucency: value })
  }

  setFit(fit: 'cover' | 'contain'): void {
    void this.write({ fit })
  }

  /** Optimistic local apply, then persist through the host. */
  private async write(patch: Partial<WeState>): Promise<void> {
    const next = normalize({ ...this.state, ...patch })
    this.state = next
    this.publish()
    try {
      const response = await fetch(`${API}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await response.json()) as { ok?: boolean; state?: WeState }
      if (data.ok === true && typeof data.state === 'object' && data.state !== null) {
        // Adopt the host's canonical (clamped) state.
        this.state = normalize(data.state)
      }
    } catch {
      // Offline write: the optimistic value stays live for this session.
    }
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}

/** Clamp/coerce one raw section (mirrors the host normalizeState). */
export function normalize(raw: WeState): WeState {
  return {
    selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : DEFAULT_STATE.selectedId,
    scrim: typeof raw.scrim === 'number' && Number.isFinite(raw.scrim)
      ? Math.max(0, Math.min(100, Math.round(raw.scrim)))
      : DEFAULT_STATE.scrim,
    translucency: typeof raw.translucency === 'number' && Number.isFinite(raw.translucency)
      ? Math.max(0, Math.min(90, Math.round(raw.translucency)))
      : DEFAULT_STATE.translucency,
    fit: raw.fit === 'contain' ? 'contain' : 'cover',
  }
}
