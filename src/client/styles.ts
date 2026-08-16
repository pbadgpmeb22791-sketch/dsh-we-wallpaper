/**
 * dsh-we-wallpaper client styles — injected as plain <style> tags by the
 * client apply() (no CSS modules in this bundle). Everything rides the
 * shell's --dsw-alias-* tokens (with neutral fallbacks) so the card matches
 * any base theme, and the layer keeps its own fixed positioning.
 */

/** The background layer element id (see src/client/layer.ts). */
export const LAYER_ID = 'dsh-we-wallpaper-layer'

/** Body attribute marking the plugin active (dispose removes it). */
export const BODY_ATTR = 'data-dsh-we-wallpaper'

/** Static CSS for the fixed background layer. */
export const LAYER_CSS = `#${LAYER_ID} {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: #000;
}
#${LAYER_ID} > video,
#${LAYER_ID} > img,
#${LAYER_ID} > iframe {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: var(--dsw-we-fit, cover);
  border: 0;
  background: transparent;
  /* The plugin-owned SVG sharpen filter; none when sharpen = 0. */
  filter: var(--dsh-we-filter, none);
}
#${LAYER_ID} > iframe {
  pointer-events: none;
}
body[${BODY_ATTR}] {
  background-color: #000;
}
`

/** Static CSS for the settings card. */
export const CARD_CSS = `.dsh-we-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}
.dsh-we-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-we-card-status {
  font-size: 12px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.dsh-we-card-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 16px;
}
.dsh-we-card-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-we-card-control label {
  font-size: 12px;
  opacity: 0.85;
}
.dsh-we-card-control input[type='range'] {
  width: 100%;
}
.dsh-we-card-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(120, 130, 150, 0.35));
  background: var(--dsw-alias-bg-layer-2, rgba(240, 242, 246, 0.9));
  color: var(--dsw-alias-label-primary, #1c2430);
}
.dsh-we-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
  padding: 2px;
}
.dsh-we-card-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--dsw-alias-border-l2, rgba(120, 130, 150, 0.3));
  background: var(--dsw-alias-bg-layer-2, rgba(240, 242, 246, 0.9));
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.dsh-we-card-item:hover {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-we-card-item[data-active='true'] {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-we-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  background: #111;
}
.dsh-we-card-thumb-empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  opacity: 0.6;
  background: #1a1f2b;
  color: #cfd6e4;
}
.dsh-we-card-meta {
  padding: 6px 8px 8px;
}
.dsh-we-card-title {
  font-size: 12px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1c2430);
  word-break: break-all;
}
.dsh-we-card-badges {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.dsh-we-card-badge {
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(77, 107, 254, 0.1));
  color: var(--dsw-alias-label-secondary, #4a5568);
}
.dsh-we-card-badge[data-hot='true'] {
  background: var(--dsw-alias-state-warn-primary, #d97706);
  color: #fff;
}
.dsh-we-card-empty {
  padding: 18px 8px;
  text-align: center;
  font-size: 13px;
  opacity: 0.7;
  color: var(--dsw-alias-label-secondary, #4a5568);
}
`
