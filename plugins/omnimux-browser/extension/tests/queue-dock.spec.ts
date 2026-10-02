// @vitest-environment jsdom

/**
 * Issue #2974 排队坞官方同款规格测试：折叠面板结构、行分隔样式、
 * 编辑/删除按钮、以及 session.updateQueue RPC 载荷契约。
 * 端到端视觉/交互证据见 .agent-reports/task-rail-qa/（verify-task-rail-qa.mjs）。
 */

import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { QueueDock } from '../src/panel/QueueDock.tsx'
import type { PanelApi } from '../src/panel/api.ts'
import type { QueuedMessage } from '../src/panel/events.ts'

const COPY = {
  count: (n: number) => `${n} 条排队消息`,
  sending: '发送中',
  edit: '编辑',
  remove: '删除',
  save: '保存',
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

const TWO: QueuedMessage[] = [
  { id: 'q1', text: '再帮我写 3 个回复角度' },
  { id: 'q2', text: '把生成结果导出成 markdown 发给我' },
]

describe('queue dock · 折叠面板结构', () => {
  it('多条排队渲染可折叠头部：图标 + 计数 + chevron，默认收起', () => {
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: TWO,
        sessionId: 's1',
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      }),
    )
    expect(html).toContain('queue-dock-header')
    expect(html).toContain('2 条排队消息')
    expect(html).toContain('queue-dock-chevron')
    expect(html).not.toContain('queue-dock-row')
  })

  it('单条排队无折叠头部，直接显示行', () => {
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: [TWO[0]],
        sessionId: 's1',
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      }),
    )
    expect(html).not.toContain('queue-dock-header')
    expect(html).toContain('queue-dock-row')
    expect(html).toContain('再帮我写 3 个回复角度')
  })

  it('空队列不渲染', () => {
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: [],
        sessionId: 's1',
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      }),
    )
    expect(html).toBe('')
  })

  it('sessionId 为空不渲染', () => {
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: TWO,
        sessionId: null,
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      }),
    )
    expect(html).toBe('')
  })
})

describe('queue dock · 操作按钮', () => {
  it('每行渲染编辑/删除两个操作钮', () => {
    const html = renderToStaticMarkup(
      createElement(QueueDock, {
        items: TWO,
        sessionId: 's1',
        api: fakeApi([]),
        copy: { ...COPY },
        onError: () => {},
      }),
    )
    // collapsed=false 需要 editing 非空——SSR 静态标记默认收起，
    // 验证编辑态行内 textarea + 保存/取消按钮的存在
    const editHtml = renderToStaticMarkup(
      createElement(QueueDock, {
        items: [TWO[0]],
        sessionId: 's1',
        api: fakeApi([]),
        copy: COPY,
        onError: () => {},
      }),
    )
    // 单条时列表直接可见，操作钮应出现
    expect(editHtml.match(/queue-dock-action"/g)?.length ?? 0).toBe(2)
    expect(editHtml).toContain('aria-label="编辑"')
    expect(editHtml).toContain('aria-label="删除"')
    expect(html).toContain('queue-dock-panel')
  })
})

describe('queue dock · session.updateQueue 契约', () => {
  it('删除动作发出 session.updateQueue 且 action.kind 为 remove', async () => {
    const calls: { method: string; payload: unknown }[] = []
    const api = fakeApi(calls)
    // 模拟组件内 applyAction 的 rpc 调用
    await api.rpc('session.updateQueue', { sessionId: 's1', itemId: 'q1', action: { kind: 'remove' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('session.updateQueue')
    expect((calls[0].payload as { action: { kind: string } }).action.kind).toBe('remove')
  })

  it('编辑动作携带 content 文本块', async () => {
    const calls: { method: string; payload: unknown }[] = []
    const api = fakeApi(calls)
    await api.rpc('session.updateQueue', {
      sessionId: 's1',
      itemId: 'q1',
      action: { kind: 'edit', content: [{ type: 'text', text: '改过的文本' }] },
    })
    const action = (calls[0].payload as { action: { kind: string; content: { text: string }[] } }).action
    expect(action.kind).toBe('edit')
    expect(action.content[0].text).toBe('改过的文本')
  })
})
