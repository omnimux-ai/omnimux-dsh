import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感弹窗大屏左中右三栏终极拉片工作台验证', () => {
  const modalPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/styles.js')

  const modalContent = fs.readFileSync(modalPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证三栏并列且彻底去除分段 Tab 切换
  assert.ok(
    modalContent.includes('is-workbench is-triptych'),
    '主视窗必须声明 is-triptych 三栏工作台',
  )
  assert.ok(
    !modalContent.includes('omnimux-inspiration-segmented-bar'),
    '大屏下无需 Tab 切换，必须彻底移除 segmented-bar',
  )

  // 2. 验证左中右三栏并存
  assert.ok(
    modalContent.includes('omnimux-inspiration-workbench-left') &&
    modalContent.includes('omnimux-inspiration-workbench-center') &&
    modalContent.includes('omnimux-inspiration-workbench-right'),
    '左栏(视频)、中栏(分镜)、右栏(解构)必须全部并存同屏渲染',
  )

  // 3. 验证中栏分镜卡片高级能力
  assert.ok(
    modalContent.includes('omnimux-inspiration-shot-speech-container') &&
    modalContent.includes('omnimux-inspiration-shot-playing-badge'),
    '中栏必须包含麦克风台词气泡与播放呼吸绿灯联动',
  )

  // 4. 验证右栏结构拆解卡片容器
  assert.ok(
    modalContent.includes('omnimux-inspiration-modal-deconstruction-body') &&
    modalContent.includes('omnimux-inspiration-strategy-card'),
    '右栏必须包含结构拆解五维策略卡片容器',
  )

  // 5. 验证 CSS 网格比例定义
  assert.ok(
    stylesContent.includes('grid-template-columns: minmax(320px, 360px) minmax(380px, 1.25fr) minmax(340px, 1fr)'),
    '样式表必须声明三栏黄金宽度比例',
  )
})
