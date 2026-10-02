// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  WorkspaceSelector,
} from '../src/panel/components/WorkspaceSelector.tsx'
import {
  KNOWN_INSTANCE_NAMES,
} from '../src/shared/instance-discovery.ts'
import {
  ModelSelector,
  REAL_LOCAL_SUBSCRIPTION_GROUPS,
} from '../src/panel/components/ModelSelector.tsx'

/** 指定端口在线（返回合法 wsUrl 的 bridge-config），其余端口一律拒绝。 */
function mockOnlyPortsOnline(ports: number[]) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url)
    const port = Number(new URL(url).port)
    if (ports.includes(port)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ wsUrl: `ws://127.0.0.1:${port}/ext/bridge` }),
      } as Response
    }
    throw new Error('Failed to fetch')
  }) as unknown as typeof fetch
}

describe('WorkspaceSelector (Dynamic Instance Discovery) Suite', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders trigger with selected instance name and port; green dot when that port is online', async () => {
    mockOnlyPortsOnline([45120])

    await act(async () => {
      root.render(
        createElement(WorkspaceSelector, {
          bridgeConnected: false,
          locale: 'zh',
          targetPort: 45120,
        })
      )
    })
    // 等待首轮探测 settle
    await act(async () => {})

    const trigger = container.querySelector('.workspace-selector-trigger')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('45120')
    expect(trigger?.textContent).toContain('OmniMux Dev')
    // spec §3.1 selector.trigger 白名单：无 chevron、无独立端口胶囊
    expect(container.querySelector('.ws-chevron-arrow')).toBeNull()
    expect(container.querySelector('.ws-port-tag')).toBeNull()
    const dot = container.querySelector('.engine-dot')
    expect(dot?.classList.contains('online')).toBe(true)
  })

  it('opens dropdown listing all known ports, Dev carries 推荐 badge, offline rows are disabled', async () => {
    mockOnlyPortsOnline([45120])
    const onSelect = vi.fn()

    await act(async () => {
      root.render(
        createElement(WorkspaceSelector, {
          bridgeConnected: false,
          locale: 'zh',
          targetPort: 45120,
          onSelectWorkspace: onSelect,
        })
      )
    })
    await act(async () => {})

    const trigger = container.querySelector<HTMLButtonElement>('.workspace-selector-trigger')!
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})

    const dropdown = container.querySelector('.workspace-dropdown-menu')
    expect(dropdown).not.toBeNull()

    const items = container.querySelectorAll('.instance-item-row')
    // 仅 45120 在线 + 映射表内离线端口（43128/43120）；映射表外端口离线不渲染
    expect(items.length).toBe(1 + Object.keys(KNOWN_INSTANCE_NAMES).length - 1)
    expect(items[0].textContent).toContain('OmniMux Dev')
    expect(items[0].textContent).toContain('推荐')
    expect(items[0].textContent).toMatch(/在线 · \d+ms/)

    // 离线行禁用且点击不触发选择
    const offlineRow = Array.from(items).find((el) => el.textContent?.includes('43128'))!
    expect(offlineRow.classList.contains('disabled')).toBe(true)
    await act(async () => {
      offlineRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelect).not.toHaveBeenCalled()

    // 点击在线的 Dev 条目：写 localStorage 并回调 {id, port, name}
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalled()
    expect(onSelect.mock.calls[0][0].port).toBe(45120)
    expect(localStorage.getItem('omnimux_target_port')).toBe('45120')
  })

  it('shows empty state copy when nothing is reachable and no custom port saved', async () => {
    // 所有端口离线：已知端口仍显示为离线条目（spec：映射表内端口离线也显示）
    globalThis.fetch = vi.fn(async () => { throw new Error('Failed to fetch') }) as unknown as typeof fetch

    await act(async () => {
      root.render(
        createElement(WorkspaceSelector, {
          bridgeConnected: false,
          locale: 'zh',
          targetPort: 43128,
        })
      )
    })
    await act(async () => {})

    const trigger = container.querySelector<HTMLButtonElement>('.workspace-selector-trigger')!
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})

    const rows = container.querySelectorAll('.instance-item-row')
    // 全部离线时仅映射表内已知端口渲染离线条目
    expect(rows.length).toBe(Object.keys(KNOWN_INSTANCE_NAMES).length)
    expect(Array.from(rows).every((r) => r.classList.contains('disabled'))).toBe(true)
    expect(container.textContent).toContain('自定义端口')
  })
})

