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

import { deflateSync } from 'node:zlib'

/** One parsed package entry (data slice view). */
export interface PkgEntry {
  name: string
  /** Data offset relative to the data area start. */
  offset: number
  length: number
  /** Absolute position in the file. */
  abs: number
}

/** Parsed package structure. */
export interface PkgFile {
  magic: string
  entries: PkgEntry[]
  dataStart: number
  size: number
}

/** A texture candidate: entry + parsed TEX header. */
export interface TexCandidate {
  name: string
  /** TexFormat value (0=RGBA8888, 4=DXT5, 6=DXT3, 7=DXT1, 8=RG88, 9=R8). */
  format: number
  flags: number
  textureWidth: number
  textureHeight: number
  imageWidth: number
  imageHeight: number
  abs: number
  length: number
}

/** The decoded background image. */
export interface BackgroundImage {
  /** PNG or JPEG bytes (ready to serve). */
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

/** How the extractor selected the texture. */
export type BackgroundSelectionSource = 'scene-graph' | 'heuristic'

/** Background bytes plus selection diagnostics. */
export interface BackgroundExtraction extends BackgroundImage {
  source: BackgroundSelectionSource
  selectedTex: string
  packageMagic: string
}

/** Parse the package directory table. Null when the layout is unsupported. */
export function parsePackage(buf: Uint8Array): PkgFile | null {
  if (buf.length < 16) return null
  const magicLen = readU32(buf, 0)
  if (magicLen <= 0 || magicLen > 32 || 4 + magicLen + 4 > buf.length) return null
  const magic = utf8(buf, 4, 4 + magicLen)
  const entryCount = readU32(buf, 4 + magicLen)
  if (entryCount <= 0 || entryCount > 4096) return null

  const entries: PkgEntry[] = []
  let pos = 4 + magicLen + 4
  for (let i = 0; i < entryCount; i++) {
    if (pos + 8 > buf.length) return null
    const nameLen = readU32(buf, pos)
    if (nameLen <= 0 || nameLen > 512 || pos + 4 + nameLen + 8 > buf.length) return null
    const name = utf8(buf, pos + 4, pos + 4 + nameLen)
    const offset = readU32(buf, pos + 4 + nameLen)
    const length = readU32(buf, pos + 4 + nameLen + 4)
    entries.push({ name, offset, length, abs: 0 })
    pos += 4 + nameLen + 8
  }
  const dataStart = pos
  for (const entry of entries) {
    entry.abs = dataStart + entry.offset
    // Reject the whole table when an entry points outside the package. This
    // prevents malformed offsets from being reused by JSON/TEX decoders.
    if (!Number.isSafeInteger(entry.abs) || entry.abs < dataStart || entry.abs + entry.length > buf.length) return null
  }
  return { magic, entries, dataStart, size: buf.length }
}

/** Read a NUL-terminated string (max length); '' when no terminator found. */
function readNString(buf: Uint8Array, pos: number, max: number): string {
  let end = pos
  const limit = Math.min(pos + max, buf.length)
  while (end < limit && buf[end] !== 0) end++
  return utf8(buf, pos, end)
}

/** Parse a TEX header from an absolute position. Null when invalid. */
export function parseTexHeader(buf: Uint8Array, abs: number): {
  format: number
  flags: number
  textureWidth: number
  textureHeight: number
  imageWidth: number
  imageHeight: number
} | null {
  if (abs + 8 > buf.length) return null
  const magic1 = readNString(buf, abs, 16)
  if (magic1 !== 'TEXV0005') return null
  const magic2 = readNString(buf, abs + magic1.length + 1, 16)
  if (magic2 !== 'TEXI0001') return null
  const p = abs + magic1.length + 1 + magic2.length + 1
  if (p + 28 > buf.length) return null
  const format = readU32(buf, p)
  const flags = readU32(buf, p + 4)
  const textureWidth = readU32(buf, p + 8)
  const textureHeight = readU32(buf, p + 12)
  const imageWidth = readU32(buf, p + 16)
  const imageHeight = readU32(buf, p + 20)
  if (textureWidth === 0 || textureHeight === 0 || textureWidth > 16384 || textureHeight > 16384) return null
  return { format, flags, textureWidth, textureHeight, imageWidth, imageHeight }
}

/** Enumerate texture entries of a package (entries whose data starts with TEXV0005). */
export function findTexCandidates(buf: Uint8Array, pkg: PkgFile): TexCandidate[] {
  const out: TexCandidate[] = []
  for (const entry of pkg.entries) {
    if (entry.abs + entry.length > buf.length) continue
    const header = parseTexHeader(buf, entry.abs)
    if (header === null) continue
    out.push({ name: entry.name, ...header, abs: entry.abs, length: entry.length })
  }
  return out
}

/** Decode an LZ4 block (the K4os LZ4Codec.Decode contract: known output length). */
export function lz4BlockDecode(src: Uint8Array, outLen: number): Uint8Array | null {
  const out = new Uint8Array(outLen)
  let ip = 0
  let op = 0
  const readByte = (): number => (ip < src.length ? src[ip++] : -1)
  try {
    while (ip < src.length) {
      const token = readByte()
      if (token < 0) break
      let litLen = token >> 4
      if (litLen === 15) {
        let b: number
        do {
          b = readByte()
          if (b < 0) throw new Error('lz4: truncated literal length')
          litLen += b
        } while (b === 255)
      }
      if (op + litLen > outLen || ip + litLen > src.length) throw new Error('lz4: literal overflow')
      out.set(src.subarray(ip, ip + litLen), op)
      ip += litLen
      op += litLen
      if (ip >= src.length) break
      const offset = readByte() | (readByte() << 8)
      if (offset === 0 || offset > op) throw new Error('lz4: invalid offset')
      let matchLen = (token & 0x0f) + 4
      if ((token & 0x0f) === 15) {
        let b: number
        do {
          b = readByte()
          if (b < 0) throw new Error('lz4: truncated match length')
          matchLen += b
        } while (b === 255)
      }
      if (op + matchLen > outLen) throw new Error('lz4: match overflow')
      // Overlapping matches copy byte-by-byte (standard LZ4 semantics).
      for (let i = 0; i < matchLen; i++) out[op + i] = out[op + i - offset]
      op += matchLen
    }
    return op === outLen ? out : null
  } catch {
    return null
  }
}

// --- raw pixel formats ---------------------------------------------------

/** R8 (1 byte/pixel) → RGBA. */
export function decodeR8(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = src[i] ?? 0
    out[i * 4] = v
    out[i * 4 + 1] = v
    out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}

/** RG88 (2 bytes/pixel) → RGBA; WE semantics: color = (G,G,G,R) i.e. R is alpha. */
export function decodeRg88(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const r = src[i * 2] ?? 0
    const g = src[i * 2 + 1] ?? 0
    out[i * 4] = g
    out[i * 4 + 1] = g
    out[i * 4 + 2] = g
    out[i * 4 + 3] = r
  }
  return out
}

