# 使用、缓存与故障排查指南

## 一、选择并应用壁纸

1. 先启动 Wallpaper Engine。
2. 打开 DeepSeek Harness，进入 **设置 → 插件配置 → 动态壁纸**。
3. 点击 **刷新**，让插件重新扫描 Wallpaper Engine 的 Workshop 与本地项目。
4. 可在搜索框输入壁纸名称或 Workshop ID。
5. 点击壁纸卡片即可应用；带“桌面使用中”标记的是 Wallpaper Engine 当前桌面壁纸。
6. 点击 **关闭壁纸背景** 可恢复 Harness 默认背景，其他设置会继续保留。

## 二、场景壁纸的两种模式

### 动态优先（默认，推荐）

1. 将 **场景显示模式** 设为 **动态优先**。
2. 点击一个 `场景 / Scene` 壁纸。
3. 首次使用时，插件让 Wallpaper Engine 在独立窗口中原生渲染场景，再录制为高清 MP4。
4. 场景窗口会置前约 15 秒。期间不要关闭窗口、切换壁纸、退出 Wallpaper Engine、
   锁屏或让电脑休眠。
5. 录制完成后，Harness 自动切换到清晰的动态循环。再次使用同一壁纸时直接播放缓存。

默认目标为约 12 秒、1080p、30 FPS、16 Mbps H.264。它保留最终画面的动画，
但鼠标交互、音频响应、时间变化和随机事件不会继续实时计算，而会重复录制循环。

### 高清静态

1. 将 **场景显示模式** 设为 **高清静态**。
2. 点击场景壁纸。
3. 插件沿 `scene.json → model → material → TEX` 依赖链提取原始背景贴图。
4. 这种模式没有动画，但无需录制，通常能获得 4K–8K 原始纹理清晰度。

动态录制失败时，插件会自动依次尝试精确高清静态贴图、可选 RePKG、启发式贴图
和普通预览，不会因为单张壁纸失败而让 Harness 崩溃。

## 三、显示选项

| 选项 | 建议与作用 |
| --- | --- |
| 遮罩 | 0–100%；文字看不清时调高 |
| 面板透明度 | 0 为不透明；调高后壁纸可透过 Harness 面板 |
| 显示方式 | `Cover` 铺满窗口，可能裁边；`Contain` 显示完整画面，可能留边 |
| 清晰度增强 | 主要用于低清预览降级源；高清 MP4 不建议拉得过高 |
| 场景显示模式 | `动态优先` 保留动画；`高清静态` 直接显示原始背景纹理 |
| RePKG 路径 | 可选的本机 `RePKG.exe` 绝对路径；插件不会自动下载 |

选择与选项会保存到：

```text
%USERPROFILE%\.dsh\we-wallpaper.json
```

## 四、缓存位置

| 路径 | 内容 |
| --- | --- |
| `%USERPROFILE%\.dsh\we-wallpaper-cache\hd-video\<ID>.mp4` | 高清动画循环 |
| `%USERPROFILE%\.dsh\we-wallpaper-cache\hd-video\<ID>.json` | 动画缓存版本与源文件时间信息 |
| `%USERPROFILE%\.dsh\we-wallpaper-cache\<ID>` | 提取的高清静态背景 |
| `%USERPROFILE%\.dsh\we-wallpaper-cache\<ID>.json` | 静态提取元数据 |

这些是可自动重建的持久缓存，不是系统临时文件。删除后不会损坏插件；下次选择对应
壁纸时会重新录制或提取。

## 五、清理缓存与重置配置

清理前先退出 DeepSeek Harness，并确认没有正在录制的 Wallpaper Engine 场景窗口。

### 只删除一张录错的动画

把示例 ID `3409595232` 替换为壁纸卡片显示的实际 Workshop ID：

```powershell
$cacheDirectory = Join-Path $env:USERPROFILE '.dsh\we-wallpaper-cache\hd-video'
$wallpaperId = '3409595232'
Remove-Item -LiteralPath (Join-Path $cacheDirectory "$wallpaperId.mp4") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $cacheDirectory "$wallpaperId.json") -Force -ErrorAction SilentlyContinue
```

### 删除全部高清录制缓存

下面的命令只清空 `hd-video` 内容，保留目录本身：

```powershell
$cacheDirectory = Join-Path $env:USERPROFILE '.dsh\we-wallpaper-cache\hd-video'
if (Test-Path -LiteralPath $cacheDirectory) {
  Get-ChildItem -LiteralPath $cacheDirectory -Force |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}
```

### 重置壁纸选择和插件选项

```powershell
$stateFile = Join-Path $env:USERPROFILE '.dsh\we-wallpaper.json'
Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
```

重新启动 Harness 后重新选择壁纸即可。

## 六、RePKG 备用提取器（可选）

正常使用不需要 RePKG。只有内置 `.pkg` / TEX 解析失败时才会调用它。

1. 用户自行从可信来源安装 RePKG；插件不会下载或捆绑它。
2. 在设置卡片的 **RePKG 路径** 中填写 `RePKG.exe` 的完整绝对路径。
3. 保存后重新选择失败的场景壁纸。
4. 插件以参数数组启动 RePKG，限制输出目录并设置约 30 秒超时。
5. RePKG 仍失败时会继续安全降级并记录原因。

RePKG 只能提取资源，不能完整重现 Wallpaper Engine 的粒子、着色器、脚本和交互。

## 七、诊断接口

把下列相对地址附加到当前 Harness 地址后访问，并将 `<ID>` 替换为 Workshop ID：

```text
/api/we-wallpaper/scene-video/status/<ID>
/api/we-wallpaper/diagnostics/<ID>
/api/we-wallpaper/state
```

- `scene-video/status`：查看动画缓存处于生成中、完成还是失败，以及错误原因。
- `diagnostics`：查看实际资源来源、选中的 TEX、降级步骤和缓存状态。
- `state`：查看当前选择和显示模式。

这些接口只读；非法 ID、跨站请求和路径穿越会被拒绝。

## 八、常见问题

### 设置卡片提示“未找到 Wallpaper Engine”

确认 Wallpaper Engine 已启动。如果安装在特殊目录，可在启动 Harness 前设置：

```powershell
$env:DSH_WE_DIR = 'D:\Steam\steamapps\common\wallpaper_engine'
```

路径必须指向包含 `wallpaper64.exe` 的 Wallpaper Engine 安装目录。设置后从同一个
PowerShell 会话启动 Harness，或把该变量配置为用户环境变量后重启 Harness。

### 场景壁纸仍然模糊

1. 确认模式为 **动态优先**。
2. 查看 `/api/we-wallpaper/scene-video/status/<ID>`。
3. 如果状态为失败，退出 Harness，删除该 ID 的 MP4 与 JSON，再重试。
4. 确认 Wallpaper Engine 正在运行，录制期间没有关闭场景窗口或锁屏。
5. 仍失败时切换 **高清静态**，再查看 `/api/we-wallpaper/diagnostics/<ID>`。

### 背景完全不显示

1. 点击 **刷新** 后重新选择壁纸。
2. 确认壁纸未从 Wallpaper Engine 中删除。
3. 暂时关闭使用不透明背景的第三方 Harness 皮肤。
4. 使用诊断接口确认资源是否成功选中。

### 动画循环处出现跳变

缓存是固定时长录制。随机或非周期场景可能无法无缝衔接；可换用高清静态模式，
或等待后续版本提供录制时长和循环优化设置。

### 操作滑杆时视频反复重启或 Harness 崩溃

这是旧版媒体元素重复创建问题。确认插件路径结尾是 `\new`，并按安装指南更新、
重新构建和重载 v0.3.0。
