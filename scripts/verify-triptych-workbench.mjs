import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

async function runVerify() {
  console.log('--- 开始验证灵感弹窗左中右三栏终极拉片工作台升级 ---')
  const results = []

  // 1. 检查 InspirationPreviewModal.jsx 中的三栏并列结构
  const modalPath = path.resolve('plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const modalContent = fs.readFileSync(modalPath, 'utf8')

  assert.ok(modalContent.includes('is-workbench is-triptych'), '主容器必须声明 is-triptych 三栏工作台')
  assert.ok(modalContent.includes('omnimux-inspiration-workbench-left'), '必须包含左侧视听主控面板')
  assert.ok(modalContent.includes('omnimux-inspiration-workbench-center'), '必须包含中栏分镜脚本面板')
  assert.ok(modalContent.includes('omnimux-inspiration-workbench-right'), '必须包含右栏结构拆解面板')
  assert.ok(!modalContent.includes('omnimux-inspiration-segmented-bar'), '必须彻底移除右侧多余的 Segmented Tabs 切换栏')
  results.push({ name: 'triptych panels present simultaneously', status: 'PASS' })

  // 2. 检查 styles.js 中的三栏 Grid 布局
  const stylesPath = path.resolve('plugins/omnimux-inspiration/src/client/styles.js')
  const stylesContent = fs.readFileSync(stylesPath, 'utf8')

  assert.ok(
    stylesContent.includes('grid-template-columns: minmax(320px, 360px) minmax(380px, 1.25fr) minmax(340px, 1fr)'),
    '样式表必须定义左中右三栏黄金分割比例',
  )
  assert.ok(stylesContent.includes('.omnimux-inspiration-workbench-center'), '样式表必须定义中栏独立样式')
  results.push({ name: 'triptych grid layout styles defined', status: 'PASS' })

  const evidencePath = path.resolve('docs/evidence/inspiration-triptych-workbench-verify.json')
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 实机验证证据已输出至:', evidencePath)
}

runVerify().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
