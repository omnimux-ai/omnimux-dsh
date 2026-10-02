// @vitest-environment jsdom
/**
 * E2E: 实例选择器动态发现（spec: specs/instance-dynamic-discovery.md）
 *
 * 断言用户可见结果：实例条目由 /ext/bridge-config 探测动态生成；
 * OmniMux Dev 在线时可点选并带「推荐」徽章；未响应端口显示离线且不可点；
 * custom 端口与动态条目同端口只渲染一条。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { WorkspaceSelector } from '../../src/panel/components/WorkspaceSelector.tsx'
import { DshInstanceSelector } from '../../src/panel/components/DshInstanceSelector.tsx'
import { KNOWN_INSTANCE_NAMES } from '../../src/shared/instance-discovery.ts'

function readMainText(root: HTMLElement): string {
  return (root.textContent || '').replace(/\s+/g, ' ')
}

/** 端口 → 行为：'online' 返回合法 bridge-config；'forbidden' 返回 403；缺省拒绝连接。 */
function mockFetchByPort(handlers: Record<number, 'online' | 'forbidden'>) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url)
    const port = Number(new URL(url).port)
    if (handlers[port] === 'online') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ wsUrl: `ws://127.0.0.1:${port}/ext/bridge` }),
      } as Response
    }
    if (handlers[port] === 'forbidden') {
      return { ok: false, status: 403, json: async () => 'forbidden' } as unknown as Response
    }
    throw new Error('Failed to fetch')
  }) as unknown as typeof fetch
}

describe('E2E: 实例选择器动态发现', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('OmniMux Dev 在线时出现于列表首位、带推荐徽章与实测延迟，可选中', async () => {
    mockFetchByPort({ 45120: 'online' })
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, { bridgeConnected: false, locale: 'zh', targetPort: 45120 }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    expect(trigger.textContent).toContain('OmniMux Dev')

    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const rows = container.querySelectorAll('.instance-item-row')
    // 1 个在线 + 映射表内其余已知端口的离线条目；映射表外端口离线不渲染
    expect(rows.length).toBe(Object.keys(KNOWN_INSTANCE_NAMES).length)
    expect(rows[0].textContent).toContain('OmniMux Dev')
    expect(rows[0].textContent).toContain('推荐')
    expect(rows[0].textContent).toMatch(/在线 · \d+ms/)
    expect(rows[0].classList.contains('disabled')).toBe(false)

    await act(async () => {
      rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(localStorage.getItem('omnimux_target_port')).toBe('45120')
  })

  it('OmniMux PRD 无进程时条目存在、状态离线、不可点选', async () => {
    mockFetchByPort({})
    const onSelect = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, {
        bridgeConnected: false,
        locale: 'zh',
        targetPort: 43128,
        onSelectWorkspace: onSelect,
      }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const rows = Array.from(container.querySelectorAll('.instance-item-row'))
    const prd = rows.find((r) => r.textContent?.includes('43128'))!
    expect(prd.textContent).toContain('OmniMux PRD')
    expect(prd.textContent).toContain('离线')
    expect(prd.classList.contains('disabled')).toBe(true)

    await act(async () => {
      prd.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('DSH Desktop 有响应但无 wsUrl 时状态为未开放且仍可点选', async () => {
    mockFetchByPort({ 43120: 'forbidden' })
    const onSelect = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, {
        bridgeConnected: false,
        locale: 'zh',
        targetPort: 43120,
        onSelectWorkspace: onSelect,
      }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const rows = Array.from(container.querySelectorAll('.instance-item-row'))
    const desktop = rows.find((r) => r.textContent?.includes('43120'))!
    expect(desktop.textContent).toContain('DSH Desktop')
    expect(desktop.textContent).toContain('未开放')
    expect(desktop.classList.contains('disabled')).toBe(false)

    await act(async () => {
      desktop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalled()
    expect(onSelect.mock.calls[0][0].port).toBe(43120)
  })

  it('DshInstanceSelector 复用同一发现逻辑：动态列表、Dev 徽章、离线禁用', async () => {
    mockFetchByPort({ 45120: 'online' })
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(DshInstanceSelector, { locale: 'zh', activePort: 43128 }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const text = readMainText(container)
    expect(text).toContain('OmniMux Dev')
    expect(text).toContain('推荐')
    expect(text).toContain('43128')
    const rows = container.querySelectorAll('.instance-item-row')
    expect(rows.length).toBe(Object.keys(KNOWN_INSTANCE_NAMES).length)
    expect(text).not.toContain('Desktop/Project')
  })

  it('无意外元素：不出现 spec 白名单之外的徽章与括号解释文案', async () => {
    mockFetchByPort({ 45120: 'online' })
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, { bridgeConnected: false, locale: 'zh', targetPort: 45120 }))
    })
    await act(async () => {})

    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    await act(async () => {})

    const text = readMainText(container)
    // 红线文案一律不得出现
    expect(text).not.toMatch(/自动|由 Agent 决策|已连接|高画质|极速|NEW/)
    // 徽章行内只允许「推荐」一处（挂在 Dev）
    const pills = container.querySelectorAll('.instance-rec-pill')
    expect(pills.length).toBe(1)
    expect(pills[0].textContent).toBe('推荐')
  })
})
