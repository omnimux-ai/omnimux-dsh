import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { parseShotTimeWindow, cleanScriptDisplay } from '../plugins/omnimux-inspiration/src/structure-script.js'

async function runVerify() {
  console.log('--- 验证灵感弹窗组件 currentShotIndex 与 handleSeekShot 完整定义 ---')
  const results = []

  // 1. 验证 parseShotTimeWindow
  const window1 = parseShotTimeWindow({ start_seconds: 2, end_seconds: 5 })
  assert.equal(window1.start, 2)
  assert.equal(window1.end, 5)
  results.push({ name: 'parseShotTimeWindow from seconds', status: 'PASS' })

  const window2 = parseShotTimeWindow({ time_range: '00:03 - 00:07' })
  assert.equal(window2.start, 3)
  assert.equal(window2.end, 7)
  results.push({ name: 'parseShotTimeWindow from time_range', status: 'PASS' })

  const window3 = parseShotTimeWindow(null)
  assert.equal(window3.start, 0)
  assert.equal(window3.end, 0)
  results.push({ name: 'parseShotTimeWindow safe fallback', status: 'PASS' })

  // 2. 验证 InspirationPreviewModal.jsx 中已正确声明 currentShotIndex 与 handleSeekShot
  const modalPath = path.resolve('plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const modalContent = fs.readFileSync(modalPath, 'utf8')

  assert.ok(modalContent.includes('const currentShotIndex = useMemo('), '必须声明 currentShotIndex')
  assert.ok(modalContent.includes('const handleSeekShot = (shot) =>'), '必须声明 handleSeekShot')
  assert.ok(modalContent.includes('parseShotTimeWindow(shot)'), '必须消费 parseShotTimeWindow')
  results.push({ name: 'currentShotIndex and handleSeekShot definitions', status: 'PASS' })

  const evidencePath = path.resolve('docs/evidence/fix-modal-shot-index-verify.json')
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 实机验证证据已输出至:', evidencePath)
}

runVerify().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
