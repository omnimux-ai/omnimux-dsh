import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  QUICK_LINK_CHIP_CHANGE_EVENT,
  createQuickLinkChipNode,
  insertQuickLinkChip,
  readQuickLinkChipKinds,
  removeQuickLinkChips,
  replaceQuickLinkChips,
  subscribeQuickLinkChipChange,
} from './dom.js'
import { QUICK_SHORTCUTS, quickShortcutDefaultLinks, quickShortcutLinks } from './catalog.js'
import { buildQuickLinkSlots, isQuickLinkSlotFilled, splitQuickLinkSlots } from './links.js'

const COMPOSER_HTML = '<div data-composer-card><div data-composer-input="true" contenteditable="true"></div></div>'

/** 装一个最小宿主输入框环境（jsdom），返回清场函数与可断言的编辑器。 */
function mountComposer(html) {
  const dom = new JSDOM(html || COMPOSER_HTML)
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const editor = dom.window.document.querySelector('[data-composer-input="true"]')
  return {
    dom,
    editor,
    dispose() {
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
    },
  }
}

/** 计数事件：胶囊变更靠它驱动卡槽两态。 */
function countChipChanges() {
  let count = 0
  const unsubscribe = subscribeQuickLinkChipChange(() => { count += 1 })
  return { get count() { return count }, unsubscribe }
}

describe('胶囊节点的形态', () => {
  it('图标 + 名称 + 分隔线 + 可粘贴链接的输入框 + × 删除，整体不可编辑', () => {
    const env = mountComposer()
    try {
      const chip = createQuickLinkChipNode('video', { label: '视频' })
      assert.equal(chip.getAttribute('data-omx-video-token'), 'true')
      assert.equal(chip.getAttribute('data-omx-product-token'), null)
      assert.equal(chip.getAttribute('data-composer-chip'), 'video')
      assert.equal(chip.getAttribute('contenteditable'), 'false')
      assert.equal(chip.getAttribute('data-omx-chip-label'), '视频')
      assert.ok(chip.classList.contains('omx-link-chip'))
      assert.ok(chip.classList.contains('omx-link-chip--video'))
      assert.equal(chip.querySelector('.omx-link-chip__name').textContent, '视频')
      assert.ok(chip.querySelector('.omx-link-chip__divider'))
      assert.ok(chip.querySelector('.omx-link-chip__icon'))
      const input = chip.querySelector('input')
      assert.equal(input.getAttribute('placeholder'), '粘贴 TikTok 视频链接')
      assert.equal(input.getAttribute('aria-label'), '粘贴 TikTok 视频链接')
      assert.equal(chip.querySelector('.omx-link-chip__remove').getAttribute('aria-label'), '移除视频链接')
      // 零业务内联样式（design.md UI02）：形态全部交给样式表
      assert.equal(chip.getAttribute('style'), null)
      assert.equal(input.getAttribute('style'), null)
    } finally {
      env.dispose()
    }
  })

  it('商品胶囊与视频胶囊带各自的锚点与占位，视觉可区分', () => {
    const env = mountComposer()
    try {
      const chip = createQuickLinkChipNode('product', { label: '商品' })
      assert.equal(chip.getAttribute('data-omx-product-token'), 'true')
      assert.equal(chip.getAttribute('data-composer-chip'), 'product')
      assert.ok(chip.classList.contains('omx-link-chip--product'))
      assert.equal(chip.querySelector('input').getAttribute('placeholder'), '粘贴商品链接或 ID')
    } finally {
      env.dispose()
    }
  })

  it('认不出的种类与没有 document 时都不造节点、不抛错', () => {
    const env = mountComposer()
    try {
      assert.equal(createQuickLinkChipNode('not-a-kind'), null)
      assert.equal(insertQuickLinkChip('not-a-kind'), false)
    } finally {
      env.dispose()
    }
  })
})

