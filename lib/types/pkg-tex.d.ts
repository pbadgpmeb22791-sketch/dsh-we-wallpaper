/**
 * Wallpaper Engine scene.pkg → background image extractor.
 *
 * The package format (validated against a real 3000925581 scene.pkg and
 * cross-checked with the RePKG C# implementation, MIT, notscuffed/repkg):
 *
 *   [u32 magicLen][magic "PKGVxxxx"] [u32 entryCount]
 *   entries: [u32 nameLen][name][u32 dataOffset][u32 dataLength] ...
 *   data area starts right after the table; each entry's bytes live at
 *   dataStart + dataOffset.
 *
 * JSON entries are plain text; texture entries are TEX files:
 *
 *   "TEXV0005\0" "TEXI0001\0"
 *   header: u32 format, u32 flags, u32 textureW, u32 textureH,
 *           u32 imageW, u32 imageH, u32 unk
 *   image container: "TEXB0003\0" u32 imageCount u32 freeImageFormat
 *   per image: u32 mipmapCount, then per mipmap:
 *     u32 width, u32 height, u32 isLz4, u32 decompressedLen, u32 byteLen, bytes
 *
 * This module decodes the largest texture to RGBA and encodes it as PNG
 * (Node's zlib) — no external dependencies, pure functions, unit-testable.
 * DXT decoding is a TypeScript port of the LibSquish-derived C# code in
 * RePKG (MIT, copyright Xalcon @ mmowned.com, see file header).
 */
/** One parsed package entry (data slice view). */
export interface PkgEntry {
    name: string;
    /** Data offset relative to the data area start. */
    offset: number;
    length: number;
    /** Absolute position in the file. */
    abs: number;
}
/** Parsed package structure. */
export interface PkgFile {
    magic: string;
    entries: PkgEntry[];
    dataStart: number;
    size: number;
}
/** A texture candidate: entry + parsed TEX header. */
export interface TexCandidate {
    name: string;
    /** TexFormat value (0=RGBA8888, 4=DXT5, 6=DXT3, 7=DXT1, 8=RG88, 9=R8). */
    format: number;
    flags: number;
    textureWidth: number;
    textureHeight: number;
    imageWidth: number;
    imageHeight: number;
    abs: number;
    length: number;
}
/** The decoded background image. */
export interface BackgroundImage {
    /** PNG or JPEG bytes (ready to serve). */
    bytes: Uint8Array;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
}
/** How the extractor selected the texture. */
export type BackgroundSelectionSource = 'scene-graph' | 'heuristic';
/** Background bytes plus selection diagnostics. */
export interface BackgroundExtraction extends BackgroundImage {
    source: BackgroundSelectionSource;
    selectedTex: string;
    packageMagic: string;
}
/** Parse the package directory table. Null when the layout is unsupported. */
export declare function parsePackage(buf: Uint8Array): PkgFile | null;
/** Parse a TEX header from an absolute position. Null when invalid. */
export declare function parseTexHeader(buf: Uint8Array, abs: number): {
    format: number;
    flags: number;
    textureWidth: number;
    textureHeight: number;
    imageWidth: number;
    imageHeight: number;
} | null;
/** Enumerate texture entries of a package (entries whose data starts with TEXV0005). */
export declare function findTexCandidates(buf: Uint8Array, pkg: PkgFile): TexCandidate[];
/** Decode an LZ4 block (the K4os LZ4Codec.Decode contract: known output length). */
export declare function lz4BlockDecode(src: Uint8Array, outLen: number): Uint8Array | null;
/** R8 (1 byte/pixel) → RGBA. */
export declare function decodeR8(src: Uint8Array, w: number, h: number): Uint8Array;
/** RG88 (2 bytes/pixel) → RGBA; WE semantics: color = (G,G,G,R) i.e. R is alpha. */
export declare function decodeRg88(src: Uint8Array, w: number, h: number): Uint8Array;
/** Decode a DXT1/3/5 texture into RGBA8888. */
export declare function decodeDxt(w: number, h: number, src: Uint8Array, format: 'dxt1' | 'dxt3' | 'dxt5'): Uint8Array | null;
/** Encode RGBA8888 pixels as a PNG (8-bit, color type 6, zlib deflate). */
export declare function rgbaToPng(width: number, height: number, rgba: Uint8Array): Uint8Array;
/** Crop RGBA to imageW x imageH (top-left, matching ImageSharp Crop). */
export declare function cropRgba(rgba: Uint8Array, texW: number, texH: number, imageW: number, imageH: number): Uint8Array;
/** One decoded texture: either an embedded image (PNG/JPEG bytes) or raw RGBA. */
export type DecodedTex = {
    kind: 'image';
    bytes: Uint8Array;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
} | {
    kind: 'rgba';
    rgba: Uint8Array;
    width: number;
    height: number;
};
/**
 * Decode one TEX entry's first image / first mipmap. Embedded image
 * containers (FIF_PNG / FIF_JPEG) pass the bytes through; raw containers
 * decode per the TEX format (RGBA8888 / DXT1/3/5 / RG88 / R8).
 */
export declare function decodeTexEntry(buf: Uint8Array, texAbs: number, header: {
    format: number;
    flags: number;
    textureWidth: number;
    textureHeight: number;
    imageWidth: number;
    imageHeight: number;
}): DecodedTex | null;
/**
 * Return scene-graph texture references in preference order. The score favors
 * visible image objects matching the orthographic canvas, neutral parallax,
 * early render order and explicit background/backdrop names.
 */
export declare function findSceneBackgroundTextures(buf: Uint8Array, pkg: PkgFile): string[];
/**
 * Extract the most background-like texture of a scene.pkg and report why it
 * was selected. Scene graph references win; aspect scoring is the fallback.
 *
 * Scenes are a stack of textures (background, character, hair, masks) with
 * no direct "background" marker in scene.json, so the heuristic scores
 * candidates by pixel area times an aspect-ratio bonus: landscape
 * (16:9-ish) textures are overwhelmingly the background plate, while
 * portrait character sprites score low. Embedded-image textures (FIF_PNG /
 * FIF_JPEG) are returned as-is; raw formats are decoded and PNG-encoded.
 * Returns null when nothing decodes.
 */
export declare function extractBackgroundWithDiagnostics(buf: Uint8Array, opts?: {
    heuristic?: boolean;
}): BackgroundExtraction | null;
/** Backwards-compatible image-only extraction API. */
export declare function extractBackgroundPng(buf: Uint8Array): BackgroundImage | null;
