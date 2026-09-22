import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildQuickLinkSlots,
  detectedSlotsDraftText,
  isQuickLinkSlotFilled,
  mergeQuickLinkKinds,
  quickLinkKindsInDraft,
  quickLinkLabels,
  quickLinkToken,
  quickLinkTokensForKind,
  splitQuickLinkSlots,
  stripQuickShortcutText,
} from './links.js'
import { QUICK_SHORTCUTS } from './catalog.js'

const LABELS = { video: '视频', product: '商品' }
const CLONE = QUICK_SHORTCUTS.find((entry) => entry.id === 'clone')

/** 跟随语言的中文文案解析器。 */
const zhT = (key) => ({ 'quickShortcuts.link.video': '视频', 'quickShortcuts.link.product': '商品' }[key] || key)
/** 文案缺失（返回 key 本身）的解析器：必须退回中文原名，不渲染空卡槽。 */
const missingT = (key) => key

describe('链接令牌与显示名', () => {
  it('令牌沿用既有方括号槽位语法，空文案不出令牌', () => {
    assert.equal(quickLinkToken('视频'), '[视频]')
    assert.equal(quickLinkToken('  商品  '), '[商品]')
    assert.equal(quickLinkToken(''), '')
    assert.equal(quickLinkToken(null), '')
  })

  it('显示名跟随语言；文案缺失时退回中文原名，绝不渲染空卡槽', () => {
    assert.deepEqual(quickLinkLabels(zhT), { video: '视频', product: '商品' })
    assert.deepEqual(quickLinkLabels(missingT), { video: '视频', product: '商品' })
    assert.deepEqual(quickLinkLabels(undefined), { video: '视频', product: '商品' })
  })

  it('每种链接都登记了全部支持语言的令牌（判据据此与界面语言解耦）', () => {
    assert.deepEqual([...quickLinkTokensForKind('video')].sort(), ['[Video]', '[视频]'].sort())
    assert.deepEqual([...quickLinkTokensForKind('product')].sort(), ['[Product]', '[商品]'].sort())
    assert.deepEqual(quickLinkTokensForKind('not-a-kind'), [])
  })

  it('卡槽形状可直接喂给既有 PromptSlotChips（id / raw / protocol 齐备）', () => {
    const slots = buildQuickLinkSlots(['video', 'product'], LABELS)
    assert.deepEqual(slots.map((slot) => [slot.id, slot.raw, slot.protocol, slot.quickLinkKind]), [
      ['omx-quick-link-video', '[视频]', 'url', 'video'],
      ['omx-quick-link-product', '[商品]', 'url', 'product'],
    ])
    assert.deepEqual(buildQuickLinkSlots([], LABELS), [])
    assert.deepEqual(buildQuickLinkSlots(['video'], { video: '' }), [])
  })
})

