/**
 * 面板宽度协调与把手对齐（Issue #2608 · T04 / 方案 D7-S1′）。
 *
 * 外壳的 `panels.rightbar` 一个字段同时决定三件事：authored 第三轨、拖拽起点
 * （`setRightbar(base − dx)` 是 delta 模型）、右分隔把手位置（`left = viewport − rightbar`）。
 * 因此插件必须维持 `panels.rightbar ≡ 可见舞台 − 比例中栏宽`，否则会出现两种可见缺陷：
 * 缩放后把手与真实列边界错位、缩放后第一次拖拽首帧跳变。
 *
 * 本文件锁住四条边界：写什么值、什么时候绝不写、拿不到外壳句柄时不写、以及
 * 「健康宽度」兜底不得与比例协调写抢同一根轨道。
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

import {
  ensureHealthySplitWidth,
} from './tab-viewport-reconciler.js'
import { focusRecordForTab } from './focus-state.js'
import { WORKBENCH_FOCUS } from '../../workbench/contract.js'
import {
  bindWorkbenchDeps,
  resetWorkbenchHostAdapter,
  setAttachedStore,
} from './host-adapter.js'
import {
  reconcileRightbarFromRatio,
  resetWorkbenchWidthMemory,
} from './split-layout.js'
import {
  resetConversationCollapseForTests,
} from '../conversation-collapse.js'
import { resetWorkspaceLayoutStoreForTests, writeChatRatio } from './workspace-layout-store.js'

const RAIL_PX = 280
const RATIO = 0.3
const SESSION_ID = 's-2608'
const TAB_ID = 'omnimux-workflow:canvas'

/** @type {{ window: unknown, document: unknown, HTMLElement: unknown }} */
const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
}

/**
 * 外壳 layout 句柄的最小替身：只保留协调写真正用到的读面与写面。
 * `setRightbar` 记录调用参数，便于断言「写了几次、写了多少、用哪个视口夹紧」。
 */
function createShellLayout({ rightbar = null, rightbarShown = true, rightbarTrack = true, rightbarFullscreen = false } = {}) {
  const state = { rightbar, rightbarShown, rightbarTrack, rightbarFullscreen }
  return {
    calls: [],
    getSnapshot: () => ({ ...state }),
    setRightbar(width, viewport) {
      this.calls.push({ width, viewport })
      state.rightbar = Math.round(width)
    },
  }
}

function makeState({ panelOpen = true, width = 1148 } = {}) {
  return {
    panelOpen,
    width,
    activePane: 'pane-1',
    splits: { kind: 'split', children: [{ kind: 'leaf', id: 'pane-1', active: TAB_ID, tabs: [{ id: TAB_ID, type: TAB_ID }] }] },
  }
}

