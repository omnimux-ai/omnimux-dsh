// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initFabCompanion } from '../src/content/fab-companion.ts'
import { BRAND_GHOST_PATH } from '../src/content/media-hover/overlay-icons.ts'

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
  const storageMap = new Map<string, unknown>()
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = []

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
        get: vi.fn((keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {}
          if (typeof keys === 'string') {
            result[keys] = storageMap.get(keys)
          } else if (Array.isArray(keys)) {
            for (const key of keys) {
              if (storageMap.has(key)) result[key] = storageMap.get(key)
            }
          }
          if (callback) callback(result)
          return Promise.resolve(result)
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          for (const [key, value] of Object.entries(items)) {
            storageMap.set(key, value)
          }
          if (callback) callback()
          return Promise.resolve()
        }),
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
          listeners.push(fn)
        },
        removeListener: (fn: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
          const idx = listeners.indexOf(fn)
          if (idx >= 0) listeners.splice(idx, 1)
        },
      },
    },
  }

  vi.stubGlobal('chrome', chromeMock)
}

describe('FAB 对标推特官方浮标规格与对齐停靠', () => {
  beforeEach(() => {
    stubLocalStorage()
    stubChrome()
    document.body.innerHTML = ''
    document.getElementById('omnimux-companion-root')?.remove()
    localStorage.clear()
  })

  afterEach(() => {
    stopCompanion()
    delete (globalThis as Record<string, unknown>).__dshBrowserWorkstation
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('渲染纯净矢量 SVG 图标而非 img 图片，且 eyes 采用 evenodd 镂空', () => {
    initFabCompanion()
    const fab = fabElement()

    // 不再使用 img
    const img = fab.querySelector('img')
    expect(img).toBeNull()

    // 必须是 32px 纯矢量 SVG
    const svg = fab.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
    expect(svg?.getAttribute('fill-rule')).toBe('evenodd')

    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('d')).toBe(BRAND_GHOST_PATH)
  })

  it('在推特页面存在 Grok 浮动抽屉时，默认停靠在 Grok 按钮正上方并保持 12px 间距', () => {
    // 模拟推特右下角的 Grok 按钮 (55x55, right 20, bottom 79)
    const grokBtn = document.createElement('button')
    grokBtn.setAttribute('data-testid', 'GrokDrawerHeader')
    grokBtn.getBoundingClientRect = () => ({
      x: 1845,
      y: 795,
      left: 1845,
      top: 795,
      right: 1900,
      bottom: 850,
      width: 55,
      height: 55,
      toJSON: () => {},
    })
    document.body.appendChild(grokBtn)

    initFabCompanion()
    const fab = fabElement()

    // 水平对齐 Grok (left: 1845)
    expect(fab.style.left).toBe('1845px')
    // 垂直间距：795 - 12 - 55 = 728px
    expect(fab.style.top).toBe('728px')
  })

  it('在无推特元素且未拖拽时，默认对齐推特三标右下角成列规格 (right 20px, bottom 146px)', () => {
    window.innerWidth = 1920
    window.innerHeight = 929

    initFabCompanion()
    const fab = fabElement()

    // left = 1920 - 75 = 1845px (即 right 20px)
    expect(fab.style.left).toBe('1845px')
    // top = 929 - 201 = 728px (即 bottom 146px)
    expect(fab.style.top).toBe('728px')
  })

  it('若有持久化拖拽位置，优先恢复用户的自定义位置', () => {
    localStorage.setItem('omnimux_fab_pos_v2', JSON.stringify({ x: 300, y: 400 }))

    initFabCompanion()
    const fab = fabElement()

    expect(fab.style.left).toBe('300px')
    expect(fab.style.top).toBe('400px')
  })
})
