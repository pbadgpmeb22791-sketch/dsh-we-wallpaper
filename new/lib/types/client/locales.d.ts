/**
 * dsh-we-wallpaper copy: zh-first dictionaries with a complete English
 * mirror, registered through the locale service under the `weWallpaper`
 * namespace (the LocaleNamespaceMap merge lives in src/client/index.ts).
 */
/** zh dictionary (key-set source of truth). */
export declare const zh: {
    'card.title': string;
    'card.description': string;
    'card.found': string;
    'card.notFound': string;
    'card.refresh': string;
    'card.search': string;
    'card.empty': string;
    'card.libraryEmpty': string;
    'card.clear': string;
    'card.clearHint': string;
    'card.active': string;
    'card.desktop': string;
    'card.apply': string;
    'card.option.scrim': string;
    'card.option.scrimHint': string;
    'card.option.translucency': string;
    'card.option.translucencyHint': string;
    'card.option.fit': string;
    'card.option.fit.cover': string;
    'card.option.fit.contain': string;
    'card.option.sharpen': string;
    'card.option.sharpenHint': string;
    'card.option.sceneMode': string;
    'card.option.sceneModeHint': string;
    'card.option.sceneMode.animated': string;
    'card.option.sceneMode.static': string;
    'card.option.repkg': string;
    'card.option.repkgHint': string;
    'card.loading': string;
    'card.error': string;
    'type.video': string;
    'type.web': string;
    'type.scene': string;
    'type.image': string;
    'type.audio': string;
    'type.other': string;
    'source.workshop': string;
    'source.myprojects': string;
    'source.defaultprojects': string;
};
/** en dictionary, complete against the zh key set. */
export declare const en: Record<keyof typeof zh, string>;
/** The dictionary key union. */
export type WeWallpaperKey = keyof typeof zh;
