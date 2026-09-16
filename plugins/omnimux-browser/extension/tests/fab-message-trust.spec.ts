// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaCapsule } from '../src/content/media-hover/capsule.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { initFabCompanion } from '../src/content/fab-companion.ts'
vi.mock('../src/content/page-sensor.ts', () => ({ getFullContext: () => ({}), detectPlatform: () => 'generic' }))
vi.mock('../src/content/media-sniffer.ts', () => ({ sniffViewportMedia: () => [] }))
vi.mock('../src/feature-flags.ts', () => ({ FEATURE_FLAG: { fab: 'fab' }, readFlag: async () => true, readFlagSync: () => true, subscribeFlag: () => () => {} }))
afterEach(() => {
  (window as any).__omnimux_fab_unsubscribe?.()
  document.getElementById('omnimux-companion-root')?.remove()
  vi.unstubAllGlobals()
})
describe('actual companion message receiver', () => {
  it('rejects script-triggered capsule actions', () => {
    const capsule = MediaCapsule.create(hoverCopy('en'))
    const action = vi.fn()
    capsule.onAction(action)
    capsule.buttonElement('attach')!.click()
    capsule.buttonElement('attach')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(action).not.toHaveBeenCalled()
  })
  it('refuses foreign frames and wrong origins while allowing its created extension frame', async () => {
    const runtimeListeners: Function[] = []
    vi.stubGlobal('chrome', { runtime: {
      getURL: (path: string) => `chrome-extension://ours/${path}`,
      sendMessage: vi.fn(async () => ({})),
      onMessage: { addListener: (listener: Function) => runtimeListeners.push(listener) },
    } })
    document.body.innerHTML = '<textarea id="draft"></textarea><iframe id="foreign"></iframe>'
    initFabCompanion()
    const frame = document.getElementById('omnimux-companion-root')!.shadowRoot!.querySelector('iframe')!
    const panelWindow = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(frame, 'contentWindow', { value: panelWindow })
    const input = document.getElementById('draft') as HTMLTextAreaElement
    const changed = vi.fn()
    input.addEventListener('input', changed)
    const data = { type: 'FILL_STRUCTURED_DRAFT', fields: [{ id: 'draft', value: 'user draft' }] }
    for (const [source, origin] of [[window, 'https://evil.example'], [window, 'chrome-extension://ours'], [panelWindow, 'chrome-extension://other']]) {
      window.dispatchEvent(new MessageEvent('message', { data, source: source as Window, origin: origin as string }))
    }
    await Promise.resolve()
    expect(input.value).toBe('')
    expect(changed).not.toHaveBeenCalled()
    window.dispatchEvent(new MessageEvent('message', { data, source: panelWindow, origin: 'chrome-extension://ours' }))
    await vi.waitFor(() => expect(input.value).toBe('user draft'))
    expect(changed).toHaveBeenCalledTimes(1)
    input.value = ''
    const reply = vi.fn()
    runtimeListeners[0]!({ action: 'FILL_STRUCTURED_DRAFT', payload: { fields: [{ id: 'draft', value: 'native draft' }] } }, {}, reply)
    await vi.waitFor(() => expect(input.value).toBe('native draft'))
    expect(reply).toHaveBeenCalled()
  })
})
