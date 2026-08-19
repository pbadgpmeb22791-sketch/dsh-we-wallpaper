/**
 * Batch-verify scene.pkg background extraction across the library.
 * Usage: node scripts/survey-extract.mjs [workshop-dir] [limit]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { extractBackgroundPng } from '../src/pkg-tex.ts'

const WS = process.argv[2] ?? 'D:\\Steam\\steamapps\\workshop\\content\\431960'
const LIMIT = Number(process.argv[3] ?? 20)

let scanned = 0
let extracted = 0
const results = []
for (const id of readdirSync(WS)) {
  if (scanned >= LIMIT) break
  const pkgPath = join(WS, id, 'scene.pkg')
  let st
  try { st = statSync(pkgPath) } catch { continue }
  if (!st.isFile() || st.size < 1000) continue
  scanned++
  const buf = readFileSync(pkgPath)
  const t0 = Date.now()
  const bg = extractBackgroundPng(buf)
  const ms = Date.now() - t0
  if (bg) {
    extracted++
    results.push(`  OK  ${id} ${bg.width}x${bg.height} ${bg.mime} ${bg.bytes.length}B ${ms}ms`)
  } else {
    results.push(`  FAIL ${id} (${ms}ms)`)
  }
}
console.log(`scanned=${scanned} extracted=${extracted} rate=${(extracted / scanned * 100).toFixed(0)}%`)
for (const r of results) console.log(r)
