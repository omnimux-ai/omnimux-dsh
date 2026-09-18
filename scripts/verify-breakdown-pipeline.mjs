import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {
  extractStructuredBreakdown,
  generateSemanticDeconstruction,
  parseShotsFromMarkdownTable,
} from '../plugins/omnimux-inspiration/src/analyzer.js'
import { getInspirationPreviewData } from '../plugins/omnimux-inspiration/src/client/inspiration-preview-data.js'
import { buildInspirationPayload } from '../plugins/omnimux-inspiration/src/client/replicate-to-chat.js'

async function runVerify() {
  console.log('--- 开始验证灵感库分镜流水线、逐字稿与复刻传参通道升级 ---')
  const results = []

  // 1. 验证 Markdown 分镜表提取能力
  const sampleMarkdown = `## 一句话视频描述
这是一条爆款科技开箱视频。

## I. 核心目标
* **转化目标**: 引导点击左下角链接购买
* **情绪基调**: 好奇、惊叹

## IV. 画面分析
* **镜头语言**: 快节奏切换

### 逐帧拆解 (Shot-by-Shot Breakdown)

| 时间 (Time) | 画面描述 & 镜头 (Visual & Shot) | Midjourney Prompt (For AI Gen) | 关键动作 (Action) | 脚本模板 (Script Template with {Variables}) |
| :--- | :--- | :--- | :--- | :--- |
| 00:00 - 00:03 | 特写，主播手持微小的AI硬件面对镜头。 | \`Young creator holding tiny black AI pendant --ar 9:16\` | 猛然举起至镜头前，瞪大眼睛 | (Audio): "别眨眼，这就是今年最震撼的AI黑科技！" |
| 00:03 - 00:08 | 中景，展示语音交互与灯光反馈。 | \`Futuristic pendant glowing blue light in dark studio --ar 9:16\` | 轻按表面，灯圈亮起，演示实时翻译 | (Audio): "不需要掏出手机，一句话就能实时翻译多国语言。" |
| 00:08 - 00:12 | 主观特写，手机App端实时数据同步。 | \`POV smartphone app displaying transcribed text stream --ar 9:16\` | 屏幕文字实时跳出，展示精准度 | (Audio): "不仅完全没有延迟，还能自动生成会议要点。" |
| 00:12 - 00:15 | 中景，主播微笑向左下角手指指引。 | \`Smiling host pointing to bottom left with excitement --ar 9:16\` | 热情招手并引导点击小黄车 | (Audio): "现货库存非常紧张，立刻点击下方链接抢先体验！" |
`

  const extracted = extractStructuredBreakdown(sampleMarkdown)
  assert.equal(extracted.summary, '这是一条爆款科技开箱视频。')
  assert.ok(extracted.shots.length === 4, `解析出的分镜数必须为 4，当前: ${extracted.shots.length}`)
  assert.equal(extracted.shots[0].time_range, '00:00 - 00:03')
  assert.equal(extracted.shots[0].action, '猛然举起至镜头前，瞪大眼睛')
  assert.ok(extracted.shots[0].script.includes('别眨眼'), '台词脚本必须被提取')
  assert.ok(extracted.shots[0].prompt.includes('Young creator'), 'Prompt 模板必须被提取')
  assert.ok(extracted.segments.length === 4, '必须同步生成 4 条台词字幕 segments')
  results.push({ name: 'shot breakdown table extraction', status: 'PASS', shot_count: extracted.shots.length })

  // 2. 验证兜底生成器产出标准分镜
  const semantic = generateSemanticDeconstruction({
    title: '智能美白面霜实测',
    content: '皮肤暗沉救星',
    tags: ['护肤', '美白'],
  })
  assert.ok(semantic.shots.length >= 3, '语义降级生成必须包含至少 3 个标准镜头')
  assert.ok(semantic.segments.length >= 3, '语义降级生成必须同步产出对应的台词 segments')
  results.push({ name: 'semantic fallback with standard shots', status: 'PASS', shot_count: semantic.shots.length })

  // 3. 验证客户端 previewData 正确融合分镜与逐字稿
  const mockItem = {
    id: 'insp_test_999',
    title: 'Claude 让我赚翻了',
    source_url: 'https://tiktok.com/@ai/video/123',
    deconstruction: extracted,
  }
  const previewData = getInspirationPreviewData(mockItem)
  assert.equal(previewData.hasShots, true)
  assert.equal(previewData.shots.length, 4)
  assert.equal(previewData.segments.length, 4)
  assert.ok(previewData.segments[0].text.includes('别眨眼'), '中间栏台词必须从分镜中继承提取')
  results.push({ name: 'previewData integration with shots and segments', status: 'PASS' })

  // 4. 验证复刻通道 payload 带上结构化分镜数据
  const payload = buildInspirationPayload(mockItem)
  assert.ok(payload.metadata.shots.length === 4, '传递给 Agent 的附件元数据必须包含完整的 shots 结构化清单')
  assert.equal(payload.metadata.shots[0].time_range, '00:00 - 00:03')
  results.push({ name: 'replication payload metadata shots attachment', status: 'PASS' })

  const evidencePath = path.resolve('docs/evidence/inspiration-breakdown-pipeline-verify.json')
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 验证完成，证据已生成至:', evidencePath)
}

runVerify().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
