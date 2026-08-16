/**
 * Empirical codec probe: try LZ4-block + zlib + deflate on pkg entry payloads.
 * Usage: node scripts/probe-codec.mjs <scene.pkg> <offset> <size>
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync, inflateSync, gunzipSync, brotliDecompressSync } from 'node:zlib'

const file = process.argv[2]
const offset = Number(process.argv[3])
const size = Number(process.argv[4])
const buf = readFileSync(file)
const raw = buf.subarray(offset, offset + size)

/** LZ4 block decompressor (https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md). */
function lz4Block(input) {
  const out = []
  let ip = 0
  const readByte = () => input[ip++]
  try {
    while (ip < input.length) {
      const token = readByte()
      let litLen = token >> 4
      if (litLen === 15) {
        let b
        do { b = readByte(); litLen += b } while (b === 255)
      }
      for (let i = 0; i < litLen; i++) out.push(readByte())
      if (ip >= input.length) break
      const offsetLE = readByte() | (readByte() << 8)
      if (offsetLE === 0) throw new Error('invalid offset 0')
      let matchLen = (token & 0x0f) + 4
      if ((token & 0x0f) === 15) {
        let b
        do { b = readByte(); matchLen += b } while (b === 255)
      }
      const start = out.length - offsetLE
      for (let i = 0; i < matchLen; i++) out.push(out[start + i])
    }
    return Buffer.from(out)
  } catch {
    return null
  }
}

function sniff(data) {
  if (!data) return 'FAIL'
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50) return `png ${data.length}B`
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return `jpg ${data.length}B`
  if (data.length >= 4 && data[0] === 0x44 && data[1] === 0x44 && data[2] === 0x53) return `dds ${data.length}B`
  const head = data.subarray(0, 120).toString('utf8')
  if (head.trimStart().startsWith('{')) return `json ${data.length}B`
  return `bin ${data.length}B`
}

console.log(`payload @${offset} size=${size}, first bytes: ${[...raw.subarray(0, 16)].map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
for (const skip of [0, 4, 8, 16]) {
  const tryRaw = raw.subarray(skip)
  let r = lz4Block(tryRaw)
  if (r) console.log(`  lz4(skip=${skip}): ${sniff(r)}`)
  try { const z = inflateRawSync(tryRaw); console.log(`  inflateRaw(skip=${skip}): ${sniff(z)}`) } catch { /* no */ }
  try { const z = inflateSync(tryRaw); console.log(`  zlib(skip=${skip}): ${sniff(z)}`) } catch { /* no */ }
  try { const z = gunzipSync(tryRaw); console.log(`  gzip(skip=${skip}): ${sniff(z)}`) } catch { /* no */ }
  try { const z = brotliDecompressSync(tryRaw); console.log(`  brotli(skip=${skip}): ${sniff(z)}`) } catch { /* no */ }
}
