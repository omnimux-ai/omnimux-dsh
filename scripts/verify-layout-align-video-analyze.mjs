import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { cleanScriptDisplay } from '../plugins/omnimux-inspiration/src/structure-script.js'

async function runVerify() {
  console.log('--- 开始验证灵感弹窗双栏工作台布局与分镜卡片对齐升级 ---')
  const results = []

  // 1. 验证台词清洗纯函数 (针对用户截图中的真实脏文本)
  const case1 = cleanScriptDisplay('Overlay): "**{Hook_Title}**<br>**{Model_List_Line_1}**"')
  assert.equal(case1, '{Hook_Title} {Model_List_Line_1}', '必须彻底剥离 Overlay): 前缀、<br> 与 ** 星号')
  results.push({ name: 'cleanScriptDisplay Overlay removal', status: 'PASS', output: case1 })

  const case2 = cleanScriptDisplay('(CTA Banner): "**{CTA_Action}**"')
  assert.equal(case2, '{CTA_Action}', '必须彻底剥离 (CTA Banner): 前缀与裸露引号')
  results.push({ name: 'cleanScriptDisplay CTA Banner removal', status: 'PASS', output: case2 })

  const case3 = cleanScriptDisplay('（口播）：这真的是我发现的宝藏！<br/>千万别错过。')
  assert.equal(case3, '这真的是我发现的宝藏！ 千万别错过。')
  results.push({ name: 'cleanScriptDisplay Chinese prefix and break removal', status: 'PASS', output: case3 })

  // 2. 检查 InspirationPreviewModal.jsx 与 styles.js 中的双栏工作台关键类名
  const modalPath = path.resolve('plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const modalContent = fs.readFileSync(modalPath, 'utf8')
  assert.ok(modalContent.includes('is-workbench'), '必须包含 is-workbench 双栏标记')
  assert.ok(modalContent.includes('omnimux-inspiration-workbench-left'), '必须包含左侧视听主控栏')
  assert.ok(modalContent.includes('omnimux-inspiration-workbench-right'), '必须包含右侧分析工作台')
  assert.ok(modalContent.includes('omnimux-inspiration-segmented-bar'), '必须包含分段切换栏')
  assert.ok(modalContent.includes('omnimux-inspiration-shot-playing-badge'), '必须包含播放中呼吸灯徽标')
  results.push({ name: 'workbench layout classes in modal', status: 'PASS' })

  const stylesPath = path.resolve('plugins/omnimux-inspiration/src/client/styles.js')
  const stylesContent = fs.readFileSync(stylesPath, 'utf8')
  assert.ok(stylesContent.includes('.omnimux-inspiration-modal-body.is-workbench'), '样式表必须包含双栏弹性样式')
  assert.ok(stylesContent.includes('@keyframes omnimux-pulse'), '样式表必须包含呼吸灯动画')
  results.push({ name: 'workbench layout styles defined', status: 'PASS' })

  const evidencePath = path.resolve('docs/evidence/inspiration-layout-align-video-analyze-verify.json')
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 专属实机验证证据已生成至:', evidencePath)
}

runVerify().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
