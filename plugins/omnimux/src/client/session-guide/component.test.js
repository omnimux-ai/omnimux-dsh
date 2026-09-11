import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createGuideStore } from './state.js'

const output = await build({ entryPoints: [new URL('./SessionGuide.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { SessionGuide } = module.exports

test('session guide switches drafts without a reference panel or send interception', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let owner = 'A'
  let draft = ''
  let phase = 'plain'
  let blank = true
  let writes = 0
  let sends = 0
  let workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const listeners = new Set()
  const workbench = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }, getSnapshot: () => workbenchSnapshot }
  const setPanel = (sessionId, panelOpen) => act(async () => {
    workbenchSnapshot = { sessionId, state: { panelOpen } }
    for (const listener of listeners) listener()
  })
  const props = () => ({ sessionId: owner, useSession: selector => selector({ blank }), useConversation: selector => selector({ activeTargets: new Set() }),
    useInput: selector => selector({ draft, phase }), inputActions: { setDraft(value) { draft = value; writes++ } },
    getCurrentSessionId: () => owner, store, workbench, t: key => key,
  })
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props())))
  const click = async selector => act(async () => document.querySelector(selector).click())
  document.querySelector('[data-send-button]').addEventListener('click', () => sends++)
  try {
    await render()
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    const first = document.querySelector('[data-starter-id]').dataset.starterId
    await click(`[data-starter-id="${first}"]`)
    await render()
    assert.equal(writes, 1)
    await click(`[data-starter-id="${first}"]`)
    assert.equal(writes, 1)
    draft += '\nuser edit'
    await render()
    const second = document.querySelectorAll('[data-starter-id]')[4].dataset.starterId
    await click(`[data-starter-id="${second}"]`)
    assert.equal(document.querySelector('.omnimux-starter-confirm'), null)
    assert.equal(draft, `guide.${second}.prompt`)
    assert.equal(store.get(owner).selectedId, second)
    assert.equal(sends, 0, 'choosing a task never submits')
    for (const button of document.querySelectorAll('[data-starter-id]')) {
      await click(`[data-starter-id="${button.dataset.starterId}"]`)
      await render()
      assert.equal(document.querySelector('.omnimux-starter-materials'), null)
    }
    draft += '\nkeep this edit'
    await render()
    const savedDraft = draft
    const savedState = store.get(owner)
    const savedWrites = writes
    await setPanel(owner, true)
    assert.equal(document.querySelector('[data-omnimux-starter-guide]'), null)
    assert.equal(document.querySelector('[data-omnimux-starter-host]'), null)
    await setPanel(owner, false)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    assert.ok(document.querySelector('[data-omnimux-starter-host]'))
    assert.equal(draft, savedDraft)
    assert.equal(store.get(owner), savedState)
    assert.equal(writes, savedWrites)
    await setPanel('another-session', true)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    await click('[data-send-button]')
    assert.equal(sends, 1, 'normal send needs no extra synchronization gesture')
    owner = 'B'
    draft = ''
    await render()
    assert.equal(document.querySelector('.omnimux-starter-materials'), null)
    assert.equal(store.get('B').selectedId, null)
    blank = false
    await render()
    assert.equal(document.querySelector('[data-omnimux-starter-guide]'), null)
    assert.equal(document.querySelector('[data-omnimux-starter-host]'), null)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('popular starters render 4 cards and marketing insight modal flows draft into input', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let draft = ''
  let writes = 0
  const workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const workbench = { subscribe: () => () => {}, getSnapshot: () => workbenchSnapshot }
  const props = () => ({
    sessionId: 'A', useSession: s => s({ blank: true }), useConversation: s => s({ activeTargets: new Set() }),
    useInput: s => s({ draft, phase: 'plain' }), inputActions: { setDraft(v) { draft = v; writes++ } },
    getCurrentSessionId: () => 'A', store, workbench, t: key => key,
  })
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props())))
  const click = async sel => act(async () => document.querySelector(sel).click())

  try {
    await render()
    // 1. 验证 4 个卡片均已呈现
    const popularCards = document.querySelectorAll('[data-popular-starter-id]')
    assert.equal(popularCards.length, 4)
    assert.equal(popularCards[0].dataset.popularStarterId, 'marketing-insight')
    assert.equal(popularCards[1].dataset.popularStarterId, 'url-to-video')
    assert.equal(popularCards[2].dataset.popularStarterId, 'recreate-viral-ads')
    assert.equal(popularCards[3].dataset.popularStarterId, 'bulk-create-ads')

    // 2. 点击占位卡片触发提示，未修改草稿
    await click('[data-popular-starter-id="url-to-video"]')
    await render()
    assert.ok(document.querySelector('.omnimux-toast-pill'))
    assert.equal(writes, 0)

    // 3. 点击营销洞察卡片打开模态框
    await click('[data-popular-starter-id="marketing-insight"]')
    await render()
    const modal = document.querySelector('.omnimux-insight-modal')
    assert.ok(modal, 'modal should open')
    const items = document.querySelectorAll('[data-insight-id]')
    assert.equal(items.length, 6)

    // 4. 切换到第2项（广告ROAS分析）
    await click(`[data-insight-id="${items[1].dataset.insightId}"]`)
    await render()
    const textarea = document.querySelector('.omnimux-insight-textarea')
    assert.ok(textarea.value.includes('Analyze performance on [platform]'))

    // 5. 点击“开始洞察 ->”按钮，提交草稿
    await click('.omnimux-insight-submit')
    await render()
    assert.equal(document.querySelector('.omnimux-insight-modal'), null, 'modal should close')
    assert.ok(draft.includes('Analyze performance on [platform]'))
    assert.equal(writes, 1)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
