import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  WORKBENCH_CONVERSATION_MIN_PX,
  WORKBENCH_FOCUS,
  WORKBENCH_PANEL_ATTR,
  WORKBENCH_SPLIT_MIN_CSS,
  WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX,
  WORKBENCH_LEFT_RAIL_COLLAPSED_MAX_PX,
  WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX,
  WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX,
  WORKBENCH_OCCUPANTS,
  WORKBENCH_TAB_TITLE_FALLBACKS,
  activeTabId,
  applyDefaultWidth,
  clampSplitPanelWidth,
  collapsedLeftRailFallbackPx,
  collectTabs,
  createWorkbenchSidebarStore,
  findOfficialSidebarColumn,
  findWorkbenchPanelElement,
  inferWorkbenchFocus,
  installSplitConversationMin,
  installWorkbenchGlobal,
  isOfficialSidebarCollapsed,
  isSeedFilesTab,
  isWorkbenchActive,
  isWorkbenchOpen,
  isWorkbenchTab,
  officialSessionSidebarWidth,
  openWorkbench,
  releaseCurrentProductStage,
  resetWorkbenchForTests,
  resolveDefaultFocus,
  resolveWorkbenchTabTitle,
  focusRecordForTab,
  getConversationCollapsed,
  getWorkbenchFocus,
  setConversationCollapsed,
  setWorkbenchFocus,
  syncSplitMaxCssVar,
  syncWorkbenchGuiWidth,
  tabIsOpen,
  workbenchDefaultWidthPx,
  workbenchGuiWidthPx,
  workbenchSplitMaxPanelPx,
} from './workbench.js'

/** Match workbench column / collapsed-host selectors used by live DOM probes. */
function selIsSidebarColumn(sel) {
  return typeof sel === 'string' && (
    sel.includes('sidebarCol')
    || sel.includes('dshDesktopSidebarSurface')
    || sel.includes('data-pane="sidebar"')
  )
}

function selIsCollapsedAttr(sel) {
  return typeof sel === 'string' && sel.includes('data-sidebar-collapsed')
}

const previousWindow = globalThis.window
const previousDocument = globalThis.document
let workbenchDom

afterEach(() => {
  resetWorkbenchForTests(globalThis.window)
  workbenchDom?.window.close()
  workbenchDom = undefined
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

function makeState(tabs = [], width = 780, panelOpen = true) {
  return {
    width,
    panelOpen,
    activePane: 'main',
    splits: {
      kind: 'leaf',
      id: 'main',
      tabs,
    },
  }
}

function setupWindow() {
  const cssVars = new Map()
  const headChildren = []
  const listeners = {}
  const doc = {
    documentElement: {
      dataset: {},
      style: {
        setProperty(k, v) { cssVars.set(k, String(v)) },
        removeProperty(k) { cssVars.delete(k) },
        getPropertyValue(k) { return cssVars.has(k) ? cssVars.get(k) : '' },
      },
    },
    head: {
      append(node) { headChildren.push(node) },
    },
    body: {
      dataset: {},
      _attrs: new Set(),
      hasAttribute(a) { return this._attrs.has(a) },
      setAttribute(a) { this._attrs.add(a) },
      removeAttribute(a) { this._attrs.delete(a) },
    },
    getElementById(id) { return headChildren.find((n) => n.id === id) || null },
    createElement(tag) {
      return { tagName: String(tag).toUpperCase(), id: '', textContent: '' }
    },
    querySelector: () => null,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) {
      const list = listeners[type] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
  }
  const win = {
    innerWidth: 1200,
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    localStorage: {
      _data: new Map(),
      getItem(k) { return this._data.get(k) ?? null },
      setItem(k, v) { this._data.set(k, String(v)) },
      removeItem(k) { this._data.delete(k) },
    },
  }
  globalThis.window = win
  globalThis.document = doc
  return win
}

test('collectTabs / isSeedFilesTab / tabIsOpen walk split trees', () => {
  const node = {
    kind: 'split',
    children: [
      { kind: 'leaf', tabs: [{ id: 't1', type: 'editor', path: '' }] },
      { kind: 'leaf', tabs: [{ id: 't2', type: 'omnimux-assets:library' }] },
    ],
  }
  const tabs = collectTabs(node)
  assert.equal(tabs.length, 2)
  assert.equal(isSeedFilesTab(tabs[0]), true)
  assert.equal(isSeedFilesTab(tabs[1]), false)
  assert.equal(tabIsOpen({ splits: node }, 'omnimux-assets:library'), true)
  assert.equal(tabIsOpen({ splits: node }, 'omnimux-clip:studio'), false)
})

test('default focus matrix: canvas defaults to split, all 9 libraries default to gui', () => {
  assert.equal(resolveDefaultFocus('omnimux-workflow:canvas'), WORKBENCH_FOCUS.split)
  const libraries = [
    'omnimux-clip:studio',
    'omnimux-assets:library',
    'omnimux-products:library',
    'omnimux-accounts:library',
    'omnimux-inspiration:library',
    'omnimux-publish:library',
    'omnimux-analytics:library',
    'omnimux-workflow:library',
    'omnimux-market:plaza',
  ]
  for (const lib of libraries) {
    assert.equal(resolveDefaultFocus(lib), WORKBENCH_FOCUS.gui, `${lib} must default to gui`)
    assert.ok(isWorkbenchTab(lib), `${lib} must be recognized as workbench tab`)
  }
  assert.equal(WORKBENCH_OCCUPANTS.length, 10)
})

test('workbenchDefaultWidthPx keeps ~420px for conversation', () => {
  assert.equal(workbenchDefaultWidthPx(makeState([], 780), { viewportWidth: 1200 }), 780)
  assert.equal(workbenchDefaultWidthPx(makeState([], 780), { viewportWidth: 600 }), 280)
})

test('releaseCurrentProductStage drops a library overlay without claiming', () => {
  const win = setupWindow()
  let released = null
  win.__omnimuxStage = {
    release(id) { released = id },
  }
  win.document.documentElement.dataset.dshProductStage = 'omnimux-assets-stage'
  const dropped = releaseCurrentProductStage()
  assert.equal(dropped, true)
  assert.equal(released, 'omnimux-assets-stage')
  assert.equal(win.document.documentElement.dataset.dshProductStage, undefined)
})

test('installWorkbenchGlobal is idempotent and never claims a product stage', () => {
  const win = setupWindow()
  const api1 = installWorkbenchGlobal(win)
  const api2 = installWorkbenchGlobal(win)
  assert.equal(api1, api2)
  assert.equal(win.__omnimuxWorkbench, api1)
  assert.equal(win.document.documentElement.dataset.dshProductStage, undefined)
})

test('openWorkbench returns false without better-sidebar and does not throw', async () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  const ok = await api.open({ tabId: 'omnimux-assets:library', timeoutMs: 0 })
  assert.equal(ok, false)
})

test('bind removes the default Files seed when a new session snapshot materializes', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let snapshot = { sessionId: undefined, state: undefined }
  let notifyState = () => {}
  const closed = []
  const service = {
    getSnapshot() { return snapshot },
    subscribeState(listener) {
      notifyState = listener
      return () => {}
    },
    closeTab(id, scope) { closed.push({ id, scope }) },
  }

  api.bind({ betterSidebar: service })
  snapshot = {
    sessionId: 's-new',
    state: makeState([{ id: 'tab:seed', type: 'editor', title: 'Files', meta: { treeOpen: true } }]),
  }
  notifyState()

  assert.deepEqual(closed, [{ id: 'tab:seed', scope: { sessionId: 's-new' } }])
})