describe('插入、读取与删除', () => {
  it('拿不到输入框卡片时安静返回 false（降级为不插入，不报错）', () => {
    const env = mountComposer('<div id="nothing-here"></div>')
    try {
      assert.equal(insertQuickLinkChip('video'), false)
      assert.deepEqual(readQuickLinkChipKinds(), [])
    } finally {
      env.dispose()
    }
  })

  it('卡片在、可编辑区不在时照样能插入（胶囊不依赖 contenteditable）', () => {
    const env = mountComposer('<div data-composer-card><p>没有可编辑区</p></div>')
    try {
      assert.equal(insertQuickLinkChip('video', { label: '视频' }), true)
      assert.deepEqual(readQuickLinkChipKinds(), ['video'])
    } finally {
      env.dispose()
    }
  })

  it('胶囊落进输入框卡片内的宿主行（宿主编辑器不会把它重渲染掉），并广播一次变更', () => {
    const env = mountComposer()
    const changes = countChipChanges()
    try {
      env.editor.textContent = '请用我的产品复刻这个爆款视频'
      assert.equal(insertQuickLinkChip('video', { label: '视频' }), true)
      assert.equal(changes.count, 1)
      const row = env.editor.closest('[data-composer-card]').querySelector('.omx-link-chip-row')
      assert.ok(row, '胶囊行必须建在输入框卡片内')
      assert.equal(env.editor.closest('[data-composer-card]').firstElementChild, row, '胶囊行排在输入行之前（贴着输入框）')
      const chip = row.querySelector('[data-omx-video-token="true"]')
      assert.ok(chip, '胶囊必须落在宿主行里')
      assert.equal(chip.parentElement, row)
      assert.equal(env.editor.querySelector('[data-omx-video-token="true"]'), null, '胶囊不进 contenteditable（宿主会清掉它）')
      assert.deepEqual(readQuickLinkChipKinds(), ['video'])
    } finally {
      changes.unsubscribe()
      env.dispose()
    }
  })

  it('同一行的多枚胶囊按插入顺序排列，宿主行只建一次', () => {
    const env = mountComposer()
    try {
      insertQuickLinkChip('video', { label: '视频' })
      insertQuickLinkChip('product', { label: '商品' })
      const rows = env.editor.closest('[data-composer-card]').querySelectorAll('.omx-link-chip-row')
      assert.equal(rows.length, 1, '宿主行不得建第二份')
      assert.deepEqual(readQuickLinkChipKinds(), ['video', 'product'])
    } finally {
      env.dispose()
    }
  })

  it('胶囊里的按键与粘贴不外传（回车不触发发送，粘贴不被宿主截走）', () => {
    const env = mountComposer()
    try {
      insertQuickLinkChip('video', { label: '视频' })
      const chip = env.editor.closest('[data-composer-card]').querySelector('[data-omx-video-token="true"]')
      let leaked = 0
      env.editor.addEventListener('keydown', () => { leaked += 1 })
      env.editor.addEventListener('paste', () => { leaked += 1 })
      const input = chip.querySelector('input')
      input.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new env.dom.window.Event('paste', { bubbles: true }))
      env.editor.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(leaked, 1, '胶囊内的事件必须被拦住，编辑器自己的仍然照常')
    } finally {
      env.dispose()
    }
  })

  it('× 删除后节点消失、广播一次变更，卡槽据此恢复可点', () => {
    const env = mountComposer()
    const changes = countChipChanges()
    try {
      insertQuickLinkChip('video', { label: '视频' })
      const chip = env.editor.closest('[data-composer-card]').querySelector('[data-omx-video-token="true"]')
      chip.querySelector('.omx-link-chip__remove').dispatchEvent(
        new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      assert.equal(env.editor.closest('[data-composer-card]').querySelector('[data-omx-video-token="true"]'), null)
      assert.deepEqual(readQuickLinkChipKinds(), [])
      assert.equal(changes.count, 2)
    } finally {
      changes.unsubscribe()
      env.dispose()
    }
  })

  it('移除全部胶囊可按范围清点，没得清时不广播', () => {
    const env = mountComposer()
    const changes = countChipChanges()
    try {
      insertQuickLinkChip('video', { label: '视频' })
      insertQuickLinkChip('product', { label: '商品' })
      assert.deepEqual(readQuickLinkChipKinds(), ['video', 'product'])
      assert.equal(removeQuickLinkChips(), 2)
      assert.equal(changes.count, 3)
      assert.equal(removeQuickLinkChips(), 0)
      assert.equal(changes.count, 3)
    } finally {
      changes.unsubscribe()
      env.dispose()
    }
  })
})

