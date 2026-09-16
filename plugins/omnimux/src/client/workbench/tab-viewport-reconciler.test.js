/**
 * 页面级视窗模式调和器单元测试（Tab Viewport Reconciler Tests）。
 *
 * 覆盖：
 * 1. 默认全屏机制：首次进入的工作台 Tab 默认期望全屏；若面板为 push 则自动触发进入全屏；
 * 2. 单页分栏手势记录：用户在 Tab A 退出全屏后，仅 Tab A 记为 split；
 * 3. 跨 Tab 调和：从 Tab A (split) 切换到 Tab B (默认全屏) 时自动切全屏；
 * 4. 记忆恢复：从 Tab B 切回 Tab A 时自动退出全屏恢复 split 并展开会话栏；
 * 5. 调和锁防反弹：由调和器触发的模式变更绝不反向污染 Tab 的记忆；
 * 6. 生命周期管理：install 与卸载清理。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { WORKBENCH_FOCUS } from './focus-state.js'
import {
  createTabViewportReconciler,
  installTabViewportReconciler,
  resolveCurrentTabId,
} from './tab-viewport-reconciler.js'

let dom
const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  dom?.window.close()
  dom = undefined
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

function setupDom(body = '') {
  dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`)
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return dom.window.document
}

test('resolveCurrentTabId prioritizes sidebarRight active record, then snapshot, then DOM', () => {
  const doc = setupDom('<div role="tab" aria-selected="true" data-dockkit-tab="dom-tab"></div>')
  
  // 1. DOM 兜底
  assert.equal(resolveCurrentTabId(doc, null), 'dom-tab')

  // 2. sidebarRight 优先
  const mockSidebar = {
    active: () => ({ kind: 'omnimux-assets:library' }),
  }
  assert.equal(resolveCurrentTabId(doc, mockSidebar), 'omnimux-assets:library')
})

test('tab-viewport-reconciler: 旅程 1 - 新 Tab 默认全屏，自动调和 push 为 fullscreen', () => {
  const doc = setupDom('<div data-sidebar-right-panel="push" data-sidebar-right-open><button data-sidebar-right-mode="fullscreen" id="enter"></button></div>')
  let currentTab = 'omnimux-assets:library'
  let isFs = false
  const enters = []
  const exits = []
  const storage = {}

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
    getTabId: () => currentTab,
    getFocusRecord: (sess, tab) => storage[tab] || { mode: WORKBENCH_FOCUS.gui },
    persistFocus: (sess, tab, patch) => {
      storage[tab] = { ...(storage[tab] || { mode: WORKBENCH_FOCUS.gui }), ...patch }
    },
    isFullscreen: () => isFs,
    enterFullscreen: () => {
      enters.push(currentTab)
      isFs = true
    },
    exitFullscreen: () => {
      exits.push(currentTab)
      isFs = false
    },
  })

  // 触发同步：当前面板为 push，而资产库默认期望全屏 (gui)
  reconciler.sync()
  assert.equal(enters.length, 1)
  assert.equal(enters[0], 'omnimux-assets:library')
  assert.equal(exits.length, 0)
})

test('tab-viewport-reconciler: 旅程 2 & 3 & 4 - 用户退出全屏记忆为 split，切换 Tab 自动全屏，切回自动还原 split', async () => {
  const doc = setupDom('<div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>')
  let currentTab = 'omnimux-assets:library'
  let isFs = true
  const enters = []
  const exits = []
  const storage = {}

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
    getTabId: () => currentTab,
    getFocusRecord: (sess, tab) => storage[tab] || { mode: WORKBENCH_FOCUS.gui },
    persistFocus: (sess, tab, patch) => {
      storage[tab] = { ...(storage[tab] || { mode: WORKBENCH_FOCUS.gui }), ...patch }
    },
    isFullscreen: () => isFs,
    enterFullscreen: () => {
      enters.push(currentTab)
      isFs = true
    },
    exitFullscreen: () => {
      exits.push(currentTab)
      isFs = false
    },
  })

  // 1. 资产库打开，当前为全屏
  reconciler.sync()
  assert.equal(enters.length, 0)
  assert.equal(exits.length, 0)

  // 2. 用户在资产库点击右上角退出全屏，面板变为 push
  isFs = false
  reconciler.sync()
  // 验证资产库的独立偏好被精准记录为 split
  assert.equal(storage['omnimux-assets:library']?.mode, WORKBENCH_FOCUS.split)

  // 3. 用户切换到灵感社区（未曾调整过，默认期望全屏 gui）
  currentTab = 'omnimux-inspiration:library'
  reconciler.sync()
  // 验证自动触发进入全屏！
  assert.equal(enters.length, 1)
  assert.equal(enters[0], 'omnimux-inspiration:library')
  assert.equal(isFs, true)
  // 等待微任务锁释放
  await new Promise((r) => setTimeout(r, 60))

  // 4. 用户切回资产库（曾设为 split）
  currentTab = 'omnimux-assets:library'
  reconciler.sync()
  // 验证自动触发退出全屏，恢复分栏展示会话栏！
  assert.equal(exits.length, 1)
  assert.equal(exits[0], 'omnimux-assets:library')
  assert.equal(isFs, false)
  await new Promise((r) => setTimeout(r, 60))

  // 5. 用户在资产库重新点击全屏，面板变为 fullscreen
  isFs = true
  reconciler.sync()
  assert.equal(storage['omnimux-assets:library']?.mode, WORKBENCH_FOCUS.gui)
})

test('tab-viewport-reconciler: 面板收起时保持静默', () => {
  // 没有 data-sidebar-right-open
  const doc = setupDom('<div data-sidebar-right-panel="push"></div>')
  let triggered = 0

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    enterFullscreen: () => { triggered += 1 },
    exitFullscreen: () => { triggered += 1 },
  })

  reconciler.sync()
  assert.equal(triggered, 0)
})

test('installTabViewportReconciler lifecycle: install and uninstall without leak', () => {
  const doc = setupDom('<div data-sidebar-right-panel="push" data-sidebar-right-open></div>')
  const unsub = installTabViewportReconciler(doc)
  assert.equal(typeof unsub, 'function')
  unsub()
})
