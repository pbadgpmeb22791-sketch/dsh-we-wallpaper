/**
 * Types shared between the wallpaper layer and the settings card.
 */

/** One library entry as listed by /api/we-wallpaper/list. */
export interface WallpaperListItem {
  /** How the local preview endpoint should be rendered. */
  previewKind?: 'image' | 'video' | 'none'
  id: string
  title: string
  type: 'video' | 'web' | 'scene' | 'image' | 'audio' | 'other'
  source: 'workshop' | 'myprojects' | 'defaultprojects'
  workshopId: string | null
  activeOnDesktop: boolean
}