describe('整组替换（切换快捷方式不残留上一个的胶囊）', () => {
  it('先清后插：只剩本次的胶囊，且种类与顺序按传入列表', () => {
    const env = mountComposer()
    try {
      assert.equal(replaceQuickLinkChips(['video', 'product'], { labels: { video: '视频', product: '商品' } }), 2)
      assert.deepEqual(readQuickLinkChipKinds(), ['video', 'product'])
      assert.equal(replaceQuickLinkChips(['product'], { labels: { product: '商品' } }), 1)
      assert.deepEqual(readQuickLinkChipKinds(), ['product'])
      assert.equal(env.editor.querySelectorAll('[data-omx-video-token="true"]').length, 0)
      assert.equal(replaceQuickLinkChips([], {}), 0)
      assert.deepEqual(readQuickLinkChipKinds(), [])
    } finally {
      env.dispose()
    }
  })

  it('数量对不上时以实际插入数为准（调用方据此给轻提示）', () => {
    const env = mountComposer('<div id="no-card"></div>')
    try {
      assert.equal(replaceQuickLinkChips(['video', 'product'], { labels: {} }), 0)
    } finally {
      env.dispose()
    }
  })

  it('变更事件名与卡槽订阅方约定一致', () => {
    assert.equal(QUICK_LINK_CHIP_CHANGE_EVENT, 'omnimux:quick-link-chips:changed')
  })
})

/**
 * 点快捷方式与点上方卡槽是**两条不同的插入通道**：
 *   - 点快捷方式：只插 `defaultLink`（clone / breakdown / reverse → 视频；selling → 商品）；
 *   - 点上方卡槽：插该卡槽那一种（`extraLinks` 里的那种），插完变不可点，删掉胶囊后又可点。
 * 这一组用例把两条通道按真实串联走一遍（卡槽两态用真源判据 `splitQuickLinkSlots`）。
 */
