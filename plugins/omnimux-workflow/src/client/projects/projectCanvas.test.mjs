import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activateProjectCanvas,
  applyProjectCanvasRatio,
  APP_TAB_ID,
  bindBetterSidebar,
  CANVAS_SENTINEL_PATH,
  CANVAS_TAB_ID,
  collectTabs,
  enterFullscreenWhenBlankConversation,
  factorySidebarWidthPx,
  isSeedFilesTab,
  leftoverHalfSidebarWidthPx,
  legacyProjectCanvasWidthPx,
  officialSessionSidebarWidth,
  openAppTab,
  PROJECT_CANVAS_MIN_PX,
  PROJECT_CANVAS_RATIO,
  projectCanvasWidthPx,
  resetProjectCanvasRatioMemory,
  shouldApplyProjectCanvasRatio,
} from './projectCanvas.js'

describe('projectCanvas isolation', () => {
  for (const service of [undefined, null]) {
    it(`bindBetterSidebar cleans normalized ${service} on its original window only`, () => {
      const previous = globalThis.window
      const original = {}
      globalThis.window = original
      const dispose = bindBetterSidebar(service)
      assert.equal(original.__omnimuxBetterSidebar, null)
      const replacement = { __omnimuxBetterSidebar: { owner: 'other' }, __omnimuxOpenAppTab: () => {} }
      globalThis.window = replacement
      try {
        dispose()
        assert.equal(Object.hasOwn(original, '__omnimuxBetterSidebar'), false)
        assert.equal(Object.hasOwn(original, '__omnimuxOpenAppTab'), false)
        assert.equal(replacement.__omnimuxBetterSidebar.owner, 'other')
        assert.equal(typeof replacement.__omnimuxOpenAppTab, 'function')
      } finally {
        dispose()
        if (previous === undefined) delete globalThis.window
        else globalThis.window = previous
      }
    })
  }

  it('normalized empty binding preserves an external replacement', () => {
    const previous = globalThis.window
    const win = {}
    globalThis.window = win
    const dispose = bindBetterSidebar(undefined)
    const externalService = {}
    const externalOpen = () => {}
    win.__omnimuxBetterSidebar = externalService
    win.__omnimuxOpenAppTab = externalOpen
    try {
      dispose()
      assert.equal(win.__omnimuxBetterSidebar, externalService)
      assert.equal(win.__omnimuxOpenAppTab, externalOpen)
    } finally {
      dispose()
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
    }
  })
  it('getBetterSidebar: Proxy 未 inject 不炸，回落到 bind', async () => {
    const { getBetterSidebar } = await import('./projectCanvas.js')
    bindBetterSidebar(null)
    const forbidden = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'betterSidebar') throw new Error('cannot get property "betterSidebar" without inject')
        return undefined
      },
    })
    assert.equal(getBetterSidebar(forbidden), null)
    const service = { openTab() {} }
    bindBetterSidebar(service)
    assert.equal(getBetterSidebar(forbidden), service)
    bindBetterSidebar(null)
  })

  it('collectTabs walks split trees', () => {
    const tabs = collectTabs({
      kind: 'split',
      children: [
        { kind: 'leaf', tabs: [{ id: 'a', type: 'editor' }] },
        { kind: 'leaf', tabs: [{ id: 'b', type: CANVAS_TAB_ID }] },
      ],
    })
    assert.equal(tabs.length, 2)
    assert.equal(tabs[0].id, 'a')
    assert.deepEqual(collectTabs(null), [])
    assert.deepEqual(collectTabs({ kind: 'leaf' }), [])
  })

  it('isSeedFilesTab only matches path-less editor tabs', () => {
    assert.equal(isSeedFilesTab({ type: 'editor' }), true)
    assert.equal(isSeedFilesTab({ type: 'editor', path: '' }), true)
    assert.equal(isSeedFilesTab({ type: 'editor', path: '/tmp/a.ts' }), false)
    assert.equal(isSeedFilesTab({ type: CANVAS_TAB_ID }), false)
  })

  it('activateProjectCanvas closes official details, drops seed Files, opens canvas', async () => {
    const closed = []
    const opened = []
    const details = []
    const service = {
      getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
      getSnapshot() {
        return {
          sessionId: 'sess-1',
          state: {
            splits: {
              kind: 'leaf',
              tabs: [
                { id: 'tab:1', type: 'editor', title: 'Files' },
                { id: 'tab:keep', type: 'editor', path: '/tmp/keep.ts' },
              ],
            },
            bottomSplits: { kind: 'leaf', tabs: [] },
          },
        }
      },
      closeTab(id, scope) { closed.push({ id, scope }) },
      openTab(seed, scope) { opened.push({ seed, scope }) },
    }
    const ok = await activateProjectCanvas({
      betterSidebar: service,
      layout: { closeDetails: () => { details.push('close') } },
      t: (key) => key,
    }, { sessionId: 'sess-1', cwd: '/tmp/ws', timeoutMs: 0 })

    assert.equal(ok, true)
    assert.deepEqual(details, ['close'])
    assert.deepEqual(closed.map((row) => row.id), ['tab:1'])
    assert.equal(opened.length, 1)
    assert.equal(opened[0].seed.type, CANVAS_TAB_ID)
    assert.equal(opened[0].seed.id, CANVAS_TAB_ID)
    assert.equal(opened[0].seed.path, CANVAS_SENTINEL_PATH)
    assert.equal(opened[0].scope.sessionId, 'sess-1')
  })

  it('activateProjectCanvas 传递 canvasWorkspaceId 到 scope、meta、updateTab 并广播 active-canvas-changed', async () => {
    const opened = []
    const updated = []
    const dispatchedEvents = []
    const previousWin = globalThis.window

    const service = {
      getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
      getSnapshot() {
        return {
          sessionId: 'sess-page-1',
          state: {
            splits: { kind: 'leaf', tabs: [{ id: CANVAS_TAB_ID, type: CANVAS_TAB_ID }] },
            bottomSplits: { kind: 'leaf', tabs: [] },
          },
        }
      },
      openTab(seed, scope) { opened.push({ seed, scope }) },
      updateTab(tabId, data) { updated.push({ tabId, data }) },
    }

    class MockCustomEvent {
      constructor(name, init) {
        this.name = name
        this.type = name
        this.detail = init?.detail
      }
    }

    const previousCustomEvent = globalThis.CustomEvent
    globalThis.CustomEvent = MockCustomEvent
    globalThis.window = {
      CustomEvent: MockCustomEvent,
      dispatchEvent(e) {
        dispatchedEvents.push(e)
        return true
      },
      __omnimuxBetterSidebar: service,
    }

    try {
      const ok = await activateProjectCanvas({
        betterSidebar: service,
        t: (key) => key,
      }, {
        sessionId: 'sess-page-1',
        cwd: '/tmp/project-path',
        title: '创作页 2',
        canvasWorkspaceId: 'ws_canvas_page_2',
        timeoutMs: 0,
      })

      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.equal(opened[0].seed.meta?.canvasWorkspaceId, 'ws_canvas_page_2')
      assert.equal(opened[0].seed.title, '创作页 2')
      assert.equal(opened[0].scope?.canvasWorkspaceId, 'ws_canvas_page_2')

      // 单例 updateTab 穿透
      assert.equal(updated.length, 1)
      assert.equal(updated[0].tabId, CANVAS_TAB_ID)
      assert.equal(updated[0].data?.meta?.canvasWorkspaceId, 'ws_canvas_page_2')
      assert.equal(updated[0].data?.meta?.canvasSessionId, 'sess-page-1')

      // 广播 active-canvas-changed
      assert.equal(dispatchedEvents.length, 1)
      assert.equal(dispatchedEvents[0].name || dispatchedEvents[0].type, 'omnimux:active-canvas-changed')
      assert.equal(dispatchedEvents[0].detail?.workspaceId, 'ws_canvas_page_2')
      assert.equal(dispatchedEvents[0].detail?.sessionId, 'sess-page-1')
    } finally {
      globalThis.window = previousWin
      globalThis.CustomEvent = previousCustomEvent
    }
  })

  it('activateProjectCanvas uncollapses conversation and forces split after opening canvas', async () => {
    resetProjectCanvasRatioMemory()
    const order = []
    const previous = globalThis.window
    let focus = 'gui'
    globalThis.window = {
      __omnimuxWorkbench: {
        getFocus() { return focus },
        setConversationCollapsed(next, opts) {
          order.push(`collapsed:${next}:${opts?.sessionId || ''}`)
        },
        setFocus(mode) {
          focus = mode
          order.push(`focus:${mode}`)
        },
      },
    }
    try {
      const opened = []
      const ok = await activateProjectCanvas({
        betterSidebar: {
          getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
          getSnapshot() {
            return {
              sessionId: 'sess-enter',
              state: {
                width: 560,
                panelOpen: true,
                splits: { kind: 'leaf', tabs: [] },
                bottomSplits: { kind: 'leaf', tabs: [] },
              },
            }
          },
          closeTab() {},
          openTab(seed, scope) {
            opened.push({ seed, scope })
            order.push('openTab')
          },
        },
        layout: { closeDetails() {} },
        t: (key) => key,
      }, { sessionId: 'sess-enter', cwd: '/tmp/ws', timeoutMs: 0 })

      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.ok(order.indexOf('openTab') >= 0)
      assert.ok(order.indexOf('collapsed:false:sess-enter') > order.indexOf('openTab'))
      assert.ok(order.indexOf('focus:split') > order.indexOf('openTab'))
      assert.equal(focus, 'split')
    } finally {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
    }
  })

  it('activateProjectCanvas refuses when canvas tab is not registered yet', async () => {
    const opened = []
    const ok = await activateProjectCanvas({
      betterSidebar: {
        getTab() { return undefined },
        getSnapshot() { return { sessionId: 'sess-1', state: { splits: { kind: 'leaf', tabs: [] } } } },
        openTab(seed) { opened.push(seed) },
        closeTab() {},
      },
    }, { sessionId: 'sess-1', timeoutMs: 0 })
    assert.equal(ok, false)
    assert.equal(opened.length, 0)
  })

  it('projectCanvasWidthPx uses conversation+sidebar, not the full window', () => {
    assert.equal(PROJECT_CANVAS_RATIO, 0.85)
    // 1600 / 无官方 / 对话 600 / panel 400 → usable 1000 → 1000 - 420 = 580
    assert.equal(projectCanvasWidthPx({ width: 400, panelOpen: true }, { conversationWidth: 600, viewportWidth: 1600 }), 580)
    assert.equal(legacyProjectCanvasWidthPx({ width: 400, panelOpen: true }, { conversationWidth: 600, viewportWidth: 1600 }), 700)
    assert.equal(projectCanvasWidthPx({ width: 400, panelOpen: false }, { conversationWidth: 1000, viewportWidth: 1600 }), 580)
    // 1000 / 无官方 / 对话 0 → 1000 - 420 = 580
    assert.equal(projectCanvasWidthPx({ width: 400 }, { conversationWidth: 0, viewportWidth: 1000 }), 580)
    assert.equal(projectCanvasWidthPx({ width: 100 }, { conversationWidth: 0, viewportWidth: 0 }), PROJECT_CANVAS_MIN_PX)
  })

  it('projectCanvasWidthPx leftover overlay is not the usable width', () => {
    assert.equal(officialSessionSidebarWidth({ officialSidebarWidth: 280 }), 280)
    assert.equal(projectCanvasWidthPx(
      { width: 811, panelOpen: true },
      { conversationWidth: 189, viewportWidth: 1280, officialSidebarWidth: 280 },
    ), 580)
  })

  it('factorySidebarWidthPx matches better-sidebar 35% default', () => {
    assert.equal(factorySidebarWidthPx(undefined, { viewportWidth: 1600 }), 560)
    assert.equal(factorySidebarWidthPx({ defaultWidthPercent: 50 }, { viewportWidth: 1600 }), 800)
  })

  it('shouldApplyProjectCanvasRatio writes factory 35% but skips a dragged width', () => {
    resetProjectCanvasRatioMemory()
    const env = { conversationWidth: 600, viewportWidth: 1600 }
    assert.equal(shouldApplyProjectCanvasRatio('s1', { width: 560, panelOpen: true }, undefined, env), true)
    // 宽 812 贴近 usable×0.7（348+812=1160），旧 70% 磁铁仍要写新 85%
    assert.equal(legacyProjectCanvasWidthPx(
      { width: 812, panelOpen: true },
      { conversationWidth: 348, viewportWidth: 1600 },
    ), 812)
    assert.equal(shouldApplyProjectCanvasRatio('s1', { width: 812, panelOpen: true }, undefined, { conversationWidth: 348, viewportWidth: 1600 }), true)
    assert.equal(shouldApplyProjectCanvasRatio('s1', { width: 900, panelOpen: true }, undefined, env), false)
  })

  it('shouldApplyProjectCanvasRatio writes leftover 70% sessions (not a user drag)', () => {
    resetProjectCanvasRatioMemory()
    // 1280 / 官方 280 → 旧 70% = 700，新 85% = 850
    assert.equal(shouldApplyProjectCanvasRatio(
      's-legacy-official',
      { width: 700, panelOpen: true },
      undefined,
      { conversationWidth: 300, viewportWidth: 1280, officialSidebarWidth: 280 },
    ), true)
    // 1280 / 官方 36 → 旧 70% = 871，新 85% = 1057
    assert.equal(shouldApplyProjectCanvasRatio(
      's-legacy-collapsed',
      { width: 871, panelOpen: true },
      undefined,
      { conversationWidth: 400, viewportWidth: 1280, officialSidebarWidth: 36 },
    ), true)
  })

  it('shouldApplyProjectCanvasRatio writes leftover crush, still skips a real drag', () => {
    resetProjectCanvasRatioMemory()
    assert.equal(shouldApplyProjectCanvasRatio(
      's-left',
      { width: 811, panelOpen: true },
      undefined,
      { conversationWidth: 189, viewportWidth: 1280, officialSidebarWidth: 280 },
    ), true)
    assert.equal(shouldApplyProjectCanvasRatio(
      's-drag',
      { width: 900, panelOpen: true },
      undefined,
      { conversationWidth: 600, viewportWidth: 1600 },
    ), false)
  })

  it('shouldApplyProjectCanvasRatio writes leftover ~50% 1:1, still skips a real drag', () => {
    resetProjectCanvasRatioMemory()
    const collapsed = { conversationWidth: 640, viewportWidth: 1280, officialSidebarWidth: 36 }
    assert.equal(leftoverHalfSidebarWidthPx({ width: 640, panelOpen: true }, collapsed), 622)
    // 现网折叠细轨 + leftover 一半 ≈ 对话:画布 1:1，不是人手拖。
    assert.equal(shouldApplyProjectCanvasRatio(
      's-half',
      { width: 640, panelOpen: true },
      undefined,
      collapsed,
    ), true)
    assert.equal(shouldApplyProjectCanvasRatio(
      's-factory-collapsed',
      { width: 448, panelOpen: true },
      undefined,
      { conversationWidth: 800, viewportWidth: 1280, officialSidebarWidth: 36 },
    ), true)
    // leftover 按整窗 50% 落宽（官方栏 280 时 usable 一半是 500，不是 640）
    assert.equal(shouldApplyProjectCanvasRatio(
      's-half-viewport',
      { width: 640, panelOpen: true },
      undefined,
      { conversationWidth: 360, viewportWidth: 1280, officialSidebarWidth: 280 },
    ), true)
    assert.equal(shouldApplyProjectCanvasRatio(
      's-drag-collapsed',
      { width: 980, panelOpen: true },
      undefined,
      { conversationWidth: 300, viewportWidth: 1280, officialSidebarWidth: 36 },
    ), false)
  })

  it('applyProjectCanvasRatio reduces live store width for the current session', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-ratio', state: { width: 560, panelOpen: true } }
      },
      reduce(fn) {
        const next = fn({ width: 560, panelOpen: true })
        reduced.push(next.width)
      },
    }
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-ratio',
      store,
      { conversationWidth: 600, viewportWidth: 1600 },
    )
    assert.equal(next, 740)
    assert.deepEqual(reduced, [740])
  })

  it('applyProjectCanvasRatio writes 580 over leftover crush 811', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-left', state: { width: 811, panelOpen: true } }
      },
      reduce(fn) {
        const nextState = fn({ width: 811, panelOpen: true })
        reduced.push(nextState.width)
      },
    }
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-left',
      store,
      { conversationWidth: 189, viewportWidth: 1280, officialSidebarWidth: 280 },
    )
    assert.equal(next, 580)
    assert.deepEqual(reduced, [580])
  })

  it('applyProjectCanvasRatio waits when the conversation column is not measured yet', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-wait', state: { width: 560, panelOpen: true } }
      },
      reduce(fn) { reduced.push(fn({ width: 560 })) },
    }
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-wait',
      store,
      { conversationWidth: 0, viewportWidth: 1600 },
    )
    assert.equal(next, undefined)
    assert.equal(reduced.length, 0)
  })

  it('applyProjectCanvasRatio waits when the open panel has not squeezed conversation yet', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-overlap', state: { width: 560, panelOpen: true } }
      },
      reduce(fn) { reduced.push(fn({ width: 560 })) },
    }
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-overlap',
      store,
      { conversationWidth: 1200, viewportWidth: 1600 },
    )
    assert.equal(next, undefined)
    assert.equal(reduced.length, 0)
  })

  it('applyProjectCanvasRatio waits until live store.reduce is available', () => {
    resetProjectCanvasRatioMemory()
    const service = {
      getSnapshot() {
        return { sessionId: 'sess-nostore', state: { width: 560, panelOpen: true } }
      },
    }
    const env = { conversationWidth: 600, viewportWidth: 1600, officialSidebarWidth: 280 }
    assert.equal(applyProjectCanvasRatio(service, 'sess-nostore', null, env), undefined)
    assert.equal(applyProjectCanvasRatio(service, 'sess-nostore', {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot: service.getSnapshot,
    }, env), undefined)
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot: service.getSnapshot,
      reduce(fn) { reduced.push(fn({ width: 560, panelOpen: true }).width) },
    }
    // 视口 − 官方栏 = 1320，1320 - 420 → 900（保持会话列 420 舒适宽）
    assert.equal(applyProjectCanvasRatio(service, 'sess-nostore', store, env), 900)
    assert.deepEqual(reduced, [900])
  })

  it('applyProjectCanvasRatio waits when live is already legacy 70% but store.reduce is missing', () => {
    resetProjectCanvasRatioMemory()
    const env = { conversationWidth: 300, viewportWidth: 1280, officialSidebarWidth: 280 }
    const service = {
      getSnapshot() {
        return { sessionId: 'sess-disk', state: { width: 700, panelOpen: true } }
      },
    }
    assert.equal(applyProjectCanvasRatio(service, 'sess-disk', null, env), undefined)
  })

  it('applyProjectCanvasRatio writes adaptive canvas width when official rail is collapsed leftover 1:1', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-collapsed', state: { width: 640, panelOpen: true } }
      },
      reduce(fn) {
        const nextState = fn({ width: 640, panelOpen: true })
        reduced.push(nextState.width)
      },
    }
    // leftover overlay 不挤对话列：1240+640 > 1280，旧 overlap 守卫会一直 undefined。
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-collapsed',
      store,
      { conversationWidth: 1240, viewportWidth: 1280, officialSidebarWidth: 36 },
    )
    assert.equal(projectCanvasWidthPx(
      { width: 640, panelOpen: true },
      { conversationWidth: 1240, viewportWidth: 1280, officialSidebarWidth: 36 },
    ), 824)
    assert.equal(next, 824)
    assert.deepEqual(reduced, [824])
  })

  it('applyProjectCanvasRatio still skips a real user drag', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const store = {
      getPrefs() { return { defaultWidthPercent: 35 } },
      getSnapshot() {
        return { sessionId: 'sess-user-drag', state: { width: 980, panelOpen: true } }
      },
      reduce(fn) { reduced.push(fn({ width: 980 })) },
    }
    const next = applyProjectCanvasRatio(
      { getSnapshot: store.getSnapshot },
      'sess-user-drag',
      store,
      { conversationWidth: 300, viewportWidth: 1280, officialSidebarWidth: 36 },
    )
    assert.equal(next, null)
    assert.equal(reduced.length, 0)
  })

  it('applyProjectCanvasRatio skips while workbench focus is gui or chat', () => {
    resetProjectCanvasRatioMemory()
    const reduced = []
    const previous = globalThis.window
    globalThis.window = { __omnimuxWorkbench: { getFocus: () => 'gui' } }
    try {
      const store = {
        getPrefs() { return { defaultWidthPercent: 35 } },
        getSnapshot() {
          return { sessionId: 'sess-gui', state: { width: 560, panelOpen: true } }
        },
        reduce(fn) { reduced.push(fn({ width: 560 })) },
      }
      const next = applyProjectCanvasRatio(
        { getSnapshot: store.getSnapshot },
        'sess-gui',
        store,
        { conversationWidth: 300, viewportWidth: 1280, officialSidebarWidth: 240 },
        true,
      )
      assert.equal(next, null)
      assert.equal(reduced.length, 0)
    } finally {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
    }
  })

  it('activateProjectCanvas no-ops tab mutations when sidebar service is missing', async () => {
    const details = []
    const ok = await activateProjectCanvas({
      layout: { closeDetails: () => { details.push('close') } },
    }, { sessionId: 'sess-1', timeoutMs: 0 })
    assert.equal(ok, false)
    assert.deepEqual(details, ['close'])
  })

  it('APP_TAB_ID constant is correctly defined', () => {
    assert.equal(APP_TAB_ID, 'omnimux-workflow:app')
  })

  it('bindBetterSidebar mounts boundService and openAppTab onto globalThis.window', () => {
    const previous = globalThis.window
    const fakeWin = {}
    globalThis.window = fakeWin
    try {
      const mockService = { openTab: () => {} }
      bindBetterSidebar(mockService)
      assert.equal(fakeWin.__omnimuxBetterSidebar, mockService)
      assert.equal(typeof fakeWin.__omnimuxOpenAppTab, 'function')
    } finally {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
      bindBetterSidebar(null)
    }
  })

  for (const sameService of [false, true]) {
    it(`binding disposer preserves a newer ${sameService ? 'same-service' : 'different-service'} owner`, async () => {
      const { getBetterSidebar } = await import('./projectCanvas.js')
      const previous = globalThis.window
      const fakeWin = {}
      globalThis.window = fakeWin
      const oldCalls = []
      const newCalls = []
      const oldService = { openTab(seed) { oldCalls.push(seed) } }
      const newService = sameService ? oldService : { openTab(seed) { newCalls.push(seed) } }
      let disposeOld
      let disposeNew
      try {
        disposeOld = bindBetterSidebar(oldService)
        disposeNew = bindBetterSidebar(newService)
        disposeOld()
        assert.equal(getBetterSidebar(), newService)
        assert.equal(fakeWin.__omnimuxBetterSidebar, newService)
        assert.equal(fakeWin.__omnimuxOpenAppTab, openAppTab)
        assert.equal(fakeWin.__omnimuxOpenAppTab({ appId: 'new-owner' }), true)
        assert.equal((sameService ? oldCalls : newCalls).length, 1)
        if (!sameService) assert.equal(oldCalls.length, 0)
        disposeNew()
        assert.equal(getBetterSidebar(), null)
        assert.equal(Object.hasOwn(fakeWin, '__omnimuxBetterSidebar'), false)
        assert.equal(Object.hasOwn(fakeWin, '__omnimuxOpenAppTab'), false)
        assert.equal(openAppTab({ appId: 'disposed' }), false)
        disposeOld()
        disposeNew()
        assert.equal(getBetterSidebar(), null, 'disposal remains idempotent')
      } finally {
        disposeNew?.()
        disposeOld?.()
        // Reset module state while the isolated test window is still installed.
        const reset = bindBetterSidebar(null)
        reset()
        if (previous === undefined) delete globalThis.window
        else globalThis.window = previous
      }
    })
  }

  it('binding disposer does not remove globals replaced by another publisher', () => {
    const previous = globalThis.window
    const fakeWin = {}
    globalThis.window = fakeWin
    const ownedService = { openTab() {} }
    const otherService = { openTab() {} }
    const otherOpen = () => 'other-owner'
    const dispose = bindBetterSidebar(ownedService)
    try {
      fakeWin.__omnimuxBetterSidebar = otherService
      fakeWin.__omnimuxOpenAppTab = otherOpen
      dispose()
      assert.equal(fakeWin.__omnimuxBetterSidebar, otherService)
      assert.equal(fakeWin.__omnimuxOpenAppTab, otherOpen)
    } finally {
      dispose()
      const reset = bindBetterSidebar(null)
      reset()
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
    }
  })

  it('openAppTab opens app tab with APP_TAB_ID and manifest details', () => {
    const opened = []
    const mockService = {
      openTab(seed, scope) {
        opened.push({ seed, scope })
        return true
      },
    }
    bindBetterSidebar(mockService)
    try {
      const manifest = {
        appId: 'app_creative_video_01',
        metadata: {
          name: '爆款创意短视频',
          category: 'video',
        },
      }
      const ok = openAppTab(manifest, { scope: { sessionId: 'sess-test-app' } })
      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.equal(opened[0].seed.type, APP_TAB_ID)
      assert.equal(opened[0].seed.id, 'app_app_creative_video_01')
      assert.equal(opened[0].seed.title, '爆款创意短视频')
      assert.equal(opened[0].seed.path, 'app://app_creative_video_01')
      assert.deepEqual(opened[0].seed.extra, { manifest, appId: 'app_creative_video_01' })
      assert.deepEqual(opened[0].scope, { sessionId: 'sess-test-app' })
    } finally {
      bindBetterSidebar(null)
    }
  })

  it('openAppTab supports fallback and opts parameters when manifest fields are missing', () => {
    const opened = []
    const mockService = {
      openTab(seed, scope) {
        opened.push({ seed, scope })
        return true
      },
    }
    bindBetterSidebar(mockService)
    try {
      const ok = openAppTab({}, { appId: 'custom_id_99', title: '自定义标题' })
      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.equal(opened[0].seed.type, APP_TAB_ID)
      assert.equal(opened[0].seed.id, 'app_custom_id_99')
      assert.equal(opened[0].seed.title, '自定义标题')
      assert.equal(opened[0].seed.path, 'app://custom_id_99')
      assert.equal(opened[0].seed.extra.appId, 'custom_id_99')
    } finally {
      bindBetterSidebar(null)
    }
  })

  it('openAppTab returns false when sidebar service is missing or lacks openTab', () => {
    bindBetterSidebar(null)
    assert.equal(openAppTab({ appId: 'no_service' }), false)
    bindBetterSidebar({})
    assert.equal(openAppTab({ appId: 'no_open_tab' }), false)
    bindBetterSidebar(null)
  })

  it('window.__omnimuxOpenAppTab delegates to openAppTab', () => {
    const previous = globalThis.window
    const fakeWin = {}
    globalThis.window = fakeWin
    const opened = []
    const mockService = {
      openTab(seed, scope) {
        opened.push({ seed, scope })
        return true
      },
    }
    try {
      bindBetterSidebar(mockService)
      assert.equal(typeof fakeWin.__omnimuxOpenAppTab, 'function')
      const ok = fakeWin.__omnimuxOpenAppTab({ appId: 'from_window_global', metadata: { name: '全局打开测试' } })
      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.equal(opened[0].seed.id, 'app_from_window_global')
      assert.equal(opened[0].seed.title, '全局打开测试')
    } finally {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
      bindBetterSidebar(null)
    }
  })
})