// --- DXT decoding (TS port of the LibSquish-derived C# in RePKG, MIT) ----

function unpack565(block: Uint8Array, pos: number, codes: Uint8Array, codePos: number): number {
  const value = block[pos] | (block[pos + 1] << 8)
  const red = (value >> 11) & 0x1f
  const green = (value >> 5) & 0x3f
  const blue = value & 0x1f
  codes[codePos] = (red << 3) | (red >> 2)
  codes[codePos + 1] = (green << 2) | (green >> 4)
  codes[codePos + 2] = (blue << 3) | (blue >> 2)
  codes[codePos + 3] = 255
  return value
}

/** Decompress one 4x4 block into rgba (16*4 bytes), dxt1 = 8-byte, dxt3/5 = 16-byte. */
function decompressBlock(rgba: Uint8Array, block: Uint8Array, blockPos: number, dxt1: boolean, dxt3: boolean, dxt5: boolean): void {
  const colorBlockPos = dxt3 || dxt5 ? blockPos + 8 : blockPos
  // Color.
  const codes = new Uint8Array(16)
  const a = unpack565(block, colorBlockPos, codes, 0)
  const b = unpack565(block, colorBlockPos + 2, codes, 4)
  for (let i = 0; i < 3; i++) {
    const c = codes[i]
    const d = codes[4 + i]
    if (dxt1 && a <= b) {
      codes[8 + i] = (c + d) >> 1
      codes[12 + i] = 0
    } else {
      codes[8 + i] = (2 * c + d) / 3
      codes[12 + i] = (c + 2 * d) / 3
    }
  }
  codes[8 + 3] = 255
  codes[12 + 3] = dxt1 && a <= b ? 0 : 255
  for (let i = 0; i < 4; i++) {
    const packed = block[colorBlockPos + 4 + i]
    rgba[i * 4] = codes[4 * (packed & 0x3)]
    rgba[i * 4 + 1] = codes[4 * (packed & 0x3) + 1]
    rgba[i * 4 + 2] = codes[4 * (packed & 0x3) + 2]
    rgba[i * 4 + 3] = codes[4 * (packed & 0x3) + 3]
    rgba[4 + i * 4] = codes[4 * ((packed >> 2) & 0x3)]
    rgba[4 + i * 4 + 1] = codes[4 * ((packed >> 2) & 0x3) + 1]
    rgba[4 + i * 4 + 2] = codes[4 * ((packed >> 2) & 0x3) + 2]
    rgba[4 + i * 4 + 3] = codes[4 * ((packed >> 2) & 0x3) + 3]
    rgba[8 + i * 4] = codes[4 * ((packed >> 4) & 0x3)]
    rgba[8 + i * 4 + 1] = codes[4 * ((packed >> 4) & 0x3) + 1]
    rgba[8 + i * 4 + 2] = codes[4 * ((packed >> 4) & 0x3) + 2]
    rgba[8 + i * 4 + 3] = codes[4 * ((packed >> 4) & 0x3) + 3]
    rgba[12 + i * 4] = codes[4 * ((packed >> 6) & 0x3)]
    rgba[12 + i * 4 + 1] = codes[4 * ((packed >> 6) & 0x3) + 1]
    rgba[12 + i * 4 + 2] = codes[4 * ((packed >> 6) & 0x3) + 2]
    rgba[12 + i * 4 + 3] = codes[4 * ((packed >> 6) & 0x3) + 3]
  }
  // Alpha.
  if (dxt3) {
    for (let i = 0; i < 8; i++) {
      const quant = block[blockPos + i]
      const lo = quant & 0x0f
      const hi = quant & 0xf0
      rgba[8 * i + 3] = lo | (lo << 4)
      rgba[8 * i + 7] = hi | (hi >> 4)
    }
  } else if (dxt5) {
    const alpha0 = block[blockPos]
    const alpha1 = block[blockPos + 1]
    const codesA = new Uint8Array(8)
    codesA[0] = alpha0
    codesA[1] = alpha1
    if (alpha0 <= alpha1) {
      for (let i = 1; i < 5; i++) codesA[1 + i] = ((5 - i) * alpha0 + i * alpha1) / 5
      codesA[6] = 0
      codesA[7] = 255
    } else {
      for (let i = 1; i < 7; i++) codesA[i + 1] = ((7 - i) * alpha0 + i * alpha1) / 7
    }
    let srcPos = 2
    let idxPos = 0
    for (let i = 0; i < 2; i++) {
      let value = 0
      for (let j = 0; j < 3; j++) value |= block[blockPos + srcPos++] << (8 * j)
      for (let j = 0; j < 8; j++) {
        const index = (value >> (3 * j)) & 0x07
        rgba[4 * idxPos + 3] = codesA[index]
        idxPos++
      }
    }
  }
}

