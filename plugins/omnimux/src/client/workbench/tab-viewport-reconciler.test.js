/**
 * 页面级视窗模式调和器单元测试（Tab Viewport Reconciler Tests）。
 *
 * 覆盖（对应 specs/right-sidebar-open-split.spec.md 的 AC-1…AC-7）：
 * 1. AC-1 未记录偏好的工作台页签 + push：不进入全屏；
 * 2. AC-2 未记录偏好的工作台页签 + fullscreen：退出全屏并清掉会话折叠键与快照键；
 * 3. AC-3 用户在同一页签切换模式：记录同时带上 `explicit: true`；
 * 4. AC-4 面板已展开时切到「显式选过全屏」的页签：恢复全屏；
 * 5. AC-5 面板收起：完全静默；
 * 6. AC-6 收起 → 展开的那一次同步：呈分栏，显式全屏记录也不生效；
 * 7. AC-7 是否存在左侧会话列表选中行，结果完全一致；
 * 8. 生命周期：install 与卸载清理。
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

/**
 * 装配一个受控调和器：`storage` 就是焦点记录表，`state.isFs` 是宿主面板当前模式。
 * @param {Document} doc
 * @param {{ tab: string, isFs: boolean }} initial
 */
function harness(doc, initial) {
  const state = { tab: initial.tab, isFs: initial.isFs }
  const enters = []
  const exits = []
  const storage = {}
  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
    getTabId: () => state.tab,
    // 未显式选过的页签：`focusRecordForTab` 会按 resolveDefaultFocus 播种 gui，
    // 但 `explicit` 为 false —— 这正是本 Issue 的回归现场。
    getFocusRecord: (sess, tab) => storage[tab] || { mode: WORKBENCH_FOCUS.gui, explicit: false },
    persistFocus: (sess, tab, patch) => {
      storage[tab] = { ...(storage[tab] || { mode: WORKBENCH_FOCUS.gui, explicit: false }), ...patch }
    },
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
  return { state, enters, exits, storage, reconciler }
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

test('AC-1 未记录偏好的工作台页签 + push：绝不自动进入全屏', () => {
  const doc = setupDom(OPEN_PANEL)
  const { enters, exits, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: false })

  reconciler.sync()

  assert.deepEqual(enters, [], '自动播种的 gui 默认值不是用户意图，不得据此进入全屏')
  assert.deepEqual(exits, [])
})

test('AC-2 未记录偏好的工作台页签 + fullscreen：调和回分栏并清掉折叠键', () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  doc.documentElement.setAttribute('data-omnimux-conversation-collapsed', '')
  doc.documentElement.setAttribute('data-omnimux-fullscreen-collapse-snapshot', 'false')
  const { exits, state, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: true })

  reconciler.sync()

  assert.deepEqual(exits, ['omnimux-assets:library'])
  assert.equal(state.isFs, false)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), false)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-fullscreen-collapse-snapshot'), false)
})

test('AC-3 用户在同一页签切换模式：记录写入 explicit 标记', async () => {
  const doc = setupDom(FULLSCREEN_PANEL)
  const { state, storage, exits, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: true })

  // 首轮同步：面板已是 fullscreen 且无显式记录，先被调和回分栏
  reconciler.sync()
  assert.deepEqual(exits, ['omnimux-assets:library'])
  assert.equal(state.isFs, false)
  await new Promise((r) => setTimeout(r, 60))

  // 用户亲手切到全屏
  state.isFs = true
  reconciler.sync()
  assert.equal(storage['omnimux-assets:library']?.mode, WORKBENCH_FOCUS.gui)
  assert.equal(storage['omnimux-assets:library']?.explicit, true)
})

test('AC-4 面板处于分栏展开时切到曾选过全屏的页签：当前分栏状态优先，禁止自动进入全屏（Issue #2212）', async () => {
  const doc = setupDom(OPEN_PANEL)
  const { state, storage, enters, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: false })
  storage['omnimux-workflow:library'] = { mode: WORKBENCH_FOCUS.gui, explicit: true }

  reconciler.sync()
  assert.deepEqual(enters, [], '首轮：未记录偏好的页签按分栏处理')

  state.tab = 'omnimux-workflow:library'
  reconciler.sync()
  assert.deepEqual(enters, [], '分栏状态优先：即便目标页签曾记录全屏偏好，切换时也绝不自动拉入全屏')
  assert.equal(state.isFs, false, '面板必须保持分栏')
  await new Promise((r) => setTimeout(r, 60))
})

