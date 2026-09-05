# dsh-we-wallpaper

把你的 [Wallpaper Engine](https://store.steampowered.com/app/431960) 壁纸库变成
[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI 的背景——
**视频壁纸直接播放、网页壁纸直接渲染、场景壁纸首次自动生成高清动画缓存**。
热插拔、无外部依赖、不改任何 dsh 源码。

- 语言: [English](README.md)

## 演示 / Screenshots

设置卡片与应用到界面背景的场景壁纸：

![demo-1](docs/images/demo-1.png)

![demo-2](docs/images/demo-2.png)

## 特性

- **把动态壁纸渲染为 GUI 背景**
  - `video` 视频壁纸以循环静音 `<video>` 播放（原生分辨率）
  - `web` 网页壁纸以沙箱化、穿透点击的 `<iframe>` 渲染
  - `image` 图片壁纸直接显示
  - `scene` 场景壁纸在「动态优先」模式下首次用 Wallpaper Engine 原生窗口播放，
    再通过 Windows Graphics Capture 硬件编码为 12 秒、1080p、30 FPS、16 Mbps 的
    H.264 循环；之后直接走缓存，完全避开 160px 预览图放大
  - 「高清静态」及故障降级仍使用内置 `.pkg` / TEX 解码器，沿场景依赖链提取
    4K–8K 原始背景贴图
- **设置卡片**（官方「设置 → 插件配置」区）：实时预览浏览壁纸库、搜索、一键应用，
  并标注当前正在桌面运行的壁纸
- **可读性控制**：深色*遮罩*、*面板透明度*（官方表面 token 重声明为半透明——
  亮/暗主题均生效）、*铺满/完整* 显示方式、*清晰度增强*（SVG 卷积锐化，用于
  回退动图源）、以及「动态优先 / 高清静态」场景模式
- **资源友好的播放**：壁纸不变时媒体元素复用——拖动滑杆绝不重启视频流或叠加
  解码管线（已修复此处导致的内存泄漏崩溃）
- **选择持久化**在 `~/.dsh/we-wallpaper.json`；场景贴图提取结果缓存在
  `~/.dsh/we-wallpaper-cache/`

## 动画缓存

- 高清录制存放在 `~/.dsh/we-wallpaper-cache/hd-video/`，按 Wallpaper Engine
  Workshop ID 保存为 MP4，并配有用于失效判断的 JSON 元数据。
- 它是可自动重建的持久缓存，不是一次性临时文件。壁纸源更新或录制器版本变化后
  会重新生成；手动删除缓存不会损坏插件。
- 首次生成会把 Wallpaper Engine 场景窗口置前约 15 秒，之后 DSH 直接读取缓存，
  不会每次启动都重新录屏。

## 快速开始

```powershell
git clone https://github.com/pbadgpmeb22791-sketch/dsh-we-wallpaper.git
dsh plugin --profile desktop add "<仓库路径>\new"
```

使用 dsh-super-injector 时，同样把插件路径设置为 `<仓库路径>\new`。仓库根目录
保留的是旧版，便于出现兼容性问题时回退。

重启（或热重载）dsh 宿主并刷新 GUI 页面，打开 **设置 → 插件配置 → 动态壁纸**，
选中壁纸，按喜好调节遮罩与面板透明度。

所有安装路径（含手动改 `cordis.patch.yml`、dsh-super-injector）见
[docs/INSTALL.md](docs/INSTALL.md)；全部选项与故障排查见
[docs/USAGE.md](docs/USAGE.md)。

## 工作原理

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `src/we-scanner.ts` | 发现 WE 安装（env → Steam 注册表 → `libraryfolders.vdf` → 常见路径）并解析每个 `project.json` |
| Host | `src/pkg-tex.ts` | WE 包解码器：目录表、TEXV/TEXB 容器、LZ4、DXT1/3/5、内嵌 PNG/JPEG、PNG 编码 |
| Host | `src/pkg-preview.ts` | 提取缓存（`~/.dsh/we-wallpaper-cache/`） |
| Host | `src/scene-video.ts` | 通过官方 CLI + wcap 生成并缓存高清 H.264 场景循环 |
| Host | `src/routes.ts` | `/api/we-wallpaper/*` 路由族——同源栅栏 + 路径穿越防护 |
| Host | `src/state.ts` | 选择持久化（`~/.dsh/we-wallpaper.json`） |
| 浏览器 | `src/client/layer.ts` | 固定背景层：按类型渲染媒体、token 快照半透明、遮罩、锐化 |
| 浏览器 | `src/client/WallpaperCard.tsx` | 壁纸库卡片（预览、搜索、应用、选项） |

### HTTP API

| 路由 | 用途 |
| --- | --- |
| `GET  /api/we-wallpaper/list` | 壁纸库（id/标题/类型/来源/桌面使用中） |
| `GET/POST /api/we-wallpaper/state` | 选择与选项持久化 |
| `GET  /api/we-wallpaper/preview/<id>` | 本地预览文件（GIF/JPG/PNG） |
| `GET  /api/we-wallpaper/pkg/<id>` | 提取的场景背景（PNG/JPEG，带缓存） |
| `GET  /api/we-wallpaper/media/<id>` | 主媒体文件（支持 Range 的视频流） |
| `GET  /api/we-wallpaper/web/<id>/<path>` | 网页壁纸静态文件 |
| `GET  /api/we-wallpaper/diagnostics/<id>` | 只读提取诊断、选中贴图与降级原因 |
| `POST /api/we-wallpaper/scene-video/generate/<id>` | 首次生成高清动画缓存 |
| `GET  /api/we-wallpaper/scene-video/status/<id>` | 查询生成进度/错误 |
| `GET  /api/we-wallpaper/scene-video/media/<id>` | 支持 Range 的 H.264 缓存流 |

## 安全说明

- 所有路由拒绝跨站请求（`Sec-Fetch-Site` / `Origin` 栅栏）——任意网页无法通过
  localhost CSRF 读取你的壁纸库
- 壁纸 id 只做扫描表查找；网页文件路径有穿越防护
- 网页壁纸运行在沙箱化、穿透点击的 iframe 中——它们仍是**你自己的本地文件**，
  请像在 Wallpaper Engine 中一样信任创意工坊内容
- 动态场景只由已安装的 Wallpaper Engine 本机进程打开；录制器是公共领域项目
  [wcap](https://github.com/mmozeiko/wcap)，源码许可证随 `tools/wcap/LICENSE` 提供

## 已知限制

- 高清动态缓存仅适用于 Windows 桌面版 Harness，并要求 Wallpaper Engine 已运行。
  首次生成时场景窗口会置前约 15 秒；缓存是 12 秒循环，随机/非周期动画可能在循环点
  出现跳变。启动或录制失败时会安全降级到高清静态贴图/本地预览。

- 可选填写本机 `RePKG.exe` 绝对路径。插件只在内置解码失败时调用，设置 30 秒
  超时，不会自动下载、安装或捆绑第三方程序。
- 内置静态解析会优先沿 `scene.json → model → material → TEX` 依赖链定位背景；
  只有场景关系无法确定时才使用尺寸/宽高比启发式，因此未知场景仍可能选错贴图。
- 音频静音（浏览器自动播放策略）
- 半透明重映射覆盖官方 `--dsw-alias-*` token；自带硬编码背景的第三方插件
  可能仍然不透明

## 本次更新解决了什么

旧版只能直接播放视频壁纸；场景壁纸通常只能放大 160px 左右的 Workshop 动态
预览，因此虽然保留动画，却会明显模糊。v0.3.0 不再把低分辨率预览当作最终背景，
而是让 Wallpaper Engine 自己完成场景渲染，插件只录制最终高清画面并缓存为 H.264。
这样在不实现完整 Wallpaper Engine 场景渲染器的前提下，同时保留了动画和清晰度。

对于不希望录制或录制失败的情况，插件仍可精确解析 `PKGV0021` 等场景包中的背景
贴图；样本 `3409595232` 会选择 `materials/背景.tex`（3840×2160），不再误选
前景人物纹理。真正未知或受保护的包不会被强制解密，而会安全降级并给出诊断信息。

## 路线图

后续可增加录制时长/码率配置、缓存空间管理与一键清理、循环接缝优化，以及对更多
旧版/特殊 TEX 容器的解析。完整技术总结见 [docs/SUMMARY.md](docs/SUMMARY.md)。

## 开发

```sh
npm install
npm run typecheck   # tsc 检查 host + client 两套 program
npm test            # vitest（pkg 解码器、LZ4、DXT、缓存、扫描器）
npm run build       # lib/index.js（host）+ lib/client.js（浏览器 bundle）
```

诊断脚本在 `scripts/`（`probe-pkg.mjs`、`probe-previews.mjs`、
`survey-extract.mjs`）。详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 许可证

MIT——DXT 解码包含 [RePKG](https://github.com/notscuffed/repkg)（Xalcon @
mmowned.com）中 LibSquish 衍生 MIT 代码的 TypeScript 移植。