describe('空会话打开应用自动全屏', () => {
  function fakeDoc({ hero }) {
    return {
      querySelector(selector) {
        if (selector === '[data-phase="hero"]') return hero ? { nodeType: 1 } : null
        return null
      },
    }
  }

  it('hero 阶段 + 中枢缝就绪：在程序化保护内调用缝一次', () => {
    const calls = []
    const guard = []
    const doc = fakeDoc({ hero: true })
    const win = {
      document: doc,
      __omnimuxEnterRightSidebarFullscreen: (arg) => { calls.push(arg); return true },
      __omnimuxTabViewport: {
        beginProgrammatic() { guard.push('begin') },
        endProgrammatic() { guard.push('end') },
      },
    }
    assert.equal(enterFullscreenWhenBlankConversation(win), true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0], doc)
    assert.deepEqual(guard, ['begin', 'end'], '必须包在调和器程序化保护内，且成对出现')
  })

  it('非 hero 阶段（已有对话）：不调用缝，返回 false', () => {
    const calls = []
    const win = {
      document: fakeDoc({ hero: false }),
      __omnimuxEnterRightSidebarFullscreen: () => { calls.push(1); return true },
    }
    assert.equal(enterFullscreenWhenBlankConversation(win), false)
    assert.equal(calls.length, 0)
  })

  it('中枢缝缺失或抛错：安静降级 false，绝不阻断', () => {
    assert.equal(enterFullscreenWhenBlankConversation({ document: fakeDoc({ hero: true }) }), false)
    const win = {
      document: fakeDoc({ hero: true }),
      __omnimuxEnterRightSidebarFullscreen: () => { throw new Error('boom') },
    }
    assert.equal(enterFullscreenWhenBlankConversation(win), false)
    assert.equal(enterFullscreenWhenBlankConversation(null), false)
  })

  it('openAppTab 在空会话页打开应用后自动全屏；非空会话不触发', () => {
    const previous = globalThis.window
    const mockService = { openTab() { return true } }
    const enterCalls = []
    const guard = []
    const makeWin = (hero) => ({
      document: fakeDoc({ hero }),
      dispatchEvent() {},
      CustomEvent: class {},
      __omnimuxEnterRightSidebarFullscreen: () => { enterCalls.push(1); return true },
      __omnimuxTabViewport: {
        beginProgrammatic() { guard.push('begin') },
        endProgrammatic() { guard.push('end') },
      },
    })
    try {
      globalThis.window = makeWin(true)
      bindBetterSidebar(mockService)
      assert.equal(openAppTab({ appId: 'hero_app' }), true)
      assert.equal(enterCalls.length, 1, '空会话页打开应用必须自动进入全屏')
      assert.deepEqual(guard, ['begin', 'end'], '自动全屏必须包在调和器程序化保护内')

      enterCalls.length = 0
      guard.length = 0
      globalThis.window = makeWin(false)
      assert.equal(openAppTab({ appId: 'active_app' }), true)
      assert.equal(enterCalls.length, 0, '已有对话时打开应用不得动布局')
      assert.deepEqual(guard, [], '非空会话不得进入程序化保护')
    } finally {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
      bindBetterSidebar(null)
    }
  })
})