/** Decode a DXT1/3/5 texture into RGBA8888. */
export function decodeDxt(w: number, h: number, src: Uint8Array, format: 'dxt1' | 'dxt3' | 'dxt5'): Uint8Array | null {
  const out = new Uint8Array(w * h * 4)
  const bytesPerBlock = format === 'dxt1' ? 8 : 16
  const dxt1 = format === 'dxt1'
  const dxt3 = format === 'dxt3'
  const dxt5 = format === 'dxt5'
  const block = new Uint8Array(16)
  let srcPos = 0
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (srcPos + bytesPerBlock > src.length) break
      block.set(src.subarray(srcPos, srcPos + bytesPerBlock))
      const rgba = new Uint8Array(64)
      decompressBlock(rgba, block, 0, dxt1, dxt3, dxt5)
      let pixel = 0
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const sx = x + px
          const sy = y + py
          if (sx < w && sy < h) {
            const target = 4 * (w * sy + sx)
            out[target] = rgba[pixel]
            out[target + 1] = rgba[pixel + 1]
            out[target + 2] = rgba[pixel + 2]
            out[target + 3] = rgba[pixel + 3]
          }
          pixel += 4
        }
      }
      srcPos += bytesPerBlock
    }
  }
  return out
}

// --- PNG encoding --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encode RGBA8888 pixels as a PNG (8-bit, color type 6, zlib deflate). */
export function rgbaToPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  // Filter 0 per scanline.
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1)
  }
  const idat = deflateSync(raw, { level: 6 })
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

