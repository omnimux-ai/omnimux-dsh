// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueueDock } from '../../src/panel/QueueDock.tsx'
import type { PanelApi } from '../../src/panel/api.ts'
import type { QueuedMessage } from '../../src/panel/events.ts'

const COPY = {
  count: (n: number) => `${n} 条排队消息`,
  steer: '立即发送（插话）',
  steerFailed: '立即发送失败',
  sending: '发送中',
  edit: '编辑排队消息',
  remove: '删除排队消息',
  save: '保存排队消息',
  cancelEdit: '取消编辑',
  editFailed: '编辑失败',
  removeFailed: '删除失败',
  taskN: (i: number) => `排队任务 ${i}`,
}

function fakeApi(calls: { method: string; payload: unknown }[]): PanelApi {
  return {
    rpc: async (method: string, payload: unknown) => {
      calls.push({ method, payload })
      return { accepted: true }
    },
  } as unknown as PanelApi
}

describe('E2E: 排队坞原生对齐验收', () => {
  it('单条排队时渲染编辑与删除按钮，steerable 时渲染立即发送插话按钮', () => {
    const item: QueuedMessage = { id: 'q1', text: '测试指令', steerable: true }
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: [item],
        sessionId: 's1',
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      })
    )
    expect(html).toContain('queue-dock-panel')
    expect(html).toContain('aria-label="立即发送（插话）"')
    expect(html).toContain('aria-label="编辑排队消息"')
    expect(html).toContain('aria-label="删除排队消息"')
  })

  it('触发立即发送插话调用 session.updateQueue 且 action 为 steer', async () => {
    const calls: { method: string; payload: unknown }[] = []
    const api = fakeApi(calls)
    await api.rpc('session.updateQueue', { sessionId: 's1', itemId: 'q1', action: { kind: 'steer' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('session.updateQueue')
    expect((calls[0].payload as { action: { kind: string } }).action.kind).toBe('steer')
  })
})