test('bind removes the default Files seed from an already materialized new-session snapshot', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  const closed = []
  api.bind({
    betterSidebar: {
      getSnapshot() {
        return {
          sessionId: 's-ready',
          state: makeState([{ id: 'tab:ready-seed', type: 'editor', title: 'Files' }]),
        }
      },
      subscribeState() { return () => {} },
      closeTab(id, scope) { closed.push({ id, scope }) },
    },
  })

  assert.deepEqual(closed, [{ id: 'tab:ready-seed', scope: { sessionId: 's-ready' } }])
})

test('bind preserves an existing persisted layout even when it contains only Files', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  win.localStorage.setItem('dsh-sidebar:v1:s-saved', JSON.stringify({ panelOpen: true }))
  const closed = []
  api.bind({
    betterSidebar: {
      getSnapshot() {
        return {
          sessionId: 's-saved',
          state: makeState([{ id: 'tab:saved-files', type: 'editor', title: 'Files' }]),
        }
      },
      subscribeState() { return () => {} },
      closeTab(id, scope) { closed.push({ id, scope }) },
    },
  })

  assert.deepEqual(closed, [])
})

test('default seed cleanup is once per session so a user-opened Files tab stays open', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let snapshot = {
    sessionId: 's-reopen',
    state: makeState([{ id: 'tab:initial-seed', type: 'editor', title: 'Files' }]),
  }
  let notifyState = () => {}
  const closed = []
  const service = {
    getSnapshot() { return snapshot },
    subscribeState(listener) {
      notifyState = listener
      return () => {}
    },
    closeTab(id, scope) {
      closed.push({ id, scope })
      snapshot = { ...snapshot, state: makeState([]) }
      notifyState()
    },
  }

  api.bind({ betterSidebar: service })
  assert.deepEqual(closed.map((entry) => entry.id), ['tab:initial-seed'])

  snapshot = {
    ...snapshot,
    state: makeState([{ id: 'tab:user-files', type: 'editor', title: 'Files' }]),
  }
  notifyState()
  assert.deepEqual(closed.map((entry) => entry.id), ['tab:initial-seed'])
})

test('default seed cleanup safely ignores no-session and non-seed snapshots', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let snapshot = { sessionId: undefined, state: undefined }
  let notifyState = () => {}
  const closed = []
  const service = {
    getSnapshot() { return snapshot },
    subscribeState(listener) {
      notifyState = listener
      return () => {}
    },
    closeTab(id) { closed.push(id) },
  }

  api.bind({ betterSidebar: service })
  notifyState()
  assert.deepEqual(closed, [])

  snapshot = {
    sessionId: 's-empty',
    state: makeState([]),
  }
  notifyState()
  assert.deepEqual(closed, [])

  snapshot = {
    sessionId: 's-non-seed',
    state: makeState([{ id: 'editor:/tmp/a.ts', type: 'editor', title: 'a.ts', path: '/tmp/a.ts' }]),
  }
  notifyState()
  assert.deepEqual(closed, [])

  snapshot = {
    sessionId: 's-non-seed',
    state: makeState([{ id: 'tab:user-files', type: 'editor', title: 'Files' }]),
  }
  notifyState()
  assert.deepEqual(closed, [], 'a session already classified as non-seed must not be watched forever')
})

test('default seed cleanup is a safe no-op when storage or service capabilities are unavailable', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  Object.defineProperty(win, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage unavailable') },
  })

  assert.doesNotThrow(() => {
    api.bind({
      betterSidebar: {
        getSnapshot() {
          return {
            sessionId: 's-no-storage',
            state: makeState([{ id: 'tab:seed', type: 'editor', title: 'Files' }]),
          }
        },
        subscribeState() { return () => {} },
        closeTab() { throw new Error('must not close without a reliable storage decision') },
      },
    })
  })

  assert.doesNotThrow(() => {
    api.bind({
      betterSidebar: {
        getSnapshot() { throw new Error('snapshot unavailable') },
        subscribeState() { throw new Error('subscription unavailable') },
      },
    })
  })

  assert.doesNotThrow(() => {
    api.bind({
      betterSidebar: {
        getSnapshot() {
          return {
            sessionId: 's-no-close-capability',
            state: makeState([{ id: 'tab:seed', type: 'editor', title: 'Files' }]),
          }
        },
      },
    })
  })
})

test('bind is idempotent and subscribes to one better-sidebar service only once', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let subscriptions = 0
  const service = {
    getSnapshot() { return { sessionId: undefined, state: undefined } },
    subscribeState() {
      subscriptions += 1
      return () => {}
    },
  }

  api.bind({ betterSidebar: service })
  api.bind({ betterSidebar: service })
  assert.equal(subscriptions, 1)
})

test('openWorkbench without current session does not create a session or claim overlay', async () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let claimed = 0
  let created = 0
  win.__omnimuxStage = { claim() { claimed += 1 } }
  const opened = []
  const state = makeState([])
  // Minimal body so nudgeWorkbenchNeedsSession can mount a status toast.
  win.document.body = {
    appendChild(node) {
      this._kids = this._kids || []
      this._kids.push(node)
      return node
    },
  }
  win.document.getElementById = () => null
  win.document.createElement = (tag) => ({
    tagName: String(tag).toUpperCase(),
    id: '',
    style: { cssText: '' },
    setAttribute() {},
    remove() {},
    textContent: '',
  })
  win.document.querySelector = () => null
  win.setTimeout = () => 0
  api.bind({
    betterSidebar: {
      openTab(seed, scope) { opened.push({ seed, scope }) },
      getTab() { return { id: 'omnimux-clip:studio' } },
      getSnapshot() { return { state } },
    },
    sessions: {
      list: { getSnapshot: () => ({ current: undefined }) },
      create: async () => { created += 1; throw new Error('no workspace') },
    },
  })
  const ok = await api.open({ tabId: 'omnimux-clip:studio', timeoutMs: 0 })
  assert.equal(ok, false, 'returns false when no session is active')
  assert.equal(opened.length, 0)
  assert.equal(created, 0)
  assert.equal(claimed, 0)
  const kids = win.document.body._kids || []
  assert.equal(kids.length, 1, 'shows needs-session status toast')
  assert.equal(kids[0].id, 'omnimux-workbench-needs-session')
  assert.match(String(kids[0].textContent || ''), /工作区|会话/)
})

