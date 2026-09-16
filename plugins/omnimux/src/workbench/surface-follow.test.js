import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SURFACE_MAP,
  decideSurfaceFollow,
  isAutoFollowEnabled,
  isUserTakeover,
  mountSurfaceFollow,
  resolveSurfaceForTool,
} from './surface-follow.js'

describe('Surface follow · 映射表', () => {
  it('把各工作面工具解析到对应页签', () => {
    assert.equal(resolveSurfaceForTool('workflow_create'), 'omnimux-workflow:canvas')
    assert.equal(resolveSurfaceForTool('workflow_node_add'), 'omnimux-workflow:canvas')
    assert.equal(resolveSurfaceForTool('canvas_write_table_node'), 'omnimux-workflow:canvas')
    assert.equal(resolveSurfaceForTool('clip_edit'), 'omnimux-clip:studio')
    assert.equal(resolveSurfaceForTool('products_list'), 'omnimux-products:library')
    assert.equal(resolveSurfaceForTool('inspiration_get'), 'omnimux-inspiration:library')
    assert.equal(resolveSurfaceForTool('omnimux_inspiration_list'), 'omnimux-inspiration:library')
    assert.equal(resolveSurfaceForTool('omnimux_image_submit'), 'omnimux:media-viewer')
    assert.equal(resolveSurfaceForTool('image_generate'), 'omnimux:media-viewer')
  })

  it('容忍命名空间前缀，且不误判非工作面工具', () => {
    assert.equal(resolveSurfaceForTool('default_api:workflow_create'), 'omnimux-workflow:canvas')
    assert.equal(resolveSurfaceForTool('video_breakdown_analyze'), null)
    assert.equal(resolveSurfaceForTool('video_process'), null)
    assert.equal(resolveSurfaceForTool('read'), null)
    assert.equal(resolveSurfaceForTool(''), null)
    assert.equal(resolveSurfaceForTool(undefined), null)
  })

  it('映射表快照可枚举（供设置页与文档引用）', () => {
    assert.ok(SURFACE_MAP.length >= 8)
    assert.ok(SURFACE_MAP.every((row) => typeof row.pattern === 'string' && row.tabId.includes(':')))
  })
})

describe('Surface follow · 开关', () => {
  it('默认启用；显式关闭或用户禁用 Agent 切页时停用', () => {
    assert.equal(isAutoFollowEnabled(null), true)
    assert.equal(isAutoFollowEnabled({}), true)
    assert.equal(isAutoFollowEnabled({ allowAutoSurfaceFollow: true }), true)
    assert.equal(isAutoFollowEnabled({ allowAutoSurfaceFollow: false }), false)
    assert.equal(isAutoFollowEnabled({ allowAgentSwitchTab: false }), false)
  })
})

describe('Surface follow · 决策', () => {
  const base = {
    follow: { enabled: true, followedTabIds: new Set() },
    toolName: 'workflow_create',
    turn: 2,
    sessionId: 's1',
    activeTabId: 'omnimux:media-viewer',
    panelOpen: true,
  }

  it('工作面工具命中且目标页签未激活时切换', () => {
    assert.deepEqual(decideSurfaceFollow(base), { action: 'switch', tabId: 'omnimux-workflow:canvas' })
  })

  it('目标页签已是当前页签时不切（already-active）', () => {
    const out = decideSurfaceFollow({ ...base, activeTabId: 'omnimux-workflow:canvas' })
    assert.deepEqual(out, { action: 'skip', code: 'already-active' })
  })

  it('同一轮内同一工作面只切一次（防抖动）', () => {
    const out = decideSurfaceFollow({
      ...base,
      follow: { enabled: true, followedTabIds: new Set(['omnimux-workflow:canvas']) },
    })
    assert.deepEqual(out, { action: 'skip', code: 'already-followed-this-turn' })
  })

  it('面板收起时不弹出（收起不打扰）', () => {
    const out = decideSurfaceFollow({ ...base, panelOpen: false })
    assert.deepEqual(out, { action: 'skip', code: 'panel-collapsed' })
  })

  it('用户本轮手动接管后停用（用户优先）', () => {
    const out = decideSurfaceFollow({
      ...base,
      follow: { enabled: true, followedTabIds: new Set(), mutedSessionId: 's1', mutedTurn: 2 },
    })
    assert.deepEqual(out, { action: 'skip', code: 'user-took-over' })
  })

  it('停用开关生效；非工作面工具永不触发', () => {
    assert.deepEqual(decideSurfaceFollow({ ...base, follow: { enabled: false } }), { action: 'skip', code: 'disabled' })
    assert.deepEqual(decideSurfaceFollow({ ...base, toolName: 'video_process' }), {
      action: 'skip',
      code: 'not-a-surface-tool',
    })
  })

  it('识别用户接管：当前页签既不是上次自动目标、也不是本次目标', () => {
    assert.equal(
      isUserTakeover({ lastAutoTabId: 'omnimux:media-viewer', activeTabId: 'omnimux-products:library', targetTabId: 'omnimux-workflow:canvas' }),
      true,
    )
    assert.equal(
      isUserTakeover({ lastAutoTabId: 'omnimux:media-viewer', activeTabId: 'omnimux:media-viewer', targetTabId: 'omnimux-workflow:canvas' }),
      false,
    )
    assert.equal(isUserTakeover({ lastAutoTabId: null, activeTabId: 'x', targetTabId: 'y' }), false)
  })
})

