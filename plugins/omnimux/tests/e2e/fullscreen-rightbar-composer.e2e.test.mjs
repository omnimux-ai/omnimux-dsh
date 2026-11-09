import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

import { computeChromeLayout } from '../../src/client/sidebar-toggle-topbar.js'

/**
 * E2E geometry regression: the host fullscreen right panel reserves the 360px
 * conversation rail. A stale split ratio (~670px) made the composer extend under
 * the right-anchored panel; `computeChromeLayout` must publish the fullscreen
 * floor instead so the input stays entirely inside its column.
 */
test('fullscreen right panel publishes the 360px conversation floor, not a stale split width', () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="dshDesktopFrame" data-rightbar-fullscreen="true" style="grid-template-columns: 280px 670px 778px"><div class="sidebarCol_test"></div><div class="centerCol"></div><div data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"></div></div></body></html>')
  const win = dom.window
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = win
  globalThis.document = win.document
  const frame = win.document.querySelector('.dshDesktopFrame')
  frame.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1728, height: 994, right: 1728, bottom: 994, left: 0, top: 0 })
  const column = win.document.querySelector('.sidebarCol_test')
  column.getBoundingClientRect = () => ({ x: 0, y: 0, width: 280, height: 994, right: 280, bottom: 994, left: 0, top: 0 })
  Object.defineProperty(column, 'offsetWidth', { value: 280, configurable: true })
  const panel = win.document.querySelector('[data-sidebar-right-panel]')
  panel.getBoundingClientRect = () => ({ x: 640, y: 0, width: 1088, height: 994, right: 1728, bottom: 994, left: 640, top: 0 })
  try {
    const layout = computeChromeLayout(win.document)
    assert.equal(layout.conversationWidth, 360)
    assert.equal(layout.leftRailW, 280)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    win.close()
  }
})
