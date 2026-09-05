# dsh-we-wallpaper — Development Summary / 开发总结

> Status: working, iteratively improved. Known limitations are listed below —
> the plugin is released as-is and refined over time.
>
> 状态：可用，持续迭代。已知限制见文末——插件按现状发布，后续逐步优化。

## What this plugin does / 功能

Bridges a local **Wallpaper Engine** library into the **DeepSeek Harness** Web
GUI as the app background, hot-pluggable via `cordis.patch.yml` + profile —
no dsh source changes, no cloud, no external binaries.

把本地 Wallpaper Engine 壁纸库接入 DeepSeek Harness Web GUI 作为应用背景。
热插拔（cordis.patch.yml + profile），不改 dsh 源码、无云端、无外部二进制。

| Wallpaper type | Rendering |
| --- | --- |
| video | muted looping `<video>` (native resolution) |
| web | sandboxed click-through `<iframe>` |
| image | as-is |
| scene / application | **background artwork extracted from `scene.pkg`** (original resolution, often 4K+), with the tiny local GIF as the loading/fallback layer |

## How scene wallpapers got sharp / 场景壁纸高清化历程

The local preview WE ships is tiny (most are 150–256px; 56% of the library
is under 480p), and the Steam workshop preview turned out to be
**byte-identical** to that file (measured: 824735-byte GIF round-trip), so a
network HD source does not exist. The real answer is the package itself:

本地预览图极小（多数 150–256px，库中 56% 低于 480p）；实测 Steam Workshop
预览与本地文件字节一致（824735 字节 GIF 往返一致），网络高清源不存在。
真正的答案是包本身：

- The `scene.pkg` directory table parses cleanly; **JSON entries are plain
  text** and **texture entries carry real image data** — embedded PNG/JPEG
  (FIF_PNG/FIF_JPEG in TEXB0003+) or raw mipmaps (LZ4-compressed or
  DXT1/3/5, RGBA8888, RG88, R8).
- Format details were validated against real wallpapers and cross-checked
  with the MIT-licensed C# [RePKG](https://github.com/notscuffed/repkg)
  implementation (the [RePKG-GUI](https://github.com/YueFChen/RePKG-GUI)
  project was also referenced for the processing flow). The decoder in
  `src/pkg-tex.ts` is a dependency-free TypeScript port (LZ4 block decode,
  DXT1/3/5 via the LibSquish-derived MIT code, PNG encoding via node zlib).
- Extraction results are cached under `~/.dsh/we-wallpaper-cache/` and
  served by `GET /api/we-wallpaper/pkg/<id>`.
- Measured success rate: **98% over 40 sampled scenes** (many 4K–8K), see
  `scripts/survey-extract.mjs`.

scene.pkg 目录表可干净解析；**JSON 条目是明文**，**贴图条目携带真实图像数据**
——内嵌 PNG/JPEG（TEXB0003+ 的 FIF_PNG/FIF_JPEG）或原始 mipmap（LZ4 压缩 /
DXT1/3/5、RGBA8888、RG88、R8）。格式细节以真实壁纸验证，并与 MIT 许可的
C# [RePKG](https://github.com/notscuffed/repkg) 实现交叉核对（处理流程参考
[RePKG-GUI](https://github.com/YueFChen/RePKG-GUI)）。`src/pkg-tex.ts` 的解码器
是无依赖 TypeScript 移植（LZ4 块解码、DXT1/3/5（LibSquish 衍生 MIT 代码）、
node zlib PNG 编码）。提取结果缓存在 `~/.dsh/we-wallpaper-cache/`，由
`GET /api/we-wallpaper/pkg/<id>` 提供。实测成功率：40 个采样场景 **98%**
（大量 4K–8K），见 `scripts/survey-extract.mjs`。

## Stability fixes / 稳定性修复

- **Memory churn crash (fixed)**: the background layer used to recreate the
  media element on every option change — dragging a slider with a video
  wallpaper active spawned one new decode pipeline per event (a
  `RADAR_PRE_LEAK_64` was observed). The element is now reused while the
  wallpaper id is unchanged; async renders are sequence-guarded; option
  writes are trailing-debounced; video decoders are released promptly on
  wallpaper switch.

  内存抖动崩溃（已修）：背景层此前每次选项变化都重建媒体元素——视频壁纸
  下拖动滑杆每事件新建一条解码管线（曾观测到 RADAR_PRE_LEAK_64）。现在壁纸
  id 不变时复用元素；异步渲染加序号守卫；选项写入尾部防抖；切换壁纸时立即
  释放视频解码器。

- **Broken-preview fallback**: the settings card no longer replaces the
  React-owned `<img>` node on error (a DOM exception hazard); it hides the
  image and inserts a sibling placeholder instead.

  缩略图加载失败回退：设置卡片不再在出错时替换 React 拥有的 `<img>` 节点
  （DOM 异常隐患），改为隐藏图片并插入兄弟占位节点。

## Known limitations / 已知限制

- Scene backgrounds are **stills**: the largest landscape texture from
  `scene.pkg` is shown — particles, shaders and animation cannot be
  re-rendered in a browser. A few exotic textures and very old package
  versions (e.g. PKGV0002-era) fall back to the animated local GIF; the
  *animated scene previews* toggle restores GIF-only rendering.

  场景背景是**静态图**：显示 scene.pkg 中最大的横版贴图——粒子、着色器与
  动画无法在浏览器重渲染。少量特殊贴图与极老包版本（如 PKGV0002 时代）
  回退到本地动图；「场景壁纸动图优先」开关可恢复纯动图模式。

- The background-selection heuristic (largest × 16:9 aspect score) is not
  perfect: it may pick a landscape character/foreground plate over the true
  backdrop on rare wallpapers. Improvement ideas are tracked below.

  背景选择启发式（最大面积 × 16:9 宽高比评分）并非完美：少数壁纸可能选中
  横版角色/前景贴图而非真正背景。优化思路见下。

- Audio is muted (browser autoplay policy).

  音频静音（浏览器自动播放策略）。

- The translucency remap covers the official `--dsw-alias-*` surface tokens;
  third-party plugins with hardcoded backgrounds may stay opaque.

  半透明重映射覆盖官方 `--dsw-alias-*` 表面 token；自带硬编码背景的第三方
  插件可能仍然不透明。

## Roadmap / 优化方向

- [ ] Decode the `scene.json` material graph to pick the true backdrop
      texture (models/*.json → material → texture) instead of the heuristic.
      解析 scene.json 材质图（models/*.json → material → texture）精确定位
      背景贴图，替代面积启发式。
- [ ] Support PKGV0002-era packages (entry-name/data misalignment observed).
      支持 PKGV0002 时代包（已观察到条目名与数据错位）。
- [ ] Optional multi-layer compose: backdrop + character plates.
      可选多层合成：背景 + 角色层。
- [ ] Publish: npm package + `dsh plugin add` one-liner docs.
      发布：npm 包 + `dsh plugin add` 一键安装文档。

## Development / 开发

```sh
npm install
npm run typecheck   # tsc over host + client programs
npm test            # 40 vitest cases (pkg decoder, LZ4, DXT, cache, scanner)
npm run build       # lib/index.js (host) + lib/client.js (browser bundle)
```

Diagnostic scripts live in `scripts/`:
`probe-pkg.mjs` (package table dumper), `probe-previews.mjs` (preview
resolution survey), `survey-extract.mjs` (background extraction success rate).
