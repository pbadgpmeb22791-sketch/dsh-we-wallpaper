# 安装与更新指南

本页按 Windows 用户实际操作顺序编写。新版插件目录必须指向仓库中的 `new`，
不要误选仓库根目录；根目录保留的是旧版回退版本。

## 一、准备条件

安装前确认以下项目：

1. Windows 10 或 Windows 11。
2. 已安装并能正常运行 Wallpaper Engine。
3. 已安装 DeepSeek Harness 桌面版。
4. 已安装 Node.js 22 或更高版本；在 PowerShell 执行 `node --version` 能看到版本号。
5. Wallpaper Engine 中至少有一个可正常播放的壁纸。

## 二、下载插件

推荐使用 Git，这样以后可以直接更新：

```powershell
cd "D:\deepseek harness"
git clone https://github.com/pbadgpmeb22791-sketch/dsh-we-wallpaper.git
cd "D:\deepseek harness\dsh-we-wallpaper\new"
npm ci
npm run build
```

如果已经下载过仓库，不要再次 `git clone`，直接执行：

```powershell
cd "D:\deepseek harness\dsh-we-wallpaper"
git pull
cd .\new
npm ci
npm run build
```

构建完成后，新版插件的绝对路径应为：

```text
D:\deepseek harness\dsh-we-wallpaper\new
```

如果仓库放在其他位置，把后续命令中的路径替换为你自己的实际路径。

## 三、接入 DeepSeek Harness

### 方法 A：dsh-super-injector（本项目当前使用方式）

1. 启动 Wallpaper Engine，并确认桌面壁纸正在运行。
2. 启动 DeepSeek Harness。
3. 在 Super Injector 中把插件目录设置为完整的新版路径：

   ```text
   D:\deepseek harness\dsh-we-wallpaper\new
   ```

4. 如果你的 Super Injector 使用命令方式，执行：

   ```text
   dev_inject_plugin "D:\deepseek harness\dsh-we-wallpaper\new"
   ```

5. 修改源码并重新构建后，可执行：

   ```text
   dev_reload_package dsh-we-wallpaper
   ```

6. 刷新 DeepSeek Harness 页面；如插件卡片未出现，完全退出并重新启动 Harness。

不要把路径设置为 `D:\deepseek harness\dsh-we-wallpaper`，否则加载的是旧版。

### 方法 B：dsh 命令行

在 PowerShell 中执行：

```powershell
dsh plugin --profile desktop add "D:\deepseek harness\dsh-we-wallpaper\new"
```

然后重启 dsh 宿主并刷新 Web GUI。由于新版位于子目录，目前不要直接把 GitHub
仓库 URL 传给 `dsh plugin add`，否则可能加载仓库根目录中的旧版。

### 方法 C：手动安装

仅在前两种方法不可用时使用：

1. 先在 `new` 目录执行 `npm ci` 和 `npm run build`。
2. 将 `new` 目录完整复制到：

   ```text
   %USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-we-wallpaper
   ```

3. 打开 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`，加入：

   ```yaml
   - insert:
       - id: we-wallpaper
         name: 'dsh-we-wallpaper'
   ```

4. 完全退出并重新启动 DeepSeek Harness，然后刷新页面。

## 四、确认安装成功

1. 打开 DeepSeek Harness。
2. 进入 **设置 → 插件配置 → 动态壁纸**。
3. 应能看到 Wallpaper Engine 壁纸列表、搜索框和刷新按钮。
4. 先选择一个普通视频壁纸。它应立即成为 Harness 背景并循环播放。
5. 再选择一个 `场景 / Scene` 壁纸。默认“动态优先”模式会开始生成高清动画缓存。
6. 首次生成约需 15 秒，Wallpaper Engine 场景窗口会短暂置前。期间不要关闭该窗口、
   切换壁纸、退出 Wallpaper Engine 或让电脑休眠。
7. 生成完成后，Harness 应播放清晰的动态背景。以后再次选择同一壁纸会直接读取缓存。

## 五、更新新版

更新前先退出 DeepSeek Harness，避免旧文件被占用：

```powershell
cd "D:\deepseek harness\dsh-we-wallpaper"
git pull
cd .\new
npm ci
npm run typecheck
npm test
npm run build
```

随后重新启动 Harness，并在 Super Injector 中重载 `dsh-we-wallpaper`。

## 六、回退旧版

如果新版无法加载，不要删除任何文件：

1. 在 Super Injector 中移除当前新版：

   ```text
   dev_uninject_plugin dsh-we-wallpaper
   ```

2. 将插件路径由 `...\dsh-we-wallpaper\new` 改为：

   ```text
   D:\deepseek harness\dsh-we-wallpaper
   ```

3. 重新注入或重启 Harness。

旧版源码一直保留在仓库根目录，因此回退不会影响新版文件和缓存。

## 七、卸载

使用 Super Injector 时执行：

```text
dev_uninject_plugin dsh-we-wallpaper
```

使用 dsh CLI 或手动安装时，从 web profile 中移除对应插件注册，并重启 Harness。
如需同时删除个人选择和可重建缓存，再按[使用指南](USAGE.md#清理缓存与重置配置)
中的步骤操作。