describe('ModelSelector Component & Real Subscription Models Suite', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('matches real local subscription models from ChatGPT (Codex) and Grok', () => {
    expect(REAL_LOCAL_SUBSCRIPTION_GROUPS.length).toBe(2)
    const codex = REAL_LOCAL_SUBSCRIPTION_GROUPS.find((g) => g.group === 'ChatGPT (Codex)')
    expect(codex).not.toBeUndefined()
    expect(codex?.models.some((m) => m.id === 'gpt-6-astra')).toBe(true)
    expect(codex?.models.some((m) => m.id === 'gpt-5.6-sol')).toBe(true)
    expect(codex?.models.some((m) => m.id === 'gpt-5.6-terra')).toBe(true)
    expect(codex?.models.some((m) => m.id === 'gpt-5.6-luna')).toBe(true)
    expect(codex?.models.some((m) => m.id === 'gpt-5.5')).toBe(true)
    expect(codex?.models.some((m) => m.id === 'gpt-5.3-codex-spark')).toBe(true)

    const grok = REAL_LOCAL_SUBSCRIPTION_GROUPS.find((g) => g.group === 'Grok (Subscription)')
    expect(grok).not.toBeUndefined()
    expect(grok?.models.some((m) => m.id === 'grok-4.20-0309-non-reasoning')).toBe(true)
    expect(grok?.models.some((m) => m.id === 'grok-4.20-0309-reasoning')).toBe(true)
  })

  it('renders select with real local models grouped by provider and switches model', async () => {
    const onSelect = vi.fn()

    await act(async () => {
      root.render(
        createElement(ModelSelector, {
          locale: 'zh',
          activePort: 45120,
          onSelectModel: onSelect,
        })
      )
    })

    const select = container.querySelector<HTMLSelectElement>('.model-select-control')!
    expect(select).not.toBeNull()

    const optgroups = container.querySelectorAll('optgroup')
    expect(optgroups.length).toBeGreaterThanOrEqual(2)
    expect(optgroups[0].label).toBe('ChatGPT (Codex)')
    expect(optgroups[1].label).toBe('Grok (Subscription)')

    // Change model to gpt-6-astra
    await act(async () => {
      select.value = 'gpt-6-astra'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalledWith('gpt-6-astra', 'medium')
    expect(localStorage.getItem('omnimux_default_model_45120')).toBe('gpt-6-astra')
  })

  it('supports custom model entry and persistence', async () => {
    const onSelect = vi.fn()

    await act(async () => {
      root.render(
        createElement(ModelSelector, {
          locale: 'zh',
          activePort: 45120,
          onSelectModel: onSelect,
        })
      )
    })

    const select = container.querySelector<HTMLSelectElement>('.model-select-control')!
    await act(async () => {
      select.value = '__custom__'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Custom input should appear
    const input = container.querySelector<HTMLInputElement>('.custom-port-input')!
    expect(input).not.toBeNull()

    const okBtn = container.querySelector<HTMLButtonElement>('.custom-port-apply-btn')!
    await act(async () => {
      input.value = 'my-custom-llm'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      // Trigger onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      nativeSetter.call(input, 'my-custom-llm')
      input.dispatchEvent(new Event('change', { bubbles: true }))
      okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalled()
  })

  it('renders reasoning effort selector on the right and allows changing effort', async () => {
    const onSelect = vi.fn()
    const onEffort = vi.fn()

    await act(async () => {
      root.render(
        createElement(ModelSelector, {
          locale: 'zh',
          activePort: 45120,
          onSelectModel: onSelect,
          onSelectEffort: onEffort,
        })
      )
    })

    const effortSelect = container.querySelector<HTMLSelectElement>('.effort-select-control')!
    expect(effortSelect).not.toBeNull()

    // Select 'high' effort
    await act(async () => {
      effortSelect.value = 'high'
      effortSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onEffort).toHaveBeenCalledWith('high')
    expect(localStorage.getItem('omnimux_default_effort_45120')).toBe('high')
  })
})
