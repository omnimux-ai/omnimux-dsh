// @vitest-environment jsdom
/**
 * E2E: 实例连接状态实时同步端到端测试 (Issue #3077)
 *
 * 验证：当 bridgeConnected 为 true 时，即使端口单次 HTTP probe 返回 unavailable（403/无wsUrl），
 * 实例下拉菜单中对应的选中行依然保持在线绿灯与「在线」文本，绝不呈现未开放状态。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { WorkspaceSelector } from '../../src/panel/components/WorkspaceSelector.tsx'
import { DshInstanceSelector } from '../../src/panel/components/DshInstanceSelector.tsx'

function mockFetchUnavailable(port: number) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url)
    const p = Number(new URL(url).port)
    if (p === port) {
      return { ok: false, status: 403, json: async () => 'forbidden' } as unknown as Response
    }
    throw new Error('Failed to fetch')
  }) as unknown as typeof fetch
}

describe('E2E: 实例选择器连接状态实时同步 (Issue #3077)', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('WorkspaceSelector: bridgeConnected 连通时下拉行自动保持在线，不显示未开放', async () => {
    mockFetchUnavailable(45120)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, { bridgeConnected: true, locale: 'zh', targetPort: 45120 }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    const triggerDot = trigger.querySelector('.engine-dot')
    expect(triggerDot?.classList.contains('online')).toBe(true)

    // 打开下拉菜单
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const devRow = Array.from(container.querySelectorAll('.instance-item-row')).find((el) =>
      el.textContent?.includes('45120')
    )!
    expect(devRow).not.toBeUndefined()
    const dot = devRow.querySelector('.instance-health-dot')
    expect(dot?.classList.contains('online')).toBe(true)
    const statusText = devRow.querySelector('.health-pill')
    expect(statusText?.textContent).toContain('在线')
    expect(statusText?.textContent).not.toContain('未开放')
  })

  it('DshInstanceSelector: bridgeConnected 连通时下拉行同步保持在线', async () => {
    mockFetchUnavailable(45120)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(DshInstanceSelector, { bridgeConnected: true, locale: 'zh', activePort: 45120 }))
    })
    await act(async () => {})

    const trigger = container.querySelector('.dsh-instance-pill-btn') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    const triggerDot = trigger.querySelector('.instance-health-dot')
    expect(triggerDot?.classList.contains('online')).toBe(true)

    // 打开下拉菜单
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const devRow = Array.from(container.querySelectorAll('.instance-item-row')).find((el) =>
      el.textContent?.includes('45120')
    )!
    expect(devRow).not.toBeUndefined()
    const dot = devRow.querySelector('.instance-health-dot')
    expect(dot?.classList.contains('online')).toBe(true)
    const statusText = devRow.querySelector('.health-pill')
    expect(statusText?.textContent).toContain('在线')
    expect(statusText?.textContent).not.toContain('未开放')
  })
})
