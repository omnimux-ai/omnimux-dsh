import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  computeGuideLayoutColumns,
  ensureGuideLayoutStyles,
  syncSidebarRightGuideLayout,
  installSidebarRightGuideLayout,
  GUIDE_LAYOUT_ATTR,
  GUIDE_LAYOUT_COLUMNS_ATTR,
  GUIDE_DOUBLE_COLUMN_THRESHOLD,
  GUIDE_MIN_DOUBLE_COLUMN_WIDTH_PX,
  GUIDE_DOUBLE_COLUMN_STYLES_ID,
} from './sidebar-right-guide-layout.js'

test('computeGuideLayoutColumns: returns 1 when count <= threshold', () => {
  assert.equal(computeGuideLayoutColumns(5, 800), '1')
  assert.equal(computeGuideLayoutColumns(6, 800), '1')
})

test('computeGuideLayoutColumns: returns 2 when count > threshold and width >= minWidth', () => {
  assert.equal(computeGuideLayoutColumns(7, 600), '2')
  assert.equal(computeGuideLayoutColumns(17, 856), '2')
})

test('computeGuideLayoutColumns: returns 1 when width is insufficient even if count > threshold', () => {
  assert.equal(computeGuideLayoutColumns(12, 500), '1')
  assert.equal(computeGuideLayoutColumns(17, 400), '1')
})

test('ensureGuideLayoutStyles: idempotent and injects style element', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
  const doc = dom.window.document

  ensureGuideLayoutStyles(doc)
  const style = doc.getElementById(GUIDE_DOUBLE_COLUMN_STYLES_ID)
  assert.ok(style, 'style element must exist')
  assert.match(style.textContent, /display:\s*grid/i)

  // Call again, should not duplicate
  ensureGuideLayoutStyles(doc)
  const allStyles = doc.querySelectorAll(`#${GUIDE_DOUBLE_COLUMN_STYLES_ID}`)
  assert.equal(allStyles.length, 1, 'must remain single style node')
})

test('syncSidebarRightGuideLayout: correctly sets data-layout-columns attribute', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head></head>
      <body>
        <div data-sidebar-right-guide="true">
          <span class="hero"></span>
          <button data-sidebar-right-guide-entry="1">1</button>
          <button data-sidebar-right-guide-entry="2">2</button>
          <button data-sidebar-right-guide-entry="3">3</button>
          <button data-sidebar-right-guide-entry="4">4</button>
          <button data-sidebar-right-guide-entry="5">5</button>
          <button data-sidebar-right-guide-entry="6">6</button>
          <button data-sidebar-right-guide-entry="7">7</button>
        </div>
      </body>
    </html>
  `)
  const doc = dom.window.document
  const guide = doc.querySelector(`[${GUIDE_LAYOUT_ATTR}="true"]`)

  // In JSDOM clientWidth defaults to 0, simulate clientWidth = 800
  Object.defineProperty(guide, 'clientWidth', { value: 800, configurable: true })

  const res = syncSidebarRightGuideLayout(doc)
  assert.equal(res, '2', 'must switch to 2 columns')
  assert.equal(guide.getAttribute(GUIDE_LAYOUT_COLUMNS_ATTR), '2')
})

test('installSidebarRightGuideLayout: cleanup disconnects observers cleanly', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
  const doc = dom.window.document

  const cleanup = installSidebarRightGuideLayout(doc)
  assert.equal(typeof cleanup, 'function')
  assert.doesNotThrow(() => cleanup())
})
