import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildQuickLinkSlots,
  detectedSlotsDraftText,
  isQuickLinkSlotFilled,
  quickLinkLabels,
  quickLinkToken,
  quickLinkTokensForKind,
  splitQuickLinkSlots,
  stripQuickShortcutText,
} from './links.js'
import { QUICK_SHORTCUTS, quickShortcutLinks } from './catalog.js'

const LABELS = { video: '视频', product: '商品' }
const CLONE = QUICK_SHORTCUTS.find((entry) => entry.id === 'clone')
const BREAKDOWN = QUICK_SHORTCUTS.find((entry) => entry.id === 'breakdown')

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

  it('草稿里已有令牌即视为已填，带链接的 markdown 形态同样命中', () => {
    assert.equal(isQuickLinkSlotFilled('请用我的产品复刻这个爆款视频\n[视频]', slots[0]), true)
    assert.equal(isQuickLinkSlotFilled('[视频](https://example.com/a.mp4) 帮我复制', slots[0]), true)
    assert.equal(isQuickLinkSlotFilled('只有提示语', slots[0]), false)
  })

  it('商品与视频互不影响，空草稿一律未填', () => {
    const draft = '[商品](https://shop.example.com/p/1)'
    assert.equal(isQuickLinkSlotFilled(draft, slots[1]), true)
    assert.equal(isQuickLinkSlotFilled(draft, slots[0]), false)
    assert.equal(isQuickLinkSlotFilled('', slots[0]), false)
    assert.equal(isQuickLinkSlotFilled(null, slots[0]), false)
    assert.equal(isQuickLinkSlotFilled('随便', null), false)
  })

  it('切换界面语言后旧令牌仍算已填（判据走 kind，不走当前语言的显示名）', () => {
    const englishSlots = buildQuickLinkSlots(['video', 'product'], { video: 'Video', product: 'Product' })
    const chineseDraft = '请用我的产品复刻这个爆款视频\n[视频] [商品]'
    assert.equal(isQuickLinkSlotFilled(chineseDraft, englishSlots[0]), true)
    assert.equal(isQuickLinkSlotFilled(chineseDraft, englishSlots[1]), true)
    assert.equal(isQuickLinkSlotFilled('[Video] [Product]', slots[0]), true)
    assert.equal(isQuickLinkSlotFilled('[Video] [Product]', slots[1]), true)
  })

  it('卡槽缺稳定标识时按令牌文本跨语言反查种类；认不出就不判已填', () => {
    assert.equal(isQuickLinkSlotFilled('[Video]', { raw: '[Video]' }), true)
    assert.equal(isQuickLinkSlotFilled('[视频]', { raw: '[视频]' }), true)
    assert.equal(isQuickLinkSlotFilled('[视频]', { raw: '[角色]' }), false)
    assert.equal(isQuickLinkSlotFilled('[视频]', { quickLinkKind: 'not-a-kind' }), false)
  })

  it('一次拆出「不可点」与「可点」两拨 id', () => {
    const split = splitQuickLinkSlots('[视频]', slots)
    assert.deepEqual(split.filledIds, ['omx-quick-link-video'])
    assert.deepEqual(split.openIds, ['omx-quick-link-product'])
    assert.deepEqual(splitQuickLinkSlots('', slots), {
      filledIds: [],
      openIds: ['omx-quick-link-video', 'omx-quick-link-product'],
    })
  })

  it('输入框已解析出的令牌可折成等效草稿文本，判据因此不依赖渲染期读 DOM', () => {
    const detected = [{ raw: '请稍等' }, { raw: '[视频]' }, { raw: null }]
    const draft = detectedSlotsDraftText(detected)
    assert.equal(draft, '请稍等 [视频]')
    assert.deepEqual(splitQuickLinkSlots(draft, slots).filledIds, ['omx-quick-link-video'])
    assert.equal(detectedSlotsDraftText(null), '')
  })
})