// --- extraction ----------------------------------------------------------

/** Crop RGBA to imageW x imageH (top-left, matching ImageSharp Crop). */
export function cropRgba(rgba: Uint8Array, texW: number, texH: number, imageW: number, imageH: number): Uint8Array {
  if (texW === imageW && texH === imageH) return rgba
  const out = new Uint8Array(imageW * imageH * 4)
  for (let y = 0; y < imageH; y++) {
    for (let x = 0; x < imageW; x++) {
      const src = 4 * (texW * y + x)
      const dst = 4 * (imageW * y + x)
      out[dst] = rgba[src]
      out[dst + 1] = rgba[src + 1]
      out[dst + 2] = rgba[src + 2]
      out[dst + 3] = rgba[src + 3]
    }
  }
  return out
}

/** One decoded texture: either an embedded image (PNG/JPEG bytes) or raw RGBA. */
export type DecodedTex =
  | { kind: 'image'; bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; width: number; height: number }
  | { kind: 'rgba'; rgba: Uint8Array; width: number; height: number }

/** FreeImage format ids used inside TEXB0003 containers (u32-unsigned reads). */
const FIF_UNKNOWN = 0xffffffff
const FIF_JPEG = 2
const FIF_PNG = 13

/** Read one mipmap record (V1/V2+3/V4) at pos; returns the record + next pos. */
function readMipmap(buf: Uint8Array, p: number, version: number): {
  width: number
  height: number
  data: Uint8Array
  next: number
} | null {
  if (version === 1) {
    if (p + 12 > buf.length) return null
    const width = readU32(buf, p)
    const height = readU32(buf, p + 4)
    const byteCount = readU32(buf, p + 8)
    if (byteCount > 512 * 1024 * 1024 || p + 12 + byteCount > buf.length) return null
    return { width, height, data: buf.subarray(p + 12, p + 12 + byteCount), next: p + 12 + byteCount }
  }
  // V2/V3 (and V4 after its header preamble).
  if (p + 20 > buf.length) return null
  const width = readU32(buf, p)
  const height = readU32(buf, p + 4)
  const isLz4 = readU32(buf, p + 8) === 1
  const decompressedLen = readU32(buf, p + 12)
  const byteCount = readU32(buf, p + 16)
  if (byteCount > 512 * 1024 * 1024 || p + 20 + byteCount > buf.length) return null
  let data = buf.subarray(p + 20, p + 20 + byteCount)
  if (isLz4) {
    const decoded = lz4BlockDecode(data, decompressedLen)
    if (decoded === null) return null
    data = decoded
  }
  return { width, height, data, next: p + 20 + byteCount }
}

