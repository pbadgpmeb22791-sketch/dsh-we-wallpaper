/**
 * dsh-we-wallpaper copy: zh-first dictionaries with a complete English
 * mirror, registered through the locale service under the `weWallpaper`
 * namespace (the LocaleNamespaceMap merge lives in src/client/index.ts).
 */

/** zh dictionary (key-set source of truth). */
export const zh = {
  'card.title': '动态壁纸',
  'card.description': '把 Wallpaper Engine 的本地壁纸库用作 DeepSeek Harness 的背景。视频 / 网页 / 图片壁纸直接播放，场景与程序壁纸使用其预览动画。',
  'card.found': '已发现 Wallpaper Engine：{root}',
  'card.notFound': '未找到 Wallpaper Engine。已检查 Steam 注册表与常见安装目录；可在启动 DSH 前设置环境变量 DSH_WE_DIR 指向安装目录。',
  'card.refresh': '刷新',
  'card.search': '搜索壁纸…',
  'card.empty': '没有匹配的壁纸',
  'card.libraryEmpty': '壁纸库为空。请先在 Wallpaper Engine 中订阅或创建壁纸。',
  'card.clear': '关闭壁纸背景',
  'card.clearHint': '恢复官方背景（保留其他设置）',
  'card.active': '使用中',
  'card.desktop': '桌面使用中',
  'card.apply': '应用',
  'card.option.scrim': '遮罩',
  'card.option.scrimHint': '壁纸上的深色半透明层，保证文字可读',
  'card.option.translucency': '面板透明度',
  'card.option.translucencyHint': '主界面面板的透过程度，让壁纸透出（0 = 不透明官方面板）',
  'card.option.fit': '显示方式',
  'card.option.fit.cover': '铺满',
  'card.option.fit.contain': '完整',
  'card.option.sharpen': '清晰度增强',
  'card.option.sharpenHint': '场景壁纸的预览图分辨率很低（常见 150~256px），放大后发虚；卷积锐化可明显改善观感（0 = 关闭）',
  'card.loading': '正在读取壁纸库…',
  'card.error': '读取壁纸库失败：{error}',
  'type.video': '视频',
  'type.web': '网页',
  'type.scene': '场景',
  'type.image': '图片',
  'type.audio': '音频',
  'type.other': '其他',
  'source.workshop': '创意工坊',
  'source.myprojects': '我的项目',
  'source.defaultprojects': '默认项目',
} satisfies Record<string, string>

/** en dictionary, complete against the zh key set. */
export const en: Record<keyof typeof zh, string> = {
  'card.title': 'Dynamic Wallpapers',
  'card.description': 'Use your local Wallpaper Engine library as the DeepSeek Harness background. Video / web / image wallpapers play directly; scene and application wallpapers use their animated preview.',
  'card.found': 'Wallpaper Engine found at {root}',
  'card.notFound': 'Wallpaper Engine was not found. Steam registry and common install paths were checked; set the DSH_WE_DIR environment variable to its install directory before starting dsh.',
  'card.refresh': 'Refresh',
  'card.search': 'Search wallpapers…',
  'card.empty': 'No matching wallpapers',
  'card.libraryEmpty': 'The library is empty. Subscribe to or create wallpapers in Wallpaper Engine first.',
  'card.clear': 'Turn the wallpaper background off',
  'card.clearHint': 'Restore the official background (other options are kept)',
  'card.active': 'Active',
  'card.desktop': 'On desktop',
  'card.apply': 'Apply',
  'card.option.scrim': 'Scrim',
  'card.option.scrimHint': 'Dark overlay over the wallpaper so text stays readable',
  'card.option.translucency': 'Panel translucency',
  'card.option.translucencyHint': 'How much of the main-interface surfaces the wallpaper shows through (0 = opaque official panels)',
  'card.option.fit': 'Fit',
  'card.option.fit.cover': 'Cover',
  'card.option.fit.contain': 'Contain',
  'card.option.sharpen': 'Sharpening',
  'card.option.sharpenHint': 'Scene previews are very low resolution (often 150-256px) and get blurry when upscaled; convolution sharpening visibly recovers edges (0 = off)',
  'card.loading': 'Reading the wallpaper library…',
  'card.error': 'Failed to read the wallpaper library: {error}',
  'type.video': 'Video',
  'type.web': 'Web',
  'type.scene': 'Scene',
  'type.image': 'Image',
  'type.audio': 'Audio',
  'type.other': 'Other',
  'source.workshop': 'Workshop',
  'source.myprojects': 'My projects',
  'source.defaultprojects': 'Default projects',
}

/** The dictionary key union. */
export type WeWallpaperKey = keyof typeof zh
