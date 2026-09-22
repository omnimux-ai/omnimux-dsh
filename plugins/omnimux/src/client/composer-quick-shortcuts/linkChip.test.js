import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  QUICK_LINK_CHIP_CLASS,
  QUICK_LINK_CHIP_KINDS,
  QUICK_LINK_CHIP_SELECTOR,
  QUICK_LINK_CHIP_SPECS,
  isQuickLinkChipTarget,
  quickLinkChipKindFromAttr,
  quickLinkChipMarkdown,
  quickLinkChipSelectorFor,
  quickLinkChipSpec,
  quickLinkChipTexts,
} from './linkChip.js'

/** 中文文案解析器。 */
const zhT = (key) => ({
  'quickShortcuts.link.videoPlaceholder': '粘贴 TikTok 视频链接',
  'quickShortcuts.link.productPlaceholder': '粘贴商品链接或 ID',
  'quickShortcuts.link.videoRemove': '移除视频链接',
  'quickShortcuts.link.productRemove': '移除商品链接',
}[key] || key)
/** 文案缺失（返回 key 本身）的解析器：必须退回内置兜底，绝不渲染空占位。 */
const missingT = (key) => key

describe('胶囊形态真源', () => {
  it('两种链接各有自己的锚点属性、图标与文案，表单完整', () => {
    assert.deepEqual(QUICK_LINK_CHIP_KINDS, ['video', 'product'])
    assert.equal(QUICK_LINK_CHIP_SPECS.video.tokenAttr, 'data-omx-video-token')
    assert.equal(QUICK_LINK_CHIP_SPECS.product.tokenAttr, 'data-omx-product-token')
    assert.equal(QUICK_LINK_CHIP_SPECS.video.icon, 'link')
    assert.equal(QUICK_LINK_CHIP_SPECS.product.icon, 'package')
    for (const kind of QUICK_LINK_CHIP_KINDS) {
      const spec = quickLinkChipSpec(kind)
      assert.equal(spec.kind, kind)
      assert.ok(spec.placeholder && spec.removeLabel && spec.defaultLabel, `${kind} 的兜底文案不能缺`)
    }
    assert.equal(quickLinkChipSpec('not-a-kind'), null)
    assert.equal(quickLinkChipSpec(''), null)
    assert.equal(quickLinkChipSpec(null), null)
  })

  it('选择器与令牌属性可以互相反查（提交桥按属性读、节点按选择器找）', () => {
    assert.equal(quickLinkChipSelectorFor('video'), '[data-omx-video-token="true"]')
    assert.equal(quickLinkChipSelectorFor('product'), '[data-omx-product-token="true"]')
    assert.equal(quickLinkChipSelectorFor('not-a-kind'), '')
    assert.equal(quickLinkChipKindFromAttr('data-omx-video-token'), 'video')
    assert.equal(quickLinkChipKindFromAttr('data-omx-product-token'), 'product')
    assert.equal(quickLinkChipKindFromAttr('data-omx-other'), '')
    assert.equal(quickLinkChipKindFromAttr(null), '')
    assert.match(QUICK_LINK_CHIP_SELECTOR, /data-omx-video-token/)
    assert.match(QUICK_LINK_CHIP_SELECTOR, /data-omx-product-token/)
    assert.equal(QUICK_LINK_CHIP_CLASS, 'omx-link-chip')
  })

  it('显示文案跟随语言；文案缺失时退回中文原名', () => {
    const video = quickLinkChipTexts('video', '视频', zhT)
    assert.deepEqual(video, { name: '视频', placeholder: '粘贴 TikTok 视频链接', removeLabel: '移除视频链接' })
    const product = quickLinkChipTexts('product', '商品', zhT)
    assert.equal(product.placeholder, '粘贴商品链接或 ID')
    // 跟随语言的名称优先，缺文案时退回内置兜底
    assert.equal(quickLinkChipTexts('video', 'Video', missingT).name, 'Video')
    assert.equal(quickLinkChipTexts('video', '', missingT).placeholder, '粘贴 TikTok 视频链接')
    assert.equal(quickLinkChipTexts('product', undefined, undefined).removeLabel, '移除商品链接')
    assert.equal(quickLinkChipTexts('not-a-kind', '视频', zhT), null)
  })
})

describe('胶囊 → 提交文本', () => {
  it('视频按既有桥的 markdown 形态，商品按既有商品槽位填充形态', () => {
    assert.equal(quickLinkChipMarkdown('video', 'https://www.tiktok.com/@a/video/1'), '[视频](https://www.tiktok.com/@a/video/1)')
    assert.equal(quickLinkChipMarkdown('product', 'https://shop.example.com/p/1'), '[商品: https://shop.example.com/p/1]')
    assert.equal(quickLinkChipMarkdown('product', 'SKU-9'), '[商品: SKU-9]')
  })

  it('链接两边空白先裁掉；没填链接不出文本（宁可不提交半截标记）', () => {
    assert.equal(quickLinkChipMarkdown('video', '  https://a.example/1  '), '[视频](https://a.example/1)')
    assert.equal(quickLinkChipMarkdown('video', ''), '')
    assert.equal(quickLinkChipMarkdown('video', '   '), '')
    assert.equal(quickLinkChipMarkdown('video', null), '')
    assert.equal(quickLinkChipMarkdown('not-a-kind', 'https://a.example/1'), '')
  })

  it('提交名是语言无关的固定名：界面语言不改变提交标记', () => {
    // 规格 S6 字面就是中文形态；提交文本随语言漂移会让下游没有唯一写法可认。
    assert.equal(quickLinkChipSpec('video').commitLabel, '视频')
    assert.equal(quickLinkChipSpec('product').commitLabel, '商品')
    assert.equal(quickLinkChipMarkdown('video', 'https://a.example/1'), '[视频](https://a.example/1)')
    assert.equal(quickLinkChipMarkdown('product', 'SKU-9'), '[商品: SKU-9]')
    // 显示名仍跟随语言（两件事互不影响）：胶囊上的名称可以叫 Video。
    assert.equal(quickLinkChipTexts('video', 'Video', zhT).name, 'Video')
  })
})

describe('胶囊内的目标判定（宿主通道据此让路）', () => {
  const fakeTarget = (selector) => ({ closest: (given) => (given === selector ? {} : null) })

  it('命中任一令牌属性即算胶囊内；非元素目标一律不算', () => {
    assert.equal(isQuickLinkChipTarget(fakeTarget(QUICK_LINK_CHIP_SELECTOR)), true)
    assert.equal(isQuickLinkChipTarget({ closest: () => null }), false)
    assert.equal(isQuickLinkChipTarget({}), false)
    assert.equal(isQuickLinkChipTarget(null), false)
    assert.equal(isQuickLinkChipTarget('target'), false)
  })
})
