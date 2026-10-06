/**
 * R10/R11 网格残差复算（相对路径版，第三方可复现）。
 * 用法：node docs/evidence/account-monitor-v2-cards-3110/r10/score-mismatch.mjs [jsonDir]
 *   jsonDir 缺省 ../r11（入库夹具 p4-kinzoku.json 6820 格 +
 *   p1-n1-600.json 7700 行，随仓库分发）；输出按「低估/高估」双列
 *   （R11 度量口径：不符数必须分方向报，禁止只报总数——
 *   低估=模型行数<Chrome，高估=>）。
 */
import { rivalWrapLines as model } from '../../../../plugins/omnimux-inspiration/src/client/rival-masonry.js'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(process.argv[2] || join(here, '..', 'r11'))
let total = 0, mis = 0, low = 0, high = 0
for (const file of ['p4-kinzoku.json', 'p1-n1-600.json']) {
  const d = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
  let m = 0, lo = 0, hi = 0
  for (const r of d.rows) {
    const w = r.width ?? r.w
    total++
    const v = model(r.text, 14, w)
    if (v !== r.chrome) { m++; if (v < r.chrome) { lo++; low++ } else { hi++; high++ } }
  }
  mis += m
  console.log(file.split('/').pop(), 'mismatch', m, '/', d.rows.length, `低估 ${lo} / 高估 ${hi}`)
}
console.log('TOTAL mismatch', mis, `低估 ${low} / 高估 ${high}`)