function setupWindow(viewportPx) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"></main>
    </div>
  </body></html>`, {
    url: 'http://127.0.0.1/',
  })
  Object.defineProperty(dom.window, 'innerWidth', { value: viewportPx, configurable: true, writable: true })
  // jsdom 不做布局，实测宽度恒为 0；左栏轨道必须能被量到，否则几何退化成「视口 = 舞台」。
  const sidebarColumn = dom.window.document.querySelector('.dshDesktopSidebarSurface')
  sidebarColumn.getBoundingClientRect = () => ({ width: RAIL_PX, height: 800, top: 0, left: 0, right: RAIL_PX, bottom: 800 })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  return dom
}

beforeEach(() => {
  resetWorkbenchHostAdapter()
  resetWorkbenchWidthMemory()
  resetConversationCollapseForTests()
  resetWorkspaceLayoutStoreForTests()
})

afterEach(() => {
  resetWorkbenchHostAdapter()
  resetWorkbenchWidthMemory()
  resetConversationCollapseForTests()
  resetWorkspaceLayoutStoreForTests()
  if (previous.window === undefined) delete globalThis.window
  else globalThis.window = previous.window
  if (previous.document === undefined) delete globalThis.document
  else globalThis.document = previous.document
  if (previous.HTMLElement === undefined) delete globalThis.HTMLElement
  else globalThis.HTMLElement = previous.HTMLElement
})

describe('T04 面板宽度协调（D7-S1′）', () => {
  it('writes the physical remainder of the visible stage into the shell panel width', () => {
    setupWindow(1920)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split

    const verdict = reconcileRightbarFromRatio(makeState(), {
      sessionId: SESSION_ID,
      officialSidebarWidth: RAIL_PX,
      chatRatio: RATIO,
    })

    assert.equal(verdict, 'written')
    assert.equal(layout.calls.length, 1)
    // 1920 − 280（舞台 1640）× 30% = 492 中栏 → 右栏拿 1640 − 492 = 1148。
    assert.equal(layout.calls[0].width, 1148)
    assert.equal(layout.calls[0].viewport, 1920, '夹紧视口必须与外壳同口径（frame 实测宽，退化时取窗口宽）')
  })

  it('is idempotent: a second reconcile with the same geometry writes nothing', () => {
    setupWindow(1920)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    const env = { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }

    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'written')
    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'consistent')
    assert.equal(layout.calls.length, 1, '几何不变时不得重复写外壳面板宽（与 frame 观察者形成自激）')
  })

  it('follows the viewport on resize, keeping the three columns summing to the viewport', () => {
    const dom = setupWindow(1920)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    const env = { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }

    reconcileRightbarFromRatio(makeState(), env)
    assert.equal(layout.calls.at(-1).width, 1148)

    // 1920 → 2560：中栏 492 → 684，右栏 1148 → 1596，三栏之和 = 视口。
    Object.defineProperty(dom.window, 'innerWidth', { value: 2560, configurable: true, writable: true })
    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'written')
    assert.equal(layout.calls.at(-1).width, 1596)
    assert.equal(RAIL_PX + 684 + 1596, 2560, '任一时刻三栏之和必须等于视口')

    // 2560 → 1440：中栏被 360px 下限夹住，右栏拿物理余量 1160 − 360 = 800。
    Object.defineProperty(dom.window, 'innerWidth', { value: 1440, configurable: true, writable: true })
    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'written')
    assert.equal(layout.calls.at(-1).width, 800)
    assert.equal(RAIL_PX + 360 + 800, 1440, '小屏同样不得留下黑边死区')
  })

  it('leaves the shell panel width equal to the real column boundary, so a drag right after a resize starts without a jump', () => {
    const dom = setupWindow(1920)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    const env = { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }

    Object.defineProperty(dom.window, 'innerWidth', { value: 2560, configurable: true, writable: true })
    reconcileRightbarFromRatio(makeState(), env)

    // 外壳拖拽以 `panels.rightbar` 为起点（delta 模型）：起点必须就是真实列边界。
    const snapshot = layout.getSnapshot()
    const conversationPx = 684
    assert.equal(
      snapshot.rightbar,
      2560 - RAIL_PX - conversationPx,
      '缩放后立即拖拽时，外壳起点必须等于「视口 − 左栏 − 中栏」，否则首帧跳变',
    )
  })

  it('never writes while the shell splitter is being dragged', () => {
    const dom = setupWindow(1920)
    dom.window.document.body.setAttribute('data-dsh-sidebar-dragging', '')
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split

    assert.equal(
      reconcileRightbarFromRatio(makeState(), { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }),
      'skipped',
    )
    assert.equal(layout.calls.length, 0, '拖拽期外壳 authored 几何是权威，代写面板宽会与指针抢同一根轨道')
  })

  it('skips the single-column states that are not ratio-driven (D6)', () => {
    setupWindow(1920)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    const env = { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }

    assert.equal(reconcileRightbarFromRatio(makeState({ panelOpen: false }), env), 'skipped', '面板收起时不写')

    const guiLayout = createShellLayout()
    bindWorkbenchDeps({ layout: guiLayout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.gui
    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'skipped', 'gui 全屏单栏态不比例化')
    assert.equal(guiLayout.calls.length, 0)

    // 右栏处于全屏（overlay）时也不写：那时面板不占网格轨道。
    bindWorkbenchDeps({ layout: createShellLayout({ rightbarFullscreen: true }) })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    assert.equal(reconcileRightbarFromRatio(makeState(), env), 'skipped')
  })

  it('skips when the shell layout handle is unavailable instead of guessing geometry', () => {
    setupWindow(1920)
    bindWorkbenchDeps({ layout: null })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split

    assert.equal(
      reconcileRightbarFromRatio(makeState(), { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX, chatRatio: RATIO }),
      'skipped',
    )
  })

  it('reads the persisted ratio so the panel matches the published conversation column', () => {
    const dom = setupWindow(1920)
    writeChatRatio(0.5)
    const layout = createShellLayout()
    bindWorkbenchDeps({ layout })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split

    // 不注入 chatRatio：协调写必须与顶栏走同一个持久化真源，否则两侧算的是两个比例。
    assert.equal(reconcileRightbarFromRatio(makeState(), { sessionId: SESSION_ID, officialSidebarWidth: RAIL_PX }), 'written')
    assert.equal(layout.calls.at(-1).width, 1640 - 820, '舞台 1640 × 50% = 820 中栏 → 右栏 820')
    assert.ok(dom.window.localStorage.getItem('omnimux.conversationRatio'))
  })

  it('keeps the legacy healthy-width fallback from fighting the ratio writer', () => {
    setupWindow(1920)
    const layout = createShellLayout({ rightbar: 300 })
    bindWorkbenchDeps({ layout })
    // 生产路径里状态来自已 attach 的 tab store；健康宽度兜底同样读它。
    setAttachedStore({ getSnapshot: () => ({ sessionId: SESSION_ID, state: makeState() }) })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
    writeChatRatio(RATIO)

    ensureHealthySplitWidth(globalThis.document)

    assert.equal(layout.calls.length, 1, '健康宽度兜底不得在比例权威适用时另写一次')
    assert.equal(layout.calls[0].width, 1148, '写进去的必须是比例余量，而不是视口 45% 的健康宽度')
  })

  it('falls back to the healthy width only when no ratio authority applies', () => {
    setupWindow(1920)
    const layout = createShellLayout({ rightbar: 300, rightbarShown: false })
    bindWorkbenchDeps({ layout })
    setAttachedStore({ getSnapshot: () => ({ sessionId: SESSION_ID, state: makeState() }) })
    focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split

    ensureHealthySplitWidth(globalThis.document)

    // 面板未展开：比例权威不适用，此时才允许走「健康宽度」兜底（视口 45% 且不低于 500）。
    assert.equal(layout.calls.length, 1)
    assert.equal(layout.calls[0].width, Math.max(500, Math.round(1920 * 0.45)))
  })
})
