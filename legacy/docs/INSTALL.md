# Installation / 安装指南

`dsh-we-wallpaper` is a standard dsh bundle plugin: it is loaded through the
web profile's `cordis.patch.yml` + `node_modules`, exactly like every other
DSH plugin. Pick whichever path fits your setup.

`dsh-we-wallpaper` 是标准 dsh bundle 插件：通过 web profile 的
`cordis.patch.yml` + `node_modules` 加载，与其他 DSH 插件一致。按你的环境任选
一种安装方式。

## Requirements / 环境要求

- Windows (Wallpaper Engine is Windows-only)
- DeepSeek Harness desktop app, or any `dsh web` profile with the Web GUI
- Wallpaper Engine installed through Steam (any library folder; the plugin
  finds it via the Steam registry — `DSH_WE_DIR` env override also works)
- For scene-wallpaper HD extraction: the plugin runs entirely offline

## Option A — `dsh plugin` CLI (recommended)

```sh
# local path
dsh plugin --profile web add /path/to/dsh-we-wallpaper

# or a published repository
dsh plugin --profile web add https://github.com/pbadgpmeb22791-sketch/dsh-we-wallpaper
```

The CLI installs the package into the web profile and writes the insert row.
Restart the dsh host (or hot-reload), then refresh the GUI page.

## Option B — manual patch (no `dsh` CLI on PATH)

1. Copy this repo (with its `node_modules`, i.e. `npm install` first) to
   `~/.dsh/profiles/web/node_modules/dsh-we-wallpaper/`
2. Append the insert row from `cordis.patch.yml` to
   `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: we-wallpaper
      name: 'dsh-we-wallpaper'
```

3. Restart the dsh host and refresh the GUI page.

## Option C — dsh-super-injector (development / hot-swap)

If you use [dsh-super-injector](https://github.com/zhu1090093659/dsh-routing-suite):

```text
dev_inject_plugin  <plugin-dir>     # runtime inject, no restart
dev_reload_package dsh-we-wallpaper # hot reload after a rebuild
dev_uninject_plugin dsh-we-wallpaper
```

## Verification / 验证安装

Refresh the GUI page, open **设置 → 插件配置 → 动态壁纸**. You should see:

- the wallpaper library grid (with live previews)
- the current selection highlighted, plus a "桌面使用中" badge on the
  wallpaper WE is running on your desktop

Select any wallpaper — it becomes the GUI background immediately. Scene
wallpapers show the extracted high-resolution artwork once the extraction
finishes (first time takes a moment; later loads come from the cache).
