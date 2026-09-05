/**
 * Unit tests for the scene.pkg extractor (src/pkg-tex.ts): package table
 * parsing, TEX container parsing, LZ4 block decode, DXT1 block decode, PNG
 * encoding and the background-selection heuristic — all against synthetic
 * in-memory packages (tests/pkg-helpers.ts).
 */

import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  decodeTexEntry,
  extractBackgroundPng,
  lz4BlockDecode,
  parsePackage,
  rgbaToPng,
} from '../src/pkg-tex.ts'
import { buildPkg, buildTex } from './pkg-helpers.ts'

describe('parsePackage', () => {
  it('parses the magic, table and relative offsets', () => {
    const tex = buildTex({
      format: 0,
      textureWidth: 2,
      textureHeight: 2,
      imageWidth: 2,
      imageHeight: 2,
      data: new Uint8Array(16),
    })
    const pkg = buildPkg(tex)
    const parsed = parsePackage(pkg)
    expect(parsed).not.toBeNull()
    expect(parsed?.magic).toBe('PKGV0001')
    expect(parsed?.entries).toHaveLength(1)
    expect(parsed?.entries[0].name).toBe('materials/background.tex')
    expect(parsed?.entries[0].offset).toBe(0)
    expect(parsed?.dataStart).toBe(4 + 8 + 4 + 4 + 24 + 8)
    expect(parsed?.entries[0].abs).toBe(parsed!.dataStart)
  })

  it('rejects truncated / invalid packages', () => {
    expect(parsePackage(new Uint8Array(4))).toBeNull()
    expect(parsePackage(buildPkg(new Uint8Array(0)))).not.toBeNull()
  })
})

describe('lz4BlockDecode', () => {
  it('decodes a literal-only block', () => {
    // token 0xF0 (lit 15) + ext 1 → 16 literal bytes.
    const src = Uint8Array.from([0xf0, 1, ...Array.from({ length: 16 }, (_, i) => i)])
    const out = lz4BlockDecode(src, 16)
    expect(out).not.toBeNull()
    expect([...out!]).toEqual(Array.from({ length: 16 }, (_, i) => i))
  })

  it('decodes an overlapping match (classic ABAB pattern)', () => {
    // token 0x40: 4 literals "ABCD", offset 4, matchLen 4.
    const src = Uint8Array.from([0x40, 0x41, 0x42, 0x43, 0x44, 0x04, 0x00])
    const out = lz4BlockDecode(src, 8)
    expect(out).not.toBeNull()
    expect(new TextDecoder().decode(out!)).toBe('ABCDABCD')
  })

  it('returns null on invalid offsets / truncation', () => {
    expect(lz4BlockDecode(Uint8Array.from([0x10, 0x41, 0x00, 0x00]), 4)).toBeNull()
    expect(lz4BlockDecode(Uint8Array.from([0x40, 0x41, 0x42, 0x43, 0x44, 0x05, 0x00]), 8)).toBeNull()
  })
})