test('openWorkbench switches focus mode to default per tab without cross-tab leakage', async () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let state = makeState([{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }], 780, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's1', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const opened = []
  api.bind({
    betterSidebar: {
      openTab(seed, scope) {
        opened.push({ seed, scope })
        state = {
          ...state,
          splits: {
            kind: 'leaf',
            id: 'main',
            active: seed.id,
            tabs: [{ id: seed.id, type: seed.type }],
          },
        }
      },
      getTab(id) { return { id } },
      getSnapshot() { return { sessionId: 's1', state } },
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 's1' }) },
    },
  })
  api.attachStore(store)

  // 1. Open canvas -> defaults to split
  await api.open({ tabId: 'omnimux-workflow:canvas', timeoutMs: 0 })
  assert.equal(api.getFocus(), WORKBENCH_FOCUS.split)
  assert.equal(state.width, 780)

  // 2. Open assets library -> defaults to gui
  await api.open({ tabId: 'omnimux-assets:library', timeoutMs: 0 })
  assert.equal(api.getFocus(), WORKBENCH_FOCUS.gui)
  assert.equal(state.width, 1200)

  // 3. Switch back to canvas -> split
  await api.open({ tabId: 'omnimux-workflow:canvas', timeoutMs: 0 })
  assert.equal(api.getFocus(), WORKBENCH_FOCUS.split)
})

test('applyDefaultWidth writes via store.reduce and skips a second write', () => {
  setupWindow()
  let state = makeState([{ id: 't1', type: 't1' }], 500, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's1', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const applied1 = applyDefaultWidth(null, 's1', store, { viewportWidth: 1200 })
  assert.equal(applied1, 780)
  assert.equal(state.width, 780)

  state.width = 600
  const applied2 = applyDefaultWidth(null, 's1', store, { viewportWidth: 1200 })
  assert.equal(applied2, null)
  assert.equal(state.width, 600)
})

test('workbenchGuiWidthPx occupies viewport minus the left rail', () => {
  assert.equal(workbenchGuiWidthPx(makeState([], 780), { viewportWidth: 1200, officialSidebarWidth: 0 }), 1200)
  assert.equal(workbenchGuiWidthPx(makeState([], 780), { viewportWidth: 1200, officialSidebarWidth: 280 }), 920)
  assert.equal(workbenchGuiWidthPx(makeState([], 780), { viewportWidth: 300, officialSidebarWidth: 0 }), 300)
})

test('officialSessionSidebarWidth falls back when expanded rail is crushed to rail size', () => {
  const column = {
    getBoundingClientRect: () => ({ width: 56 }),
    closest() { return null },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      if (selIsCollapsedAttr(sel)) return null
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = { document: doc }
  // Seed a healthy expanded width first.
  assert.equal(officialSessionSidebarWidth({ officialSidebarWidth: 280 }), 280)
  assert.equal(officialSessionSidebarWidth(), WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX)
  assert.equal(
    workbenchGuiWidthPx(makeState([], 1672), { viewportWidth: 1728 }),
    1728 - WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX,
  )
})

test('officialSessionSidebarWidth ignores mid-animation widths below expanded min (#356)', () => {
  let liveWidth = 80
  const column = {
    getBoundingClientRect: () => ({ width: liveWidth }),
    closest() { return null },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      if (selIsCollapsedAttr(sel)) return null
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = { document: doc }
  assert.equal(officialSessionSidebarWidth({ officialSidebarWidth: 280 }), 280)
  // Expand tween 80px must not replace the healthy 280 seed.
  assert.ok(liveWidth < WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX)
  assert.equal(officialSessionSidebarWidth(), 280)
  assert.equal(workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }), 1448)
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 280)
})

test('collapsedLeftRailFallbackPx is 0 when topbar sidebar-toggle feature is on', () => {
  const doc = {
    documentElement: {
      hasAttribute(name) {
        return name === 'data-omnimux-sidebar-toggle-topbar'
      },
    },
  }
  assert.equal(collapsedLeftRailFallbackPx(doc), 0)
  assert.equal(collapsedLeftRailFallbackPx({ documentElement: { hasAttribute: () => false } }), WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX)
  assert.equal(WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX, 56)
})

test('officialSessionSidebarWidth returns 0 when topbar feature on + collapsed (no 56 gutter)', () => {
  let liveWidth = 56
  const frame = { tag: 'frame' }
  const column = {
    getBoundingClientRect: () => ({ width: liveWidth }),
    closest(sel) {
      if (selIsCollapsedAttr(sel)) return frame
      return null
    },
    querySelector() { return null },
  }
  const doc = {
    documentElement: {
      hasAttribute(name) {
        return name === 'data-omnimux-sidebar-toggle-topbar'
      },
    },
    querySelector(sel) {
      if (selIsCollapsedAttr(sel)) return frame
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = { document: doc, innerWidth: 1728 }
  assert.equal(collapsedLeftRailFallbackPx(doc), 0)
  assert.equal(officialSessionSidebarWidth(), 0)
  assert.equal(workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }), 1728)
  // Still-expanded live width while collapsed attr set → also 0 under feature.
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 0)
})

test('officialSessionSidebarWidth uses collapsed rail while attr is set mid-tween', () => {
  let liveWidth = 280
  let collapsedEl = { tag: 'frame' }
  const column = {
    getBoundingClientRect: () => ({ width: liveWidth }),
    closest(sel) {
      if (selIsCollapsedAttr(sel)) return collapsedEl
      return null
    },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      if (selIsCollapsedAttr(sel)) return collapsedEl
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = { document: doc }
  // Seed expanded history so a wrong branch would return 280 and leave a gap.
  assert.equal(officialSessionSidebarWidth({ officialSidebarWidth: 280 }), 280)

  // Collapse attr lands first; track still reports expanded width → collapsed fallback (56),
  // NOT the historic 72 max (that left a permanent 16px panel gutter on the official rail).
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX)
  assert.equal(
    workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }),
    1728 - WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX,
  )

  // Mid-tween below expanded min is trusted (not lastExpanded).
  liveWidth = 120
  assert.equal(officialSessionSidebarWidth(), 120)

  // Real collapsed measure wins once the track finishes and becomes the next fallback.
  liveWidth = 56
  assert.equal(officialSessionSidebarWidth(), 56)
  assert.equal(workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }), 1672)

  // Attr-only frame again after a real 56 measure must keep 56 (no 72 regression gutter).
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 56)
  assert.equal(workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }), 1672)

  // Expand again: attr gone + healthy width restores expanded math.
  collapsedEl = null
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 280)
  assert.equal(workbenchGuiWidthPx(makeState([], 1000), { viewportWidth: 1728 }), 1448)
})

