# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-08-16

### Added

- Wallpaper Engine library bridge for the DeepSeek Harness Web GUI
  - video wallpapers play as muted looping `<video>` (native resolution)
  - web wallpapers render in a sandboxed click-through `<iframe>`
  - image wallpapers display as-is
  - scene/application wallpapers display **background artwork decoded from
    `scene.pkg`** (dependency-free decoder: TEXV/TEXB containers, LZ4
    mipmaps, DXT1/3/5, RGBA8888/RG88/R8, embedded PNG/JPEG, PNG encoding via
    node zlib) — measured 98% extraction rate over 40 sampled scenes, many
    4K–8K; results cached under `~/.dsh/we-wallpaper-cache/`
- Settings card in the official plugin configuration section: live previews,
  search, one-click apply, desktop-active badge
- Options: scrim, panel translucency (token-snapshot remap), cover/contain
  fit, SVG sharpening, animated-scene-previews toggle; persisted in
  `~/.dsh/we-wallpaper.json`
- `/api/we-wallpaper/*` route family (list/state/preview/pkg/media/web) —
  same-origin fenced, traversal-guarded, range-capable video streaming
- WE install discovery: `DSH_WE_DIR` env → Steam registry →
  `libraryfolders.vdf` → well-known defaults; workshop + local projects
  scanned; desktop-active detection from the WE config
- 40 vitest tests; CI workflow; bilingual README + docs/ documentation set

### Fixed

- Memory-leak crash when dragging options with a video wallpaper active
  (the background layer recreated the media element per state change — each
  event spawned a new decode pipeline; observed as RADAR_PRE_LEAK_64). The
  element is now reused while the wallpaper id is unchanged, async renders
  are sequence-guarded, option writes are trailing-debounced, and video
  decoders are released promptly on wallpaper switch
- Settings-card thumbnail fallback no longer replaces the React-owned `<img>`
  node (a DOM exception hazard); it hides the image and inserts a sibling
  placeholder

### Notes

- The Steam workshop "HD preview" approach was implemented then removed:
  measured byte-identical to the local preview GIF, so it added nothing —
  the scene.pkg decoder is the real fix
- DXT decoding is a TypeScript port of the LibSquish-derived MIT code from
  RePKG (Xalcon @ mmowned.com); the package format was cross-checked with
  the MIT C# [RePKG](https://github.com/notscuffed/repkg) implementation
