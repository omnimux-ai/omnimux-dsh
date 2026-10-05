// @vitest-environment jsdom
/**
 * 排队坞「插话发送」：真实 QueueDock 组件在 jsdom 中渲染，宿主桥为受控桩。
 *
 * 对齐原生契约：按钮常驻，仅任务运行中可用；点击发出
 * session.updateQueue(itemId, { kind: 'steer' })；宿主回 steer-unavailable /
 * queue-item-not-found 时静默（队列投影自行刷新），其他失败才提示。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PanelApi } from '../src/panel/api.ts'
import { QueueDock } from '../src/panel/QueueDock.tsx'
import { nextQueueSteer } from '../src/panel/queue-gesture.ts'

const copy = {
  count: (n: number) => `${n} 条排队消息`,
  steer: '插话发送',
  steerUnavailable: '仅运行中可插话发送',
  steerFailed: '插话发送失败，请重试。',
  sending: '发送中…',
  edit: '编辑排队消息',
  remove: '删除排队消息',
  save: '保存排队消息',
  cancelEdit: '取消编辑',
  editFailed: '编辑失败',
  removeFailed: '删除失败',
  taskN: (index: number) => `任务 ${index}`,
}

const items = [
  { id: 'q1', text: '第一条排队消息' },
  { id: 'q2', text: '第二条排队消息' },
]

describe('排队坞插话发送', () => {
  let root: Root
  let rpc: ReturnType<typeof vi.fn>
  let onError: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    rpc = vi.fn(async () => ({ accepted: true }))
    onError = vi.fn()
    root = createRoot(document.querySelector('#root')!)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    vi.restoreAllMocks()
  })

  async function renderDock(steerAvailable: boolean): Promise<void> {
    const api = { rpc } as unknown as PanelApi
    await act(async () => {
      root.render(createElement(QueueDock, {
        items,
        sessionId: 'session-1',
        api,
        steerAvailable,
        copy,
        onError,
      }))
    })
    // 多条消息时头部默认收起，展开后每行才可见。
    const header = document.querySelector<HTMLButtonElement>('.queue-dock-header')
    if (header !== null) {
      await act(async () => { header.click() })
    }
  }

  function steerButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.queue-dock-action-steer'))
  }

  it('每行都渲染插话发送按钮，运行中可用且提示为插话发送', async () => {
    await renderDock(true)

    const buttons = steerButtons()
    expect(buttons.length).toBe(2)
    const disabled = buttons[0]!.disabled
    const title = buttons[0]!.getAttribute('title')
    const label = buttons[0]!.getAttribute('aria-label')
    expect(disabled).toBe(false)
    expect(title).toBe('插话发送')
    expect(label).toBe('插话发送')
  })

  it('点击后按原生契约发出 steer 请求', async () => {
    await renderDock(true)

    await act(async () => { steerButtons()[0]!.click() })
    await vi.waitFor(() => { expect(rpc).toHaveBeenCalledTimes(1) })

    const [method, payload] = rpc.mock.calls[0] as [string, { sessionId: string; itemId: string; action: { kind: string } }]
    expect(method).toBe('session.updateQueue')
    expect(payload.sessionId).toBe('session-1')
    expect(payload.itemId).toBe('q1')
    expect(payload.action.kind).toBe('steer')
  })

  it('任务未运行时按钮置灰并说明原因，点击不发请求', async () => {
    await renderDock(false)

    const buttons = steerButtons()
    expect(buttons.length).toBe(2)
    const disabled = buttons[0]!.disabled
    const title = buttons[0]!.getAttribute('title')
    expect(disabled).toBe(true)
    expect(title).toBe('仅运行中可插话发送')

    await act(async () => { buttons[0]!.click() })
    expect(rpc).toHaveBeenCalledTimes(0)
  })

  it('插话窗口已关闭时静默，其他失败才提示', async () => {
    await renderDock(true)

    rpc.mockRejectedValueOnce(new Error('session/steer-unavailable'))
    await act(async () => { steerButtons()[0]!.click() })
    await vi.waitFor(() => { expect(rpc).toHaveBeenCalledTimes(1) })
    expect(onError).toHaveBeenCalledTimes(0)

    rpc.mockRejectedValueOnce(new Error('session/queue-item-not-found'))
    await act(async () => { steerButtons()[1]!.click() })
    await vi.waitFor(() => { expect(rpc).toHaveBeenCalledTimes(2) })
    expect(onError).toHaveBeenCalledTimes(0)

    rpc.mockRejectedValueOnce(new Error('boom'))
    await act(async () => { steerButtons()[0]!.click() })
    await vi.waitFor(() => { expect(onError).toHaveBeenCalledTimes(1) })
    const message = onError.mock.calls[0]?.[0]
    expect(message).toBe('插话发送失败，请重试。')
  })
})

describe('空输入框回车依次插话', () => {
  const base = {
    input: '',
    hasDraftImages: false,
    working: true,
    stopping: false,
    queuedIds: ['q1', 'q2'],
  }

  it('运行中且输入框为空时取队首', () => {
    const target = nextQueueSteer(base)
    expect(target).toBe('q1')
  })

  it('队列变化后取新的队首（连按依次清空）', () => {
    const target = nextQueueSteer({ ...base, queuedIds: ['q2'] })
    expect(target).toBe('q2')
  })

  it('输入框有文字时不插话（仍走排队提交）', () => {
    const target = nextQueueSteer({ ...base, input: '一条新消息' })
    expect(target).toBe(null)
  })

  it('输入框只有空白字符时按空处理（与发送语义一致）', () => {
    const target = nextQueueSteer({ ...base, input: '   ' })
    expect(target).toBe('q1')
  })

  it('挂着待发图片时不插话', () => {
    const target = nextQueueSteer({ ...base, hasDraftImages: true })
    expect(target).toBe(null)
  })

  it('任务未运行时不插话', () => {
    const target = nextQueueSteer({ ...base, working: false })
    expect(target).toBe(null)
  })

  it('正在停止当前轮时不插话', () => {
    const target = nextQueueSteer({ ...base, stopping: true })
    expect(target).toBe(null)
  })

  it('队列为空时不插话', () => {
    const target = nextQueueSteer({ ...base, queuedIds: [] })
    expect(target).toBe(null)
  })
})