/**
 * Decode one TEX entry's first image / first mipmap. Embedded image
 * containers (FIF_PNG / FIF_JPEG) pass the bytes through; raw containers
 * decode per the TEX format (RGBA8888 / DXT1/3/5 / RG88 / R8).
 */
export function decodeTexEntry(buf: Uint8Array, texAbs: number, header: { format: number; flags: number; textureWidth: number; textureHeight: number; imageWidth: number; imageHeight: number }): DecodedTex | null {
  const p0 = texAbs + 18 // "TEXV0005\0" + "TEXI0001\0"
  let p = p0 + 28 // header
  // Image container magic (NUL-terminated).
  const containerMagic = readNString(buf, p, 16)
  if (!containerMagic.startsWith('TEXB')) return null
  p += containerMagic.length + 1
  const imageCount = readU32(buf, p)
  p += 4
  if (imageCount === 0 || imageCount > 64) return null
  const version = Number(containerMagic.slice(4)) || 1
  // TEXB0003 carries a FreeImageFormat int; TEXB0004 adds an isVideoMp4 int.
  let imageFormat = FIF_UNKNOWN
  if (version >= 3) {
    imageFormat = readU32(buf, p)
    p += 4
  }
  if (version >= 4) {
    p += 4 // isVideoMp4 (unused: video textures are skipped anyway)
  }
  // First image only.
  const mipmapCount = readU32(buf, p)
  p += 4
  if (mipmapCount === 0 || mipmapCount > 64) return null
  // NOTE: real TEXB0004 packages (e.g. workshop 3478434536) store mipmaps in
  // the same {w,h,isLz4,decLen,byteLen,bytes} layout as V2/V3 — the V4
  // preamble some RePKG versions expect was not observed in the wild.
  const mipmap = readMipmap(buf, p, version === 1 ? 1 : 2)
  if (mipmap === null) return null
  const width = header.imageWidth || mipmap.width
  const height = header.imageHeight || mipmap.height

  // Embedded image: pass through.
  if (imageFormat === FIF_PNG || imageFormat === FIF_JPEG) {
    return {
      kind: 'image',
      bytes: mipmap.data,
      mime: imageFormat === FIF_PNG ? 'image/png' : 'image/jpeg',
      width: mipmap.width || width,
      height: mipmap.height || height,
    }
  }

  // Raw formats (imageFormat UNKNOWN → the TEX format decides).
  const format = imageFormat === FIF_UNKNOWN ? header.format : imageFormat
  let rgba: Uint8Array | null = null
  switch (format) {
    case 0: // RGBA8888
      if (mipmap.data.length >= mipmap.width * mipmap.height * 4) {
        rgba = mipmap.data.subarray(0, mipmap.width * mipmap.height * 4)
      }
      break
    case 4: // DXT5
      rgba = decodeDxt(mipmap.width, mipmap.height, mipmap.data, 'dxt5')
      break
    case 6: // DXT3
      rgba = decodeDxt(mipmap.width, mipmap.height, mipmap.data, 'dxt3')
      break
    case 7: // DXT1
      rgba = decodeDxt(mipmap.width, mipmap.height, mipmap.data, 'dxt1')
      break
    case 8: // RG88
      if (mipmap.data.length >= mipmap.width * mipmap.height * 2) {
        rgba = decodeRg88(mipmap.data, mipmap.width, mipmap.height)
      }
      break
    case 9: // R8
      if (mipmap.data.length >= mipmap.width * mipmap.height) {
        rgba = decodeR8(mipmap.data, mipmap.width, mipmap.height)
      }
      break
    default:
      return null
  }
  if (rgba === null) return null
  const cropped = cropRgba(rgba, mipmap.width, mipmap.height, width, height)
  return { kind: 'rgba', rgba: cropped, width, height }
}