describe('撤回只清本快捷方式写入的部分', () => {
  it('整篇都是本快捷方式写入的：清空', () => {
    const draft = `${CLONE.prompt}\n\n[视频] [商品]`
    assert.equal(stripQuickShortcutText(CLONE, draft), '')
  })

  it('用户手打的追加文字原样保留', () => {
    const draft = `${CLONE.prompt}\n\n[视频] [商品]\n再帮我加个标题`
    assert.equal(stripQuickShortcutText(CLONE, draft), '再帮我加个标题')
  })

  it('用户改过提示语时只剥令牌，改过的提示语不被吞掉', () => {
    const draft = `改成我自己的提示语\n\n[视频]`
    assert.equal(stripQuickShortcutText(CLONE, draft), '改成我自己的提示语')
  })

  it('空草稿与非法输入不抛错', () => {
    assert.equal(stripQuickShortcutText(CLONE, ''), '')
    assert.equal(stripQuickShortcutText(CLONE, null), '')
    assert.equal(stripQuickShortcutText(CLONE, 42), '')
  })

  it('条目信息缺失时不猜、不动草稿（宁可留着也不静默丢弃）', () => {
    assert.equal(stripQuickShortcutText(null, '[视频]'), '[视频]')
    assert.equal(stripQuickShortcutText(null, '用户自己写的字'), '用户自己写的字')
  })

  it('只剥本条目自带的链接令牌，别的令牌留着', () => {
    const draft = `${CLONE.prompt}\n\n[视频] [商品] [角色]`
    const kinds = quickShortcutLinks(CLONE)
    assert.deepEqual(kinds, ['video', 'product'])
    assert.equal(stripQuickShortcutText(CLONE, draft), '[角色]')
  })
})

describe('剥离边界：markdown 形态、用户自输令牌、语言切换', () => {
  it('markdown 形态整体剥离，不留 (url) 残骸（与「已填」判据对称）', () => {
    const draft = `${CLONE.prompt}\n\n[视频](https://example.com/a.mp4) [商品](https://shop.example.com/p/1)`
    assert.equal(isQuickLinkSlotFilled(draft, buildQuickLinkSlots(['video'], LABELS)[0]), true)
    assert.equal(stripQuickShortcutText(CLONE, draft), '')
  })

  it('用户改过提示语时，末尾的 markdown 链接同样整体剥掉', () => {
    const draft = '我自己的话\n\n[视频](https://example.com/a.mp4)'
    assert.equal(stripQuickShortcutText(CLONE, draft), '我自己的话')
  })

  it('夹在文字里的 markdown 链接整段剥离，周围文字保留', () => {
    const draft = '[视频](https://example.com/a.mp4) 帮我复制'
    assert.equal(stripQuickShortcutText(CLONE, draft), '帮我复制')
  })

  it('用户自己独立输入的令牌不被误删（含追加文字里的同名令牌）', () => {
    const draft = `${CLONE.prompt}\n\n[视频] [商品]\n我的标题 [视频]`
    assert.equal(stripQuickShortcutText(CLONE, draft), '我的标题 [视频]')
  })

  it('追加文字里的另一种令牌同样不动', () => {
    const draft = `${CLONE.prompt}\n\n[视频] [商品]\n再补一个 [商品] 的链接`
    assert.equal(stripQuickShortcutText(CLONE, draft), '再补一个 [商品] 的链接')
  })

  it('剥离次数以本条目写过的链接条数为上限', () => {
    // breakdown 只带 video 一条：草稿里多出来的第二个 [视频] 不是它写的，不剥。
    const draft = `${BREAKDOWN.prompt}\n\n[视频] [视频]`
    assert.deepEqual(quickShortcutLinks(BREAKDOWN), ['video'])
    assert.equal(stripQuickShortcutText(BREAKDOWN, draft), '[视频]')
  })

  it('界面语言切换后旧语言的令牌照样剥得掉', () => {
    const chineseDraft = `${CLONE.prompt}\n\n[视频] [商品]`
    assert.equal(stripQuickShortcutText(CLONE, chineseDraft), '')
    assert.equal(stripQuickShortcutText(CLONE, '[Video](https://example.com/a.mp4)'), '')
    assert.equal(stripQuickShortcutText(CLONE, '我的说明 [Video] [Product]'), '我的说明')
  })
})
