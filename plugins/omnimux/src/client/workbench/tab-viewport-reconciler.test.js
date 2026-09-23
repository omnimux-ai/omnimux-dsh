/**
 * 页面级视窗模式调和器单元测试（Issue #2516）。
 *
 * 1. 未记录偏好的页签已是全屏：不得拆回三栏（图 1）
 * 2. 用户亲手切分栏：写入 explicit + 会话三栏钥匙
 * 3. 同会话内部换页签：锁当前布局
 * 4. 面板收起：静默
 * 5. 生命周期
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
import { enterHostRightSidebarFullscreen } from './host-fullscreen.js'
import { resetConversationCollapseForTests } from '../conversation-collapse.js'

let dom
const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  resetConversationCollapseForTests()
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

const OPEN_PANEL = '<div data-sidebar-right-panel="push" data-sidebar-right-open><button data-sidebar-right-mode="fullscreen" id="enter"></button></div>'
const FULLSCREEN_PANEL = '<div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>'

function harness(doc, initial) {
  const state = { tab: initial.tab, isFs: initial.isFs }
  const enters = []
  const exits = []
  const storage = {}
  const threeColumn = {}
  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
    getTabId: () => state.tab,
    getFocusRecord: (sess, tab) => storage[tab] || { mode: WORKBENCH_FOCUS.gui, explicit: false },
    persistFocus: (sess, tab, patch) => {
      storage[tab] = { ...(storage[tab] || { mode: WORKBENCH_FOCUS.gui, explicit: false }), ...patch }
    },
    persistSessionThreeColumn: (val) => { threeColumn.val = val },
    isFullscreen: () => state.isFs,
    enterFullscreen: () => {
      enters.push(state.tab)
      state.isFs = true
    },
    exitFullscreen: () => {
      exits.push(state.tab)
      state.isFs = false
    },
  })
  return { state, enters, exits, storage, threeColumn, reconciler }
}

test('resolveCurrentTabId prioritizes sidebarRight active record, then snapshot, then DOM', () => {
  const doc = setupDom('<div role="tab" aria-selected="true" data-dockkit-tab="dom-tab"></div>')
  assert.equal(resolveCurrentTabId(doc, null), 'dom-tab')
  const mockSidebar = { active: () => ({ kind: 'omnimux-assets:library' }) }
  assert.equal(resolveCurrentTabId(doc, mockSidebar), 'omnimux-assets:library')
})

test('AC-1 未记录偏好的页签已是全屏：不得拆回三栏（图 1）', () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  doc.documentElement.setAttribute('data-omnimux-conversation-collapsed', '')
  const { exits, state, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: true })

  reconciler.sync()

  assert.deepEqual(exits, [], '默认全屏不得被调和器拆掉')
  assert.equal(state.isFs, true)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true)
})

test('AC-2 未记录偏好的页签处于分栏：调和器不自动进全屏（进全屏由打开序列负责）', () => {
  const doc = setupDom(OPEN_PANEL)
  const { enters, exits, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: false })

  reconciler.sync()

  assert.deepEqual(enters, [])
  assert.deepEqual(exits, [])
})

test('AC-3 用户在同一页签切到分栏：记录 explicit 与会话三栏钥匙', async () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  const { state, storage, threeColumn, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: true })

  reconciler.sync()
  state.isFs = false
  reconciler.sync()

  assert.equal(storage['omnimux-assets:library']?.mode, WORKBENCH_FOCUS.split)
  assert.equal(storage['omnimux-assets:library']?.explicit, true)
  assert.equal(threeColumn.val, true)
  await new Promise((r) => setTimeout(r, 20))
})

test('AC-4 同会话内部换页签：锁当前分栏，不按目标页默认弹全屏', () => {
  const doc = setupDom(OPEN_PANEL)
  const { state, storage, enters, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: false })
  storage['omnimux-workflow:library'] = { mode: WORKBENCH_FOCUS.gui, explicit: true }

  reconciler.sync()
  state.tab = 'omnimux-workflow:library'
  reconciler.sync()

  assert.deepEqual(enters, [])
  assert.equal(state.isFs, false)
})

test('AC-5 同会话内部换页签：锁当前全屏，不因目标页无记忆而退出', () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  const { state, exits, reconciler } = harness(doc, { tab: 'omnimux-workflow:library', isFs: true })

  reconciler.sync()
  state.tab = 'omnimux-assets:library'
  reconciler.sync()

  assert.equal(state.isFs, true)
  assert.deepEqual(exits, [])
})

test('AC-6 面板收起时保持静默', () => {
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

test('AC-7 切到无三栏记忆的会话：收起右侧，不把全屏带过去', () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  const closes = []
  const focus = []
  let session = 'sess-a'
  let isFs = true
  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => session,
    getTabId: () => 'omnimux-assets:library',
    isFullscreen: () => isFs,
    loadSessionThreeColumn: (id) => id === 'sess-a',
    closePanel: () => { closes.push(session); isFs = false },
    setFocus: (mode) => { focus.push(mode) },
  })
  reconciler.sync()
  assert.deepEqual(closes, [])
  session = 'sess-b'
  reconciler.sync()
  assert.deepEqual(closes, ['sess-b'])
  assert.ok(focus.includes('chat'))
})

test('AC-8 程序化进全屏不得写成 explicit', () => {
  const doc = setupDom(OPEN_PANEL)
  const { state, storage, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: false })
  reconciler.sync()
  reconciler.beginProgrammatic()
  state.isFs = true
  reconciler.sync()
  assert.equal(storage['omnimux-assets:library']?.explicit, undefined)
})

test('installTabViewportReconciler lifecycle: install and uninstall without leak', () => {
  const doc = setupDom(OPEN_PANEL)
  const unsub = installTabViewportReconciler(doc)
  assert.equal(typeof unsub, 'function')
  const win = doc.defaultView
  assert.equal(typeof win.__omnimuxEnterRightSidebarFullscreen, 'function', '安装后必须暴露官方全屏公开缝')
  assert.equal(win.__omnimuxEnterRightSidebarFullscreen, enterHostRightSidebarFullscreen, '公开缝必须就是中枢唯一实现')
  unsub()
  assert.equal(win.__omnimuxEnterRightSidebarFullscreen, undefined, '卸载后公开缝必须按身份回收')
})