test('gui collapse settle never leaves 16px gutter (panel = viewport − 56)', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }], 1448, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-no-gutter', state }),
    reduce: (fn) => { state = fn(state) },
  }
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(state.width, 1448)

  // Mid-tween collapsed attr with stale expanded live width: fallback 56, not 72.
  // (Live path uses DOM; here we force env after seeding collapsed memory via DOM probe.)
  let liveWidth = 56
  let collapsedEl = { tag: 'frame' }
  const column = {
    getBoundingClientRect: () => ({ width: liveWidth }),
    closest(sel) {
      if (selIsCollapsedAttr(sel)) return collapsedEl
      return null
    },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      if (selIsCollapsedAttr(sel)) return collapsedEl
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = {
    document: doc,
    innerWidth: 1728,
    localStorage: globalThis.window?.localStorage,
  }
  assert.equal(officialSessionSidebarWidth(), 56)

  // Stale store still at expanded gui width — sync must grow to 1672.
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728 })
  assert.equal(synced, true)
  assert.equal(state.width, 1672)

  // Even if live width briefly reports the old COLLAPSED_MAX (72) band as a
  // sub-expanded measure, width stays rail-sized; after real 56 is remembered,
  // a pure expanded-stale frame must not regress to 72.
  liveWidth = 72
  assert.equal(officialSessionSidebarWidth(), 72)
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 72)
  // Force sync with no env override — uses lastCollapsed 72 only if that was
  // last trusted; prefer remembering 56 by re-seeding.
  liveWidth = 56
  assert.equal(officialSessionSidebarWidth(), 56)
  liveWidth = 280
  assert.equal(officialSessionSidebarWidth(), 56)
  syncWorkbenchGuiWidth(store, { viewportWidth: 1728 })
  assert.equal(state.width, 1672)
  assert.equal(getConversationCollapsed(), true)
})

test('syncWorkbenchGuiWidth expands gui when left rail collapses', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1448, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-collapse-fill', state }),
    reduce: (fn) => { state = fn(state) },
  }
  // Gui sized while left rail was expanded (280).
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(state.width, 1448)

  // Left rail collapses to 56 — panel must grow to fill viewport − collapsed rail.
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(synced, true)
  assert.equal(state.width, 1672)
  assert.equal(inferWorkbenchFocus(state, { viewportWidth: 1728, officialSidebarWidth: 56 }), WORKBENCH_FOCUS.gui)

  // Expand again — panel shrinks back so it does not cover the session list.
  const expanded = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(expanded, true)
  assert.equal(state.width, 1448)
})

test('left-rail collapse sync does not call setConversationCollapsed (#372 gate)', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1448, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-no-mid-flip', state }),
    reduce: (fn) => { state = fn(state) },
  }
  api.attachStore(store)
  // Start split with middle visible — left collapse must NOT hide the middle.
  setWorkbenchFocus(WORKBENCH_FOCUS.split, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(getConversationCollapsed(), false)

  let collapseCalls = 0
  const real = api.setConversationCollapsed.bind(api)
  api.setConversationCollapsed = (...args) => {
    collapseCalls += 1
    return real(...args)
  }

  // Oversized panel while split: clamp only.
  state.width = 1448
  syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(collapseCalls, 0, 'left-rail sync must not call setConversationCollapsed')
  assert.equal(getConversationCollapsed(), false)
  assert.equal(focusRecordForTab('s-no-mid-flip', 'omnimux-assets:library').mode, WORKBENCH_FOCUS.split)

  // Gui fill path also must not re-enter setConversationCollapsed.
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  collapseCalls = 0
  syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(collapseCalls, 0, 'gui left-rail fill must not re-call setConversationCollapsed')
  assert.equal(getConversationCollapsed(), true)
  assert.equal(state.width, 1672)
})

test('split + left collapse only clamps; mode stays split; convCollapsed stays false', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1448, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-split-clamp', state }),
    reduce: (fn) => { state = fn(state) },
  }
  setWorkbenchFocus(WORKBENCH_FOCUS.split, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  // Stale oversized panel (gui-sized) while still split intent.
  state.width = 1448
  assert.equal(getConversationCollapsed(), false)

  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(synced, true)
  // split max = max(280, 1728 - 56 - 360) = 1312
  assert.equal(state.width, 1312)
  assert.equal(focusRecordForTab('s-split-clamp', 'omnimux-assets:library').mode, WORKBENCH_FOCUS.split)
  assert.equal(getConversationCollapsed(), false)
})

test('gui + left collapse → width = viewport − collapsedRail', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1448, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-gui-fill', state }),
    reduce: (fn) => { state = fn(state) },
  }
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(state.width, 1448)
  const convBefore = getConversationCollapsed()
  assert.equal(convBefore, true)

  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(synced, true)
  assert.equal(state.width, 1728 - 56)
  // Middle intent unchanged (still collapsed); left-rail sync must not re-enter setConversationCollapsed path.
  assert.equal(getConversationCollapsed(), true)
  assert.equal(focusRecordForTab('s-gui-fill', 'omnimux-assets:library').mode, WORKBENCH_FOCUS.gui)
})

test('isOfficialSidebarCollapsed finds frame-subtree attr via column.closest', () => {
  const frame = { tag: 'frame', hasAttribute: (n) => n === 'data-sidebar-collapsed' }
  const column = {
    getBoundingClientRect: () => ({ width: 56 }),
    closest(sel) {
      if (selIsCollapsedAttr(sel)) return frame
      return null
    },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      // Bare document query would miss if only column.closest works — simulate that.
      if (selIsCollapsedAttr(sel) && !sel.includes('frame') && !sel.includes('dshDesktopFrame')) {
        return null
      }
      if (selIsCollapsedAttr(sel)) return frame
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  assert.equal(isOfficialSidebarCollapsed(doc), true)
})

test('findOfficialSidebarColumn hits dshDesktopSidebarSurface fixture', () => {
  const surface = {
    className: 'dshDesktopSidebarSurface',
    getBoundingClientRect: () => ({ width: 280 }),
    closest() { return null },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      if (typeof sel === 'string' && sel.includes('dshDesktopSidebarSurface')) return surface
      if (selIsSidebarColumn(sel) && sel.includes('sidebarCol')) return null
      return null
    },
  }
  assert.equal(findOfficialSidebarColumn(doc), surface)
})