describe('decodeTexEntry', () => {
  it('decodes RGBA8888 raw mipmaps and crops to the image size', () => {
    // 4x4 texture, image 2x2 → crop keeps the top-left quadrant.
    const rgba = new Uint8Array(4 * 4 * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 10
      rgba[i + 1] = 20
      rgba[i + 2] = 30
      rgba[i + 3] = 255
    }
    const pkg = buildPkg(buildTex({
      format: 0,
      textureWidth: 4,
      textureHeight: 4,
      imageWidth: 2,
      imageHeight: 2,
      data: rgba,
      mipmapWidth: 4,
      mipmapHeight: 4,
    }))
    const parsed = parsePackage(pkg)!
    const entry = parsed.entries[0]
    const decoded = decodeTexEntry(pkg, entry.abs, { format: 0, flags: 0, textureWidth: 4, textureHeight: 4, imageWidth: 2, imageHeight: 2 })
    expect(decoded).not.toBeNull()
    expect(decoded?.kind).toBe('rgba')
    if (decoded?.kind === 'rgba') {
      expect(decoded.width).toBe(2)
      expect(decoded.height).toBe(2)
      expect(decoded.rgba.length).toBe(16)
      expect(decoded.rgba[0]).toBe(10)
    }
  })

  it('passes embedded PNG textures through', () => {
    const png = rgbaToPng(2, 2, new Uint8Array(16).fill(255))
    const pkg = buildPkg(buildTex({
      format: 0,
      textureWidth: 2,
      textureHeight: 2,
      imageWidth: 2,
      imageHeight: 2,
      imageFormat: 13, // FIF_PNG
      data: png,
    }))
    const parsed = parsePackage(pkg)!
    const decoded = decodeTexEntry(pkg, parsed.entries[0].abs, {
      format: 0, flags: 0, textureWidth: 2, textureHeight: 2, imageWidth: 2, imageHeight: 2,
    })
    expect(decoded?.kind).toBe('image')
    if (decoded?.kind === 'image') {
      expect(decoded.mime).toBe('image/png')
      expect(decoded.bytes[0]).toBe(0x89)
      expect(decoded.bytes[1]).toBe(0x50)
    }
  })

  it('decodes DXT1 blocks', () => {
    // One 4x4 block: white endpoint, black endpoint, all indices 0 → all white.
    const block = Uint8Array.from([
      0xff, 0xff, // color0 = 0xffff (white)
      0x00, 0x00, // color1 = 0x0000 (black)
      0x00, 0x00, 0x00, 0x00, // indices all 0
    ])
    const pkg = buildPkg(buildTex({
      format: 7, // DXT1
      textureWidth: 4,
      textureHeight: 4,
      imageWidth: 4,
      imageHeight: 4,
      data: block,
    }))
    const parsed = parsePackage(pkg)!
    const decoded = decodeTexEntry(pkg, parsed.entries[0].abs, {
      format: 7, flags: 0, textureWidth: 4, textureHeight: 4, imageWidth: 4, imageHeight: 4,
    })
    expect(decoded?.kind).toBe('rgba')
    if (decoded?.kind === 'rgba') {
      expect(decoded.rgba[0]).toBe(255)
      expect(decoded.rgba[1]).toBe(255)
      expect(decoded.rgba[2]).toBe(255)
      expect(decoded.rgba[3]).toBe(255)
    }
  })

  it('rejects unknown formats', () => {
    const pkg = buildPkg(buildTex({
      format: 99,
      textureWidth: 2,
      textureHeight: 2,
      imageWidth: 2,
      imageHeight: 2,
      data: new Uint8Array(16),
    }))
    const parsed = parsePackage(pkg)!
    expect(decodeTexEntry(pkg, parsed.entries[0].abs, {
      format: 99, flags: 0, textureWidth: 2, textureHeight: 2, imageWidth: 2, imageHeight: 2,
    })).toBeNull()
  })
})

describe('rgbaToPng', () => {
  it('produces a decodable PNG', () => {
    const png = rgbaToPng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]))
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
    const ihdr = png.subarray(16, 29)
    expect(new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(0)).toBe(2)
    expect(new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(4)).toBe(1)
    // IDAT inflates back to 1 + 2*4 bytes.
    const idatLen = new DataView(png.buffer, png.byteOffset + 33, 4).getUint32(0)
    const raw = inflateSync(png.subarray(41, 41 + idatLen))
    expect(raw.length).toBe(1 + 8)
  })
})

describe('extractBackgroundPng', () => {
  it('picks the landscape texture over a portrait one', () => {
    // Portrait 200x600 (character) vs landscape 800x450 (background): the
    // aspect scoring must pick the landscape one.
    const portrait = buildTex({
      format: 0, textureWidth: 200, textureHeight: 600, imageWidth: 200, imageHeight: 600,
      data: new Uint8Array(200 * 600 * 4),
    })
    const landscape = buildTex({
      format: 0, textureWidth: 800, textureHeight: 450, imageWidth: 800, imageHeight: 450,
      data: new Uint8Array(800 * 450 * 4).fill(9),
    })
    // Build a package with two entries.
    const out: number[] = []
    const lstr = (text: string): void => {
      out.push(text.length & 0xff, (text.length >>> 8) & 0xff, (text.length >>> 16) & 0xff, (text.length >>> 24) & 0xff)
      for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff)
    }
    const u32 = (v: number): void => {
      out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
    }
    lstr('PKGV0001')
    u32(2)
    lstr('character.tex')
    u32(0)
    u32(portrait.length)
    lstr('background.tex')
    u32(portrait.length)
    u32(landscape.length)
    for (const b of portrait) out.push(b)
    for (const b of landscape) out.push(b)
    const pkg = Uint8Array.from(out)

    const bg = extractBackgroundPng(pkg)
    expect(bg).not.toBeNull()
    expect(bg?.width).toBe(800)
    expect(bg?.height).toBe(450)
  })

  it('returns null for a package without decodable textures', () => {
    const pkg = buildPkg(buildTex({
      format: 99, textureWidth: 2, textureHeight: 2, imageWidth: 2, imageHeight: 2,
      data: new Uint8Array(16),
    }))
    expect(extractBackgroundPng(pkg)).toBeNull()
  })
})
