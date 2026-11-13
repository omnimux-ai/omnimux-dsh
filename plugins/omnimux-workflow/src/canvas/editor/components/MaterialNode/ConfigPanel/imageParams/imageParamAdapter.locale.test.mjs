/**
 * Issue #4113（F1）— 图片摘要必须按当前 locale 解析生成模式名。
 *
 * 修复前 `formatImageSummary(params)` 无 locale 参数，en 界面图片节点的模式名停在中文，
 * 与视频摘要（summaryFormatter）/ SegmentControls 不一致。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildImageModeOptions, formatImageSummary } from './imageParamAdapter.ts'

/** gateway-only 图片操作：没有本地 label，必须由已审校目录解析。 */
const params = (operation) => ({
  model: 'm',
  operation,
  operationLabel: '',
  effectiveOperations: [],
  showModeUi: true,
  schema: {},
  aspectRatio: '16:9',
})

describe('formatImageSummary locale (#4113 F1)', () => {
  it('en：gateway-only 图片操作显示英文（不再停在中文）', () => {
    assert.equal(formatImageSummary(params('text_to_image'), 'en').modeText, 'Text to image')
    assert.equal(formatImageSummary(params('image_to_image'), 'en').modeText, 'Image to image')
    assert.equal(formatImageSummary(params('multi_reference'), 'en').modeText, 'Multi-image reference')
  })

  it('zh：同一操作显示中文（回归不变）', () => {
    assert.equal(formatImageSummary(params('text_to_image'), 'zh').modeText, '文生图')
  })

  it('型号自定义 label 优先（≠ id 时不改写）', () => {
    assert.equal(
      formatImageSummary({ ...params('text_to_image'), operationLabel: '一键出图' }, 'en').modeText,
      '一键出图',
    )
  })
})

/** #4113 M1：浮层 modeOptions 的行为断言（en/zh），与摘要条同一解析器。 */
describe('buildImageModeOptions locale (#4113 M1)', () => {
  const ops = [
    { id: 'text_to_image', label: '' },
    { id: 'image_to_image', label: '' },
    { id: 'multi_reference', label: '' },
  ]
  it('en：浮层生成方式选项为英文', () => {
    assert.deepEqual(buildImageModeOptions(ops, 'en').map((x) => x.label), [
      'Text to image', 'Image to image', 'Multi-image reference',
    ])
  })
  it('zh：浮层生成方式选项为中文', () => {
    assert.deepEqual(buildImageModeOptions(ops, 'zh').map((x) => x.label), [
      '文生图', '图生图', '多图主体参考',
    ])
  })
  it('自定义 label 优先，不被 locale 改写', () => {
    assert.equal(buildImageModeOptions([{ id: 'text_to_image', label: '一键出图' }], 'en')[0].label, '一键出图')
  })
})
