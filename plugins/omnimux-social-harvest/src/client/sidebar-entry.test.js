import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { ENTRY_SELECTOR, HARVEST_TAB_ID, mountSidebarEntry } from './sidebar-entry.js'

const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow

  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

test('social-harvest sidebar entry mounts and registers to coordinator', () => {
  assert.equal(ENTRY_SELECTOR, '[data-omnimux-social-harvest-entry]')
  assert.equal(HARVEST_TAB_ID, 'omnimux-social-harvest:library')

  let registeredRow = null
  let openedTabId = null

  // 模拟 DOM
  globalThis.document = {
    createElement(tag) {
      const attrs = {}
      const listeners = {}
      let innerHTML = ''
      let className = ''
      return {
        tagName: tag.toUpperCase(),
        type: '',
        dataset: {},
        setAttribute(k, v) { attrs[k] = v },
        getAttribute(k) { return attrs[k] },
        set className(c) { className = c },
        get className() { return className },
        set innerHTML(h) {
          innerHTML = h
        },
        get innerHTML() { return innerHTML },
        querySelector(sel) {
          if (sel === '.omnimux-sidebar-nav-entry-label') {
            return {
              set textContent(txt) { attrs['label-text'] = txt },
              get textContent() { return attrs['label-text'] },
            }
          }
          return null
        },
        addEventListener(event, fn) {
          listeners[event] = fn
        },
        click() {
          if (listeners.click) listeners.click()
        },
      }
    },
  }

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore(opts) {
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() { openedTabId = opts.tabId },
          close() {},
        }
      },
    },
  }

  const t = (k) => (k === 'nav' ? '社媒采集' : k)
  const unmount = mountSidebarEntry(null, t, { subscribe: () => () => {} })

  assert.ok(registeredRow, 'entry should be registered to __omnimuxSidebar')
  assert.equal(registeredRow.id, 'omnimux-social-harvest-entry')
  assert.equal(registeredRow.rank, 3.8)
  assert.equal(typeof registeredRow.create, 'function')

  const el = registeredRow.create()
  assert.ok(el.getAttribute('data-omnimux-social-harvest-entry') !== undefined)
  assert.equal(el.getAttribute('aria-label'), '社媒采集')

  el.click()
  assert.equal(openedTabId, HARVEST_TAB_ID)

  unmount()
  assert.equal(registeredRow, null, 'unmount should unregister coordinator')
})
