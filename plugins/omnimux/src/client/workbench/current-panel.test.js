import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  bindWorkbenchDeps,
  resetWorkbenchHostAdapter,
} from './host-adapter.js'
import {
  currentRightbarPanel,
  readCurrentRightbarState,
} from './current-panel.js'

let dom

afterEach(() => {
  resetWorkbenchHostAdapter()
  dom?.window.close()
  dom = undefined
})

function setup(body, mounted) {
  dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`)
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  if (mounted !== undefined) {
    bindWorkbenchDeps({ sidebarRight: { mounted: { getSnapshot: () => mounted } } })
  }
  return dom.window.document
}

test('currentRightbarPanel 优先按 mounted 会话选择面板', () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a" hidden>
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
    <div data-sidebar-right-session="session-b">
      <div data-sidebar-right-panel="push" data-sidebar-right-open><span id="current"></span></div>
    </div>
  `, 'session-b')
  const panel = currentRightbarPanel(doc)
  assert.ok(panel)
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')
  assert.equal(panel.querySelector('#current') !== null, true)
})

test('currentRightbarPanel 无 mounted 时退回可见面板，不返回隐藏面板', () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a" hidden>
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
    <div data-sidebar-right-session="session-b">
      <div data-sidebar-right-panel="push" data-sidebar-right-open></div>
    </div>
  `)
  assert.equal(currentRightbarPanel(doc)?.getAttribute('data-sidebar-right-panel'), 'push')
})

test('所有面板隐藏时返回 null，绝不取 panels[0]', () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a" hidden>
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
  `)
  assert.equal(currentRightbarPanel(doc), null)
})

test('readCurrentRightbarState 返回当前会话的 open/fullscreen', () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a" hidden>
      <div data-sidebar-right-panel="push" data-sidebar-right-open></div>
    </div>
    <div data-sidebar-right-session="session-b">
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
  `, 'session-b')
  assert.deepEqual(
    (({ open, fullscreen }) => ({ open, fullscreen }))(readCurrentRightbarState(doc)),
    { open: true, fullscreen: true },
  )
})
