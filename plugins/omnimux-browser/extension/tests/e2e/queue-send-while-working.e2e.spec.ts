// @vitest-environment jsdom
/**
 * 排队态主按钮切换：任务执行中只要输入框有内容，右下角就从「停止」切回
 * 「发送」，让用户能继续排队；清空后回到「停止」。
 *
 * 这里驱动真实面板组件（App + 真实输入区），只把宿主桥替换成受控桩，
 * 断言的是用户能看到并点到的按钮与真实排队 RPC，而不是源码文本。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BridgeState } from '../../src/background/bridge.ts'
import type { PanelApi } from '../../src/panel/api.ts'

let panelApi: PanelApi

vi.mock('../../src/panel/api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/panel/api.ts')>(),
  connectPanel: (): PanelApi => panelApi,
}))

import { App } from '../../src/panel/App.tsx'

interface PromptCall {
  mode?: string
  content?: unknown
}

function stubChrome(): void {
  const noop = (): void => {}
  vi.stubGlobal('chrome', {
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
      onChanged: { addListener: noop, removeListener: noop },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: noop, removeListener: noop },
    },
    tabs: { query: vi.fn(async () => [{ id: 7 }]), sendMessage: vi.fn(async () => undefined) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
  })
}

describe('E2E: 排队态输入框有文字时右侧按钮切回发送', () => {
  let root: Root
  let onStatus: ((state: BridgeState, caps: null) => void) | undefined
  let rpc: Mock<(method: string, payload?: unknown) => Promise<unknown>>

  beforeEach(() => {
    // Node 自带的 webstorage 会遮蔽 jsdom 的 localStorage 且没有 clear()。
    const storage = globalThis.localStorage as Storage | undefined
    if (typeof storage?.clear === 'function') storage.clear()
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    stubChrome()

    rpc = vi.fn(async (method: string) => {
      if (method === 'session.create') return { sessionId: 'session-current' }
      if (method === 'session.history') return { events: [] }
      if (method === 'settings.describe') return { namespaces: [] }
      if (method === 'credentials.describe') return { credentials: {} }
      return {}
    })
    const unsubscribe = (): void => {}
    panelApi = {
      rpc: async <T = unknown>(method: string, payload?: unknown): Promise<T> => await rpc(method, payload) as T,
      respond: vi.fn(async () => undefined),
      onStatus: vi.fn((callback) => { onStatus = callback; return unsubscribe }),
      onEvent: vi.fn(() => unsubscribe),
      onApprovalRequest: vi.fn(() => unsubscribe),
      onApprovalResolved: vi.fn(() => unsubscribe),
      onTabAffinity: vi.fn(() => unsubscribe),
      onSelection: vi.fn(() => unsubscribe),
      onMediaAttach: vi.fn(() => unsubscribe),
      onSessionResumeHint: vi.fn(() => unsubscribe),
      onTaskLocate: vi.fn(() => () => {}),
      respondToApproval: vi.fn(async () => {}),
      resolveTabAffinity: vi.fn(async () => {}),
      rebindTabAffinity: vi.fn(async () => {}),
      clearSelection: vi.fn(async () => {}),
      registerWindow: vi.fn(async () => {}),
      setActiveSession: vi.fn(async () => {}),
      updateSettings: vi.fn(async () => {}) as unknown as PanelApi['updateSettings'],
      requestStatus: vi.fn(async () => {}),
    }
    root = createRoot(document.querySelector('#root')!)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function primaryButton(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>('.composer-actions .clean-send-btn')
    if (button === null) throw new Error('composer primary button not found')
    return button
  }

  function primaryLabel(): string | null {
    return primaryButton().getAttribute('aria-label')
  }

  function draftValue(): string {
    const area = document.querySelector<HTMLTextAreaElement>('textarea')
    if (area === null) throw new Error('composer textarea not found')
    return area.value
  }

  async function typeText(text: string): Promise<void> {
    const area = document.querySelector<HTMLTextAreaElement>('textarea')!
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(area, text)
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function clickPrimary(): Promise<void> {
    await act(async () => { primaryButton().click() })
  }

  function promptCalls(): PromptCall[] {
    return rpc.mock.calls
      .filter(([method]) => method === 'session.prompt')
      .map(([, payload]) => payload as PromptCall)
  }

  async function waitForPrompts(count: number): Promise<PromptCall[]> {
    await vi.waitFor(() => { expect(promptCalls().length).toBe(count) })
    return promptCalls()
  }

  async function openPanel(): Promise<void> {
    await act(async () => { root.render(createElement(App)) })
    await act(async () => { onStatus?.('connected', null) })
    await vi.waitFor(() => { expect(document.querySelector('.composer-actions .clean-send-btn')).not.toBeNull() })
    await vi.waitFor(() => { expect(document.querySelector('textarea')).not.toBeNull() })
  }

  it('空闲态：无文字为禁用的发送按钮，有文字为可用的发送按钮', async () => {
    await openPanel()

    const idleLabel = primaryLabel()
    const idleDisabled = primaryButton().disabled
    expect(idleLabel).toBe('发送消息')
    expect(idleDisabled).toBe(true)

    await typeText('第一条消息')
    const typedLabel = primaryLabel()
    const typedDisabled = primaryButton().disabled
    expect(typedLabel).toBe('发送消息')
    expect(typedDisabled).toBe(false)
  })

  it('排队态：输入框有文字切回发送并真实入队，清空后回到停止', async () => {
    await openPanel()

    // 首条消息让任务进入执行（排队）态。
    await typeText('第一条消息')
    await clickPrimary()
    const first = await waitForPrompts(1)
    expect(first[0]?.mode).toBe('queue')
    await vi.waitFor(() => { expect(draftValue()).toBe('') })

    // 排队态 + 空输入框 → 停止。
    const runningEmptyLabel = primaryLabel()
    expect(runningEmptyLabel).toBe('停止生成')

    // 排队态 + 有文字 → 发送，且可点击。
    await typeText('第二条排队消息')
    const queuedLabel = primaryLabel()
    const queuedDisabled = primaryButton().disabled
    const queuedIsStop = primaryButton().className.includes('stop-button')
    expect(queuedLabel).toBe('发送消息')
    expect(queuedDisabled).toBe(false)
    expect(queuedIsStop).toBe(false)

    // 点击后走真实排队路径，输入框清空并回到停止。
    await clickPrimary()
    const second = await waitForPrompts(2)
    expect(second[1]?.mode).toBe('queue')
    expect(JSON.stringify(second[1]?.content)).toContain('第二条排队消息')
    await vi.waitFor(() => { expect(draftValue()).toBe('') })
    const afterLabel = primaryLabel()
    expect(afterLabel).toBe('停止生成')
  })
})
