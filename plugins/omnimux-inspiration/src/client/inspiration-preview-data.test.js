import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canAnalyzeInspiration,
  deconstructionCopyText,
  getInspirationPreviewData,
  hasDeconstruction,
  parseDocAnalysis,
  scriptCopyText,
  renderPlainBreakdownText,
} from './inspiration-preview-data.js'

describe('inspiration preview data', () => {
  it('prefers content over narrative and never invents timestamps', () => {
    const data = getInspirationPreviewData({
      content: '脚本',
      analysis: { narrative_strategy: '策略' },
      created_at: '2024-01-01T00:00:00.000Z',
      published_at: '2024-02-02T00:00:00.000Z',
    })
    assert.equal(data.script, '脚本')
    assert.equal(data.createdAt, '2024-01-01')
    assert.equal(data.publishedAt, '2024-02-02')
    assert.equal(data.hasTimecodes, false)
    assert.equal(data.segmentCount, 0)
  })

  it('falls back to narrative then compatible caption', () => {
    assert.equal(getInspirationPreviewData({ analysis: { narrative_strategy: '策略' }, caption: '说明' }).script, '策略')
    assert.equal(getInspirationPreviewData({ caption: '说明' }).script, '说明')
  })

  it('handles malformed and empty legacy records', () => {
    const data = getInspirationPreviewData(null)
    assert.equal(data.title, '灵感详情')
    assert.equal(hasDeconstruction(data), false)
    assert.equal(data.createdAt, '')
  })

  it('ignores non-text analysis fields instead of exposing render-unsafe values', () => {
    const data = getInspirationPreviewData({
      analysis: {
        narrative_strategy: { text: 'bad shape' },
        hook_highlight: { text: 'bad shape' },
        target_goal: ['bad shape'],
        visual_breakdown: 42,
        replication_action: false,
      },
    })
    assert.equal(data.script, '')
    assert.equal(data.hook, '')
    assert.equal(data.targetGoal, '')
    assert.equal(data.visual, '')
    assert.equal(data.replication, '')
    assert.equal(hasDeconstruction(data), false)
  })

  it('renders breakdown text without Markdown markers', () => {
    assert.equal(renderPlainBreakdownText('## 目标\n* **转化目标**: 提升点击\n- 继续观看\n\n\n下一步'), '目标\n· 转化目标: 提升点击\n· 继续观看\n\n下一步')
  })

  it('keeps real segment timecodes and formats duration', () => {
    const data = getInspirationPreviewData({
      duration: 17,
      deconstruction: {
        segments: [
          { id: 'seg_1', start: 0, text: 'hook line' },
          { id: 'seg_2', text: 'no time' },
        ],
        sections: [{ title: 'Hook', quote: 'hook line', analysis: 'why', source_segment_ids: ['seg_1'] }],
      },
    })
    assert.equal(data.durationLabel, '0:17')
    assert.equal(data.hasTimecodes, true)
    assert.equal(data.segments[0].startLabel, '0:00')
    assert.equal(data.segments[1].startLabel, '')
    assert.equal(data.sections[0].quote, 'hook line')
    assert.match(scriptCopyText(data, false), /0:00/)
    assert.match(deconstructionCopyText(data), /hook line/)
  })

  it('parses markdown analysis into clear 2-level item and 3-level description hierarchy', () => {
    const raw = `### 明线价值 (Explicit Value)
提供改善皮肤、增强肌肉、增加骨密度的营养补充方案。

### 暗线价值 (Implicit Value)
- 强调第三方测试 (Third Party Tested)。
- 强调草饲 (Grass Fed)。

* **转化目标**: 强化品牌功效心智
* **情绪基调**: 惊喜、种草`

    const parsed = parseDocAnalysis(raw)
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0].title, '明线价值 (Explicit Value)')
    assert.equal(parsed[0].entries[0].type, 'desc')
    assert.equal(parsed[0].entries[0].text, '提供改善皮肤、增强肌肉、增加骨密度的营养补充方案。')

    assert.equal(parsed[1].title, '暗线价值 (Implicit Value)')
    assert.equal(parsed[1].entries[0].text, '强调第三方测试 (Third Party Tested)。')
    assert.equal(parsed[1].entries[1].text, '强调草饲 (Grass Fed)。')
    assert.equal(parsed[1].entries[2].type, 'labeled')
    assert.equal(parsed[1].entries[2].label, '转化目标')
    assert.equal(parsed[1].entries[2].desc, '强化品牌功效心智')
  })
})

describe('canAnalyzeInspiration — degraded items must not offer a failing action (P1-2)', () => {
  it('hides the action for a link or image item, which has no video stream', () => {
    assert.equal(canAnalyzeInspiration({ type: 'link', source_url: 'https://youtu.be/abc' }), false)
    assert.equal(canAnalyzeInspiration({ type: 'image', source_url: 'https://www.instagram.com/p/C1/' }), false)
    assert.equal(canAnalyzeInspiration({ type: 'link', local_paths: { cover: '/tmp/c.jpg' } }), false)
  })

  it('keeps the action for a video item with a local file', () => {
    assert.equal(canAnalyzeInspiration({
      type: 'video',
      source_url: 'https://x.com/a/status/1',
      local_paths: { video: '/tmp/v.mp4' },
    }), true)
  })

  it('keeps the action for a video item the backend can still re-resolve from its url', () => {
    // Cloud-catalog video items carry no `local_paths`; `handleAnalyze` downloads
    // the stream from `source_url` before decomposing it.
    assert.equal(canAnalyzeInspiration({ type: 'video', source_url: 'https://www.tiktok.com/@a/video/1' }), true)
    assert.equal(canAnalyzeInspiration({ type: 'video', source_url: 'https://x.com/a/status/1', local_paths: {} }), true)
  })

  it('hides the action when nothing can produce a video at all', () => {
    assert.equal(canAnalyzeInspiration({ type: 'video' }), false)
    assert.equal(canAnalyzeInspiration({ type: 'video', source_url: '' }), false)
    assert.equal(canAnalyzeInspiration({}), false)
    assert.equal(canAnalyzeInspiration(null), false)
    assert.equal(canAnalyzeInspiration(undefined), false)
  })
})
