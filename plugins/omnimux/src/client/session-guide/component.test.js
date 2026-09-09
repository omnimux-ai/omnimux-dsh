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
  const props = () => ({ sessionId: owner, useSession: selector => selector({ blank }), useConversation: selector => selector({ activeTargets: new Set() }),
    useInput: selector => selector({ draft, phase }), inputActions: { setDraft(value) { draft = value; writes++ } },
    getCurrentSessionId: () => owner, store, t: key => key,
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
