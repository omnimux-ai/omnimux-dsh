// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PANEL_COPY } from '../src/panel/strings.ts'
import {
  AutoModelPicker,
  flattenCatalogGroups,
  flattenModelGroupsFallback,
  normalizeModelMode,
  resolveModelBrandKey,
  MODEL_MODE_STORAGE_PREFIX,
  type AutoModelPickerProps,
} from '../src/panel/components/AutoModelPicker.tsx'

const PORT = 43120

function makeCatalog() {
  return {
    groups: [
      {
        id: 'chatgpt',
        models: [
          { id: 'gpt-6-astra', name: 'GPT-6-Astra' },
          { id: 'gpt-5.5', name: 'GPT-5.5' },
        ],
      },
      {
        id: 'grok',
        models: [{ id: 'grok-4.6', name: 'Grok 4.6' }],
      },
    ],
  }
}

function makeRpc(overrides?: { failCatalog?: boolean }): (method: string, payload?: unknown) => Promise<unknown> {
  return vi.fn(async (method: string) => {
    if (method === 'session.modelCatalog') {
      if (overrides?.failCatalog) throw new Error('unknown method')
      return makeCatalog()
    }
    if (method === 'bridge.modelMode') return { ok: true }
    throw new Error(`unexpected rpc ${method}`)
  }) as unknown as (method: string, payload?: unknown) => Promise<unknown>
}

function makeFetch(config?: { ok?: boolean; modelGroups?: unknown; reject?: boolean }) {
  return vi.fn(async () => {
    if (config?.reject) throw new Error('connection refused')
    return {
      ok: config?.ok ?? true,
      json: async () => ({ modelGroups: config?.modelGroups ?? [] }),
    } as unknown as Response
  }) as unknown as typeof fetch
}

interface Harness {
  container: HTMLDivElement
  root: Root
  rpcCalls: Array<{ method: string; payload: unknown }>
  onSelectModel: ReturnType<typeof vi.fn>
  unmount: () => void
}

async function mountPicker(props?: Partial<AutoModelPickerProps>): Promise<Harness> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onSelectModel = vi.fn()
  const rpcCalls: Array<{ method: string; payload: unknown }> = []
  const rpc = props?.rpc ?? (async (method: string, payload?: unknown) => {
    rpcCalls.push({ method, payload })
    if (method === 'session.modelCatalog') return makeCatalog()
    return { ok: true }
  })
  await act(async () => {
    root.render(createElement(AutoModelPicker, {
      locale: 'zh',
      port: PORT,
      copy: PANEL_COPY.zh.modelPicker,
      rpc,
      fetchImpl: makeFetch(),
      onSelectModel,
      ...props,
    }))
  })
  return {
    container,
    root,
    rpcCalls,
    onSelectModel,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => { await Promise.resolve() })
}

function trigger(container: HTMLElement): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('.amp-trigger')
  if (!btn) throw new Error('trigger button not found')
  return btn
}

function panel(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.amp-panel')
}

function keydown(target: Element | Document, key: string, init?: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })
}

