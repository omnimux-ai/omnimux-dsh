// @vitest-environment jsdom
// Verification suite for DSH & OmniMux instance port selector and health checker
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  DshInstanceSelector,
  PRESET_INSTANCES,
  probeInstanceHealth,
} from '../src/panel/components/DshInstanceSelector.tsx'

describe('DshInstanceSelector Component & Port Health Check Suite', () => {
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

  it('probes port health correctly: online for 200, standby for 401/403, offline on failure', async () => {
    // 1. Mock 200 OK
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    })
    globalThis.fetch = fetchMock

    const resOnline = await probeInstanceHealth(45120)
    expect(resOnline.status).toBe('online')
    expect(resOnline.messageZh).toContain('已就绪')

    // 2. Mock 401 Unauthorized (DSH app alive and listening)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })
    const resStandby = await probeInstanceHealth(45120)
    expect(resStandby.status).toBe('standby')
    expect(resStandby.messageZh).toContain('运行中')

    // 3. Mock Network Error (Port offline)
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'))
    const resOffline = await probeInstanceHealth(99999)
    expect(resOffline.status).toBe('offline')
    expect(resOffline.messageZh).toContain('离线')
  })

  it('renders instance selector pill and selects OmniMux Dev by default', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    await act(async () => {
      root.render(
        createElement(DshInstanceSelector, {
          locale: 'zh',
          activePort: 45120,
        })
      )
    })

    const pill = container.querySelector('.dsh-instance-pill-btn')
    expect(pill).not.toBeNull()
    expect(pill?.textContent).toContain('45120')
    expect(pill?.textContent).toContain('OmniMux Dev')
  })

  it('opens dropdown menu, lists instances with health tags, and triggers onSelectInstance', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const onSelect = vi.fn()

    await act(async () => {
      root.render(
        createElement(DshInstanceSelector, {
          locale: 'zh',
          activePort: 45120,
          onSelectInstance: onSelect,
        })
      )
    })

    // Click to open dropdown
    const pill = container.querySelector<HTMLButtonElement>('.dsh-instance-pill-btn')!
    await act(async () => {
      pill.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dropdown = container.querySelector('.dsh-instance-dropdown-menu')
    expect(dropdown).not.toBeNull()

    // 3 preset items
    const items = container.querySelectorAll('.instance-item-card')
    expect(items.length).toBe(3)

    // Select DSH Desktop (43120)
    await act(async () => {
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalledWith({
      id: 'dsh-desktop',
      port: 43120,
      name: 'DSH Desktop（基础版）',
    })
    expect(localStorage.getItem('omnimux_target_port')).toBe('43120')
  })
})
