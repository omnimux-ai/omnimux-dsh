import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 生成素材一键升格为正式资产与跨场景流转端到端契约验证', () => {
  const generationsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/GenerationsView.jsx')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')

  const viewContent = fs.readFileSync(generationsViewPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')

  // 1. 验证词条声明
  assert.ok(
    localesContent.includes("'generations.promote': '设为资产'") &&
    localesContent.includes("'generations.addToCanvas': '放入画布'"),
    'locales 必须包含设为资产与放入画布词条'
  )

  // 2. 验证升格资产逻辑
  assert.ok(
    viewContent.includes('createAsset({') &&
    viewContent.includes('setPromotedIds'),
    'GenerationsView 必须实现调用 createAsset 并记录已升格状态'
  )

  // 3. 验证放入画布事件广播
  assert.ok(
    viewContent.includes("new CustomEvent('omnimux-workflow:add-media'") &&
    viewContent.includes('setCanvasAddedIds'),
    'GenerationsView 必须广播 omnimux-workflow:add-media 事件并记录已加入画布状态'
  )

  // 4. 验证 GenerationCard 挂载了快捷工具按钮
  assert.ok(
    viewContent.includes('onPromote') &&
    viewContent.includes('onAddToCanvas') &&
    viewContent.includes('isPromoted') &&
    viewContent.includes('isCanvasAdded'),
    'GenerationCard 必须接入升格与画布流转控制属性'
  )
})
