# dsh-we-wallpaper — Development Summary / 开发总结

> [!IMPORTANT]
> 本节是 **v0.3.0 当前实现摘要**。下方“旧版开发记录”保留 v0.1.x 阶段的调查
> 过程，仅供追溯，不再代表新版行为。

## v0.3.0 当前实现

本插件把用户本机 Wallpaper Engine 壁纸库接入 DeepSeek Harness 背景层：

| 壁纸类型 | 新版处理方式 |
| --- | --- |
| 视频 | 原分辨率静音循环播放 |
| 网页 | 沙箱化、穿透点击的 iframe |
| 图片 | 直接显示原文件 |
| 场景 | 默认由 Wallpaper Engine 原生渲染并生成一次性高清 H.264 动画缓存 |
| 场景故障降级 | 精确高清 TEX → 可选 RePKG → 启发式 TEX → 普通预览 |

### 高清动画方案

旧版把约 150–256px 的 Workshop 动态预览放大到全屏，动画存在但画面明显模糊。
v0.3.0 改为：

1. 调用本机 Wallpaper Engine 打开真实场景窗口。
2. 使用随插件附带、公共领域许可的 `wcap`，通过 Windows Graphics Capture 捕获窗口。
3. 生成约 12 秒、1080p、30 FPS、16 Mbps 的 H.264 MP4。
4. 保存到 `~/.dsh/we-wallpaper-cache/hd-video/`，后续由 Harness 直接循环播放。
5. 依据 Wallpaper Engine 项目修改时间、录制器版本和参数判断缓存是否失效。

这不是每次启动都持续录屏，而是“首次生成、长期缓存、必要时重建”。它保留最终
画面的动画与清晰度，但交互、音频响应和实时随机变化会被固定为录制循环。

### 高清静态与 `.pkg` 解析

内置解析器支持 PKG/TEX、LZ4、DXT1/3/5、RGBA、内嵌 PNG/JPEG 等资源。背景选择
优先沿 `scene.json → model → material → TEX` 依赖链定位可见、全屏、低渲染层级
背景，无法确定时才使用尺寸与宽高比启发式。样本 `3409595232` 可正确选择
`materials/背景.tex`（3840×2160），不会误选前景人物纹理。

可选 `repkgPath` 只调用用户已经安装的本地 RePKG，不会自动下载。插件以参数数组
启动外部程序，限制输出目录、设置超时并捕获错误。

### 接口、安全与稳定性

- 保留 `/list`、`/state`、`/preview`、`/pkg`、`/media`、`/web`。
- 新增动画生成、状态、Range 流媒体和只读诊断接口。
- 壁纸 ID 必须来自扫描表；文件路径有穿越防护；路由拒绝跨站读取。
- 录制和解析异常均安全降级，不让 Harness 因单张壁纸失败而崩溃。
- 视频媒体元素在设置变化时复用，避免拖动滑杆重复创建解码管线。

### 已知边界

- 本阶段没有在浏览器内实现完整 Wallpaper Engine 场景渲染器。
- 首次动画生成会让场景窗口置前约 15 秒。
- 固定时长循环可能在随机/非周期动画上出现接缝。
- 真正未知或受保护的包不会被强制解密；所有提取器失败后使用普通预览。
- 动画静音；第三方不透明 Harness 皮肤可能遮住背景。

### 验证状态

- v0.3.0：类型检查通过，5 个测试文件、47 项测试通过，构建成功。
- CI 同时验证仓库根目录旧版与 `new/` 新版。
- 详细安装与操作见 [INSTALL.md](INSTALL.md) 和 [USAGE.md](USAGE.md)。

---

## 旧版开发记录（v0.1.x，仅供追溯）

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