test('isOfficialSidebarCollapsed ignores phantom attr not above the sidebar column', () => {
  const phantom = { tag: 'DIV', className: '', getBoundingClientRect: () => ({ width: 0 }) }
  const column = {
    getBoundingClientRect: () => ({ width: 280 }),
    closest() { return null },
    querySelector() { return null },
  }
  const doc = {
    querySelector(sel) {
      // Global bare query would return the phantom (the old bug).
      if (sel === '[data-sidebar-collapsed]') return phantom
      if (selIsCollapsedAttr(sel) && sel.includes('frame')) return null
      if (selIsSidebarColumn(sel)) return column
      return null
    },
  }
  globalThis.document = doc
  globalThis.window = { document: doc }
  assert.equal(isOfficialSidebarCollapsed(doc), false)
  assert.equal(officialSessionSidebarWidth({}), 280)
})

test('syncWorkbenchGuiWidth resizes gui panel after left rail width changes', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1672, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-sync-gui', state }),
    reduce: (fn) => { state = fn(state) },
  }
  // Stale gui width as if measured while the left rail was collapsed (56px).
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 56 })
  assert.equal(state.width, 1672)

  // Left rail expands to 280 — sync must shrink the panel so it no longer covers the session list.
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(synced, true)
  assert.equal(state.width, 1448)
  assert.equal(inferWorkbenchFocus(state, { viewportWidth: 1728, officialSidebarWidth: 280 }), WORKBENCH_FOCUS.gui)
})

test('getFocus keeps gui intent when stale collapsed-rail width looks like split (#356)', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 780, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-gui-stale', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const api = installWorkbenchGlobal()
  api.attachStore(store)
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(state.width, 1448)
  // Simulate the live bug: width still sized for the collapsed 56px rail.
  state.width = 1672

  // Geometry alone says split once the left rail is 280 (1672 ≉ 1448).
  assert.equal(
    inferWorkbenchFocus(state, { viewportWidth: 1728, officialSidebarWidth: 280 }),
    WORKBENCH_FOCUS.split,
  )
  // getFocus must not clobber stored gui — otherwise sync no-ops and the panel covers the rail.
  assert.equal(
    getWorkbenchFocus({ viewportWidth: 1728, officialSidebarWidth: 280 }),
    WORKBENCH_FOCUS.gui,
  )
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(synced, true)
  assert.equal(state.width, 1448)
})

test('syncWorkbenchGuiWidth clamps oversized width even after mode was clobbered to split', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 1672, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-clamp-split', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const record = focusRecordForTab('s-clamp-split', 'omnimux-assets:library')
  record.mode = WORKBENCH_FOCUS.split

  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1728, officialSidebarWidth: 280 })
  assert.equal(synced, true)
  // Split clamp keeps the middle conversation column >= 360:
  //   max(280, 1728 - 280 - 360) = 1088
  assert.equal(state.width, 1088)
})

test('syncWorkbenchGuiWidth clamps split width so the conversation column keeps its min (360px)', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }], 900, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-colsplit', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const record = focusRecordForTab('s-colsplit', 'omnimux-workflow:canvas')
  record.mode = WORKBENCH_FOCUS.split

  // Viewport 1200, left rail 280 -> split max = 1200 - 280 - 360 = 560.
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1200, officialSidebarWidth: 280 })
  assert.equal(synced, true)
  assert.ok(state.width <= 560, `expected <=560, got ${state.width}`)
  assert.equal(state.width, 560)
})

test('syncWorkbenchGuiWidth suspends clamping while user is actively dragging', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }], 900, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-drag-suspend', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const record = focusRecordForTab('s-drag-suspend', 'omnimux-workflow:canvas')
  record.mode = WORKBENCH_FOCUS.split

  // Simulate active drag on body
  globalThis.document.body.setAttribute('data-dsh-sidebar-dragging', '')
  const synced = syncWorkbenchGuiWidth(store, { viewportWidth: 1200, officialSidebarWidth: 280 })
  assert.equal(synced, false, 'must suspend clamping during drag')
  assert.equal(state.width, 900, 'state width must not be mutated during drag')
  globalThis.document.body.removeAttribute('data-dsh-sidebar-dragging')
})

test('syncWorkbenchGuiWidth never clamps gui / collapsed middle column', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 900, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-guiglamp', state }),
    reduce: (fn) => { state = fn(state) },
  }
  // Intentional gui: panel keeps viewport - rail, no conversation-column clamp.
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1200, officialSidebarWidth: 280 })
  assert.equal(state.width, 920)
  state.width = 900
  const syncedGui = syncWorkbenchGuiWidth(store, { viewportWidth: 1200, officialSidebarWidth: 280 })
  assert.equal(syncedGui, true)
  assert.equal(state.width, 920, 'gui must not be clamped to split max')

  // Collapsed middle column: also allowed to be squeezed (column is 0 anyway).
  state.width = 900
  setConversationCollapsed(true, { persist: false })
  const record = focusRecordForTab('s-guiglamp', 'omnimux-assets:library')
  record.mode = WORKBENCH_FOCUS.split
  const syncedCollapsed = syncWorkbenchGuiWidth(store, { viewportWidth: 1200, officialSidebarWidth: 280 })
  assert.equal(syncedCollapsed, true)
  assert.equal(state.width, 920, 'collapsed middle must not be clamped to split max')
})

test('inferWorkbenchFocus maps collapsed / full / split geometry', () => {
  const env = { viewportWidth: 1200, officialSidebarWidth: 0 }
  assert.equal(inferWorkbenchFocus(makeState([], 780, false), env), WORKBENCH_FOCUS.chat)
  assert.equal(inferWorkbenchFocus(makeState([], 1200, true), env), WORKBENCH_FOCUS.gui)
  assert.equal(inferWorkbenchFocus(makeState([], 1180, true), env), WORKBENCH_FOCUS.gui)
  assert.equal(inferWorkbenchFocus(makeState([], 780, true), env), WORKBENCH_FOCUS.split)
})

test('setWorkbenchFocus chat/gui/split writes panel geometry and restores split width', () => {
  setupWindow()
  const env = { viewportWidth: 1200, officialSidebarWidth: 0 }
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 780, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's1', state }),
    reduce: (fn) => { state = fn(state) },
  }

  setWorkbenchFocus(WORKBENCH_FOCUS.chat, store, env)
  assert.equal(state.panelOpen, false)

  setWorkbenchFocus(WORKBENCH_FOCUS.split, store, env)
  assert.equal(state.panelOpen, true)
  assert.equal(state.width, 780)

  state.width = 650
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, env)
  assert.equal(state.panelOpen, true)
  assert.equal(state.width, 1200)

  setWorkbenchFocus(WORKBENCH_FOCUS.split, store, env)
  assert.equal(state.panelOpen, true)
  assert.equal(state.width, 650)
})

