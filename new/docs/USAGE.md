# Usage / 使用指南

## The settings card / 设置卡片

Open **设置 → 插件配置 → 动态壁纸** (the official plugin configuration
section). The card shows:

- **搜索框** — filter the library by title or id
- **壁纸网格** — live previews; click any wallpaper to apply it; the active
  one is highlighted; a 「桌面使用中」 badge marks the wallpaper WE currently
  runs on your desktop
- **刷新** — re-scan the Wallpaper Engine library
- **关闭壁纸背景** — restore the official background (options are kept)

## Wallpaper types / 壁纸类型

| Badge | Rendering |
| --- | --- |
| 视频 / Video | loops muted, native resolution (poster while loading) |
| 网页 / Web | sandboxed click-through iframe |
| 图片 / Image | shown as-is |
| 场景 / Scene | animated-first: one-time 1080p H.264 capture cached as a loop; static-HD/failure: exact extracted `.pkg` background |
| 应用程序 / Application | treated like scenes (artwork or preview) |
| 音频 / Audio, 其他 / Other | the local preview image |

## Options / 选项

| Control | Meaning |
| --- | --- |
| 遮罩 / Scrim | dark overlay 0–100% over the wallpaper for readability |
| 面板透明度 / Translucency | how much of the official surfaces the wallpaper shows through (0 = opaque) |
| 显示方式 / Fit | Cover (fills the viewport) or Contain (full frame) |
| 清晰度增强 / Sharpening | SVG convolution sharpen 0–100 (helps the tiny fallback GIF) |
| 场景显示模式 / Scene display mode | animated-first (default) generates/plays the cached HD animated loop; static-HD loads the extracted background immediately |
| RePKG 路径 / RePKG path | optional absolute path to a user-installed `RePKG.exe`; never downloaded by the plugin |

All options persist in `~/.dsh/we-wallpaper.json` and survive page reloads
and dsh restarts.

## Where things live / 文件位置

| Path | Purpose |
| --- | --- |
| `~/.dsh/we-wallpaper.json` | the current selection + options |
| `~/.dsh/we-wallpaper-cache/<workshopId>` | extracted scene background (PNG/JPEG) |
| `~/.dsh/we-wallpaper-cache/<workshopId>.json` | extraction meta (mime/size/timestamp) |

Delete the cache files to force a re-extraction; delete
`we-wallpaper.json` to reset the selection.

## Environment / 环境变量

- `DSH_WE_DIR` — point straight at the Wallpaper Engine install directory
  (skips Steam registry discovery)
- `DSH_HOME` — the dsh home (defaults to `~/.dsh`)

## Troubleshooting / 故障排查

**The card says "未找到 Wallpaper Engine"**
: The plugin checked the Steam registry and common paths. Set `DSH_WE_DIR`
to your install dir (e.g. `D:\Steam\steamapps\common\wallpaper_engine`) and
restart.

**A scene wallpaper still shows the blurry GIF**
: Open `/api/we-wallpaper/scene-video/status/<id>` and inspect `phase/error`.
The Windows desktop Harness and a running Wallpaper Engine are required.
Generation brings the scene window forward for roughly 15 seconds. If it
fails, switch to HD-static and inspect `/api/we-wallpaper/diagnostics/<id>`.

**The wallpaper doesn't show at all**
: the selection may point at a wallpaper that vanished; open the card and
re-pick one. Check that the layer is not hidden by a skin: skins and this
plugin both paint the background — use the stock look or a translucent skin.

**The GUI crashed while dragging sliders with a video wallpaper**
: this was a real bug (media element recreated per event) — update to the
latest version; the layer now reuses the element.
