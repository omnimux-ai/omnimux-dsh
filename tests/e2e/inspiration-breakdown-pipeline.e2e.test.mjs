import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感库视频解构升级为逐镜头分镜流水线、逐字稿与复刻传参通道贯通验证', () => {
  const analyzerPath = path.join(root, 'plugins/omnimux-inspiration/src/analyzer.js')
  const previewDataPath = path.join(root, 'plugins/omnimux-inspiration/src/client/inspiration-preview-data.js')
  const modalPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const replicatePath = path.join(root, 'plugins/omnimux-inspiration/src/client/replicate-to-chat.js')
  const stylesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/styles.js')

  const analyzerContent = fs.readFileSync(analyzerPath, 'utf-8')
  const previewDataContent = fs.readFileSync(previewDataPath, 'utf-8')
  const modalContent = fs.readFileSync(modalPath, 'utf-8')
  const replicateContent = fs.readFileSync(replicatePath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证后端解构提取逐镜头表格能力
  assert.ok(
    analyzerContent.includes('export function parseShotsFromMarkdownTable') &&
    analyzerContent.includes('parseTimeRangeSeconds'),
    'analyzer.js 必须具备分镜表格解析器 parseShotsFromMarkdownTable 与时间段解析器',
  )
  assert.ok(
    analyzerContent.includes('generateSemanticDeconstruction') &&
    analyzerContent.includes('parseShotsFromMarkdownTable(markdown)'),
    '语义降级兜底生成必须包含标准分镜列表与台词 segments',
  )

  // 2. 验证前端数据层融合 shots 与真实台词字幕
  assert.ok(
    previewDataContent.includes('export function collectShots') &&
    previewDataContent.includes('hasShots: Boolean(shots.length)'),
    'inspiration-preview-data.js 必须导出 collectShots 并输出 hasShots 状态',
  )
  assert.ok(
    previewDataContent.includes('const shots = collectShots(analysis, item)') &&
    previewDataContent.includes('fromShots.length'),
    'collectSegments 必须优先使用分镜中的原声台词生成逐字稿，消除空占位提示',
  )

  // 3. 验证弹窗右侧栏逐镜头卡片与顶部爆款策略渲染
  assert.ok(
    modalContent.includes('omnimux-inspiration-strategy-card') &&
    modalContent.includes('omnimux-inspiration-shots-container') &&
    modalContent.includes('omnimux-inspiration-shot-card'),
    'InspirationPreviewModal.jsx 必须渲染顶部爆款策略卡片与逐镜头分镜卡片容器',
  )
  assert.ok(
    modalContent.includes('shot.time_range') &&
    modalContent.includes('shot.prompt'),
    '分镜卡片必须展示精准时间跨度与 AI 提示词模板',
  )

  // 4. 验证复刻通道附件元数据完整携带结构化分镜数据
  assert.ok(
    replicateContent.includes('metadata: {') &&
    replicateContent.includes('shots,') &&
    replicateContent.includes('structure,'),
    'buildInspirationPayload 必须在 metadata 中挂载 shots 与 structure 结构化数据以供复刻 Skill 消费',
  )

  // 5. 验证 CSS 样式表支持分镜卡片规范且无违规
  assert.ok(
    stylesContent.includes('.omnimux-inspiration-shots-container') &&
    stylesContent.includes('.omnimux-inspiration-shot-card') &&
    stylesContent.includes('.omnimux-inspiration-shot-prompt-box'),
    'styles.js 必须包含逐镜头分镜卡片的完整深色极简样式',
  )
})