/**
 * Normalize a package-internal path for case-insensitive matching.
 */
function normalizePkgPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').toLowerCase()
}

/** Parse one bounded JSON package entry. */
function parseJsonEntry(buf: Uint8Array, entry: PkgEntry | undefined): Record<string, unknown> | null {
  if (entry === undefined || entry.length <= 0 || entry.length > 16 * 1024 * 1024) return null
  try {
    const raw: unknown = JSON.parse(utf8(buf, entry.abs, entry.abs + entry.length).replace(/^\uFEFF/, ''))
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** Parse a Wallpaper Engine vector string's first two finite values. */
function vec2(value: unknown): [number, number] | null {
  const parts = typeof value === 'string'
    ? value.trim().split(/\s+/).map(Number)
    : Array.isArray(value)
      ? value.slice(0, 2).map(Number)
      : []
  return parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
    ? [parts[0], parts[1]]
    : null
}

/** Wallpaper Engine visibility can be a boolean or a user-property object. */
function isVisible(value: unknown): boolean {
  if (value === false) return false
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (value as Record<string, unknown>).value !== false
  }
  return true
}

/** Resolve a texture name from model -> material -> texture references. */
function resolveModelTexture(
  buf: Uint8Array,
  entries: Map<string, PkgEntry>,
  modelPath: string,
): string | null {
  const modelKey = normalizePkgPath(modelPath)
  const model = parseJsonEntry(buf, entries.get(modelKey))
  if (model === null || typeof model.material !== 'string') return null
  const materialPath = normalizePkgPath(model.material)
  const material = parseJsonEntry(buf, entries.get(materialPath))
  if (material === null || !Array.isArray(material.passes)) return null
  for (const pass of material.passes) {
    if (typeof pass !== 'object' || pass === null || Array.isArray(pass)) continue
    const textures = (pass as Record<string, unknown>).textures
    if (!Array.isArray(textures)) continue
    for (const texture of textures) {
      if (typeof texture !== 'string' || texture.trim() === '') continue
      const clean = normalizePkgPath(texture).replace(/\.tex$/i, '')
      const materialDir = materialPath.includes('/') ? materialPath.slice(0, materialPath.lastIndexOf('/')) : ''
      const candidates = [
        `${materialDir}/${clean}.tex`,
        `${clean}.tex`,
        `materials/${clean}.tex`,
      ].map(normalizePkgPath)
      const matched = candidates.find(candidate => entries.has(candidate))
      if (matched !== undefined) return entries.get(matched)?.name ?? null
    }
  }
  return null
}

/**
 * Return scene-graph texture references in preference order. The score favors
 * visible image objects matching the orthographic canvas, neutral parallax,
 * early render order and explicit background/backdrop names.
 */
export function findSceneBackgroundTextures(buf: Uint8Array, pkg: PkgFile): string[] {
  const entries = new Map(pkg.entries.map(entry => [normalizePkgPath(entry.name), entry]))
  const scene = parseJsonEntry(buf, entries.get('scene.json'))
  if (scene === null || !Array.isArray(scene.objects)) return []
  const objects = scene.objects
  const general = typeof scene.general === 'object' && scene.general !== null && !Array.isArray(scene.general)
    ? scene.general as Record<string, unknown>
    : {}
  const projection = typeof general.orthogonalprojection === 'object'
    && general.orthogonalprojection !== null
    && !Array.isArray(general.orthogonalprojection)
    ? general.orthogonalprojection as Record<string, unknown>
    : {}
  const canvasWidth = typeof projection.width === 'number' && projection.width > 0 ? projection.width : 1920
  const canvasHeight = typeof projection.height === 'number' && projection.height > 0 ? projection.height : 1080
  const canvasRatio = canvasWidth / canvasHeight
  const ranked: Array<{ texture: string; score: number }> = []

  objects.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return
    const object = raw as Record<string, unknown>
    if (!isVisible(object.visible) || typeof object.image !== 'string') return
    const imagePath = normalizePkgPath(object.image)
    if (imagePath.includes('/util/') || imagePath.includes('composelayer') || imagePath.includes('fullscreenlayer')) return
    const texture = resolveModelTexture(buf, entries, object.image)
    if (texture === null) return
    const size = vec2(object.size)
    const width = Math.abs(size?.[0] ?? canvasWidth)
    const height = Math.abs(size?.[1] ?? canvasHeight)
    if (width <= 0 || height <= 0) return
    const ratio = width / height
    const sizeFit = Math.min(width / canvasWidth, canvasWidth / width)
      * Math.min(height / canvasHeight, canvasHeight / height)
    const ratioFit = Math.max(0, 1 - Math.abs(Math.log(ratio / canvasRatio)))
    const parallax = vec2(object.parallaxDepth)
    const neutralDepth = parallax !== null && Math.abs(parallax[0]) <= 0.001 && Math.abs(parallax[1]) <= 0.001 ? 0.5 : 0
    const name = typeof object.name === 'string' ? object.name.toLowerCase() : ''
    const nameBonus = /background|backdrop|背景|底图|背景图/.test(name) ? 4 : 0
    const orderBonus = (objects.length - index) / Math.max(1, objects.length) * 0.1
    ranked.push({ texture, score: nameBonus + sizeFit * 3 + ratioFit * 2 + neutralDepth + orderBonus })
  })

  ranked.sort((a, b) => b.score - a.score)
  return [...new Set(ranked.map(item => item.texture))]
}

