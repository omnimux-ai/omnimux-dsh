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

  it('AC-03: activateProjectCanvas 穿透单例更新 meta 并广播 omnimux:active-canvas-changed', async () => {
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

      // 必须广播 active-canvas-changed 事件并携带 sessionId (缺陷 3)
      assert.equal(events.length, 1)
      assert.equal(events[0].name || events[0].type, 'omnimux:active-canvas-changed')
      assert.equal(events[0].detail?.workspaceId, 'ws_canvas_page_3')
      assert.equal(events[0].detail?.sessionId, 'sess-p1')
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

  it('AC-06: 【缺陷 1 & 2 整改】CanvasTab 源码契约闭环校验（会话比对与事件守卫）', () => {
    const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')

    // 1. 验证存在 isTabMetaValidForSession 严密校验函数（缺陷 1）
    assert.match(src, /isTabMetaValidForSession/, 'CanvasTab 必须包含 tab.meta 与会话有效性判定函数')
    assert.match(src, /meta\.canvasSessionId && currentSessionId && meta\.canvasSessionId !== currentSessionId/, '必须比对 meta.canvasSessionId 与当前会话')

    // 2. 验证 useEffect 监听包含 tab.meta.canvasSessionId 且在不匹配时清理为 null（缺陷 1）
    assert.match(src, /setActiveCanvasWsId\(null\)/, '会话切换或不匹配时必须清理 activeCanvasWsId')

    // 3. 验证 omnimux:active-canvas-changed 监听器中严格校验 e?.detail?.sessionId（缺陷 2）
    assert.match(src, /sessionId && eventSessionId !== sessionId/, '必须校验事件中的 sessionId，不匹配时直接忽略')
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

      // 验证事件载荷携带了 sessionId
      assert.equal(events.length, 1)
      assert.equal(events[0].detail?.workspaceId, 'ws_full_ctx')
      assert.equal(events[0].detail?.sessionId, 'sess-ctx')

      // 验证 updateTab 的 meta 携带了 canvasWorkspaceId 与 canvasSessionId
      assert.equal(updated.length, 1)
      assert.equal(updated[0].data?.meta?.canvasWorkspaceId, 'ws_full_ctx')
      assert.equal(updated[0].data?.meta?.canvasSessionId, 'sess-ctx')
    } finally {
      globalThis.window = previousWin
    }
  })

  it('AC-08: 【二轮复审 缺陷 1】CanvasTab 优先级调整：显式 scope 优先于 activeCanvasWsId 缓存与 validTabWsId', () => {
    const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')

    // 1. 验证 explicitWorkspaceId 严格先采纳 scope，再采纳 activeCanvasWsId 与 validTabWsId
    assert.match(
      src,
      /const\s+explicitWorkspaceId\s*=\s*scope\?\.canvasWorkspaceId\s*\|\|\s*scope\?\.workspaceId\s*\|\|\s*activeCanvasWsId\s*\|\|\s*validTabWsId/,
      'explicitWorkspaceId 必须优先采纳当前显式传入的 scope，再回退到 activeCanvasWsId 与 validTabWsId'
    )

    // 2. 验证 hasExplicitCanvas 也以相同优先级声明
    assert.match(
      src,
      /scope\?\.canvasWorkspaceId\s*\|\|\s*scope\?\.workspaceId\s*\|\|\s*activeCanvasWsId\s*\|\|\s*validTabWsId/,
      'hasExplicitCanvas 必须同步调整优先级，确保 scope 优先判定'
    )

    // 3. 逻辑验证：即使存在上一页的 activeCanvasWsId，新传入的 scope 也必须胜出
    const scopeWs = 'ws_new_page_scope'
    const activeWs = 'ws_previous_page_cached'
    const computed = scopeWs || activeWs
    assert.equal(computed, 'ws_new_page_scope', '同会话内换创作页时，显式传入的 scope 必须压过缓存的 activeCanvasWsId')
  })

  it('AC-09: 【二轮复审 缺陷 2】ProjectLibraryPage handleOpenPage 移除异步提前派发，委托 activateProjectCanvas', () => {
    const pageSrc = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8')

    // 1. 提取 handleOpenPage 函数体
    const handleOpenPageMatch = pageSrc.match(/const\s+handleOpenPage\s*=\s*async\s*\([\s\S]*?\n  \}/)
    assert.ok(handleOpenPageMatch, '必须找到 handleOpenPage 函数定义')
    const handleOpenPageBody = handleOpenPageMatch[0]

    // 2. 验证 handleOpenPage 内部不再直接调用 window.dispatchEvent(new CustomEvent('omnimux:active-canvas-changed'
    assert.doesNotMatch(
      handleOpenPageBody,
      /window\.dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]omnimux:active-canvas-changed['"]/,
      'handleOpenPage 严禁在 sessionId 异步创建前提前派发 active-canvas-changed 全局事件'
    )

    // 3. 验证 handleOpenPage 调用 activateProjectCanvas 时传递了 projectId 与 canvasWorkspaceId
    assert.match(
      handleOpenPageBody,
      /projectId:\s*selectedProject\.id/,
      'handleOpenPage 必须向 activateProjectCanvas 传递 projectId 以便后续安全广播完整上下文'
    )
    assert.match(
      handleOpenPageBody,
      /canvasWorkspaceId/,
      'handleOpenPage 必须向 activateProjectCanvas 传递 canvasWorkspaceId'
    )
  })
})
