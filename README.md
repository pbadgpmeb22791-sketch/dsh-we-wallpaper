# dsh-we-wallpaper

Use your local [Wallpaper Engine](https://store.steampowered.com/app/431960)
library as the background of the [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
Web GUI — **video wallpapers play**, **web wallpapers render**, and **scene
wallpapers get their original high-resolution artwork decoded straight from
the `.pkg` file**. Hot-pluggable, dependency-free, no dsh source changes.

- Language: [简体中文](README.zh.md)

## Features

- **Plays the wallpaper as the GUI background**
  - `video` wallpapers play as a looping muted `<video>` (native resolution)
  - `web` wallpapers render in a sandboxed, click-through `<iframe>`
  - `image` wallpapers display as-is
  - `scene` / `application` wallpapers display the **background artwork
    decoded from `scene.pkg`** — an in-repo, dependency-free decoder for the
    WE package format (embedded PNG/JPEG, LZ4 mipmaps, DXT1/3/5, RGBA8888),
    so most scenes show their original 4K–8K textures instead of the tiny
    150–256px preview GIF
- **A settings card** in the official plugin configuration section
  (**设置 → 插件配置**): browse the library with live previews, search,
  one-click apply, and a badge marking the wallpaper currently running on
  your desktop
- **Readability controls**: dark *scrim*, *panel translucency* (the official
  surface tokens are re-declared translucent — works in light and dark
  themes), *cover / contain* fit, *sharpening* (SVG convolution filter for
  fallback GIF sources), and an *animated scene previews* toggle
- **Resource-conscious playback**: the media element is reused while the
  wallpaper is unchanged — dragging a slider never restarts the video stream
  or spawns another decode pipeline (a memory-leak crash was fixed here)
- **Persistent selection** in `~/.dsh/we-wallpaper.json`; extracted scene
  artwork cached in `~/.dsh/we-wallpaper-cache/`

## Quick start

```sh
# from this repo
dsh plugin --profile web add <path-or-git-url>
# or, from a published repo:
# dsh plugin --profile web add https://github.com/pbadgpmeb22791-sketch/dsh-we-wallpaper
```

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

## Security notes

- Every route rejects cross-site requests (`Sec-Fetch-Site` / `Origin`
  fence) — a random webpage cannot read your wallpaper library through
  localhost CSRF
- Wallpaper ids resolve only against the scan map; web-file paths are
  traversal-guarded
- Web wallpapers run in a sandboxed, click-through iframe — they are still
  **your own local files**, treat workshop content with the trust you give
  it in Wallpaper Engine
- Scene/application wallpapers are never executed; only their textures are
  decoded

## Known limitations

- Scene backgrounds are **stills**: the largest landscape texture from the
  package is shown — particles, shaders and animation cannot be re-rendered
  in a browser. Very old package versions (PKGV0002-era) and a few exotic
  textures fall back to the animated local GIF
- The background-selection heuristic (largest × 16:9 aspect score) may pick
  a landscape character/foreground plate over the true backdrop on rare
  wallpapers (tracked in [docs/SUMMARY.md](docs/SUMMARY.md))
- Audio is muted (browser autoplay policy)
- The translucency remap covers the official `--dsw-alias-*` tokens;
  third-party plugins with hardcoded backgrounds may stay opaque

## Roadmap

See [docs/SUMMARY.md](docs/SUMMARY.md) — scene.json material-graph backdrop
selection, PKGV0002-era support, optional multi-layer compose, npm publish.

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
