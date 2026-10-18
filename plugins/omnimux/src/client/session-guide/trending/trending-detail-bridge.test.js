import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

test('recommendation detail delegates the complete creation handoff to its owning preview service', async () => {
  const built = await build({ entryPoints: [new URL('./TrendingDetailModal.jsx', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  let opened, disposed = 0, oldCardAction = 0, closed = 0
  dom.window.__omnimuxInspirationPreview = { open(options) { opened = options; return () => { disposed += 1 } } }
  const root = createRoot(dom.window.document.querySelector('#root'))
  const row = { id: 'saved', content: '原帖', media_items: [{ type: 'image', url: '/saved.jpg' }] }
  try {
    await act(async () => root.render(React.createElement(module.exports.TrendingDetailModal, { item: { inspirationRow: row }, onRecreate: () => { oldCardAction += 1 }, onClose: () => { closed += 1 } })))
    assert.equal(opened.row, row)
    assert.equal(Object.hasOwn(opened, 'onReplicate'), false, 'the owner must receive the prepared row through its default handoff, never the old card action')
    assert.equal(oldCardAction, 0)
    opened.onClose('dismissed')
    assert.equal(closed, 1)
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, { window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: previous.act })
    dom.window.close()
  }
  // onClose already released this instance; it must not be disposed twice.
  assert.equal(disposed, 0)
})
