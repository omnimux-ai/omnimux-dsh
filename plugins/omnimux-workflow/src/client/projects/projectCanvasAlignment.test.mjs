/**
 * P1-1 回归：会话对齐超时后仍保证最终一致。
 *
 * 目标会话非前台时 activateProjectCanvas 先按目标 scope 打开画布；对齐窗口内
 * 不写任何 meta。超时后挂一次右侧栏快照监听，等目标会话真正成为前台再补
 * openTab + commit，成功后立即解绑；插件换绑/卸载时也要解绑。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activateProjectCanvas,
  bindBetterSidebar,
  CANVAS_TAB_ID,
} from './projectCanvas.js'

class MockCustomEvent {
  constructor(name, init) {
    this.name = name
    this.type = name
    this.detail = init?.detail
  }
}

function installWindow() {
  const previous = globalThis.window
  const events = []
  globalThis.window = {
    CustomEvent: MockCustomEvent,
    dispatchEvent(event) { events.push(event); return true },
  }
  return {
    events,
    restore() {
      if (previous === undefined) delete globalThis.window
      else globalThis.window = previous
    },
  }
}

/** 有快照订阅能力的假侧栏：手动控制前台会话。 */
function createSidebar(initialSessionId) {
  const opened = []
  const updated = []
  let currentSessionId = initialSessionId
  const listeners = new Set()
  let unsubscribeCalls = 0
  const service = {
    getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
    getSnapshot() {
      return { sessionId: currentSessionId, state: { splits: { kind: 'leaf', tabs: [] } } }
    },
    openTab(seed, scope) { opened.push({ seed, scope }) },
    updateTab(tabId, data) { updated.push({ tabId, data }) },
    subscribeState(listener) {
      listeners.add(listener)
      return () => {
        unsubscribeCalls += 1
        listeners.delete(listener)
      }
    },
  }
  return {
    service,
    opened,
    updated,
    get unsubscribeCalls() { return unsubscribeCalls },
    get listenerCount() { return listeners.size },
    switchForeground(sessionId) {
      currentSessionId = sessionId
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('P1-1 画布会话对齐超时后的最终一致', () => {
  it('超时窗口内零写入，目标会话成为前台后才补 openTab + meta，随即解绑', async () => {
    const windowHarness = installWindow()
    const sidebar = createSidebar('sess-current')
    try {
      const ok = await activateProjectCanvas({
        betterSidebar: sidebar.service,
        sessionNavigation: { openSession() {} },
        t: (key) => key,
      }, {
        sessionId: 'sess-target',
        cwd: '/tmp/ws',
        canvasWorkspaceId: 'ws_target',
        alignmentTimeoutMs: 0,
      })

      assert.equal(ok, true)
      assert.equal(sidebar.opened.length, 1, '对齐全之前只开一次目标 scope 的画布')
      assert.equal(sidebar.opened[0].scope.sessionId, 'sess-target')
      assert.equal(sidebar.updated.length, 0, '对齐窗口内不得写 meta')
      assert.equal(windowHarness.events.length, 0, '对齐窗口内不得广播')
      assert.equal(sidebar.listenerCount, 1, '超时后必须挂上补位监听')

      // 前台还是别的会话：监听不得向当前会话写任何 meta。
      sidebar.switchForeground('sess-current')
      assert.equal(sidebar.opened.length, 1)
      assert.equal(sidebar.updated.length, 0)
      assert.equal(windowHarness.events.length, 0)

      // 目标会话真正成为前台：补一次带 scope 的 openTab，再写 meta/广播。
      sidebar.switchForeground('sess-target')
      assert.equal(sidebar.opened.length, 2)
      assert.equal(sidebar.opened[1].seed.meta.canvasSessionId, 'sess-target')
      assert.equal(sidebar.opened[1].scope.sessionId, 'sess-target')
      assert.equal(sidebar.updated.length, 1)
      assert.equal(sidebar.updated[0].data.meta.canvasWorkspaceId, 'ws_target')
      assert.equal(sidebar.updated[0].data.meta.canvasSessionId, 'sess-target')
      assert.equal(windowHarness.events.length, 0, '不再派发全局画布事件')
      assert.equal(sidebar.listenerCount, 0, '补位成功必须解绑监听')
      assert.equal(sidebar.unsubscribeCalls, 1)
    } finally {
      bindBetterSidebar(null)
      windowHarness.restore()
    }
  })

  it('同一会话重复激活时只保留最新目标：旧监听被解绑，不覆盖新画布', async () => {
    const windowHarness = installWindow()
    const sidebar = createSidebar('sess-current')
    try {
      await activateProjectCanvas({
        betterSidebar: sidebar.service,
        sessionNavigation: { openSession() {} },
        t: (key) => key,
      }, {
        sessionId: 'sess-target',
        canvasWorkspaceId: 'ws_old',
        alignmentTimeoutMs: 0,
      })
      await activateProjectCanvas({
        betterSidebar: sidebar.service,
        sessionNavigation: { openSession() {} },
        t: (key) => key,
      }, {
        sessionId: 'sess-target',
        canvasWorkspaceId: 'ws_new',
        alignmentTimeoutMs: 0,
      })

      assert.equal(sidebar.listenerCount, 1, '旧监听必须被本次点击取代')
      sidebar.switchForeground('sess-target')
      const lastMeta = sidebar.updated.at(-1)?.data?.meta
      assert.equal(lastMeta?.canvasWorkspaceId, 'ws_new', '最终画布必须是最近一次点击的目标')
      assert.equal(sidebar.listenerCount, 0)
    } finally {
      bindBetterSidebar(null)
      windowHarness.restore()
    }
  })

  it('侧栏服务换绑/卸载时解绑补位监听，之后不再写 meta', async () => {
    const windowHarness = installWindow()
    const sidebar = createSidebar('sess-current')
    try {
      await activateProjectCanvas({
        betterSidebar: sidebar.service,
        sessionNavigation: { openSession() {} },
        t: (key) => key,
      }, {
        sessionId: 'sess-target',
        canvasWorkspaceId: 'ws_target',
        alignmentTimeoutMs: 0,
      })
      assert.equal(sidebar.listenerCount, 1)

      bindBetterSidebar(sidebar.service)
      assert.equal(sidebar.listenerCount, 0, '换绑必须先解绑旧监听')
      assert.equal(sidebar.unsubscribeCalls, 1)

      sidebar.switchForeground('sess-target')
      assert.equal(sidebar.opened.length, 1, '解绑后不得再补 openTab')
      assert.equal(sidebar.updated.length, 0)
      assert.equal(windowHarness.events.length, 0)
    } finally {
      bindBetterSidebar(null)
      windowHarness.restore()
    }
  })
})
