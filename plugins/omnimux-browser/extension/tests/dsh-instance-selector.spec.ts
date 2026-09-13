// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  WorkspaceSelector,
  PRESET_INSTANCES,
  probeInstanceHealth,
} from '../src/panel/components/WorkspaceSelector.tsx'
import {
  ModelSelector,
  INSTANCE_MODELS,
  getDefaultModelForPort,
} from '../src/panel/components/ModelSelector.tsx'

describe('WorkspaceSelector (Unified Default Workspace & Instance Engine) Suite', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defines the 3 official preset instances with OmniMux Dev 45120 as default recommended', () => {
    expect(PRESET_INSTANCES.length).toBe(3)
    const dev = PRESET_INSTANCES.find((p) => p.id === 'omnimux-dev')
    expect(dev?.port).toBe(45120)
    expect(dev?.isRecommended).toBe(true)

    const desktop = PRESET_INSTANCES.find((p) => p.id === 'dsh-desktop')
    expect(desktop?.port).toBe(43120)

    const prd = PRESET_INSTANCES.find((p) => p.id === 'omnimux-prd')
    expect(prd?.port).toBe(43128)
  })

  it('probes port health correctly: online for 200/401/403, offline on network refusal', async () => {
    // 1. Mock 200 OK
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    })
    globalThis.fetch = fetchMock

    const resOnline = await probeInstanceHealth(45120)
    expect(resOnline.status).toBe('online')

    // 2. Mock 401 Unauthorized (DSH app alive and listening -> treated as active online)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })
    const resStandby = await probeInstanceHealth(45120)
    expect(resStandby.status).toBe('online')
    expect(resStandby.messageZh).toContain('就绪')

    // 3. Mock Network Error (Port offline)
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'))
    const resOffline = await probeInstanceHealth(99999)
    expect(resOffline.status).toBe('offline')
    expect(resOffline.messageZh).toContain('离线')
  })

  it('renders default workspace trigger with green dot for active OmniMux Dev 45120 and ChevronDown arrow', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    await act(async () => {
      root.render(
        createElement(WorkspaceSelector, {
          bridgeConnected: false,
          locale: 'zh',
          targetPort: 45120,
        })
      )
    })

    const trigger = container.querySelector('.workspace-selector-trigger, .workspace-selector-pill')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('45120')
    expect(trigger?.textContent).toContain('OmniMux Dev')
    expect(container.querySelector('.ws-chevron-arrow')).not.toBeNull()
    // Must be online (green dot) because 45120 responded healthy
    const dot = container.querySelector('.engine-dot')
    expect(dot?.classList.contains('online')).toBe(true)
  })

  it('opens dropdown menu, lists instances and triggers onSelectWorkspace', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
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

    // Click to open dropdown
    const trigger = container.querySelector<HTMLButtonElement>('.workspace-selector-trigger, .workspace-selector-pill')!
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dropdown = container.querySelector('.workspace-dropdown-menu')
    expect(dropdown).not.toBeNull()

    // 3 preset items
    const items = container.querySelectorAll('.instance-item-row')
    expect(items.length).toBe(3)

    // Select DSH Desktop (43120)
    await act(async () => {
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalled()
    expect(localStorage.getItem('omnimux_target_port')).toBe('43120')
  })
})

describe('ModelSelector Component & Instance Match Suite', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('matches models correctly per instance port', () => {
    expect(getDefaultModelForPort(45120)).toBe('gemini-3.8-flash-high')
    expect(getDefaultModelForPort(43120)).toBe('deepseek-v4.1-flash')
    expect(getDefaultModelForPort(43128)).toBe('gemini-3.1-pro-preview')

    const devModels = INSTANCE_MODELS[45120]
    expect(devModels.some((m) => m.id === 'gemini-3.8-flash-high')).toBe(true)
    expect(devModels.some((m) => m.id === 'deepseek-reasoner')).toBe(true)

    const dshModels = INSTANCE_MODELS[43120]
    expect(dshModels.some((m) => m.id === 'deepseek-v4.1-flash')).toBe(true)
  })

  it('renders select matching active instance port and switches model', async () => {
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
    expect(select.value).toBe('gemini-3.8-flash-high')

    // Change model to deepseek-reasoner
    await act(async () => {
      select.value = 'deepseek-reasoner'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalledWith('deepseek-reasoner')
    expect(localStorage.getItem('omnimux_default_model_45120')).toBe('deepseek-reasoner')
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
})
