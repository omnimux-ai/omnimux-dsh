import { rivalWrapLines as R10 } from '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/account-monitor-v2-cards-r8/plugins/omnimux-inspiration/src/client/rival-masonry.js'
import { readFileSync } from 'node:fs'
let total = 0, mis = 0
for (const file of ['/tmp/r8qa/logs/p4-kinzoku.json', '/tmp/r8qa/logs/p1-n1-600.json']) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  let m = 0
  for (const r of d.rows) {
    const w = r.width ?? r.w
    total++
    if (R10(r.text, 14, w) !== r.chrome) m++
  }
  mis += m
  console.log(file.split('/').pop(), 'mismatch', m, '/', d.rows.length)
}
console.log('TOTAL mismatch', mis)
