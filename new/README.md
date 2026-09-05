# dsh-we-wallpaper

Use your local [Wallpaper Engine](https://store.steampowered.com/app/431960)
library as the background of the [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
Web GUI — **video wallpapers play**, **web wallpapers render**, and **scene
wallpapers get a one-time high-resolution animated cache from Wallpaper Engine**.
Hot-pluggable, dependency-free, no dsh source changes.

- Language: [简体中文](README(ch).md)

## Screenshots / 演示

The wallpaper library card and a scene wallpaper applied as the GUI
background:

设置卡片与应用到界面背景的场景壁纸：

![demo-1](docs/images/demo-1.png)

![demo-2](docs/images/demo-2.png)

## Features

- **Plays the wallpaper as the GUI background**
  - `video` wallpapers play as a looping muted `<video>` (native resolution)
  - `web` wallpapers render in a sandboxed, click-through `<iframe>`
  - `image` wallpapers display as-is
  - `scene` wallpapers in animated-first mode are first played by Wallpaper
    Engine and captured through Windows.Graphics.Capture as a 12-second,
    1080p, 30 FPS, 16 Mbps H.264 loop; subsequent loads use the cache and
    never upscale the 160px Workshop preview
  - HD-static mode and failure fallback still use the dependency-free `.pkg`
    / TEX decoder to extract the exact 4K–8K background texture
- **A settings card** in the official plugin configuration section
  (**设置 → 插件配置**): browse the library with live previews, search,
  one-click apply, and a badge marking the wallpaper currently running on
  your desktop
- **Readability controls**: dark *scrim*, *panel translucency* (the official
  surface tokens are re-declared translucent — works in light and dark
  themes), *cover / contain* fit, *sharpening* (SVG convolution filter for
  fallback preview sources), and an *animated first / HD static* scene mode
- **Resource-conscious playback**: the media element is reused while the
  wallpaper is unchanged — dragging a slider never restarts the video stream
  or spawns another decode pipeline (a memory-leak crash was fixed here)
- **Persistent selection** in `~/.dsh/we-wallpaper.json`; extracted scene
  artwork cached in `~/.dsh/we-wallpaper-cache/`

## Animated cache

- HD recordings live under `~/.dsh/we-wallpaper-cache/hd-video/`, keyed by
  Wallpaper Engine Workshop ID, with JSON metadata used for invalidation.
- This is a persistent, rebuildable cache rather than a disposable temporary
  file. Source or recorder-version changes regenerate it; deleting it manually
  is safe.
- First generation foregrounds the Wallpaper Engine scene window for about 15
  seconds. Later DSH launches read the cached MP4 and do not record again.

## Quick start

```powershell
git clone https://github.com/pbadgpmeb22791-sketch/dsh-we-wallpaper.git
dsh plugin --profile desktop add "<repository-path>\new"
```

With dsh-super-injector, point the plugin path to `<repository-path>\new` as
well. The repository root keeps the legacy version for rollback.

Restart (or hot-reload) the dsh host, refresh the GUI page, open
**设置 → 插件配置 → 动态壁纸**, pick a wallpaper, adjust scrim / translucency
to taste.

See [docs/INSTALL.md](docs/INSTALL.md) for all install paths (including
manual `cordis.patch.yml` editing and dsh-super-injector) and
[docs/USAGE.md](docs/USAGE.md) for every option and the troubleshooting guide.

## How it works

| Half | File | Role |
| --- | --- | --- |
| Host | `src/we-scanner.ts` | Discovers the WE install (env → Steam registry → `libraryfolders.vdf` → defaults) and parses every `project.json` |
| Host | `src/pkg-tex.ts` | The WE package decoder: directory table, TEXV/TEXB containers, LZ4, DXT1/3/5, embedded PNG/JPEG, PNG encoding |
| Host | `src/pkg-preview.ts` | Extraction cache (`~/.dsh/we-wallpaper-cache/`) |
| Host | `src/scene-video.ts` | Builds/caches the HD H.264 loop through the official CLI + wcap |
| Host | `src/routes.ts` | `/api/we-wallpaper/*` route family — same-origin fenced, traversal-guarded |
| Host | `src/state.ts` | Selection persistence (`~/.dsh/we-wallpaper.json`) |
| Browser | `src/client/layer.ts` | The fixed background layer: media per type, token-snapshot translucency, scrim, sharpen |
| Browser | `src/client/WallpaperCard.tsx` | The library card (previews, search, apply, options) |

### HTTP API

| Route | Purpose |
| --- | --- |
| `GET  /api/we-wallpaper/list` | Wallpaper library (id/title/type/source/desktop-active) |
| `GET/POST /api/we-wallpaper/state` | Persisted selection + options |
| `GET  /api/we-wallpaper/preview/<id>` | The local preview file (GIF/JPG/PNG) |
| `GET  /api/we-wallpaper/pkg/<id>` | The extracted scene background (PNG/JPEG, cached) |
| `GET  /api/we-wallpaper/media/<id>` | The main media file (range-capable video streaming) |
| `GET  /api/we-wallpaper/web/<id>/<path>` | Static files of a web wallpaper |
| `POST /api/we-wallpaper/scene-video/generate/<id>` | Generate the first HD animated cache |
| `GET  /api/we-wallpaper/scene-video/status/<id>` | Read progress / failure status |
| `GET  /api/we-wallpaper/scene-video/media/<id>` | Range-capable cached H.264 stream |

## Security notes

- Every route rejects cross-site requests (`Sec-Fetch-Site` / `Origin`
  fence) — a random webpage cannot read your wallpaper library through
  localhost CSRF
- Wallpaper ids resolve only against the scan map; web-file paths are
  traversal-guarded
- Web wallpapers run in a sandboxed, click-through iframe — they are still
  **your own local files**, treat workshop content with the trust you give
  it in Wallpaper Engine
- Dynamic scenes are opened only by the locally installed Wallpaper Engine.
  The bundled recorder is the public-domain [wcap](https://github.com/mmozeiko/wcap)
  binary; its license is included at `tools/wcap/LICENSE`.

## Known limitations

- HD animated caching requires the Windows desktop Harness and a running
  Wallpaper Engine. The scene window comes to the foreground for roughly 15
  seconds on first generation. The 12-second loop may have a visible seam for
  random/non-periodic scenes. Failures safely fall back to the exact HD still
  or local preview.
- Static extraction first follows the `scene.json → model → material → TEX`
  dependency chain. Size/aspect heuristics are used only when scene relations
  cannot identify the background, so unknown scenes can still select the wrong
  texture.
- Audio is muted (browser autoplay policy)
- The translucency remap covers the official `--dsw-alias-*` tokens;
  third-party plugins with hardcoded backgrounds may stay opaque

## What this update fixes

The legacy version could play video wallpapers directly, but scene wallpapers
usually had to upscale an approximately 160px Workshop preview. That preserved
motion but looked visibly blurred. v0.3.0 lets Wallpaper Engine render the real
scene, then records and caches the final HD output as H.264. This preserves both
animation and clarity without attempting to reimplement the complete Wallpaper
Engine scene renderer.

When recording is disabled or fails, the built-in static path can still resolve
the real background texture from scene packages. Sample `3409595232` selects
`materials/背景.tex` at 3840×2160 instead of the foreground character texture.
Unknown or protected packages are not forcibly decrypted; they fail safely and
return diagnostics.

## Roadmap

Possible follow-ups include configurable capture duration/bitrate, cache-space
management and one-click cleanup, loop-seam improvements, and support for more
legacy or exotic TEX containers. See [docs/SUMMARY.md](docs/SUMMARY.md).

## Development

```sh
npm install
npm run typecheck   # tsc over host + client programs
npm test            # vitest (pkg decoder, LZ4, DXT, cache, scanner)
npm run build       # lib/index.js (host) + lib/client.js (browser bundle)
```

Diagnostic scripts live in `scripts/` (`probe-pkg.mjs`, `probe-previews.mjs`,
`survey-extract.mjs`). Full details in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License

MIT — DXT decoding includes a TypeScript port of the LibSquish-derived MIT
code from [RePKG](https://github.com/notscuffed/repkg) (Xalcon @ mmowned.com).
