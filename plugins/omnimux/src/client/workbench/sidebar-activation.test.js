/**
 * 左侧栏激活仲裁真值表与不变量（#rail-active-state-convergence）。
 *
 * 覆盖：纯裁决函数、宿主页签键三级映射、会话行真源读取（含搜索态排除）、
 * 信号采集，以及仲裁器在真实 DOM 上的互斥投影（INV-1/3/4/5）。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { CONVERSATION_COLLAPSED_ATTR } from '../conversation-collapse.js'
import { bindWorkbenchDeps, resetWorkbenchHostAdapter } from './host-adapter.js'
import {
  IDLE_VERDICT,
  RAIL_TAB_IDS,
  SidebarActivationArbiter,
  SESSION_ROW_SELECTOR,
  getRailVerdict,
  installSidebarActivation,
  isRailRowActive,
  isRailVerdictRow,
  mapNativeTabKeyToRailTab,
  readSelectedSessionRows,
  readSidebarActivationSignals,
  requestRailActivationSync,
  resetSidebarActivationForTests,
  resolveSidebarActiveTarget,
} from './sidebar-activation.js'

const CLIP = 'omnimux-clip:studio'
const ASSETS = 'omnimux-assets:library'

const PAGE = `<!doctype html><html><body>
  <div class="dshDesktopFrame">
    <div class="dsh_sidebarCol_x" data-pane="sidebar">
      <div role="tree" aria-label="Sessions">
        <div role="treeitem" id="row-a" aria-selected="true"></div>
        <div role="treeitem" id="row-b" aria-selected="false"></div>
      </div>
    </div>
    <div class="centerCol" data-slot="conversation"></div>
    <div data-sidebar-right-panel="push" data-sidebar-right-open></div>
  </div>
</body></html>`

const previousWindow = globalThis.window
const previousDocument = globalThis.document
/** @type {JSDOM | undefined} */
let dom

