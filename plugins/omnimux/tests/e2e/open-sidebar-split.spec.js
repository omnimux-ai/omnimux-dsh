import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createWorkbenchSidebarStore } from '../../src/client/workbench/sidebar-controller.js'
import { WORKBENCH_FOCUS } from '../../src/client/workbench/focus-state.js'

test('e2e: openSidebarStore uses default split focus mode without forcing gui (Issue #1882)', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const win = dom.window
  globalThis.document = win.document
  globalThis.window = win

  let openedOptions = null
  win.__omnimuxWorkbench = {
    open(opts) {
      openedOptions = opts
    },
    isActive() { return false },
    subscribe() { return () => {} },
  }

  const store = createWorkbenchSidebarStore({
    tabId: 'omnimux-workflow:library',
    title: '项目',
  })

  store.open()

  assert.ok(openedOptions, 'open should be called on click')
  assert.equal(openedOptions.tabId, 'omnimux-workflow:library')
  assert.equal(openedOptions.focus, undefined, 'focus must NOT be hardcoded to gui')
})
