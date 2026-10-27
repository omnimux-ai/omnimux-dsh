/**
 * E2E：探索模板专区里「点卡片 → 装进输入框」全链路（Issue #3812）。
 *
 * 覆盖一级 Tab 的资产库 / 灵感库 / 商品库三路素材卡片，以及精选货架的模板卡片。
 * 断言只看界面本体：输入框里真的多了一句指令、素材卡槽里真的多了一张图、
 * 没有冒出「输入框尚未准备好」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createGuideStore } from '../../../omnimux/src/client/session-guide/state.js'
import { guideZh } from '../../../omnimux/src/client/session-guide/catalog.js'

async function loadBundledModule(relPath) {
  const output = await build({
    entryPoints: [new URL(relPath, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}

const { SessionGuide } = await loadBundledModule('./SessionGuide.jsx')

/** 会话附件 Store：断言看到的是真实挂载结果，不是桩。 */
async function loadAttachmentStore() {
  const output = await build({
    entryPoints: [new URL('../../../omnimux/src/client/attachments/store.ts', import.meta.url).pathname],
    bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  })
  const attachments = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), attachments, attachments.exports)
  return attachments.exports
}

// ─────────────────────────────────────────────────────────────
// 探索模板一级 Tab 卡片 → 输入框：素材类卡片必须真的装进去（#3812）
// ─────────────────────────────────────────────────────────────

/** 四路素材库各自的最小真实行：id / 标题 / 封面都必须能映射出附件载荷。 */
const LIBRARY_TAB_FIXTURES = {
  assets: {
    path: '/omnimux/assets/library',
    body: { assets: [{ id: 'asset_1', name: '夏日海边素材', type: 'image', url: '/x/a.jpg' }], total: 1 },
    title: '夏日海边素材',
  },
  inspiration: {
    path: '/omnimux/inspiration/local',
    body: { data: { items: [{ id: 'insp_1', title: 'US beauty hook', cover_url: '/x/c.jpg', source_url: '/x/v.mp4' }], total: 1 } },
    title: 'US beauty hook',
  },
  products: {
    path: '/omnimux/products',
    body: { products: [{ id: 'prod_1', name: '香薰蜡烛', price: '99', image: '/x/p.jpg' }], total: 1 },
    title: '香薰蜡烛',
  },
}

test('E2E：探索模板卡片点一下就装进输入框——素材库三路预填并挂卡槽，精选模板预填', async () => {
  const dom = new JSDOM(
    '<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-card><div data-composer-input="true" contenteditable="true"></div></div></div>',
    { url: 'http://localhost/' },
  )
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
    CustomEvent: globalThis.CustomEvent,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.CustomEvent = dom.window.CustomEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const attachmentStore = await loadAttachmentStore()
  // 精选货架的模板来自创意模板快照，是另一条分发路径（handleItemRecreate）。
  const creativeSnapshot = {
    schemaVersion: 1,
    dataVersion: 'a'.repeat(64),
    items: [{ id: 'tpl_qa_1', titleZh: '黄金开场模板', categorySlug: 'hook-intro', promptZh: '请用黄金开场模板生成脚本' }],
  }
  globalThis.fetch = async (path) => {
    const request = String(path)
    if (request.includes('/omnimux/templates/creative')) {
      return { ok: true, status: 200, json: async () => creativeSnapshot }
    }
    const hit = Object.values(LIBRARY_TAB_FIXTURES).find((fixture) => request.includes(fixture.path))
    return { ok: true, status: 200, json: async () => (hit ? hit.body : {}) }
  }
  // 模板快照适配器按 window.fetch 取值，jsdom 的 window 必须拿到同一个桩。
  dom.window.fetch = globalThis.fetch

  const store = createGuideStore()
  const sessionId = 'sess-explore-library-dock'
  let draft = ''
  const workbench = { subscribe: () => () => {}, getSnapshot: () => ({ sessionId, state: { panelOpen: false } }) }
  const props = {
    sessionId,
    useSession: (selector) => selector({ blank: true }),
    useConversation: (selector) => selector({ activeTargets: new Set() }),
    useInput: (selector) => selector({ draft, phase: 'plain' }),
    inputActions: { setDraft(value) { draft = value } },
    getCurrentSessionId: () => sessionId,
    store,
    workbench,
    t: (key) => guideZh[key] || key,
  }
  const globalStore = attachmentStore.getGlobalAttachmentStore()
  dom.window.__omnimuxAttachments = globalStore
  globalStore.clear(sessionId)
  globalStore.setActiveSessionId(sessionId)
  const root = createRoot(document.querySelector('#guide'))
  const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

  try {
    await act(async () => root.render(React.createElement(SessionGuide, props)))
    await settle()

    for (const [tab, fixture] of Object.entries(LIBRARY_TAB_FIXTURES)) {
      draft = ''
      globalStore.clear(sessionId)

      const tabButton = document.querySelector(`[data-primary-tab="${tab}"]`)
      assert.ok(tabButton, `一级 Tab ${tab} 必须渲染`)
      await click(tabButton)
      await settle()

      const cell = document.querySelector('.omx-library-flow-cell')
      assert.ok(cell, `Tab ${tab} 必须渲染出素材卡片（前置条件成立）`)
      const card = cell.querySelector('[role="checkbox"], button, [role="button"]') || cell.firstElementChild
      assert.ok(card, `Tab ${tab} 的卡片必须有可点击元素`)
      await click(card)
      await settle()

      assert.ok(draft.includes(fixture.title), `Tab ${tab} 点击卡片必须把「${fixture.title}」写进输入框，实际是 ${JSON.stringify(draft)}`)
      assert.equal(globalStore.getSnapshot(sessionId).length, 1, `Tab ${tab} 点击卡片必须挂进附件卡槽`)
      assert.equal(document.querySelector('.omnimux-starter-notice'), null, `Tab ${tab} 不得弹「输入框尚未准备好」`)
    }

    // 精选货架的模板卡片走另一条分发路径，修复前同样点了没反应。
    // 按合同它只交付 Prompt、不生成物理附件载荷，所以只断言预填与无报错。
    draft = ''
    globalStore.clear(sessionId)
    await click(document.querySelector('[data-primary-tab="featured"]'))
    await settle()
    await click(document.querySelector('[data-sub-category="hook-intro"]'))
    await settle()
    const templateCard = document.querySelector('[data-template-id="tpl_qa_1"]')
    assert.ok(templateCard, '精选货架必须渲染出快照里的模板卡片（前置条件成立）')
    await click(templateCard.querySelector('.omnimux-trending-recreate-btn'))
    await settle()
    assert.ok(draft.includes('黄金开场模板'), `精选模板卡片点击必须预填提示词，实际是 ${JSON.stringify(draft)}`)
    assert.equal(document.querySelector('.omnimux-starter-notice'), null, '精选模板卡片不得弹「输入框尚未准备好」')
  } finally {
    await act(async () => root.unmount())
    globalStore.clear(sessionId)
    delete dom.window.__omnimuxAttachments
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    globalThis.fetch = previous.fetch
    globalThis.CustomEvent = previous.CustomEvent
  }
})

