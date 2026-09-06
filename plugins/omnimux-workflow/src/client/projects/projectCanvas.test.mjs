import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activateProjectCanvas,
  applyProjectCanvasRatio,
  bindBetterSidebar,
  CANVAS_SENTINEL_PATH,
  CANVAS_TAB_ID,
  collectTabs,
  factorySidebarWidthPx,
  isSeedFilesTab,
  leftoverHalfSidebarWidthPx,
  legacyProjectCanvasWidthPx,
  officialSessionSidebarWidth,
  PROJECT_CANVAS_MIN_PX,
  PROJECT_CANVAS_RATIO,
  projectCanvasWidthPx,
  resetProjectCanvasRatioMemory,
  shouldApplyProjectCanvasRatio,
} from './projectCanvas.js'

describe('projectCanvas isolation', () => {
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
})