describe('Surface follow · 宿主挂载', () => {
  function harness({ settings = null, surface = { panelOpen: true, tabId: 'omnimux:media-viewer' } } = {}) {
    const handlers = new Map()
    const ctx = { on: (ev, fn) => { handlers.set(ev, fn); return () => handlers.delete(ev) } }
    const rpcCalls = []
    let current = surface
    const mailbox = {
      getActiveView: () => ({ ok: true, uiContext: { sessionId: 's1', surface: current } }),
      sendRpc: async (payload) => { rpcCalls.push(payload); current = { ...current, tabId: payload.tabId }; return { ok: true, applied: true } },
    }
    mountSurfaceFollow(ctx, { mailbox, getSettings: () => settings })
    const run = async (name, turn = 2) => {
      await handlers.get('tools/execute')({ name, turn, agent: { session: { id: 's1' } } }, async () => ({ isError: false }))
    }
    return { run, rpcCalls, setSurface: (s) => { current = s } }
  }

  it('工具执行时自动切到对应工作面，并复用既有 RPC 通道', async () => {
    const h = harness()
    await h.run('workflow_create')
    assert.equal(h.rpcCalls.length, 1)
    assert.equal(h.rpcCalls[0].method, 'open')
    assert.equal(h.rpcCalls[0].tabId, 'omnimux-workflow:canvas')
    assert.equal(h.rpcCalls[0].auto, true)
  })

  it('同一轮内连续写多个节点只切一次', async () => {
    const h = harness()
    await h.run('workflow_create')
    await h.run('workflow_node_add')
    await h.run('canvas_write_table_node')
    assert.equal(h.rpcCalls.length, 1)
  })

  it('用户手动切走后本轮不再抢画面', async () => {
    const h = harness()
    await h.run('workflow_create') // 自动切到画布
    h.setSurface({ panelOpen: true, tabId: 'omnimux-products:library' }) // 用户自己切走
    await h.run('workflow_node_add', 2) // 同轮
    assert.equal(h.rpcCalls.length, 1, '接管后不应再切换')
  })

  it('面板收起时不切换；开关关闭时不切换', async () => {
    const collapsed = harness({ surface: { panelOpen: false, tabId: 'omnimux:media-viewer' } })
    await collapsed.run('workflow_create')
    assert.equal(collapsed.rpcCalls.length, 0)

    const disabled = harness({ settings: { allowAutoSurfaceFollow: false } })
    await disabled.run('workflow_create')
    assert.equal(disabled.rpcCalls.length, 0)
  })

  it('非工作面工具不触发，且始终放行下游执行', async () => {
    const h = harness()
    let passed = 0
    const handlers = new Map()
    const ctx = { on: (ev, fn) => { handlers.set(ev, fn); return () => {} } }
    mountSurfaceFollow(ctx, {
      mailbox: { getActiveView: () => ({ ok: true, uiContext: { surface: { panelOpen: true, tabId: 'x' } } }), sendRpc: async () => ({}) },
      getSettings: () => null,
    })
    await handlers.get('tools/execute')(
      { name: 'video_process', turn: 1, agent: { session: { id: 's1' } } },
      async () => { passed += 1; return { isError: false } },
    )
    assert.equal(passed, 1)
    assert.equal(h.rpcCalls.length, 0)
  })

  it('RPC 失败不阻断工具执行', async () => {
    const handlers = new Map()
    const ctx = { on: (ev, fn) => { handlers.set(ev, fn); return () => {} } }
    mountSurfaceFollow(ctx, {
      mailbox: {
        getActiveView: () => ({ ok: true, uiContext: { surface: { panelOpen: true, tabId: 'other' } } }),
        sendRpc: async () => { throw new Error('rpc down') },
      },
      getSettings: () => null,
    })
    let passed = 0
    await handlers.get('tools/execute')(
      { name: 'workflow_create', turn: 1, agent: { session: { id: 's1' } } },
      async () => { passed += 1; return { isError: false } },
    )
    assert.equal(passed, 1)
  })
})
