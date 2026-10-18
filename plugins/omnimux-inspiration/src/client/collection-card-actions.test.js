import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { COLLECTION_CARD_CACHE_URL, mountCollectionCard } from './test-fixtures/collection-card-render.mjs'

const zhTable = new Map(Object.entries(zh))
const enTable = new Map(Object.entries(en))
const zhT = key => zhTable.get(key) || key
const enT = key => enTable.get(key) || key

const COLLECTION = {
  id: 'col_1',
  title: '夏日护肤',
  item_count: 5,
  preview_items: [
    { id: 'insp_1', title: 'A' },
    { id: 'insp_2', title: 'B' },
    { id: 'insp_3', title: 'C' },
  ],
}
const ROW = { id: 'insp_9', title: '普通灵感', is_local: true, source_platform: 'tiktok', type: 'video' }

after(() => {
  rmSync(fileURLToPath(COLLECTION_CARD_CACHE_URL), { recursive: true, force: true })
})

describe('InspirationCollectionCard hover actions', () => {
  it('renders exactly the two localized actions inside a labelled group', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      const group = mounted.group()
      assert.ok(group, '合集卡必须渲染封面操作层')
      assert.equal(group.getAttribute('role'), 'group')
      assert.equal(group.getAttribute('aria-label'), zhTable.get('collection.actions'))

      const buttons = mounted.buttons()
      assert.equal(buttons.length, 2, '操作层有且仅有两个按钮')
      assert.equal(buttons[0].textContent, zhTable.get('collection.view'))
      assert.equal(buttons[1].textContent, zhTable.get('collection.addToSession'))
      assert.equal(buttons[0].getAttribute('aria-label'), zhTable.get('collection.view'))
      assert.equal(buttons[1].getAttribute('aria-label'), zhTable.get('collection.addToSession'))
      assert.equal(mounted.allButtons().length, 2, '未传菜单时卡片上只有这两个按钮')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('reuses the ordinary card CTA classes and never matches host [class*="add"] rules', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      const buttons = mounted.buttons()
      assert.equal(buttons.length, 2)
      for (const button of buttons) {
        assert.equal(button.className.includes('omnimux-inspiration-overlay-cta-btn'), true, '必须复用普通卡的 CTA 按钮样式')
        // omnimux-market ships `button[class*="add"] { ... !important }` globally;
        // any class containing "add" would hijack the CTA in the real host.
        assert.equal(button.matches('button[class*="add"]'), false, `${button.className} 不得被宿主全局 add 规则命中`)
      }
      assert.equal(buttons[0].className.includes('secondary'), true, '查看 使用 secondary 表面')
      assert.equal(buttons[1].className.includes('primary'), true, '加入会话 使用 primary 表面')
      assert.equal(buttons[0].querySelector('.omnimux-inspiration-overlay-cta-label')?.textContent, zhTable.get('collection.view'))
      assert.equal(buttons[1].querySelector('.omnimux-inspiration-overlay-cta-label')?.textContent, zhTable.get('collection.addToSession'))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders the English labels from the shared dictionary', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: enT })
    try {
      const buttons = mounted.buttons()
      assert.equal(buttons.length, 2)
      assert.equal(buttons[0].textContent, enTable.get('collection.view'))
      assert.equal(buttons[1].textContent, enTable.get('collection.addToSession'))
      assert.equal(mounted.group().getAttribute('aria-label'), enTable.get('collection.actions'))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('查看 uses the dedicated view handler and never the card/merge handler', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      await mounted.click(mounted.buttons()[0])
      assert.equal(mounted.calls.view.length, 1, '查看 必须恰好进入合集一次')
      assert.equal(mounted.calls.view[0], COLLECTION)
      assert.equal(mounted.calls.open.length, 0, '查看 不得复用整卡点击的合并选择链路')
      assert.equal(mounted.calls.add.length, 0, '查看 不得触发加入会话')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('加入会话 only asks the section to add the collection', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      await mounted.click(mounted.buttons()[1])
      assert.equal(mounted.calls.add.length, 1, '加入会话 必须恰好触发一次')
      assert.equal(mounted.calls.add[0], COLLECTION)
      assert.equal(mounted.calls.open.length, 0, '加入会话 不得进入合集详情')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps the whole-card click as the single navigation path', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      await mounted.click(mounted.card())
      assert.equal(mounted.calls.open.length, 1, '整卡点击仍进入合集')
      assert.equal(mounted.calls.add.length, 0)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('marks the add button busy and refuses a second add', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT, addToSessionBusy: true })
    try {
      const add = mounted.buttons()[1]
      assert.equal(add.getAttribute('aria-busy'), 'true')
      assert.equal(add.disabled, true, '忙碌时按钮不可重复触发')
      await mounted.click(add)
      assert.equal(mounted.calls.add.length, 0)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps keyboard events inside the action button and does not block activation', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT })
    try {
      let bubbled = 0
      mounted.document.addEventListener('keydown', () => {
        bubbled += 1
      })
      const pressed = await mounted.press(mounted.buttons()[0], 'Enter')
      assert.equal(bubbled, 0, '操作按钮的 keydown 不得冒泡到卡片/文档')
      assert.equal(pressed.prevented, false, '不得阻止 Enter/Space 的原生按钮激活')
      assert.equal(mounted.calls.open.length, 0, 'keydown 不应直接打开合集')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('does not render the action layer in the preview variant', async () => {
    const mounted = await mountCollectionCard({ collection: COLLECTION, t: zhT, preview: true })
    try {
      assert.equal(mounted.group(), null)
      assert.equal(mounted.allButtons().length, 0)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders no collection actions on an ordinary inspiration card', async () => {
    const mounted = await mountCollectionCard({ kind: 'inspiration', row: ROW, t: zhT })
    try {
      assert.equal(mounted.group(), null)
      const addLabel = zhTable.get('collection.addToSession')
      assert.equal(mounted.container.querySelector(`[aria-label="${addLabel}"]`), null)
      assert.equal(mounted.container.textContent.includes(addLabel), false)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
