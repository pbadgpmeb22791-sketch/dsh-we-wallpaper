# dsh-we-wallpaper

Turn your [Wallpaper Engine](https://store.steampowered.com/app/431960) library
into the background of the [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
web GUI. A hot-pluggable plugin — no dsh source changes.

## What it does

- **Reads your local Wallpaper Engine library** (workshop content +
  `projects/myprojects` + `projects/defaultprojects`) directly from disk —
  no external services, no cloud.
- **Plays the wallpaper as the GUI background**:
  - `video` wallpapers play as a looping muted `<video>` (with a preview
    poster while loading),
  - `web` wallpapers render in a sandboxed, click-through `<iframe>`,
  - `image` wallpapers display as-is,
  - `scene` / `application` / other wallpapers render the **original
    background artwork extracted from the scene.pkg** — a dependency-free
    decoder for the WE package format (TEXV/TEXB containers, LZ4 mipmaps,
    DXT1/3/5, embedded PNG/JPEG; see scripts/survey-extract.mjs — 98%
    extraction rate over 40 sampled scenes, many 4K+). Extractions are
    cached under `~/.dsh/we-wallpaper-cache/`; the tiny local GIF serves as
    the loading / fallback layer, and the *animated scene previews* toggle
    restores the GIF-only behavior.
- **A settings card** in the official plugin configuration section
  (**设置 → 插件配置**): browse the library with live previews, search,
  one-click apply, and a badge for the wallpaper currently running on your
  desktop.
- **Readability controls**: a dark *scrim* over the wallpaper, *panel
  translucency* (the official surface tokens are re-declared translucent, so
  the wallpaper glows through — in light and dark themes), *cover / contain*
  fit, and *sharpening* (an SVG convolution filter that visibly recovers
  edges — scene previews are tiny sources and get upscaled to the full
  viewport).
- **Resource-conscious playback**: the media element is only (re)created when
  the wallpaper actually changes — option tweaks are pure CSS updates, so a
  slider drag never restarts the video stream or spawns a second decode
  pipeline.
- **Persistent selection**: stored in `~/.dsh/we-wallpaper.json` (the same
  pattern dsh-pet uses), so the wallpaper comes back after a page refresh or
  a dsh restart.

## Requirements

- Windows (Wallpaper Engine is Windows-only)
- DeepSeek Harness desktop app (or any `dsh web` profile) with the Web GUI
- Wallpaper Engine installed through Steam (any library folder; the plugin
  finds it via the Steam registry — `DSH_WE_DIR` env override also works)

## Install

```sh
# from the repo root
dsh plugin --profile web add <path-to-this-repo>
# or from a published GitHub URL
dsh plugin --profile web add https://github.com/<your-account>/dsh-we-wallpaper
```

No `dsh` CLI? Append the insert row from `cordis.patch.yml` to
`~/.dsh/profiles/web/cordis.patch.yml`, then put this package (with its
`node_modules`) under `~/.dsh/profiles/web/node_modules/` — or install with
the dsh-super-injector (`dev_inject_plugin`) when you use that tooling.

Restart (or hot-reload) the dsh host and refresh the GUI page. Open
**设置 → 插件配置 → 动态壁纸**, pick a wallpaper, and adjust the scrim /
translucency to taste.

## How it works

| Half | File | Role |
| --- | --- | --- |
| Host | `src/index.ts` | Mounts the `/api/we-wallpaper/*` route family |
| Host | `src/we-scanner.ts` | Discovers the WE install (env → Steam registry → `libraryfolders.vdf` → defaults) and parses every `project.json` |
| Host | `src/routes.ts` | `/api/we-wallpaper/list`, `/state`, `/preview/<id>`, `/media/<id>` (range-capable), `/web/<id>/<path>` — same-origin fenced, traversal-guarded |
| Host | `src/state.ts` | Selection persistence (`~/.dsh/we-wallpaper.json`, DSH_HOME aware) |
| Browser | `src/client/layer.ts` | The fixed background layer; token-snapshot translucency, scrim, media per kind |
| Browser | `src/client/WallpaperCard.tsx` | The library card (previews, search, apply, options) |

## Development

```sh
npm install
npm run typecheck   # tsc over host + client programs
npm test            # vitest (scanner / discovery / path guards)
npm run build       # tsc types + tsdown (lib/index.js + lib/client.js)
```

## Security notes

- All routes reject cross-site requests (`Sec-Fetch-Site` / `Origin` fence) —
  a random webpage cannot read your local wallpaper library through
  localhost CSRF.
- Wallpaper ids are resolved against the scan map and web-file paths are
  traversal-guarded; only files inside discovered wallpaper dirs are served.
- Web wallpapers run in a sandboxed, `pointer-events: none` iframe. They are
  still **your own local files** — treat workshop wallpapers with the same
  trust you give them in Wallpaper Engine.
- Scene/application wallpapers are never executed — they render as previews.

## Limitations

- Audio is muted (browser autoplay policy; a wallpaper with sound would also
  fight your GUI audio).
- Scene backgrounds are **stills**: the largest landscape texture extracted
  from scene.pkg (the package's proprietary format is decodable for
  textures — see scripts/survey-extract.mjs — but the scene itself cannot be
  re-rendered in a browser; particle/shaders are lost). Very old package
  versions and a few exotic textures fall back to the tiny local GIF (the
  sharpening control then does what it can). The *animated scene previews*
  option restores the GIF-only behavior.
- The translucency remap covers the main surface tokens
  (`--dsw-alias-*`); third-party plugins with their own hardcoded backgrounds
  may stay opaque.

## License

MIT