function click(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Issue #2966 会话栏「自动/手动」模型选择器', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('纯函数接缝', () => {
    it('normalizeModelMode：合法值原样、非法/缺省回退 auto', () => {
      expect(normalizeModelMode('auto')).toBe('auto')
      expect(normalizeModelMode('manual')).toBe('manual')
      expect(normalizeModelMode(undefined)).toBe('auto')
      expect(normalizeModelMode(null)).toBe('auto')
      expect(normalizeModelMode('')).toBe('auto')
      expect(normalizeModelMode('MANUAL')).toBe('auto')
      expect(normalizeModelMode('anything')).toBe('auto')
    })

    it('flattenCatalogGroups：groups[].models[] 拍平且 provider 取 group.id', () => {
      const rows = flattenCatalogGroups(makeCatalog())
      expect(rows).toHaveLength(3)
      expect(rows[0]).toEqual({ id: 'gpt-6-astra', name: 'GPT-6-Astra', provider: 'chatgpt' })
      expect(rows[2]).toEqual({ id: 'grok-4.6', name: 'Grok 4.6', provider: 'grok' })
    })

    it('flattenCatalogGroups：容忍非法载荷', () => {
      expect(flattenCatalogGroups(null)).toEqual([])
      expect(flattenCatalogGroups({})).toEqual([])
      expect(flattenCatalogGroups({ groups: 'nope' })).toEqual([])
      expect(flattenCatalogGroups({ groups: [{ id: 'x', models: 'nope' }] })).toEqual([])
    })

    it('flattenModelGroupsFallback：沿用 ModelSelector 的 group→provider 规则', () => {
      const rows = flattenModelGroupsFallback([
        { group: 'ChatGPT (Codex)', models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }] },
        { group: 'Grok (Subscription)', models: [{ id: 'grok-4.5', name: 'Grok 4.5' }] },
        { group: 'Other (Something)', models: [{ id: 'misc-1', name: 'Misc' }] },
        { group: 'Any', provider: 'direct', models: [{ id: 'm-1' }] },
      ])
      expect(rows.map((r) => r.provider)).toEqual(['chatgpt', 'grok', undefined, 'direct'])
      expect(rows[3]?.name).toBe('m-1')
    })

    it('resolveModelBrandKey：字典命中 → 前缀回退（gpt*/grok*）→ 未登记不渲染', () => {
      expect(resolveModelBrandKey('gpt-6-astra')).toBe('openai')
      expect(resolveModelBrandKey('grok-4.6')).toBe('grok')
      expect(resolveModelBrandKey('gpt-99-future')).toBe('openai')
      expect(resolveModelBrandKey('grok-next')).toBe('grok')
      expect(resolveModelBrandKey('claude-9')).toBe(null)
      expect(resolveModelBrandKey('')).toBe(null)
    })
  })

  describe('DOM 渲染与交互', () => {
    it('默认态：「自动」胶囊按钮带 aria-haspopup=dialog、aria-expanded=false、无品牌图标', async () => {
      const h = await mountPicker()
      const btn = trigger(h.container)
      expect(btn.getAttribute('aria-haspopup')).toBe('dialog')
      expect(btn.getAttribute('aria-expanded')).toBe('false')
      expect(btn.getAttribute('aria-label')).toBe('选择模型')
      expect(btn.textContent).toContain('自动')
      expect(btn.querySelector('.amp-brand-icon')).toBeNull()
      expect(btn.querySelector('svg')).not.toBeNull()
      expect(panel(h.container)).toBeNull()
      h.unmount()
    })

    it('挂载时下发 bridge.modelMode { auto: true }（fire-and-forget，失败静默）', async () => {
      const rpcCalls: Array<{ method: string; payload: unknown }> = []
      const rpc = vi.fn(async (method: string, payload?: unknown) => {
        rpcCalls.push({ method, payload })
        if (method === 'session.modelCatalog') return makeCatalog()
        if (method === 'bridge.modelMode') throw new Error('not implemented')
        return null
      })
      const h = await mountPicker({ rpc: rpc as never })
      await flush()
      expect(rpcCalls.some((c) => c.method === 'bridge.modelMode' && (c.payload as { auto?: boolean })?.auto === true)).toBe(true)
      // rpc 抛错不应让组件崩掉
      expect(trigger(h.container)).not.toBeNull()
      h.unmount()
    })

    it('展开面板：标题「模型」、自动行+switch(ON)、说明文案、无列表/分隔线', async () => {
      const h = await mountPicker()
      click(trigger(h.container))
      const p = panel(h.container)
      expect(p).not.toBeNull()
      expect(p!.getAttribute('role')).toBe('dialog')
      expect(trigger(h.container).getAttribute('aria-expanded')).toBe('true')

      expect(p!.querySelector('.amp-title')?.textContent).toBe('模型')
      const sw = p!.querySelector<HTMLElement>('[role="switch"]')
      expect(sw).not.toBeNull()
      expect(sw!.getAttribute('aria-checked')).toBe('true')
      expect(p!.querySelector('.amp-help')?.textContent).toBe('每条消息自动选择模型')
      expect(p!.querySelector('.amp-divider')).toBeNull()
      expect(p!.querySelector('[role="listbox"]')).toBeNull()
      h.unmount()
    })

    it('关闭 switch → 分隔线+模型列表出现；点选行 → 收起、按钮变模型名、回调带 provider、写入模式键', async () => {
      const h = await mountPicker()
      click(trigger(h.container))
      const sw = h.container.querySelector<HTMLElement>('[role="switch"]')!
      click(sw)
      await flush()

      const p = panel(h.container)!
      expect(sw.getAttribute('aria-checked')).toBe('false')
      expect(p.querySelector('.amp-divider')).not.toBeNull()
      const options = p.querySelectorAll<HTMLElement>('[role="option"]')
      expect(options.length).toBe(3)
      // 行结构：品牌图标 + 名称 + PM 副标题
      const first = options[0]!
      expect(first.querySelector('.amp-row-name')?.textContent).toBe('GPT-6-Astra')
      expect(first.querySelector('.amp-row-sub')?.textContent).toBe('旗舰通用模型')
      expect(first.querySelector('.amp-brand-icon')).not.toBeNull()

      click(first)
      await flush()

      // 面板收起、按钮显示模型名
      expect(panel(h.container)).toBeNull()
      expect(trigger(h.container).textContent).toContain('GPT-6-Astra')
      // 回调：modelId + provider（来自 group.id）
      expect(h.onSelectModel).toHaveBeenCalledWith('gpt-6-astra', undefined, 'chatgpt')
      // 模式持久化
      expect(localStorage.getItem(`${MODEL_MODE_STORAGE_PREFIX}${PORT}`)).toBe('manual')
      h.unmount()
    })

    it('手动态重开面板：当前生效行带 aria-selected 与 check，开关 OFF 状态保持', async () => {
      localStorage.setItem(`${MODEL_MODE_STORAGE_PREFIX}${PORT}`, 'manual')
      localStorage.setItem(`omnimux_default_model_${PORT}`, 'gpt-5.5')
      const h = await mountPicker()
      await flush()
      expect(trigger(h.container).textContent).toContain('GPT-5.5')
      click(trigger(h.container))
      await flush()
      const sw = h.container.querySelector<HTMLElement>('[role="switch"]')!
      expect(sw.getAttribute('aria-checked')).toBe('false')
      const selected = h.container.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      expect(selected).not.toBeNull()
      expect(selected!.querySelector('.amp-row-name')?.textContent).toBe('GPT-5.5')
      expect(selected!.querySelector('.amp-check')).not.toBeNull()
      h.unmount()
    })

    it('Esc 关闭并回焦触发按钮；外点关闭', async () => {
      const h = await mountPicker()
      click(trigger(h.container))
      expect(panel(h.container)).not.toBeNull()

      keydown(document, 'Escape')
      expect(panel(h.container)).toBeNull()
      expect(document.activeElement).toBe(trigger(h.container))

      click(trigger(h.container))
      expect(panel(h.container)).not.toBeNull()
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      click(outside)
      expect(panel(h.container)).toBeNull()
      outside.remove()
      h.unmount()
    })

    it('rpc modelCatalog 失败 → 回落 bridge-config 的 modelGroups；两级均空 → 空态文案', async () => {
      const fetchMock = makeFetch({
        modelGroups: [
          { group: 'ChatGPT (Codex)', models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }] },
          { group: 'Grok (Subscription)', models: [{ id: 'grok-4.5', name: 'Grok 4.5' }] },
        ],
      })
      localStorage.setItem(`${MODEL_MODE_STORAGE_PREFIX}${PORT}`, 'manual')
      const h = await mountPicker({ rpc: makeRpc({ failCatalog: true }), fetchImpl: fetchMock })
      await flush()
      click(trigger(h.container))
      await flush()
      const options = h.container.querySelectorAll('[role="option"]')
      expect(options.length).toBe(2)
      expect(fetchMock).toHaveBeenCalled()
      h.unmount()

      localStorage.setItem(`${MODEL_MODE_STORAGE_PREFIX}${PORT}`, 'manual')
      const h2 = await mountPicker({
        rpc: makeRpc({ failCatalog: true }),
        fetchImpl: makeFetch({ modelGroups: [] }),
      })
      await flush()
      click(trigger(h2.container))
      await flush()
      expect(h2.container.querySelector('[role="option"]')).toBeNull()
      expect(h2.container.querySelector('.amp-empty')?.textContent).toBe('暂无可用模型')
      h2.unmount()
    })

    it('未登记模型：不渲染图标槽位，副标题回退通用文案', async () => {
      localStorage.setItem(`${MODEL_MODE_STORAGE_PREFIX}${PORT}`, 'manual')
      const rpc = vi.fn(async (method: string) => {
        if (method === 'session.modelCatalog') {
          return { groups: [{ id: 'chatgpt', models: [{ id: 'mystery-9', name: 'Mystery Nine' }] }] }
        }
        return null
      })
      const h = await mountPicker({ rpc: rpc as never })
      await flush()
      click(trigger(h.container))
      await flush()
      const row = h.container.querySelector('[role="option"]')
      expect(row).not.toBeNull()
      expect(row!.querySelector('.amp-brand-icon')).toBeNull()
      expect(row!.querySelector('.amp-row-name')?.textContent).toBe('Mystery Nine')
      expect(row!.querySelector('.amp-row-sub')?.textContent).toBe('通用对话模型')
      h.unmount()
    })
  })

  describe('挂载与源码契约', () => {
    it('App.tsx 在 .composer-actions-start 内回形针按钮之后挂载 AutoModelPicker', () => {
      const appPath = resolve(__dirname, '../src/panel/App.tsx')
      const appCode = readFileSync(appPath, 'utf8')
      expect(appCode).toContain('AutoModelPicker')
      const startIdx = appCode.indexOf('composer-actions-start')
      const paperclipIdx = appCode.indexOf('<PaperclipIcon size={18} />')
      const pickerIdx = appCode.indexOf('<AutoModelPicker')
      expect(startIdx).toBeGreaterThan(-1)
      expect(paperclipIdx).toBeGreaterThan(startIdx)
      expect(pickerIdx).toBeGreaterThan(paperclipIdx)
      // 手动选择执行链复用 handleSelectModel
      const pickerTag = appCode.slice(pickerIdx, pickerIdx + 800)
      expect(pickerTag).toContain('handleSelectModel')
    })

    it('styles.css 定义 clean 体系内的 picker 胶囊与浮层样式', () => {
      const styles = readFileSync(resolve(__dirname, '../src/panel/styles.css'), 'utf8')
      expect(styles).toContain('.amp-trigger')
      expect(styles).toContain('.amp-panel')
      expect(styles).toContain('.amp-switch')
      expect(styles).toContain('.amp-list')
    })

    it('strings.ts 的 modelPicker 文案与 PM 字典逐字一致（zh/en）', () => {
      const zh = PANEL_COPY.zh.modelPicker
      const en = PANEL_COPY.en.modelPicker
      expect(zh.triggerAuto).toBe('自动')
      expect(en.triggerAuto).toBe('Auto')
      expect(zh.triggerAriaLabel).toBe('选择模型')
      expect(en.triggerAriaLabel).toBe('Choose model')
      expect(zh.panelTitle).toBe('模型')
      expect(en.panelTitle).toBe('Model')
      expect(zh.autoLabel).toBe('自动')
      expect(en.autoLabel).toBe('Auto')
      expect(zh.autoHelp).toBe('每条消息自动选择模型')
      expect(en.autoHelp).toBe('Picks a model for each message')
      expect(zh.listEmpty).toBe('暂无可用模型')
      expect(en.listEmpty).toBe('No models available')
      expect(zh.listUnavailable).toBe('模型列表暂不可用')
      expect(en.listUnavailable).toBe('Model list unavailable')
      expect(zh.rowSelectedAria).toBe('当前使用')
      expect(en.rowSelectedAria).toBe('In use')
      // 副标题字典
      expect(zh.modelSubtitles['gpt-6-astra']).toBe('旗舰通用模型')
      expect(en.modelSubtitles['gpt-6-astra']).toBe('Flagship general model')
      expect(zh.modelSubtitles['grok-4.20-multi-agent-0309']).toBe('多智能体协作')
      expect(en.modelSubtitles['grok-4.20-multi-agent-0309']).toBe('Multi-agent collaboration')
      expect(zh.fallbackSubtitle).toBe('通用对话模型')
      expect(en.fallbackSubtitle).toBe('General chat model')
    })
  })
})
