// @vitest-environment jsdom
/**
 * E2E: 新用户首次打开面板时的实例列表（产品基线）
 *
 * 断言用户可见结果：列表里只有正式版与 DSH Desktop，推荐位落在正式版，默认端口是
 * 正式版端口，且任何条目都不含开发机检出路径。合同：docs/contracts/product-baseline.md
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  WorkspaceSelector,
  PRESET_INSTANCES as WORKSPACE_PRESETS,
} from '../../src/panel/components/WorkspaceSelector.tsx'
import {
  DshInstanceSelector,
  PRESET_INSTANCES as INSTANCE_PRESETS,
} from '../../src/panel/components/DshInstanceSelector.tsx'

function readMainText(root: HTMLElement): string {
  const scroller = root.querySelector('.selector-scroll, [class*="scroll"]')
  return (scroller?.textContent || root.textContent || '').replace(/\s+/g, ' ')
}

describe('E2E: 新用户首次打开实例列表', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
  })

  it('预设数据：无开发版条目，推荐落在正式版，且不含开发机路径', () => {
    const all = [...WORKSPACE_PRESETS, ...INSTANCE_PRESETS]

    expect(all.some((p) => p.id === 'omnimux-dev')).toBe(false)
    expect(all.some((p) => p.id === 'omnimux-dev' || p.id.includes('dev'))).toBe(false)

    const recommended = all.filter((p) => p.isRecommended)
    expect(recommended.length).toBeGreaterThan(0)
    expect(recommended.every((p) => p.id === 'omnimux-prd' && p.port === 43128)).toBe(true)

    expect(JSON.stringify(all)).not.toContain('Desktop/Project')
    expect(JSON.stringify(all)).not.toContain('/Users/')
  })

  it('WorkspaceSelector 展开后：显示正式版 43128，默认端口即正式版', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WorkspaceSelector, { bridgeConnected: false, locale: 'zh' }))
    })

    const trigger = container.querySelector('button') as HTMLButtonElement
    expect(trigger).toBeTruthy()
    expect(container.textContent).toContain('43128')

    await act(async () => {
      trigger.click()
    })

    const text = readMainText(container)
    expect(text).toContain('43128')
    expect(text).toContain('43120')
    expect(text).not.toContain('OmniMux Dev')
    expect(text).not.toContain('Desktop/Project')
  })

  it('DshInstanceSelector 展开后：推荐位是正式版，不再出现开发版', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(DshInstanceSelector, { locale: 'zh' }))
    })

    const trigger = container.querySelector('button') as HTMLButtonElement
    expect(trigger).toBeTruthy()
    await act(async () => {
      trigger.click()
    })

    const text = readMainText(container)
    expect(text).toContain('43128')
    expect(text).not.toContain('OmniMux Dev')
    expect(text).not.toContain('45120')
    expect(text).not.toContain('Desktop/Project')
  })
})