afterEach(() => {
  resetSidebarActivationForTests()
  resetWorkbenchHostAdapter()
  dom?.window.close()
  dom = undefined
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

/**
 * 建一个带官方三栏骨架的 jsdom，并把会话列宽度固定为可测值。
 * @param {{ columnWidth?: number, html?: string }} [options]
 */
function setupDom(options = {}) {
  const { columnWidth = 720, html = PAGE } = options
  dom = new JSDOM(html)
  const doc = dom.window.document
  const column = doc.querySelector('[data-slot="conversation"]')
  if (column) {
    column.getBoundingClientRect = () => ({
      width: columnWidth,
      height: 800,
      top: 0,
      left: 220,
      right: 220 + columnWidth,
      bottom: 800,
      x: 220,
      y: 0,
      toJSON() {},
    })
  }
  globalThis.window = dom.window
  globalThis.document = doc
  return doc
}

/** 官方右栏读面替身：`ctx.sidebarRight` 的最小公开面。 */
function makeSidebarRight({ expanded = true, kind } = {}) {
  return {
    isExpanded: () => expanded,
    active: () => (kind ? { id: `tab:${kind}`, kind, title: 'x' } : null),
  }
}

function resetSessionRows(doc) {
  for (const row of doc.querySelectorAll('[role="treeitem"]')) {
    row.setAttribute('aria-selected', 'false')
  }
}

function selectSessionRow(doc, index = 0) {
  const rows = doc.querySelectorAll('[data-pane="sidebar"] [role="treeitem"]')
  rows[index].setAttribute('aria-selected', 'true')
}

/** 当前所有左栏行的激活集合（互斥断言的事实来源）。 */
function activeRailRows() {
  return RAIL_TAB_IDS.filter((tabId) => isRailRowActive(tabId))
}

/* ------------------------------------------------------------ 纯裁决函数 */

test('rule 1: a selected session row plus a visible conversation column wins for the session', () => {
  const verdict = resolveSidebarActiveTarget({ selectedSessionRows: 1, conversationVisible: true })
  assert.equal(verdict.winner, 'session')
  assert.equal(verdict.reason, 'session-wins')
  assert.equal(isRailVerdictRow(verdict, CLIP), false)
  assert.equal(isRailVerdictRow(verdict, ASSETS), false)
})

test('rule 1 outranks a focused workbench tab: plugins must go dark', () => {
  const verdict = resolveSidebarActiveTarget({
    selectedSessionRows: 1,
    conversationVisible: true,
    panelExpanded: true,
    activeTabKey: CLIP,
  })
  assert.equal(verdict.winner, 'session')
  assert.equal(isRailVerdictRow(verdict, CLIP), false)
})

test('rule 1 does not fire when the conversation column is not visible', () => {
  for (const extra of [{ conversationVisible: false }, {}]) {
    const verdict = resolveSidebarActiveTarget({
      selectedSessionRows: 1,
      panelExpanded: true,
      activeTabKey: CLIP,
      ...extra,
    })
    assert.equal(verdict.winner, 'row')
    assert.equal(verdict.tabId, CLIP)
  }
  assert.equal(resolveSidebarActiveTarget({ selectedSessionRows: 1 }).winner, 'none')
})

test('rule 2: the focused native tab owns the slot, and only that row', () => {
  const verdict = resolveSidebarActiveTarget({
    selectedSessionRows: 0,
    conversationVisible: false,
    panelExpanded: true,
    activeTabKey: CLIP,
  })
  assert.equal(verdict.winner, 'row')
  assert.equal(verdict.reason, 'focused-tab')
  assert.equal(isRailVerdictRow(verdict, CLIP), true)
  assert.equal(isRailVerdictRow(verdict, ASSETS), false)
  assert.equal(isRailVerdictRow(verdict, undefined), false)
})

test('rule 3: no map-able tab, or a closed panel, yields no activation at all', () => {
  const unmapped = resolveSidebarActiveTarget({ panelExpanded: true, activeTabKey: 'tab:5' })
  assert.deepEqual(unmapped, { winner: 'none', reason: 'tab-has-no-rail-row' })
  assert.equal(resolveSidebarActiveTarget({ panelExpanded: true }).winner, 'none')
  assert.equal(resolveSidebarActiveTarget({ panelExpanded: true }).reason, 'idle')
  // Tab 存在但面板未展开：绝不回退成 active（isOpen 回退已删除）。
  assert.deepEqual(resolveSidebarActiveTarget({ panelExpanded: false, activeTabKey: CLIP }), IDLE_VERDICT)
})

test('multiple selected rows still resolve to the session and are flagged', () => {
  const verdict = resolveSidebarActiveTarget({ selectedSessionRows: 2, conversationVisible: true })
  assert.equal(verdict.winner, 'session')
  assert.equal(verdict.detail, 'multiple-selected-rows')
})

test('native tab keys map through the three-tier tolerance', () => {
  assert.equal(mapNativeTabKeyToRailTab(CLIP), CLIP)
  assert.equal(mapNativeTabKeyToRailTab(' 项目 '), 'omnimux-workflow:library')
  assert.equal(mapNativeTabKeyToRailTab('资产库'), ASSETS)
  assert.equal(mapNativeTabKeyToRailTab('tab:5'), undefined)
  assert.equal(mapNativeTabKeyToRailTab(''), undefined)
  assert.equal(mapNativeTabKeyToRailTab(undefined), undefined)
})

/* -------------------------------------------------------------- 信号读取 */

test('selected session rows are read from the official left column only', () => {
  const doc = setupDom({
    html: `<!doctype html><html><body>
      <div class="dsh_sidebarCol_x" data-pane="sidebar">
        <div role="treeitem" aria-selected="true"></div>
      </div>
      <div class="somewhereElse" role="treeitem" aria-selected="true"></div>
      <div class="centerCol" data-slot="conversation"></div>
    </body></html>`,
  })
  assert.equal(readSelectedSessionRows(doc).count, 1)
  assert.equal(readSelectedSessionRows(doc).scoped, true)
})

test('search-result tree rows are excluded from the session count', () => {
  const doc = setupDom({
    html: `<!doctype html><html><body>
      <div class="dsh_sidebarCol_x" data-pane="sidebar">
        <div role="treeitem" aria-selected="false"></div>
        <div class="searchResults">
          <div role="treeitem" aria-selected="true"></div>
          <div role="treeitem" aria-selected="true"></div>
        </div>
      </div>
      <div class="centerCol" data-slot="conversation"></div>
    </body></html>`,
  })
  assert.equal(readSelectedSessionRows(doc).count, 0)
  assert.equal(doc.querySelectorAll(SESSION_ROW_SELECTOR).length, 2)
})

test('signals join the semantic key, the geometry key and the host fullscreen key', () => {
  const doc = setupDom()
  const deps = { sidebarRight: makeSidebarRight({ expanded: true, kind: CLIP }) }
  const visible = readSidebarActivationSignals(doc, deps)
  assert.equal(visible.selectedSessionRows, 1)
  assert.equal(visible.conversationVisible, true)
  assert.equal(visible.panelExpanded, true)
  assert.equal(visible.activeTabKey, CLIP)
  assert.equal(visible.panelSource, 'native')

  const collapsedDoc = setupDom()
  collapsedDoc.documentElement.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  assert.equal(readSidebarActivationSignals(collapsedDoc, deps).conversationVisible, false)

  const fullscreenHtml = PAGE.replace('data-sidebar-right-panel="push"', 'data-sidebar-right-panel="fullscreen"')
  const fullscreenDoc = setupDom({ html: fullscreenHtml })
  const fullscreen = readSidebarActivationSignals(fullscreenDoc, deps)
  assert.equal(fullscreen.fullscreen, true)
  // 全屏盖住中间栏时，会话列即使仍有宽度也不可见。
  assert.equal(fullscreen.columnWidth > 0, true)
  assert.equal(fullscreen.conversationVisible, false)
})

test('zero-width conversation column keeps the session rule off', () => {
  const doc = setupDom({ columnWidth: 0 })
  const signals = readSidebarActivationSignals(doc, { sidebarRight: makeSidebarRight({ kind: CLIP }) })
  assert.equal(signals.columnWidth, 0)
  assert.equal(signals.conversationVisible, false)
})

test('without a native reader the panel still reports expansion but never invents a tab id', () => {
  const doc = setupDom()
  resetSessionRows(doc)
  const signals = readSidebarActivationSignals(doc, { sidebarRight: null })
  assert.equal(signals.panelExpanded, true)
  assert.equal(signals.activeTabKey, undefined)
  assert.equal(signals.panelSource, 'dom')
  assert.equal(resolveSidebarActiveTarget(signals).winner, 'none')
})

/* ---------------------------------------------------------- 仲裁器与不变量 */

test('arbiter projects one exclusive slot onto every rail row (INV-1/3/4/5)', () => {
  const doc = setupDom()
  let notifies = 0
  const dispose = installSidebarActivation({
    document: doc,
    deps: { sidebarRight: makeSidebarRight({ expanded: true, kind: CLIP }) },
    notify: () => { notifies += 1 },
  })

  // 会话行选中 + 中间栏可见 ⇒ 会话优先，所有插件行熄灭（INV-3）。
  assert.equal(getRailVerdict().winner, 'session')
  assert.deepEqual(activeRailRows(), [])
  assert.equal(isRailRowActive(CLIP), false)

  // 全屏 + 面板展开 ⇒ 恰好 1 个插件行高亮（INV-5）。
  resetSessionRows(doc)
  doc.querySelector('[data-sidebar-right-panel]').setAttribute('data-sidebar-right-panel', 'fullscreen')
  requestRailActivationSync()
  assert.deepEqual(activeRailRows(), [CLIP])
  assert.equal(getRailVerdict().reason, 'focused-tab')

  // 面板未展开 ⇒ 无激活项（INV-4）。
  const disposeFullscreen = dispose
  disposeFullscreen()
  installSidebarActivation({
    document: doc,
    deps: { sidebarRight: makeSidebarRight({ expanded: false, kind: CLIP }) },
    notify: () => { notifies += 1 },
  })
  doc.querySelector('[data-sidebar-right-panel]').removeAttribute('data-sidebar-right-open')
  requestRailActivationSync()
  assert.deepEqual(activeRailRows(), [])
  assert.equal(notifies > 0, true)
})

test('arbiter notifies once per verdict change and stays quiet on repeats', () => {
  const doc = setupDom()
  const events = []
  installSidebarActivation({
    document: doc,
    deps: { sidebarRight: makeSidebarRight({ expanded: true, kind: CLIP }) },
    notify: () => events.push('change'),
  })
  assert.equal(events.length, 1)

  resetSessionRows(doc)
  doc.querySelector('[data-sidebar-right-panel]').removeAttribute('data-sidebar-right-open')
  requestRailActivationSync()
  assert.equal(events.length, 2)

  requestRailActivationSync()
  assert.equal(events.length, 2)
})

test('arbiter reports the first row when several session rows are selected', () => {
  const doc = setupDom()
  selectSessionRow(doc, 1)
  const arbiter = new SidebarActivationArbiter({ document: doc, deps: {}, notify: () => {} })
  arbiter.install()
  const verdict = arbiter.getVerdict()
  assert.equal(verdict.winner, 'session')
  assert.equal(arbiter.getSignals().selectedSessionRows, 2)
  arbiter.dispose()
})

test('arbiter reads panel state from ctx.sidebarRight when bound on the host adapter', () => {
  const doc = setupDom()
  resetSessionRows(doc)
  bindWorkbenchDeps({ sidebarRight: makeSidebarRight({ expanded: true, kind: ASSETS }) })
  installSidebarActivation({ document: doc, notify: () => {} })
  assert.deepEqual(activeRailRows(), [ASSETS])
  assert.equal(isRailRowActive(ASSETS, doc), true)
})

test('disposing the arbiter leaves no global reader behind', () => {
  const doc = setupDom()
  const dispose = installSidebarActivation({ document: doc, deps: {}, notify: () => {} })
  dispose()
  // 卸载后没有文档可读时，读数退回无激活项，而不是抛错或残留旧裁决。
  delete globalThis.document
  delete globalThis.window
  assert.deepEqual(activeRailRows(), [])
  assert.equal(getRailVerdict(), IDLE_VERDICT)
})

test('arbiter without a document is inert instead of throwing', () => {
  delete globalThis.document
  delete globalThis.window
  assert.equal(isRailRowActive(CLIP), false)
  assert.equal(requestRailActivationSync(), false)
  const arbiter = new SidebarActivationArbiter({ notify: () => {} })
  arbiter.install()
  assert.equal(arbiter.isRowActive(CLIP), false)
  assert.equal(arbiter.getSignals().conversationVisible, false)
  arbiter.dispose()
})