test('AC-5 面板收起时保持静默', () => {
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

test('AC-6 展开后切换任何页签均保持分栏，当前三栏状态优先于历史全屏偏好（Issue #2212）', () => {
  const doc = setupDom('<div data-sidebar-right-panel="push"></div>')
  const { state, storage, enters, reconciler } = harness(doc, { tab: 'omnimux-workflow:library', isFs: false })
  storage['omnimux-workflow:library'] = { mode: WORKBENCH_FOCUS.gui, explicit: true }

  // 面板收起态先观测一轮
  reconciler.sync()
  assert.deepEqual(enters, [])

  // 面板展开（收起 → 展开）
  doc.body.innerHTML = OPEN_PANEL
  reconciler.sync()
  assert.deepEqual(enters, [], '展开右侧栏是「并排」意图，此刻不占满整屏')

  // 切到另一个未记录偏好的页签：仍按分栏处理
  state.tab = 'omnimux-assets:library'
  reconciler.sync()
  assert.deepEqual(enters, [], '未记录偏好的页签始终保持分栏')

  // 切到显式选过全屏的页签：用户当前分栏状态绝对优先，绝不触发全屏
  state.tab = 'omnimux-workflow:library'
  reconciler.sync()
  assert.deepEqual(enters, [], '当前分栏状态优先，绝不自动拉入全屏')
  assert.equal(state.isFs, false, '面板必须保持分栏')
})

test('AC-7 左侧会话列表有无选中行，调和结果完全一致', () => {
  const outcomes = []
  for (const withSelection of [false, true]) {
    const body = withSelection
      ? `${OPEN_PANEL}<div role="treeitem" aria-selected="true">会话 A</div>`
      : OPEN_PANEL
    const doc = setupDom(body)
    const { state, enters, exits, reconciler } = harness(doc, { tab: 'omnimux-assets:library', isFs: true })
    reconciler.sync()
    outcomes.push({ enters: [...enters], exits: [...exits], isFs: state.isFs })
  }
  assert.deepEqual(outcomes[0], outcomes[1], '右侧栏呈现方式不得依赖左侧列表的渲染事实')
  assert.equal(outcomes[0].isFs, false)
})

test('AC-8 同一会话内全屏后切换任意页签，视窗模式绝对锁定全屏，绝不跳变或自动退出', () => {
  const doc = setupDom(OPEN_PANEL)
  const { state, storage, enters, exits, reconciler } = harness(doc, { tab: 'omnimux-workflow:library', isFs: false })

  // 1. 初态分栏
  reconciler.sync()
  assert.equal(state.isFs, false)

  // 2. 用户在当前会话主动点击全屏
  state.isFs = true
  reconciler.sync()
  assert.equal(state.isFs, true)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, '会话栏被折叠')

  // 3. 在同一会话内连续切换到其他未记录全屏的页签（资产库、技能/专家）
  state.tab = 'omnimux-assets:library'
  reconciler.sync()
  assert.equal(state.isFs, true, '切换至资产库必须保持全屏')
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, '会话栏继续保持折叠')
  assert.deepEqual(exits, [], '绝不得触发任何退出全屏')

  state.tab = 'omnimux-market:plaza'
  reconciler.sync()
  assert.equal(state.isFs, true, '切换至技能专家必须保持全屏')
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, '会话栏继续保持折叠')
  assert.deepEqual(exits, [], '绝不得触发任何退出全屏')

  // 4. 切回最初的项目页签
  state.tab = 'omnimux-workflow:library'
  reconciler.sync()
  assert.equal(state.isFs, true, '切回项目必须保持全屏')
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, '会话栏继续保持折叠')
})

test('AC-9 跨会话视窗记忆严格隔离与平滑精准还原', () => {
  const doc = setupDom(OPEN_PANEL)
  let currentSession = 'session-A'
  const state = { tab: 'omnimux-workflow:library', isFs: false }
  const enters = []
  const exits = []

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => currentSession,
    getTabId: () => state.tab,
    isFullscreen: () => state.isFs,
    enterFullscreen: () => {
      enters.push(currentSession)
      state.isFs = true
    },
    exitFullscreen: () => {
      exits.push(currentSession)
      state.isFs = false
    },
  })

  // 1. 在 session-A 中，初始分栏，用户点击全屏
  reconciler.sync()
  state.isFs = true
  reconciler.sync()
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, 'session-A 为全屏')

  // 2. 切换至 session-B（新会话/默认分栏会话）
  currentSession = 'session-B'
  reconciler.sync()
  assert.equal(state.isFs, false, 'session-B 自动还原为分栏')
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), false, 'session-B 会话栏展开')
  assert.deepEqual(exits, ['session-B'], '对 session-B 执行了一次平滑退出全屏')

  // 3. 切换回 session-A
  currentSession = 'session-A'
  reconciler.sync()
  assert.equal(state.isFs, true, 'session-A 自动精准还原为全屏')
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true, 'session-A 会话栏自动恢复折叠')
  assert.deepEqual(enters, ['session-A'], '对 session-A 执行了一次平滑进入全屏')
})

test('installTabViewportReconciler lifecycle: install and uninstall without leak', () => {
  const doc = setupDom(OPEN_PANEL)
  const unsub = installTabViewportReconciler(doc)
  assert.equal(typeof unsub, 'function')
  unsub()
})
