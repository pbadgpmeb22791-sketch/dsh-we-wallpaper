/**
 * Diagnostic: read image dimensions from file headers (PNG/JPEG/GIF/WebP)
 * for every wallpaper preview, and report the size distribution.
 *
 * Usage: node scripts/probe-previews.mjs [workshop-dir]
 * (defaults to DSH_WE_DIR's derived workshop dir, or the Steam default).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WS = process.argv[2]
  ?? process.env.DSH_WE_DIR?.replace(/\\/g, '/').replace(/\/common\/wallpaper_engine$/, '/steamapps/workshop/content/431960')
  ?? 'D:\\Steam\\steamapps\\workshop\\content\\431960'

function dimensions(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: 'png' }
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), fmt: 'gif' }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), fmt: 'jpg' }
      }
      const len = buf.readUInt16BE(i + 2)
      i += 2 + len
    }
    return { w: 0, h: 0, fmt: 'jpg' }
  }
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const vp8 = buf.slice(12, 16).toString()
    if (vp8 === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, fmt: 'webp' }
    if (vp8 === 'VP8L') return { w: buf.readUInt16LE(21) & 0x3fff, h: buf.readUInt16LE(23) & 0x3fff, fmt: 'webp' }
    if (vp8 === 'VP8X') {
      const w = 1 + buf.readUIntLE(24, 3)
      const h = 1 + buf.readUIntLE(27, 3)
      return { w, h, fmt: 'webp' }
    }
  }
  return { w: 0, h: 0, fmt: 'unknown' }
}

const rows = []
for (const id of readdirSync(WS)) {
  const dir = join(WS, id)
  let st
  try { st = statSync(dir) } catch { continue }
  if (!st.isDirectory()) continue
  const files = readdirSync(dir)
  for (const name of files) {
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) continue
    if (!/preview|thumb|poster|image/i.test(name)) continue
    const abs = join(dir, name)
    try {
      const buf = readFileSync(abs)
      const d = dimensions(buf)
      rows.push({ id, name, w: d.w, h: d.h, fmt: d.fmt, bytes: buf.length })
    } catch { /* skip */ }
  }
}

rows.sort((a, b) => a.w * a.h - b.w * b.h)
const buckets = new Map()
for (const r of rows) {
  const area = r.w * r.h
  const key = area === 0 ? 'unreadable' : area < 480 * 270 ? '<480x270' : area < 854 * 480 ? '480p' : area < 1280 * 720 ? '720p-ish' : area < 1920 * 1080 ? '1080p-ish' : '>=1080p'
  buckets.set(key, (buckets.get(key) ?? 0) + 1)
}
console.log('total previews:', rows.length)
console.log('distribution:', Object.fromEntries(buckets))
console.log('--- smallest 12 ---')
for (const r of rows.slice(0, 12)) console.log(`  ${r.id} ${r.name} ${r.w}x${r.h} ${r.fmt} ${r.bytes}`)
console.log('--- largest 8 ---')
for (const r of rows.slice(-8)) console.log(`  ${r.id} ${r.name} ${r.w}x${r.h} ${r.fmt} ${r.bytes}`)
