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
  sharpen: number
}

/** Defaults when the host has no state yet. */
export const DEFAULT_STATE: WeState = {
  selectedId: '',
  scrim: 25,
  translucency: 50,
  fit: 'cover',
  sharpen: 40,
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

  /** Apply a wallpaper ('' = official background) — immediate write. */
  select(id: string): void {
    void this.write({ selectedId: id })
  }

  /** Option writes are debounced: a slider drag coalesces into one POST. */
  setScrim(value: number): void {
    this.writeSoon({ scrim: value })
  }

  setTranslucency(value: number): void {
    this.writeSoon({ translucency: value })
  }

  setFit(fit: 'cover' | 'contain'): void {
    this.writeSoon({ fit })
  }

  setSharpen(value: number): void {
    this.writeSoon({ sharpen: value })
  }

  /** Trailing-edge debounce state for option writes. */
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingPatch: Partial<WeState> = {}

  /**
   * Apply optimistically (live preview) and coalesce the host write: rapid
   * option changes during one drag produce exactly one POST.
   * @param patch - the option patch.
   * @param delay - trailing delay in ms.
   */
  private writeSoon(patch: Partial<WeState>, delay = 150): void {
    this.state = normalize({ ...this.state, ...patch })
    this.publish()
    Object.assign(this.pendingPatch, patch)
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer)
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      const merged = this.pendingPatch
      this.pendingPatch = {}
      void this.write(merged)
    }, delay)
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
    sharpen: typeof raw.sharpen === 'number' && Number.isFinite(raw.sharpen)
      ? Math.max(0, Math.min(100, Math.round(raw.sharpen)))
      : DEFAULT_STATE.sharpen,
  }
}