test('setWorkbenchFocus chat forces middle conversation open (right-closed session view)', () => {
  setupWindow()
  const env = { viewportWidth: 1200, officialSidebarWidth: 0 }
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 780, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-chat-mid', state }),
    reduce: (fn) => { state = fn(state) },
  }

  // Hide mid via gui, then close the right panel — mid must come back.
  setWorkbenchFocus(WORKBENCH_FOCUS.gui, store, env)
  assert.equal(getConversationCollapsed(), true)
  setWorkbenchFocus(WORKBENCH_FOCUS.chat, store, env)
  assert.equal(state.panelOpen, false)
  assert.equal(getConversationCollapsed(), false, 'closing right panel must show the session column')
})

test('attachStore reapplies gui focus so default width cannot stomp it', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 500, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-gui', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const api = installWorkbenchGlobal()
  api.setFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1200, officialSidebarWidth: 0 })
  assert.equal(state.width, 1200)

  state.width = 500
  api.attachStore(store)
  assert.equal(state.width, 1200)
})

test('applyDefaultWidth skips while focus is gui', () => {
  setupWindow()
  let state = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 500, true)
  const store = {
    getSnapshot: () => ({ sessionId: 's-gui-2', state }),
    reduce: (fn) => { state = fn(state) },
  }
  const api = installWorkbenchGlobal()
  api.setFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1200, officialSidebarWidth: 0 })

  const applied = applyDefaultWidth(null, 's-gui-2', store, { viewportWidth: 1200 })
  assert.equal(applied, null)
})

test('createWorkbenchSidebarStore.open never claims product stage', () => {
  const win = setupWindow()
  let claimed = 0
  win.__omnimuxStage = { claim() { claimed += 1 } }
  let openedTab = null
  win.__omnimuxWorkbench = {
    open(opts) { openedTab = opts },
    isOpen() { return false },
    isActive() { return false },
    subscribe() { return () => {} },
  }
  const adapter = createWorkbenchSidebarStore({
    tabId: 'omnimux-assets:library',
    title: '资产库',
  })
  adapter.open()
  assert.equal(openedTab?.tabId, 'omnimux-assets:library')
  assert.equal(claimed, 0)
})

test('createWorkbenchSidebarStore.close uses closeTab not closePanel', () => {
  const win = setupWindow()
  const closed = []
  win.__omnimuxWorkbench = {
    closeTab(id) { closed.push(['tab', id]) },
    closePanel() { closed.push(['panel']) },
    isActive() { return false },
    subscribe() { return () => {} },
  }
  const adapter = createWorkbenchSidebarStore({ tabId: 'omnimux-clip:studio' })
  adapter.close()
  assert.deepEqual(closed, [['tab', 'omnimux-clip:studio']])
})

test('isActive follows focused tab; isOpen keeps coexistence; chat clears active', () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  const assets = 'omnimux-assets:library'
  const clip = 'omnimux-clip:studio'
  let state = makeState([
    { id: assets, type: assets },
    { id: clip, type: clip },
  ], 780, true)
  state.splits.active = assets
  api.bind({
    betterSidebar: {
      getSnapshot() { return { sessionId: 's-active', state } },
      subscribeState() { return () => {} },
    },
  })

  assert.equal(isWorkbenchOpen(assets), true)
  assert.equal(isWorkbenchOpen(clip), true)
  assert.equal(isWorkbenchActive(assets), true)
  assert.equal(isWorkbenchActive(clip), false)
  assert.equal(api.isActive(assets), true)
  assert.equal(api.isActive(clip), false)

  state = {
    ...state,
    splits: { ...state.splits, active: clip },
  }
  assert.equal(api.isActive(assets), false)
  assert.equal(api.isActive(clip), true)
  assert.equal(isWorkbenchOpen(assets), true)

  const assetsStore = createWorkbenchSidebarStore({ tabId: assets })
  const clipStore = createWorkbenchSidebarStore({ tabId: clip })
  assert.equal(assetsStore.getSnapshot(), false)
  assert.equal(clipStore.getSnapshot(), true)

  state = { ...state, panelOpen: false }
  assert.equal(api.isActive(assets), false)
  assert.equal(api.isActive(clip), false)
  assert.equal(assetsStore.getSnapshot(), false)
  assert.equal(clipStore.getSnapshot(), false)
})

test('resolveWorkbenchTabTitle prefers opts, then getTab, then human fallback (#345)', () => {
  assert.equal(resolveWorkbenchTabTitle('omnimux-assets:library', '自定义', () => ({ title: '资产库' })), '自定义')
  assert.equal(
    resolveWorkbenchTabTitle('omnimux-assets:library', '', () => ({ title: () => '资产库' })),
    '资产库',
  )
  assert.equal(
    resolveWorkbenchTabTitle('omnimux-accounts:library', '', () => ({ title: 'omnimux-accounts:library' })),
    WORKBENCH_TAB_TITLE_FALLBACKS['omnimux-accounts:library'],
  )
  assert.equal(
    resolveWorkbenchTabTitle('omnimux-products:library', undefined, undefined),
    '产品库',
  )
  assert.equal(
    resolveWorkbenchTabTitle('omnimux-market:plaza', undefined, undefined),
    '插件市场',
  )
  assert.notEqual(
    resolveWorkbenchTabTitle('omnimux-publish:library', '', () => null),
    'omnimux-publish:library',
  )
})

test('openWorkbench uses human title fallback when getTab has no title (#345)', async () => {
  const win = setupWindow()
  const api = installWorkbenchGlobal(win)
  const opened = []
  const state = makeState([])
  api.bind({
    betterSidebar: {
      openTab(seed, scope) { opened.push({ seed, scope }) },
      getTab() { return { id: 'omnimux-assets:library' } },
      getSnapshot() { return { state } },
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 's-title' }) },
    },
  })
  const ok = await api.open({ tabId: 'omnimux-assets:library', timeoutMs: 0 })
  assert.equal(ok, true)
  assert.equal(opened.length, 1)
  assert.equal(opened[0].seed.title, '资产库')
  assert.notEqual(opened[0].seed.title, 'omnimux-assets:library')
})

