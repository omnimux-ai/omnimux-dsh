import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import * as bridge from './dom.js'

function fixture(run) {
  const dom = new JSDOM('<div data-composer-seat id="a"><div data-composer-card><div data-composer-input="true" contenteditable="true"></div></div></div><div data-composer-seat id="b"><div data-composer-card></div></div>')
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window; globalThis.document = dom.window.document
  try { run(dom.window) } finally { dom.window.close(); Object.assign(globalThis, previous) }
}

test('private top-row insertion and bulk removal are not exported', () => {
  for (const name of ['insertQuickLinkChip', 'removeQuickLinkChips', 'replaceQuickLinkChips']) {
    assert.equal(name in bridge, false)
  }
})

test('legacy detached node fixture retains video and product ID semantics without mounting a row', () => fixture(() => {
  const video = bridge.createQuickLinkChipNode('video', { label: '视频' })
  const product = bridge.createQuickLinkChipNode('product', { label: '商品' })
  assert.equal(video.getAttribute('data-omx-video-token'), 'true')
  assert.equal(video.getAttribute('contenteditable'), 'false')
  assert.equal(product.getAttribute('data-omx-product-token'), 'true')
  assert.equal(product.querySelector('input').placeholder, '粘贴商品链接或 ID')
  product.querySelector('input').value = 'prod_42'
  assert.equal(product.querySelector('input').value, 'prod_42')
  assert.equal(video.isConnected, false); assert.equal(product.isConnected, false)
  assert.equal(document.querySelector('[data-omx-link-chip-row]'), null)
  assert.equal(bridge.createQuickLinkChipNode('invalid'), null)
}))

test('legacy reads stay card scoped and cannot infer ownership across multiple seats', () => fixture(() => {
  const a = document.querySelector('#a'), b = document.querySelector('#b')
  const video = bridge.createQuickLinkChipNode('video')
  const product = bridge.createQuickLinkChipNode('product')
  a.querySelector('[data-composer-card]').append(video)
  b.querySelector('[data-composer-card]').append(product)
  assert.deepEqual(bridge.readQuickLinkChipKinds(a), ['video'])
  assert.deepEqual(bridge.readQuickLinkChipKinds(b), ['product'])
  assert.deepEqual(bridge.readQuickLinkChipKinds(), [])
  assert.equal(video.isConnected, true); assert.equal(product.isConnected, true)
}))

test('legacy input events stay local; explicit close removes only that node and notifies', () => fixture(win => {
  const card = document.querySelector('#a [data-composer-card]')
  const video = bridge.createQuickLinkChipNode('video')
  const product = bridge.createQuickLinkChipNode('product')
  card.append(video, product)
  let bubbled = 0, changes = 0
  document.addEventListener('keydown', () => bubbled++)
  document.addEventListener('paste', () => bubbled++)
  const off = bridge.subscribeQuickLinkChipChange(() => changes++)
  video.querySelector('input').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  video.querySelector('input').dispatchEvent(new win.Event('paste', { bubbles: true }))
  assert.equal(bubbled, 0)
  video.querySelector('button').click()
  assert.equal(video.isConnected, false); assert.equal(product.isConnected, true)
  assert.equal(changes, 1)
  off(); bridge.notifyQuickLinkChipChange()
  assert.equal(changes, 1)
}))