describe('点快捷方式只插默认链接，另一枚由上方卡槽点了才插', () => {
  const LABELS = { video: '视频', product: '商品' }
  const entryOf = (id) => QUICK_SHORTCUTS.find((entry) => entry.id === id)

  /** 点上方某一枚可点卡槽（与 `AttachmentTray.onSelectSlot` 的快捷链接分支同一路径）。 */
  const clickOpenSlot = (env, slots, openIds) => {
    const openSlot = slots.find((slot) => slot.id === openIds[0])
    assert.ok(openSlot, '必须先有一枚可点卡槽')
    const kind = openSlot.quickLinkKind
    assert.equal(isQuickLinkSlotFilled(readQuickLinkChipKinds(), openSlot), false, '可点卡槽不得已被填')
    return insertQuickLinkChip(kind, { label: LABELS[kind] })
  }

  it('clone：点后只有视频胶囊；点上方商品卡槽才多出商品胶囊，随后两枚卡槽都不可点', () => {
    const env = mountComposer()
    try {
      const clone = entryOf('clone')
      const slots = buildQuickLinkSlots(quickShortcutLinks(clone), LABELS)
      const openIdsOf = () => splitQuickLinkSlots(readQuickLinkChipKinds(), slots)

      assert.equal(replaceQuickLinkChips(quickShortcutDefaultLinks(clone), { labels: LABELS }), 1)
      assert.deepEqual(readQuickLinkChipKinds(), ['video'], '点 clone 后只有视频一个胶囊')
      assert.deepEqual(openIdsOf(), { filledIds: ['omx-quick-link-video'], openIds: ['omx-quick-link-product'] })

      assert.equal(clickOpenSlot(env, slots, openIdsOf().openIds), true)
      assert.deepEqual(readQuickLinkChipKinds(), ['video', 'product'], '点了商品卡槽才出现商品胶囊')
      assert.deepEqual(openIdsOf().openIds, [], '两枚卡槽都不可点')

      env.editor.closest('[data-composer-card]').querySelector('[data-omx-product-token="true"] .omx-link-chip__remove')
        .dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      assert.deepEqual(readQuickLinkChipKinds(), ['video'], '× 删掉商品胶囊')
      assert.deepEqual(openIdsOf().openIds, ['omx-quick-link-product'], '删掉胶囊后商品卡槽恢复可点')
    } finally {
      env.dispose()
    }
  })

  it('selling 反向对称：点后只有商品胶囊，视频卡槽可点', () => {
    const env = mountComposer()
    try {
      const selling = entryOf('selling')
      assert.equal(replaceQuickLinkChips(quickShortcutDefaultLinks(selling), { labels: LABELS }), 1)
      assert.deepEqual(readQuickLinkChipKinds(), ['product'], '点带货只插商品胶囊')
      const slots = buildQuickLinkSlots(quickShortcutLinks(selling), LABELS)
      assert.deepEqual(splitQuickLinkSlots(readQuickLinkChipKinds(), slots), {
        filledIds: ['omx-quick-link-product'],
        openIds: ['omx-quick-link-video'],
      })
    } finally {
      env.dispose()
    }
  })

  it('切换快捷方式整组替换：清掉上一条的胶囊，只留新一条的默认链接', () => {
    const env = mountComposer()
    try {
      const clone = entryOf('clone')
      replaceQuickLinkChips(quickShortcutDefaultLinks(clone), { labels: LABELS })
      // 用户点了上方商品卡槽，商品胶囊也在输入框里
      insertQuickLinkChip('product', { label: LABELS.product })
      assert.deepEqual(readQuickLinkChipKinds(), ['video', 'product'])

      const breakdown = entryOf('breakdown')
      assert.equal(replaceQuickLinkChips(quickShortcutDefaultLinks(breakdown), { labels: LABELS }), 1)
      assert.deepEqual(readQuickLinkChipKinds(), ['video'], '切换后只剩新一条的默认链接胶囊')
    } finally {
      env.dispose()
    }
  })
})

/**
 * 宿主可以同时挂载两张输入框卡片（分屏、多标签保活），每张卡在自己的会话座位
 * `[data-composer-seat]` 里。读 / 删 / 整组替换都必须收敛到锚点所在的那一张卡片：
 * 否则 A 的卡槽会把 B 的胶囊算作已填、A 的撤回会删掉 B 的胶囊。
 */