test('clampSplitPanelWidth keeps a visible conversation at 360px including Files', () => {
  setupWindow()
  assert.equal(WORKBENCH_CONVERSATION_MIN_PX, 360)
  const env = { viewportWidth: 1200, officialSidebarWidth: 280 }
  const files = makeState([{ id: 'editor:readme', type: 'editor', title: 'Files' }], 900, true)
  const record = focusRecordForTab('s-files-min', 'editor:readme')
  record.mode = WORKBENCH_FOCUS.split
  assert.equal(clampSplitPanelWidth(900, files, { ...env, sessionId: 's-files-min' }), 560)
  assert.equal(workbenchSplitMaxPanelPx(files, env), 560)

  const gui = makeState([{ id: 'omnimux-assets:library', type: 'omnimux-assets:library' }], 900, true)
  setConversationCollapsed(true, { persist: false })
  const guiRecord = focusRecordForTab('s-gui-min', 'omnimux-assets:library')
  guiRecord.mode = WORKBENCH_FOCUS.gui
  assert.equal(clampSplitPanelWidth(920, gui, { ...env, sessionId: 's-gui-min' }), 920)
})

test('syncSplitMaxCssVar writes the live split ceiling', () => {
  const win = setupWindow()
  const state = makeState([{ id: 'editor:home', type: 'editor', title: 'Files' }], 900, true)
  const record = focusRecordForTab('s-live-drag', 'editor:home')
  record.mode = WORKBENCH_FOCUS.split
  const env = { viewportWidth: 1200, officialSidebarWidth: 280, sessionId: 's-live-drag' }
  assert.equal(syncSplitMaxCssVar(state, env), true)
  assert.equal(win.document.documentElement.style.getPropertyValue('--omnimux-split-max'), '560px')
  const style = win.document.getElementById('omnimux-split-conversation-min-chrome')
  assert.ok(style)
  assert.match(style.textContent, /--omnimux-split-max/)
  const unsub = installSplitConversationMin(win.document)
  assert.equal(typeof unsub, 'function')
})

test('illegal split widths are not persisted', () => {
  const win = setupWindow()
  win.innerWidth = 1200
  const column = { getBoundingClientRect: () => ({ width: 280 }) }
  win.document.querySelector = (sel) => (String(sel).includes('sidebarCol') || String(sel).includes('data-pane="sidebar"') ? column : null)
  let state = makeState([{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }], 900, true)
  let listener = null
  const api = installWorkbenchGlobal(win)
  api.bind({
    betterSidebar: {
      getSnapshot: () => ({ sessionId: 's-persist-min', state }),
      subscribeState(fn) { listener = fn; return () => {} },
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 's-persist-min' }) },
    },
  })
  const record = focusRecordForTab('s-persist-min', 'omnimux-workflow:canvas')
  record.mode = WORKBENCH_FOCUS.split
  listener(state)
  assert.equal(record.splitWidth, 560)
  const raw = win.localStorage.getItem('omnimux-workbench-focus:v1:s-persist-min')
  assert.match(String(raw), /"splitWidth":560/)
})

/**
 * #505 live-evidence shape: viewport 1728, left rail 280, real better-sidebar
 * right panel dragged to inline width 1298 (split max = 1728 − 280 − 360 = 1088).
 * The panel has NO [data-dsh-panel-host] and NO [data-dragging] after release;
 * an unrelated AppFrame node carries [data-dragging] as a decoy.
 */
function makeIssue505Dom({ viewport = 1728, railWidth = 280, panelWidth = 1298, withHandle = true } = {}) {
  const win = setupWindow()
  win.innerWidth = viewport
  const doc = win.document
  const column = { getBoundingClientRect: () => ({ width: railWidth }) }
  const mkAttrSet = () => {
    const set = new Set()
    return {
      hasAttribute: (a) => set.has(a),
      setAttribute: (a) => { set.add(a) },
      removeAttribute: (a) => { set.delete(a) },
    }
  }
  const panelAttrs = mkAttrSet()
  const panel = {
    className: 'nArs4W_panel',
    style: { width: `${panelWidth}px` },
    hasAttribute: panelAttrs.hasAttribute,
    setAttribute: panelAttrs.setAttribute,
    removeAttribute: panelAttrs.removeAttribute,
    getBoundingClientRect: () => ({ x: viewport - panelWidth, right: viewport, width: panelWidth }),
  }
  const handle = { className: 'nArs4W_panelResize nArs4W_panelResizeActive', parentElement: panel }
  const decoyAttrs = mkAttrSet()
  decoyAttrs.setAttribute('data-dragging')
  const decoy = {
    className: 'appFrame_dragTarget',
    style: { width: '' },
    hasAttribute: decoyAttrs.hasAttribute,
    setAttribute: decoyAttrs.setAttribute,
    removeAttribute: decoyAttrs.removeAttribute,
    getBoundingClientRect: () => ({ x: 0, right: railWidth, width: railWidth }),
  }
  doc.querySelector = (sel) => {
    const s = String(sel)
    if (s.includes('panelResize')) return withHandle ? handle : null
    if (s.includes('data-dsh-panel-host')) return null
    if (s === '[data-dragging]') return decoy
    if (s.includes(WORKBENCH_PANEL_ATTR)) {
      return panelAttrs.hasAttribute(WORKBENCH_PANEL_ATTR) ? panel : null
    }
    if (selIsSidebarColumn(s)) return column
    return null
  }
  const captured = {}
  doc.addEventListener = (type, fn) => { (captured[type] ||= []).push(fn) }
  return { win, doc, panel, handle, decoy, captured }
}

function bindIssue505Service(win, state, sessionId = 's-505') {
  const api = installWorkbenchGlobal(win)
  api.bind({
    betterSidebar: {
      getSnapshot: () => ({ sessionId, state }),
    },
  })
  return api
}

test('#505 regression: post-release oversized Files panel is clamped on the real panel node', () => {
  const { win, doc, panel, decoy, captured } = makeIssue505Dom({})
  // better-sidebar's committed drag state: inline width + layout var overshoot.
  doc.documentElement.style.setProperty('--dsh-sidebar-width', '1298px')
  const state = makeState([{ id: 'editor:readme', type: 'editor', title: 'Files' }], 1298, true)
  bindIssue505Service(win, state)
  const record = focusRecordForTab('s-505', 'editor:readme')
  record.mode = WORKBENCH_FOCUS.split

  installSplitConversationMin(doc)
  assert.equal(captured.pointerup?.length, 1)
  captured.pointerup[0]()

  // The resolver must find the real right panel via its resize-handle parent,
  // never the AppFrame [data-dragging] decoy.
  assert.equal(findWorkbenchPanelElement(doc), panel)
  assert.ok(panel.hasAttribute(WORKBENCH_PANEL_ATTR))
  // Old code queried [data-dragging]/[data-dsh-panel-host]: after release the
  // panel has neither, so the 1298px inline width survived and covered the
  // conversation column down to ~150px. The clamp must land on the panel.
  assert.equal(panel.style.width, '1088px')
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-sidebar-width'), '1088px')
  assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-split-max'), '1088px')
  // The decoy is never touched.
  assert.equal(decoy.style.width, '')
})

