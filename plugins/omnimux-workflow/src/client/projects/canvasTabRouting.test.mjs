/**
 * 创作页新建与画布路由交互审查规范测试（AC-01 ~ AC-06）
 * 覆盖：
 * 1. resolveCanvasTargetWorkspaceId 优先级与 P0 透传；
 * 2. activateProjectCanvas 穿透单例更新 tab.meta 与 scope；
 * 3. active-canvas-changed 事件广播机制；
 * 4. 换会话隔离与旧状态自动作废。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  activateProjectCanvas,
  CANVAS_TAB_ID,
  resolveCanvasTargetWorkspaceId,
} from './projectCanvas.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('Canvas Tab Routing and Workspace Activation Contract', () => {
  it('AC-01/02: resolveCanvasTargetWorkspaceId 优先采用 explicitWorkspaceId 或 tab.meta.canvasWorkspaceId (P0)', () => {
    // 1. explicitWorkspaceId 优先
    const res1 = resolveCanvasTargetWorkspaceId({
      explicitWorkspaceId: 'ws_explicit_1',
      tab: { meta: { canvasWorkspaceId: 'ws_tab_meta_1' } },
      pickedBySession: { sessionId: 's1', workspaceId: 'ws_picked' },
      sessionBinding: { sessionId: 's1', canvasWorkspaceId: 'ws_bound' },
      sessionId: 's1',
    })
    assert.equal(res1, 'ws_explicit_1')

    // 2. 无 explicitWorkspaceId 时，tab.meta.canvasWorkspaceId 作为 P0 优先于 pickedBySession 与 sessionBinding
    const res2 = resolveCanvasTargetWorkspaceId({
      tab: { meta: { canvasWorkspaceId: 'ws_tab_meta_1' } },
      pickedBySession: { sessionId: 's1', workspaceId: 'ws_picked' },
      sessionBinding: { sessionId: 's1', canvasWorkspaceId: 'ws_bound' },
      sessionId: 's1',
    })
    assert.equal(res2, 'ws_tab_meta_1')
  })

  it('AC-03: activateProjectCanvas 穿透单例更新 meta', async () => {
    const opened = []
    const updated = []
    const events = []
    const previousWin = globalThis.window

    const service = {
      getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
      getSnapshot() {
        return {
          sessionId: 'sess-p1',
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
        events.push(e)
        return true
      },
      __omnimuxBetterSidebar: service,
    }

    try {
      const ok = await activateProjectCanvas({
        betterSidebar: service,
        t: (k) => k,
      }, {
        sessionId: 'sess-p1',
        cwd: '/path/to/project',
        title: '创作页 3',
        canvasWorkspaceId: 'ws_canvas_page_3',
        timeoutMs: 0,
      })

      assert.equal(ok, true)
      assert.equal(opened.length, 1)
      assert.equal(opened[0].seed.meta?.canvasWorkspaceId, 'ws_canvas_page_3')
      assert.equal(opened[0].seed.meta?.canvasSessionId, 'sess-p1')
      assert.equal(opened[0].scope?.canvasWorkspaceId, 'ws_canvas_page_3')

      // 单例已打开时必须显式 updateTab 覆盖 meta 并记录 canvasSessionId (缺陷 3)
      assert.equal(updated.length, 1)
      assert.equal(updated[0].tabId, CANVAS_TAB_ID)
      assert.equal(updated[0].data?.meta?.canvasWorkspaceId, 'ws_canvas_page_3')
      assert.equal(updated[0].data?.meta?.canvasSessionId, 'sess-p1')

      // 不再派发全局画布事件。
      assert.equal(events.length, 0)
    } finally {
      globalThis.window = previousWin
      globalThis.CustomEvent = previousCustomEvent
    }
  })

  it('AC-04: 切换会话后旧会话的选中状态不应跨会话污染', () => {
    // 旧会话点过创作页 2，切到新会话后，新会话所属项目有自己的创作页 1
    const res = resolveCanvasTargetWorkspaceId({
      pickedBySession: { sessionId: 'sess-old', workspaceId: 'ws_canvas_old_page_2' },
      sessionBinding: { sessionId: 'sess-new', canvasWorkspaceId: 'ws_canvas_new_page_1' },
      sessionId: 'sess-new',
    })
    assert.equal(res, 'ws_canvas_new_page_1', '新会话不应被旧会话的 pickedBySession 污染')
  })

  it('AC-05: 【缺陷 1 整改】tab.meta 跨会话隔离：非本会话的 tab.meta 严格阻断渗透', () => {
    // 场景 A：tab.meta 残留了旧会话（sess-old）的 canvasSessionId，当前是新会话（sess-new）
    // resolveCanvasTargetWorkspaceId 必须忽略旧会话的 tab.meta，回退到本会话的 sessionBinding
    const resStaleMeta = resolveCanvasTargetWorkspaceId({
      tab: {
        meta: {
          canvasWorkspaceId: 'ws_stale_from_old_session',
          canvasSessionId: 'sess-old',
        },
      },
      sessionBinding: { sessionId: 'sess-new', canvasWorkspaceId: 'ws_correct_bound_for_new' },
      sessionId: 'sess-new',
    })
    assert.equal(resStaleMeta, 'ws_correct_bound_for_new', '旧会话的 tab.meta 绝不能渗透到新会话中')

    // 场景 B：tab.meta 的 canvasSessionId 与当前 sessionId 一致，成功作为 P0 采纳
    const resMatchedMeta = resolveCanvasTargetWorkspaceId({
      tab: {
        meta: {
          canvasWorkspaceId: 'ws_current_session_canvas',
          canvasSessionId: 'sess-new',
        },
      },
      sessionBinding: { sessionId: 'sess-new', canvasWorkspaceId: 'ws_fallback_binding' },
      sessionId: 'sess-new',
    })
    assert.equal(resMatchedMeta, 'ws_current_session_canvas', '本会话匹配的 tab.meta 应作为 P0 正常采纳')
  })

  it('AC-06: CanvasTab 只读 WorkspaceContextStore，不再保留会话级画布缓存', () => {
    const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
    assert.match(src, /useWorkspaceContext\(workspaceContext\)/)
    assert.match(src, /resolveWorkspaceContextPage\(project, pageId\)/)
    assert.doesNotMatch(src, /isTabMetaValidForSession/)
    assert.doesNotMatch(src, /pickedBySession/)
    assert.doesNotMatch(src, /omnimux:active-canvas-changed/)
  })

  it('AC-07: 【缺陷 3 整改】activateProjectCanvas 完整携带 sessionId 与 projectId 等上下文', async () => {
    const events = []
    const updated = []
    const previousWin = globalThis.window

    class MockCustomEvent {
      constructor(name, init) {
        this.name = name
        this.detail = init?.detail
      }
    }

    const service = {
      getTab(id) { return id === CANVAS_TAB_ID ? { id } : undefined },
      getSnapshot() { return { sessionId: 'sess-ctx', state: { splits: { kind: 'leaf', tabs: [] } } } },
      openTab() {},
      updateTab(tabId, data) { updated.push({ tabId, data }) },
    }

    globalThis.window = {
      CustomEvent: MockCustomEvent,
      dispatchEvent(e) { events.push(e); return true },
      __omnimuxBetterSidebar: service,
    }

    try {
      await activateProjectCanvas({
        betterSidebar: service,
        t: (k) => k,
      }, {
        sessionId: 'sess-ctx',
        projectId: 'proj-123',
        pageId: 'page-456',
        canvasWorkspaceId: 'ws_full_ctx',
        timeoutMs: 0,
      })

      // 不再派发全局画布事件。
      assert.equal(events.length, 0)

      // 验证 updateTab 的 meta 携带了 canvasWorkspaceId 与 canvasSessionId
      assert.equal(updated.length, 1)
      assert.equal(updated[0].data?.meta?.canvasWorkspaceId, 'ws_full_ctx')
      assert.equal(updated[0].data?.meta?.canvasSessionId, 'sess-ctx')
    } finally {
      globalThis.window = previousWin
    }
  })

  it('AC-08: CanvasTab 目标由上下文项目 activePage/pageId 解析', () => {
    const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
    assert.match(src, /const activePage = project \? resolveWorkspaceContextPage\(project, pageId\) : null/)
    assert.match(src, /const targetWorkspaceId = activePage\?\.canvasWorkspaceId \|\| scratchWorkspaceId/)
    assert.doesNotMatch(src, /explicitWorkspaceId/)
    assert.doesNotMatch(src, /validTabWsId/)
  })

  it('AC-09: ProjectLibraryPage handleOpenPage 委托 ProjectNavigationService', () => {
    const pageSrc = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8')
    assert.match(pageSrc, /const result = await navigation\.openPage\(selectedProject, page\)/)
    assert.doesNotMatch(pageSrc, /selectedProject\.sessionId/)
    assert.doesNotMatch(pageSrc, /omnimux:active-canvas-changed/)
  })
})