/** Decode one selected candidate to an image response. */
function decodeCandidate(buf: Uint8Array, candidate: TexCandidate): BackgroundImage | null {
  const decoded = decodeTexEntry(buf, candidate.abs, candidate)
  if (decoded === null) return null
  return decoded.kind === 'image'
    ? { bytes: decoded.bytes, mime: decoded.mime, width: decoded.width, height: decoded.height }
    : { bytes: rgbaToPng(decoded.width, decoded.height, decoded.rgba), mime: 'image/png', width: decoded.width, height: decoded.height }
}

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
export function extractBackgroundWithDiagnostics(
  buf: Uint8Array,
  opts: { heuristic?: boolean } = {},
): BackgroundExtraction | null {
  const pkg = parsePackage(buf)
  if (pkg === null) return null
  const candidates = findTexCandidates(buf, pkg)
  const byName = new Map(candidates.map(candidate => [normalizePkgPath(candidate.name), candidate]))

  for (const selectedTex of findSceneBackgroundTextures(buf, pkg)) {
    const candidate = byName.get(normalizePkgPath(selectedTex))
    if (candidate === undefined) continue
    const decoded = decodeCandidate(buf, candidate)
    if (decoded !== null) {
      return { ...decoded, source: 'scene-graph', selectedTex: candidate.name, packageMagic: pkg.magic }
    }
  }

  if (opts.heuristic === false) return null

  let best: BackgroundExtraction | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const width = candidate.imageWidth || candidate.textureWidth
    const height = candidate.imageHeight || candidate.textureHeight
    if (width === 0 || height === 0) continue
    const ratio = width / height
    const aspectScore = Math.max(0, 1 - Math.abs(ratio - 16 / 9) / 1.2)
    const score = width * height * aspectScore
    if (score <= bestScore) continue
    const decoded = decodeCandidate(buf, candidate)
    if (decoded === null) continue
    best = { ...decoded, source: 'heuristic', selectedTex: candidate.name, packageMagic: pkg.magic }
    bestScore = score
  }
  return best
}

/** Backwards-compatible image-only extraction API. */
export function extractBackgroundPng(buf: Uint8Array): BackgroundImage | null {
  return extractBackgroundWithDiagnostics(buf)
}

// --- small readers -------------------------------------------------------

function readU32(buf: Uint8Array, pos: number): number {
  return (buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24)) >>> 0
}

function utf8(buf: Uint8Array, start: number, end: number): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(start, end))
}
