/**
 * 当前会话真源（Issue #3800）。
 *
 * 背景：Dev 实装的侧栏支持包 0.19.1 只读 `sessions.list.getSnapshot().current`
 * 来设自己的会话槽位；rc.3 运行时在该字段留空时它的槽位永远为空，`openTab`
 * 直接返回，侧栏一级入口点击全废。
 *
 * 本仓解析会话的顺序固定为：`sidebarRight.mounted`（在屏）→ `sessions.list.current`
 * （选中）。两者都是官方契约字段，读不到就返回 undefined，绝不猜。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  currentSessionId,
  mountedSessionId,
  resetWorkbenchHostAdapter,
  bindWorkbenchDeps,
} from './host-adapter.js'

afterEach(() => {
  resetWorkbenchHostAdapter()
})

/** 官方 `ObservableSnapshot` 形状的极简桩。 */
function snapshotOf(value) {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

/** sessions 列表桩。 */
function sessionsOf(snapshot) {
  return { list: { getSnapshot: () => snapshot, subscribe: () => () => {} } }
}

test('mountedSessionId 读官方 sidebarRight.mounted', () => {
  bindWorkbenchDeps({ sidebarRight: { mounted: snapshotOf('sess-abc') } })
  assert.equal(mountedSessionId(), 'sess-abc')
})

test('mountedSessionId 在无 sidebarRight / 无 mounted / 空值时返回 undefined', () => {
  bindWorkbenchDeps({ sidebarRight: null })
  assert.equal(mountedSessionId(), undefined)

  bindWorkbenchDeps({ sidebarRight: {} })
  assert.equal(mountedSessionId(), undefined)

  bindWorkbenchDeps({ sidebarRight: { mounted: snapshotOf(undefined) } })
  assert.equal(mountedSessionId(), undefined)

  bindWorkbenchDeps({ sidebarRight: { mounted: snapshotOf('') } })
  assert.equal(mountedSessionId(), undefined)
})

test('mountedSessionId 把宿主读取异常收敛为 undefined，不冒泡', () => {
  bindWorkbenchDeps({
    sidebarRight: { mounted: { getSnapshot: () => { throw new Error('cordis proxy') } } },
  })
  assert.equal(mountedSessionId(), undefined)
})

test('currentSessionId 优先返回 mounted（在屏），而不是列表选中项', () => {
  bindWorkbenchDeps({
    sidebarRight: { mounted: snapshotOf('mounted-sess') },
    sessions: sessionsOf({ current: 'selected-sess', phase: 'ready' }),
  })
  assert.equal(currentSessionId(), 'mounted-sess')
})

test('mounted 缺失时回落到列表的 current（选中）', () => {
  bindWorkbenchDeps({
    sidebarRight: null,
    sessions: sessionsOf({ current: 'selected-sess', phase: 'ready' }),
  })
  assert.equal(currentSessionId(), 'selected-sess')
})

test('mounted 为空值时仍回落到 current，不因空串短路', () => {
  bindWorkbenchDeps({
    sidebarRight: { mounted: snapshotOf(undefined) },
    sessions: sessionsOf({ current: 'selected-sess' }),
  })
  assert.equal(currentSessionId(), 'selected-sess')
})

test('两个来源都没有时返回 undefined，绝不拿列表首项冒充', () => {
  bindWorkbenchDeps({
    sidebarRight: null,
    sessions: sessionsOf({ current: undefined, phase: 'ready', ids: ['a'] }),
  })
  assert.equal(currentSessionId(), undefined)
})

test('currentSessionId 在 sessions 缺失或抛错时安全返回 undefined', () => {
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
  assert.equal(currentSessionId(), undefined)

  bindWorkbenchDeps({
    sidebarRight: null,
    sessions: { list: { getSnapshot: () => { throw new Error('boom') } } },
  })
  assert.equal(currentSessionId(), undefined)
})
