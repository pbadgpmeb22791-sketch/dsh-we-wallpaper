/**
 * Survey: across a sample of scene.pkg files, find entries whose payload is
 * a RAW image (png/jpg/dds) or any plain-text (json) — i.e. how many
 * packages have directly usable content without the proprietary codec.
 * Usage: node scripts/survey-pkg.mjs [workshop-dir] [limit]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WS = process.argv[2] ?? 'D:\\Steam\\steamapps\\workshop\\content\\431960'
const LIMIT = Number(process.argv[3] ?? 20)

function parseTable(buf) {
  const count = buf.readUInt32LE(16)
  const entries = []
  let pos = 16
  for (let i = 0; i < count && pos + 8 <= buf.length; i++) {
    const len = buf.readUInt32LE(pos)
    if (len <= 0 || len > 4096 || pos + 4 + len + 8 > buf.length) break
    const name = buf.subarray(pos + 4, pos + 4 + len).toString('utf8')
    const offset = buf.readUInt32LE(pos + 4 + len)
    const size = buf.readUInt32LE(pos + 4 + len + 4)
    entries.push({ name, offset, size })
    pos += 4 + len + 8
  }
  return entries
}

function kindOf(data) {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50) return 'png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'jpg'
  if (data.length >= 4 && data[0] === 0x44 && data[1] === 0x44 && data[2] === 0x53 && data[3] === 0x20) return 'dds'
  const head = data.subarray(0, 200).toString('utf8')
  if (head.trimStart().startsWith('{') && head.includes('"')) return 'json'
  return null
}

let scanned = 0
let withRawImages = 0
let withAnyReadable = 0
const details = []

for (const id of readdirSync(WS)) {
  if (scanned >= LIMIT) break
  const pkgPath = join(WS, id, 'scene.pkg')
  let st
  try { st = statSync(pkgPath) } catch { continue }
  if (!st.isFile() || st.size < 1000) continue
  scanned++
  const buf = readFileSync(pkgPath)
  const entries = parseTable(buf)
  const rawImages = []
  let readable = 0
  for (const e of entries) {
    if (e.offset + e.size > buf.length || e.size < 4) continue
    const k = kindOf(buf.subarray(e.offset, Math.min(e.offset + 2048, e.offset + e.size)))
    if (k === 'json') readable++
    if (k === 'png' || k === 'jpg' || k === 'dds') {
      rawImages.push(`${e.name} [${k} ${e.size}B]`)
    }
  }
  const hasImages = rawImages.length > 0
  if (hasImages) withRawImages++
  if (readable > 0) withAnyReadable++
  if (hasImages || readable > 0) details.push({ id, magic: buf.subarray(0, 12).toString('latin1'), rawImages, readable })
  if (details.length >= 12) break
}

console.log(`scanned=${scanned} pkgs with raw images=${withRawImages} pkgs with readable json=${withAnyReadable}`)
for (const d of details) {
  console.log(`--- ${d.id} (${d.magic}) ---`)
  for (const img of d.rawImages) console.log(`    IMG ${img}`)
  if (d.readable > 0) console.log(`    (+${d.readable} readable json entries)`)
}
