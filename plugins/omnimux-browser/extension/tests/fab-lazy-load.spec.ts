// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initFabCompanion } from '../src/content/fab-companion.ts'

function shadowHost(): ShadowRoot {
  const host = document.getElementById('omnimux-companion-root')
  if (host?.shadowRoot === null || host?.shadowRoot === undefined) throw new Error('companion host is not mounted')
  return host.shadowRoot
}

function fabElement(): HTMLElement {
  const fab = shadowHost().getElementById('omnimux-fab-btn')
  if (fab === null || fab === undefined) throw new Error('companion fab button is not mounted')
  return fab
}

function iframeElement(): HTMLIFrameElement {
  const iframe = shadowHost().getElementById('omnimux-panel-iframe') as HTMLIFrameElement
  if (iframe === null || iframe === undefined) throw new Error('companion iframe is not mounted')
  return iframe
}

function stopCompanion(): void {
  const shell = window as unknown as { __omnimux_fab_unsubscribe?: () => void }
  shell.__omnimux_fab_unsubscribe?.()
  delete shell.__omnimux_fab_unsubscribe
}

function stubLocalStorage(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => { store.set(key, String(value)) },
      removeItem: (key: string): void => { store.delete(key) },
      clear: (): void => { store.clear() },
      key: (index: number): string | null => [...store.keys()][index] ?? null,
      get length(): number { return store.size },
    },
  })
}

function stubChrome(): void {
  const chromeMock = {
    runtime: {
      id: 'test-ext-id',
      getURL: (path: string) => `chrome-extension://test-ext-id/${path}`,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      sync: {
        get: vi.fn((_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {}
          if (callback) callback(result)
          return Promise.resolve(result)
        }),
        set: vi.fn((_items: Record<string, unknown>, callback?: () => void) => {
          if (callback) callback()
          return Promise.resolve()
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  }
  vi.stubGlobal('chrome', chromeMock)
}

class FakePointerEvent extends MouseEvent {
  pointerId: number
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}

function stubPointerEvents(): void {
  if (typeof globalThis.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', FakePointerEvent)
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
}

describe('浮动工作台按需懒加载机制（解决与 OpenCLI 等自动化工具 CDP 冲突）', () => {
  beforeEach(() => {
    stubLocalStorage()
    stubChrome()
    stubPointerEvents()
    document.body.innerHTML = ''
    document.getElementById('omnimux-companion-root')?.remove()
  })

  afterEach(() => {
    stopCompanion()
    delete (globalThis as Record<string, unknown>).__dshBrowserWorkstation
    document.body.innerHTML = ''
    document.getElementById('omnimux-companion-root')?.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('初始挂载时，浮标正常渲染，但 iframe 窗口地址必须为 about:blank，严禁填入真实插件地址', () => {
    initFabCompanion()
    const fab = fabElement()
    const iframe = iframeElement()

    // 浮标正常存在
    expect(fab).toBeDefined()
    expect(fab.style.display).not.toBe('none')

    // 严禁存在真实插件地址，必须为 about:blank，避免被外部自动化程序（OpenCLI）识别为常驻跨域插件 target
    const currentSrc = iframe.getAttribute('src')
    expect(currentSrc).toBe('about:blank')
    expect(currentSrc).not.toContain('chrome-extension://')
  })

  it('点击浮标展开面板时，才动态填入真实的 panelUrl 插件地址', () => {
    initFabCompanion()
    const fab = fabElement()
    const iframe = iframeElement()
    const workstation = shadowHost().getElementById('omnimux-workstation')

    expect(iframe.getAttribute('src')).toBe('about:blank')
    expect(workstation?.classList.contains('expanded')).toBe(false)

    // 模拟点击浮标（pointerdown -> pointerup 无拖拽位移）
    fab.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }))
    fab.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }))

    // 应当展开工作台，并且 iframe 此时已被填入真实插件地址
    expect(workstation?.classList.contains('expanded')).toBe(true)
    expect(iframe.getAttribute('src')).toBe('chrome-extension://test-ext-id/panel/index.html?mode=float')
  })

  it('展开后再次收起，保留已装载的真实地址；Dock 模式卸载时恢复为 about:blank 并在后续重新展开时再次动态装载', () => {
    initFabCompanion()
    const fab = fabElement()
    const iframe = iframeElement()
    const workstation = shadowHost().getElementById('omnimux-workstation')
    const panelOrigin = 'chrome-extension://test-ext-id'

    // 第一次展开
    fab.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }))
    fab.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }))
    expect(iframe.getAttribute('src')).toBe('chrome-extension://test-ext-id/panel/index.html?mode=float')

    // 按 ESC 收起
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(workstation?.classList.contains('expanded')).toBe(false)
    // 普通收起保留 iframe 真实地址，避免下次展开重新刷新页面
    expect(iframe.getAttribute('src')).toBe('chrome-extension://test-ext-id/panel/index.html?mode=float')

    // 模拟来自面板的 dock 卸载指令 COLLAPSE_WORKSTATION (unload: true)
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'COLLAPSE_WORKSTATION', unload: true },
      origin: panelOrigin,
      source: iframe.contentWindow as Window,
    }))

    // iframe 应被重置为 about:blank
    expect(iframe.getAttribute('src')).toBe('about:blank')

    // 再次点击浮标展开，必须重新填回真实地址
    fab.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }))
    fab.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }))
    expect(iframe.getAttribute('src')).toBe('chrome-extension://test-ext-id/panel/index.html?mode=float')
    expect(workstation?.classList.contains('expanded')).toBe(true)
  })
})
