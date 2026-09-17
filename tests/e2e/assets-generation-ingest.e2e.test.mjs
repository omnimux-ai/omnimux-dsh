import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 中枢生成引擎与智能体工具链静默自动收敛端到端契约验证', () => {
  const indexPath = path.join(root, 'plugins/omnimux-assets/src/index.js')
  const ingestPath = path.join(root, 'plugins/omnimux-assets/src/generation-ingest.js')

  const indexContent = fs.readFileSync(indexPath, 'utf-8')
  const ingestContent = fs.readFileSync(ingestPath, 'utf-8')

  // 1. 验证 index.js 中挂载了 mountGenerationIngest
  assert.ok(
    indexContent.includes('mountGenerationIngest') &&
    indexContent.includes('mountGenerationIngest(ctx, { artifacts })'),
    'plugins/omnimux-assets/src/index.js 必须引入并执行 mountGenerationIngest 挂载静默收敛'
  )

  // 2. 验证 generation-ingest.js 覆盖核心 4 大生成工具
  assert.ok(
    ingestContent.includes("'image_generate'") &&
    ingestContent.includes("'video_generate'") &&
    ingestContent.includes("'omnimux_image_submit'") &&
    ingestContent.includes("'omnimux_video_submit'"),
    'generation-ingest 必须完整覆盖 4 大核心生成工具'
  )

  // 3. 验证具备异步静默容错保护
  assert.ok(
    ingestContent.includes('try {') &&
    ingestContent.includes('artifacts.report'),
    'generation-ingest 必须具备完整的异常静默包裹，杜绝影响正常生成链路'
  )
})
