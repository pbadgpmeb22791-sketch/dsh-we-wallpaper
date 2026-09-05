/**
 * Parse the WE scene.pkg directory table ({u32 len, name, u32 offset, u32 size})
 * and verify every entry: stored vs zlib, image detection, inflate sanity.
 * Usage: node scripts/probe-pkg.mjs <scene.pkg> [filter]
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/probe-pkg.mjs <scene.pkg> [filter]')
  process.exit(1)
}
const filter = process.argv[3] ?? ''
const buf = readFileSync(file)

console.log(`magic: ${buf.subarray(0, 12).toString('latin1')}`)
const at12 = buf.readUInt32LE(12)
const count = buf.readUInt32LE(16)
console.log(`u32@12=${at12} count(u32@16)=${count}`)

/** Entry layout: u32 len, name, u32 offset, u32 size. */
function parseTable() {
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
  return { entries, end: pos }
}

const { entries, end } = parseTable()
console.log(`parsed ${entries.length} entries, table ends at ${end}`)

function detectKind(data) {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e) return 'png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'jpg'
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'gif'
  if (data.length >= 4 && data[0] === 0x44 && data[1] === 0x44 && data[2] === 0x53) return 'dds'
  const head = data.subarray(0, 64).toString('utf8')
  if (head.trimStart().startsWith('{')) return 'json'
  if (/^[\x20-\x7e\n\r\t]{16,}/.test(head)) return 'text'
  return 'bin'
}

const rows = []
for (const e of entries) {
  if (e.offset + e.size > buf.length) { rows.push({ ...e, note: 'OUT-OF-BOUNDS' }); continue }
  const raw = buf.subarray(e.offset, e.offset + e.size)
  let data = null
  let method = 'stored'
  try { data = inflateRawSync(raw); method = 'zlib' } catch { /* not zlib */ }
  const sample = data ?? raw
  const kind = detectKind(sample)
  rows.push({ ...e, method, kind, outSize: sample.length })
}

console.log('--- all entries ---')
for (const r of rows) {
  console.log(`  ${r.name} | ${r.kind} | ${r.method} | @${r.offset} stored=${r.size}B out=${r.outSize}B${r.note ?? ''}`)
}
console.log('--- images ---')
for (const r of rows.filter(r => ['png', 'jpg', 'gif', 'dds'].includes(r.kind))) {
  console.log(`  ${r.name} | ${r.kind} | ${r.method} | @${r.offset} stored=${r.size}B out=${r.outSize}B`)
}
console.log('--- filter ---')
for (const r of rows.filter(r => filter === '' || r.name.includes(filter))) {
  console.log(`  ${r.name} | ${r.kind} | ${r.method} | @${r.offset} stored=${r.size}B out=${r.outSize}B`)
}
