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

test('session guide uses owner actions, protects edits, and flushes pending URLs before send', async () => {
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
  const materialCalls = []
  const props = () => ({ sessionId: owner, useSession: selector => selector({ blank }), useConversation: selector => selector({ activeTargets: new Set() }),
    useInput: selector => selector({ draft, phase }), inputActions: { setDraft(value) { draft = value; writes++ } },
    getCurrentSessionId: () => owner, store, t: key => key,
    getMaterials: () => ({ openLibrary: id => materialCalls.push(id), addFiles: async id => materialCalls.push(id) }),
  })
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props())))
  const click = async selector => act(async () => document.querySelector(selector).click())
  document.querySelector('[data-send-button]').addEventListener('click', () => sends++)
  try {
    await render()
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 6)
    const first = document.querySelector('[data-starter-id]').dataset.starterId
    await click(`[data-starter-id="${first}"]`)
    await render()
    assert.equal(writes, 1)
    await click(`[data-starter-id="${first}"]`)
    assert.equal(writes, 1)
    draft += '\nuser edit'
    await render()
    const second = document.querySelectorAll('[data-starter-id]')[1].dataset.starterId
    await click(`[data-starter-id="${second}"]`)
    assert.ok(document.querySelector('.omnimux-starter-confirm'))
    assert.match(draft, /user edit/)
    await click('.omnimux-starter-confirm button:last-child')
    assert.match(draft, /user edit/)
    await act(async () => store.set(owner, { ...store.get(owner), urlValue: 'https://example.com/video' }))
    await click('[data-send-button]')
    assert.equal(sends, 0)
    assert.match(draft, /https:\/\/example.com\/video/)
    await render()
    await click('[data-send-button]')
    assert.equal(sends, 1)
    phase = 'claimed'
    await render()
    await click('[data-send-button]')
    assert.equal(sends, 2, 'unchanged references must not block command input')
    phase = 'plain'
    await act(async () => store.set(owner, { ...store.get(owner), urlValue: 'https://example.com/a\nhttps://example.com/b' }))
    await click('[data-send-button]')
    await render()
    await click(`[data-starter-id="${second}"]`)
    await click('.omnimux-starter-confirm button:first-of-type')
    await render()
    assert.equal(document.querySelector('.omnimux-starter-materials textarea').value, 'https://example.com/a\nhttps://example.com/b')
    await click('[data-send-button]')
    assert.equal(sends, 3, 'multiple retained references remain sendable after changing card')
    await act(async () => store.set(owner, { ...store.get(owner), urlValue: 'invalid' }))
    await render()
    await click('[data-send-button]')
    assert.equal(sends, 3)
    await click('.omnimux-starter-material-actions button:first-child')
    assert.deepEqual(materialCalls, ['A'])
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