describe('胶囊作用域收敛到本会话的输入框卡片', () => {
  const SPLIT_HTML = [
    '<div data-phase="hero">',
    '  <div data-composer-seat id="seat-a">',
    '    <div data-composer-card id="card-a"><div data-composer-input="true" contenteditable="true"></div></div>',
    '  </div>',
    '  <div data-composer-seat id="seat-b">',
    '    <div data-composer-card id="card-b"><div data-composer-input="true" contenteditable="true"></div></div>',
    '  </div>',
    '</div>',
  ].join('')

  /** 取某一侧卡片内的锚点（与组件把根节点当锚点的做法一致）。 */
  const anchorOf = (env, cardId) => env.dom.window.document.querySelector(`#${cardId} [data-composer-input="true"]`)

  it('插入只看得到本会话：A 的锚点插出的胶囊不落进 B 的卡片', () => {
    const env = mountComposer(SPLIT_HTML)
    try {
      const a = anchorOf(env, 'card-a')
      const b = anchorOf(env, 'card-b')
      assert.equal(insertQuickLinkChip('video', { label: '视频', anchor: a }), true)
      assert.deepEqual(readQuickLinkChipKinds(a), ['video'])
      assert.deepEqual(readQuickLinkChipKinds(b), [], 'B 会话不得看到 A 的胶囊')
      assert.equal(env.dom.window.document.querySelector('#card-b .omx-link-chip'), null, 'A 的胶囊只落在 A 的卡片里')
      // 卡片行也只建在本会话卡片内
      assert.equal(env.dom.window.document.querySelectorAll('#card-b .omx-link-chip-row').length, 0)
    } finally {
      env.dispose()
    }
  })

  it('撤回只删本会话的胶囊：B 的撤回不动 A 的胶囊', () => {
    const env = mountComposer(SPLIT_HTML)
    try {
      const a = anchorOf(env, 'card-a')
      const b = anchorOf(env, 'card-b')
      insertQuickLinkChip('video', { label: '视频', anchor: a })
      insertQuickLinkChip('product', { label: '商品', anchor: b })
      assert.equal(removeQuickLinkChips(b), 1, '只清掉 B 的那一枚')
      assert.deepEqual(readQuickLinkChipKinds(b), [])
      assert.deepEqual(readQuickLinkChipKinds(a), ['video'], 'A 的胶囊必须还在')
    } finally {
      env.dispose()
    }
  })

  it('文档里有多张卡片又拿不到锚点时：不按文档兜底，宁可不动作', () => {
    const env = mountComposer(SPLIT_HTML)
    try {
      const a = anchorOf(env, 'card-a')
      assert.equal(insertQuickLinkChip('video', { label: '视频', anchor: a }), true)
      // 无锚点（文档里两张卡 → 无从归属会话）：读为空、删为 0、不插入
      assert.deepEqual(readQuickLinkChipKinds(), [])
      assert.equal(removeQuickLinkChips(), 0)
      assert.equal(insertQuickLinkChip('product', { label: '商品' }), false)
      assert.equal(replaceQuickLinkChips(['product'], { labels: { product: '商品' } }), 0)
      assert.deepEqual(readQuickLinkChipKinds(a), ['video'], 'A 的胶囊不受无锚点调用影响')
    } finally {
      env.dispose()
    }
  })

  it('整组替换只在锚点那张卡片里清旧插新', () => {
    const env = mountComposer(SPLIT_HTML)
    try {
      const a = anchorOf(env, 'card-a')
      const b = anchorOf(env, 'card-b')
      insertQuickLinkChip('video', { label: '视频', anchor: a })
      assert.equal(replaceQuickLinkChips(['product'], { labels: { product: '商品' }, anchor: b }), 1)
      assert.deepEqual(readQuickLinkChipKinds(b), ['product'])
      assert.deepEqual(readQuickLinkChipKinds(a), ['video'], 'B 的整组替换不得动 A')
    } finally {
      env.dispose()
    }
  })

  it('拿不到胶囊行时整条不动：不先把旧胶囊清掉', () => {
    const env = mountComposer(SPLIT_HTML)
    try {
      const a = anchorOf(env, 'card-a')
      insertQuickLinkChip('video', { label: '视频', anchor: a })
      // 锚点落在一张没有卡片的座位里（宿主重建中的瞬间）：替换必须原样返回 0 且不清旧
      const orphanSeat = env.dom.window.document.createElement('div')
      orphanSeat.setAttribute('data-composer-seat', '')
      env.dom.window.document.body.appendChild(orphanSeat)
      assert.equal(replaceQuickLinkChips(['product'], { labels: { product: '商品' }, anchor: orphanSeat }), 0)
      assert.deepEqual(readQuickLinkChipKinds(a), ['video'], '拿不到行时必须整条不动，不能先清掉旧的')
    } finally {
      env.dispose()
    }
  })
})