test('#505 regression: mid-drag samples do not fight inline drag writes, release clamps', () => {
  const { win, doc, panel, captured } = makeIssue505Dom({ panelWidth: 1400 })
  const state = makeState([{ id: 'editor:readme', type: 'editor', title: 'Files' }], 1400, true)
  bindIssue505Service(win, state)
  const record = focusRecordForTab('s-505', 'editor:readme')
  record.mode = WORKBENCH_FOCUS.split
  installSplitConversationMin(doc)

  // Mid-drag: better-sidebar sets body[data-dsh-sidebar-dragging] + panel
  // [data-dragging] and rewrites the inline width every frame.
  doc.body.setAttribute('data-dsh-sidebar-dragging')
  panel.setAttribute('data-dragging')
  panel.style.width = '1400px'
  captured.pointermove[0]()
  // No jitter: the inline drag write is NOT rewritten mid-drag; the persistent
  // marker + --omnimux-split-max clamp the visuals through CSS instead.
  assert.equal(panel.style.width, '1400px')
  assert.ok(panel.hasAttribute(WORKBENCH_PANEL_ATTR))
  assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-split-max'), '1088px')

  // Release: React commits width 1298 (clamped only to the viewport) and both
  // dragging markers disappear; the panel must now be clamped in the DOM.
  doc.body.removeAttribute('data-dsh-sidebar-dragging')
  panel.removeAttribute('data-dragging')
  panel.style.width = '1298px'
  doc.documentElement.style.setProperty('--dsh-sidebar-width', '1298px')
  captured.pointerup[0]()
  assert.equal(panel.style.width, '1088px')
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-sidebar-width'), '1088px')
})

test('#505 regression: panel resolution never mistakes an AppFrame [data-dragging] node', () => {
  const { win, doc, decoy, captured } = makeIssue505Dom({ withHandle: false })
  doc.documentElement.style.setProperty('--dsh-sidebar-width', '1298px')
  const state = makeState([{ id: 'editor:readme', type: 'editor', title: 'Files' }], 1298, true)
  bindIssue505Service(win, state)
  installSplitConversationMin(doc)
  // No resize handle, no host: the only [data-dragging] node is the decoy,
  // which is not right-anchored to the viewport — it must be rejected.
  assert.equal(findWorkbenchPanelElement(doc), null)
  captured.pointerup[0]()
  assert.equal(decoy.style.width, '')
  // The layout var still clamps so #root keeps the 360px conversation floor.
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-sidebar-width'), '1088px')
})

test('#505 split-min CSS clamps the tagged real panel, not only mid-drag nodes', () => {
  assert.match(WORKBENCH_SPLIT_MIN_CSS, /\[data-omnimux-workbench-panel\]/)
  assert.doesNotMatch(WORKBENCH_SPLIT_MIN_CSS, /\[data-dsh-panel-host\]/)
  assert.doesNotMatch(WORKBENCH_SPLIT_MIN_CSS, /\[data-dragging\]/)
})

test('#610 regression: panel host is never treated as the workbench panel', () => {
  const win = setupWindow()
  const hostAttrs = new Set()
  const host = {
    style: { width: '' },
    hasAttribute: (name) => hostAttrs.has(name),
    setAttribute: (name) => { hostAttrs.add(name) },
    removeAttribute: (name) => { hostAttrs.delete(name) },
    getBoundingClientRect: () => ({ x: 0, right: win.innerWidth, width: win.innerWidth }),
  }
  win.document.querySelector = (selector) => (
    String(selector).includes('data-dsh-panel-host') ? host : null
  )

  installSplitConversationMin(win.document)

  assert.equal(findWorkbenchPanelElement(win.document), null)
  assert.equal(host.hasAttribute(WORKBENCH_PANEL_ATTR), false)
  assert.equal(host.style.width, '')
})

test('#610 regression: a panel inside the viewport host receives the split marker', () => {
  workbenchDom = new JSDOM(`<!doctype html><html><head></head><body>
    <div data-pane="sidebar"></div>
    <div data-dsh-panel-host style="position:fixed;inset:0;width:1200px">
      <aside class="_panel_8x" style="position:absolute;right:0;width:900px">
        <div class="_panelResize_8x"></div>
      </aside>
      <aside class="_bottomPanel_8x"><div class="_bottomResize_8x"></div></aside>
    </div>
    <div data-dragging class="appFrame_dragTarget"></div>
  </body></html>`)
  const { window: win } = workbenchDom
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1200 })
  globalThis.window = win
  globalThis.document = win.document
  const host = win.document.querySelector('[data-dsh-panel-host]')
  const rail = win.document.querySelector('[data-pane="sidebar"]')
  const panel = win.document.querySelector('._panel_8x')
  const bottom = win.document.querySelector('._bottomPanel_8x')
  const dragging = win.document.querySelector('[data-dragging]')
  panel.getBoundingClientRect = () => ({ x: 300, right: 1200, width: 900 })
  rail.getBoundingClientRect = () => ({ x: 0, right: 280, width: 280 })
  dragging.getBoundingClientRect = () => ({ x: 0, right: 280, width: 280 })
  const state = makeState([{ id: 'editor:readme', type: 'editor', title: 'Files' }], 900, true)
  win.document.documentElement.style.setProperty('--dsh-sidebar-width', '900px')
  const api = installWorkbenchGlobal(win)
  api.bind({
    betterSidebar: { getSnapshot: () => ({ sessionId: 's-610', state }) },
  })
  focusRecordForTab('s-610', 'editor:readme').mode = WORKBENCH_FOCUS.split

  installSplitConversationMin(win.document)
  win.document.dispatchEvent(new win.Event('pointermove'))

  assert.equal(findWorkbenchPanelElement(win.document), panel)
  assert.equal(panel.hasAttribute(WORKBENCH_PANEL_ATTR), true)
  assert.equal(host.hasAttribute(WORKBENCH_PANEL_ATTR), false)
  assert.equal(bottom.hasAttribute(WORKBENCH_PANEL_ATTR), false)
  assert.equal(dragging.hasAttribute(WORKBENCH_PANEL_ATTR), false)
  assert.equal(host.style.width, '1200px')
  assert.equal(panel.style.width, '560px')
  assert.equal(win.document.documentElement.style.getPropertyValue('--dsh-sidebar-width'), '560px')
})
