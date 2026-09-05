# Development / 开发指南

## Layout / 结构

```
src/
  index.ts              host entry (routes mount, exports)
  we-scanner.ts         WE install discovery + project.json scanning
  pkg-tex.ts            the WE package decoder (pure functions, unit-tested)
  pkg-preview.ts        extraction cache (~/.dsh/we-wallpaper-cache)
  routes.ts             /api/we-wallpaper/* route family
  state.ts              selection persistence (~/.dsh/we-wallpaper.json)
  client/
    index.ts            browser entry (locale, layer, card)
    layer.ts            the background layer controller
    layer-types.ts      shared WallpaperListItem type
    state.ts            browser-side state store (optimistic + debounced)
    WallpaperCard.tsx   the settings card
    locales.ts          zh/en dictionaries
    styles.ts           injected CSS (no CSS modules in this bundle)
tests/                  vitest suites + synthetic-pkg helpers
scripts/                diagnostics (probe-pkg, probe-previews, survey-extract)
docs/                   this documentation set
```

## Commands / 命令

```sh
npm install
npm run typecheck       # tsc over the host + client programs
npm test                # vitest (40 cases)
npm run build           # tsc types + tsdown → lib/index.js + lib/client.js
```

The browser bundle is the ModuleLoader closure factory
(`window.__ModuleLoader__.load(...)`); its only runtime externals are
`react` / `react/jsx-runtime` from the shell's module table.

## The package decoder / 包解码器

`src/pkg-tex.ts` decodes Wallpaper Engine `scene.pkg` packages:

1. **directory table** — `[u32 magicLen]["PKGVxxxx"][u32 entryCount]` then
   per entry `[u32 nameLen][name][u32 dataOffset][u32 dataLength]`; entry
   data lives at `dataStart + dataOffset`
2. **TEX files** — `"TEXV0005\0" "TEXI0001\0"` + header (format, flags,
   texture w/h, image w/h) + `"TEXB0003\0"`/`"TEXB0004\0"` container
   (image count, FreeImage format, optional isVideoMp4) + mipmaps
   `{w, h, isLz4, decompressedLen, byteLen, bytes}`
3. **decode** — embedded PNG/JPEG pass-through; LZ4 block decode; DXT1/3/5
   (LibSquish-derived, MIT); RGBA8888 / RG88 / R8; PNG encoding via node zlib

The format was validated against real wallpapers and cross-checked with the
MIT [RePKG](https://github.com/notscuffed/repkg) C# implementation. The
background heuristic picks the largest landscape (16:9-scored) decodable
texture; `scripts/survey-extract.mjs` measures the success rate.

## Diagnostics / 诊断脚本

```sh
node scripts/probe-pkg.mjs <scene.pkg>          # dump the package table
node scripts/probe-previews.mjs [workshop-dir]  # preview resolution survey
node scripts/survey-extract.mjs [workshop-dir] [limit]  # extraction rate
```

## Testing / 测试

- `tests/pkg-tex.spec.ts` — package table, LZ4 block decode, DXT1, PNG
  encoding, embedded-image pass-through, background heuristic (synthetic
  in-memory packages from `tests/pkg-helpers.ts`)
- `tests/pkg-preview.spec.ts` — extraction cache behavior
- `tests/state.spec.ts` — selection persistence
- `tests/scanner.spec.ts` — WE discovery + project.json scanning
