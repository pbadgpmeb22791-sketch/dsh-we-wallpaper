# dsh-we-wallpaper

把你的 [Wallpaper Engine](https://store.steampowered.com/app/431960) 壁纸库变成
[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI 的背景。
热插拔插件——不改任何 dsh 源码。

## 它能做什么

- **直接读取本地 Wallpaper Engine 壁纸库**（创意工坊内容 + `projects/myprojects`
  + `projects/defaultprojects`），纯本地、无云端。
- **把动态壁纸渲染为 GUI 背景**：
  - `video` 视频壁纸以循环静音 `<video>` 播放（加载中先显示预览图），
  - `web` 网页壁纸以沙箱化、穿透点击的 `<iframe>` 渲染，
  - `image` 图片壁纸直接显示，
  - `scene` 场景 / `application` 程序等壁纸渲染**创意工坊高清预览图**（与
    Workshop 页面同一资源，首次拉取后本地缓存），本地小动图作为加载中/离线回退；
    「场景壁纸动图优先」开关可恢复纯动图模式。
- **设置卡片**（官方「设置 → 插件配置」区）：实时预览浏览壁纸库、搜索、一键应用，
  并标注当前正在桌面运行的壁纸。
- **可读性控制**：壁纸上方深色*遮罩*、*面板透明度*（把官方表面 token 重声明为
  半透明，壁纸透出——亮/暗主题均生效）、*铺满/完整* 显示方式，以及*清晰度增强*
  （SVG 卷积锐化，明显找回边缘——场景预览图是极小图源，放大到全屏后会发虚）。
- **资源友好的播放**：媒体元素只在壁纸真正切换时重建——调节选项只是纯 CSS 更新，
  拖动滑杆绝不会重启视频流或叠加第二条解码管线。
- **选择持久化**：存入 `~/.dsh/we-wallpaper.json`（与 dsh-pet 相同的模式），
  刷新页面或重启 dsh 后壁纸自动恢复。

## 环境要求

- Windows（Wallpaper Engine 仅支持 Windows）
- DeepSeek Harness 桌面版（或任意 `dsh web` profile）及其 Web GUI
- 通过 Steam 安装的 Wallpaper Engine（任意库目录均可；插件经 Steam 注册表
  自动定位，也可用 `DSH_WE_DIR` 环境变量覆盖）

## 安装

```sh
# 在仓库根目录
dsh plugin --profile web add <本仓库路径>
# 或从 GitHub URL
dsh plugin --profile web add https://github.com/<你的账号>/dsh-we-wallpaper
```

没有 `dsh` CLI？把 `cordis.patch.yml` 中的 insert 行追加到
`~/.dsh/profiles/web/cordis.patch.yml`，再把本包（连同其 `node_modules`）放到
`~/.dsh/profiles/web/node_modules/` 下；或在使用 dsh-super-injector 时用
`dev_inject_plugin` 注入。

重启（或热重载）dsh 宿主并刷新 GUI 页面。打开
**设置 → 插件配置 → 动态壁纸**，选中壁纸，按喜好调节遮罩与面板透明度。

## 工作原理

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `src/index.ts` | 挂载 `/api/we-wallpaper/*` 路由族 |
| Host | `src/we-scanner.ts` | 发现 WE 安装（env → Steam 注册表 → `libraryfolders.vdf` → 常见路径）并解析每个 `project.json` |
| Host | `src/routes.ts` | `/api/we-wallpaper/list`、`/state`、`/preview/<id>`、`/media/<id>`（支持 Range）、`/web/<id>/<path>`——同源栅栏 + 路径穿越防护 |
| Host | `src/state.ts` | 选择持久化（`~/.dsh/we-wallpaper.json`，DSH_HOME 感知） |
| 浏览器 | `src/client/layer.ts` | 固定背景层；token 快照半透明、遮罩、按类型渲染媒体 |
| 浏览器 | `src/client/WallpaperCard.tsx` | 壁纸库卡片（预览、搜索、应用、选项） |

## 开发

```sh
npm install
npm run typecheck   # tsc 检查 host + client 两套 program
npm test            # vitest（扫描 / 发现 / 路径防护）
npm run build       # tsc 类型 + tsdown（lib/index.js + lib/client.js）
```

## 安全说明

- 所有路由拒绝跨站请求（`Sec-Fetch-Site` / `Origin` 栅栏）——任意网页无法通过
  localhost CSRF 读取你的本地壁纸库。
- 壁纸 id 只做扫描表查找，网页文件路径有穿越防护；只提供已发现壁纸目录内的文件。
- 网页壁纸运行在沙箱化、`pointer-events: none` 的 iframe 中，但它们仍是
  **你自己的本地文件**——请像在 Wallpaper Engine 中一样信任创意工坊壁纸。
- 场景/程序壁纸永不执行，仅以预览图呈现。

## 已知限制

- 音频静音（浏览器自动播放策略；带声音的壁纸也会干扰 GUI 音频）。
- `scene.pkg` 壁纸无法在浏览器中渲染（私有编解码，见 scripts/probe-pkg.mjs），
  因此场景背景是**静态图**：Steam 创意工坊预览图（首次联网拉取后缓存在
  `~/.dsh/we-wallpaper-cache/`）。离线或作者未上传预览时回退到本地小动图
  （此时「清晰度增强」尽量补救）；「场景壁纸动图优先」开关可恢复纯动图模式。
- 半透明重映射覆盖主界面表面 token（`--dsw-alias-*`）；自带硬编码背景的
  第三方插件可能仍然不透明。

## 许可证

MIT
