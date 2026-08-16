/**
 * Shared test helpers: build a minimal Wallpaper Engine scene.pkg in memory
 * (one texture entry) so the extractor can be exercised end-to-end without
 * committing binary fixtures.
 */

import { deflateSync } from 'node:zlib'

/** Append a u32 little-endian. */
function u32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

/** Append a NUL-terminated string. */
function nstr(out: number[], text: string): void {
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff)
  out.push(0)
}

/** Append a length-prefixed string. */
function lstr(out: number[], text: string): void {
  u32(out, text.length)
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff)
}

export interface TexSpec {
  /** TEX header format (0=RGBA8888, 4=DXT5, 6=DXT3, 7=DXT1, 8=RG88, 9=R8). */
  format: number
  textureWidth: number
  textureHeight: number
  imageWidth: number
  imageHeight: number
  /** FreeImageFormat for the container (-1 = unknown, 13 = PNG, 2 = JPEG). */
  imageFormat?: number
  /** Mipmap payload (raw; LZ4-compressed when isLz4). */
  data: Uint8Array
  isLz4?: boolean
  mipmapWidth?: number
  mipmapHeight?: number
}

/** Build one TEX file image bytes. */
export function buildTex(spec: TexSpec): Uint8Array {
  const out: number[] = []
  nstr(out, 'TEXV0005')
  nstr(out, 'TEXI0001')
  u32(out, spec.format)
  u32(out, 0) // flags
  u32(out, spec.textureWidth)
  u32(out, spec.textureHeight)
  u32(out, spec.imageWidth)
  u32(out, spec.imageHeight)
  u32(out, 0) // unk
  nstr(out, 'TEXB0003')
  u32(out, 1) // imageCount
  u32(out, spec.imageFormat ?? -1)
  u32(out, 1) // mipmapCount
  u32(out, spec.mipmapWidth ?? spec.textureWidth)
  u32(out, spec.mipmapHeight ?? spec.textureHeight)
  u32(out, spec.isLz4 === true ? 1 : 0)
  u32(out, spec.isLz4 === true ? spec.data.length : 0)
  u32(out, spec.data.length)
  for (const b of spec.data) out.push(b)
  return Uint8Array.from(out)
}

/**
 * Build a minimal scene.pkg containing one texture entry.
 * @param tex - the TEX bytes (buildTex output).
 * @param entryName - the entry's path inside the package.
 */
export function buildPkg(tex: Uint8Array, entryName = 'materials/background.tex'): Uint8Array {
  const out: number[] = []
  lstr(out, 'PKGV0001')
  u32(out, 1) // entryCount
  lstr(out, entryName)
  u32(out, 0) // data offset (relative to dataStart)
  u32(out, tex.length)
  for (const b of tex) out.push(b)
  return Uint8Array.from(out)
}

/** Encode RGBA pixels as PNG (reused by tests to validate round-trips). */
export function rgbaToPngFixture(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1)
  }
  const idat = deflateSync(raw)
  const chunks: Uint8Array[] = []
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out2 = new Uint8Array(12 + data.length)
    const view = new DataView(out2.buffer)
    view.setUint32(0, data.length)
    for (let i = 0; i < 4; i++) out2[4 + i] = type.charCodeAt(i)
    out2.set(data, 8)
    view.setUint32(8 + data.length, 0) // CRC not validated by the extractor
    return out2
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  chunks.push(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  chunks.push(chunk('IHDR', ihdr))
  chunks.push(chunk('IDAT', idat))
  chunks.push(chunk('IEND', new Uint8Array(0)))
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out2 = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out2.set(c, pos)
    pos += c.length
  }
  return out2
}