describe('卡槽两态判据（唯一实现）', () => {
  const slots = buildQuickLinkSlots(['video', 'product'], LABELS)
  /** 判据输入 = 输入框里的胶囊种类 + 草稿里手打的令牌种类（业务侧就这一条合成路径）。 */
  const present = (chipKinds, draft) => mergeQuickLinkKinds(chipKinds, draft)

  it('输入框里有该种类的胶囊即视为已填（胶囊不进草稿文本，全靠节点种类）', () => {
    assert.equal(isQuickLinkSlotFilled(present(['video'], ''), slots[0]), true)
    assert.equal(isQuickLinkSlotFilled(present(['product'], ''), slots[1]), true)
    assert.equal(isQuickLinkSlotFilled(present([], ''), slots[0]), false)
  })

  it('草稿里已有手打令牌同样算已填，带链接的 markdown 形态也命中', () => {
    assert.equal(isQuickLinkSlotFilled(present([], '请用我的产品复刻这个爆款视频\n[视频]'), slots[0]), true)
    assert.equal(isQuickLinkSlotFilled(present([], '[视频](https://example.com/a.mp4) 帮我复制'), slots[0]), true)
    assert.equal(isQuickLinkSlotFilled(present([], '只有提示语'), slots[0]), false)
  })

  it('商品与视频互不影响，空输入一律未填', () => {
    const chips = present([], '[商品](https://shop.example.com/p/1)')
    assert.equal(isQuickLinkSlotFilled(chips, slots[1]), true)
    assert.equal(isQuickLinkSlotFilled(chips, slots[0]), false)
    assert.equal(isQuickLinkSlotFilled(present([], ''), slots[0]), false)
    assert.equal(isQuickLinkSlotFilled(present([], null), slots[0]), false)
    assert.equal(isQuickLinkSlotFilled(present([], '随便'), null), false)
    assert.equal(isQuickLinkSlotFilled(null, slots[0]), false)
  })

  it('切换界面语言后旧令牌仍算已填（判据走 kind，不走当前语言的显示名）', () => {
    const englishSlots = buildQuickLinkSlots(['video', 'product'], { video: 'Video', product: 'Product' })
    const chineseDraft = present([], '请用我的产品复刻这个爆款视频\n[视频] [商品]')
    assert.equal(isQuickLinkSlotFilled(chineseDraft, englishSlots[0]), true)
    assert.equal(isQuickLinkSlotFilled(chineseDraft, englishSlots[1]), true)
    const englishDraft = present([], '[Video] [Product]')
    assert.equal(isQuickLinkSlotFilled(englishDraft, slots[0]), true)
    assert.equal(isQuickLinkSlotFilled(englishDraft, slots[1]), true)
  })

  it('草稿文本反查种类跨语言；认不出的种类不算已填', () => {
    assert.deepEqual(quickLinkKindsInDraft('[Video]'), ['video'])
    assert.deepEqual(quickLinkKindsInDraft('[商品] 加个 [角色]'), ['product'])
    assert.deepEqual(quickLinkKindsInDraft(''), [])
    assert.deepEqual(quickLinkKindsInDraft(null), [])
    assert.equal(isQuickLinkSlotFilled(present([], '[视频]'), { raw: '[视频]' }), true)
    assert.equal(isQuickLinkSlotFilled(present([], '[视频]'), { raw: '[角色]' }), false)
    assert.equal(isQuickLinkSlotFilled(present([], '[视频]'), { quickLinkKind: 'not-a-kind' }), false)
  })

  it('商品认自己的提交形态 [商品: <值>]，草稿里已有槽位时不再插第二枚胶囊', () => {
    assert.deepEqual(quickLinkKindsInDraft('[商品: https://shop.example.com/p/1]'), ['product'])
    assert.deepEqual(quickLinkKindsInDraft('[Product: SKU-9]'), ['product'])
    assert.deepEqual(quickLinkKindsInDraft('  前一句 [商品: SKU-9] 后一句  '), ['product'])
    // 与 promptSlotDetector 同口径：冒号后必须有值才算填充态
    assert.deepEqual(quickLinkKindsInDraft('[商品:]'), [])
    // 视频的提交形态是 markdown 链接而非槽位：`[视频: xxx]` 在槽位口径里是文件槽位，不算视频已填
    assert.deepEqual(quickLinkKindsInDraft('[视频: xxx]'), [])
    // 与胶囊种类合流后仍是同一份判据
    assert.equal(
      isQuickLinkSlotFilled(mergeQuickLinkKinds([], '[商品: SKU-9]'), buildQuickLinkSlots(['product'], LABELS)[0]),
      true,
    )
  })

  it('胶囊种类与草稿令牌合并且按真源顺序去重', () => {
    assert.deepEqual(mergeQuickLinkKinds(['product'], '[视频]'), ['video', 'product'])
    assert.deepEqual(mergeQuickLinkKinds(['video', 'video'], ''), ['video'])
    assert.deepEqual(mergeQuickLinkKinds(null, null), [])
  })

  it('一次拆出「不可点」与「可点」两拨 id', () => {
    const split = splitQuickLinkSlots(present(['video'], ''), slots)
    assert.deepEqual(split.filledIds, ['omx-quick-link-video'])
    assert.deepEqual(split.openIds, ['omx-quick-link-product'])
    assert.deepEqual(splitQuickLinkSlots(present([], ''), slots), {
      filledIds: [],
      openIds: ['omx-quick-link-video', 'omx-quick-link-product'],
    })
  })

  it('输入框已解析出的令牌可折成等效草稿文本，判据因此不依赖渲染期读 DOM', () => {
    const detected = [{ raw: '请稍等' }, { raw: '[视频]' }, { raw: null }]
    const draft = detectedSlotsDraftText(detected)
    assert.equal(draft, '请稍等 [视频]')
    assert.deepEqual(splitQuickLinkSlots(present([], draft), slots).filledIds, ['omx-quick-link-video'])
    assert.equal(detectedSlotsDraftText(null), '')
  })
})

describe('撤回只剥提示语，绝不吃用户手打的内容', () => {
  it('整篇都是本快捷方式写入的提示语：清空', () => {
    assert.equal(stripQuickShortcutText(CLONE, CLONE.prompt), '')
    assert.equal(stripQuickShortcutText(CLONE, `${CLONE.prompt}\n\n`), '')
  })

  it('用户手打的追加文字原样保留', () => {
    const draft = `${CLONE.prompt}\n\n再帮我加个标题`
    assert.equal(stripQuickShortcutText(CLONE, draft), '再帮我加个标题')
  })

  it('用户手打的同名令牌一枚都不吃（不再按卡槽集数量剥令牌）', () => {
    const draft = `${CLONE.prompt}\n\n我的标题 [视频] 与 [商品]`
    assert.equal(stripQuickShortcutText(CLONE, draft), '我的标题 [视频] 与 [商品]')
  })

  it('用户手打的 markdown 形态链接同样不动', () => {
    const draft = `${CLONE.prompt}\n\n参考 [视频](https://example.com/a.mp4) 的节奏`
    assert.equal(stripQuickShortcutText(CLONE, draft), '参考 [视频](https://example.com/a.mp4) 的节奏')
  })

  it('用户改过提示语时整条保留（不是草稿开头就不再认作本快捷方式写的）', () => {
    const draft = '改成我自己的提示语\n\n[视频]'
    assert.equal(stripQuickShortcutText(CLONE, draft), '改成我自己的提示语\n\n[视频]')
  })

  it('空草稿与非法输入不抛错', () => {
    assert.equal(stripQuickShortcutText(CLONE, ''), '')
    assert.equal(stripQuickShortcutText(CLONE, null), '')
    assert.equal(stripQuickShortcutText(CLONE, 42), '')
  })

  it('条目信息缺失时不猜、不动草稿（宁可留着也不静默丢弃）', () => {
    assert.equal(stripQuickShortcutText(null, '[视频]'), '[视频]')
    assert.equal(stripQuickShortcutText(null, '用户自己写的字'), '用户自己写的字')
    assert.equal(stripQuickShortcutText({}, CLONE.prompt), CLONE.prompt)
  })

  it('界面语言不影响结论：别的语言写法的令牌同样不动', () => {
    assert.equal(stripQuickShortcutText(CLONE, '我的说明 [Video] [Product]'), '我的说明 [Video] [Product]')
    assert.equal(
      stripQuickShortcutText(CLONE, `${CLONE.prompt}\n\n[Video](https://example.com/a.mp4)`),
      '[Video](https://example.com/a.mp4)',
    )
  })
})
