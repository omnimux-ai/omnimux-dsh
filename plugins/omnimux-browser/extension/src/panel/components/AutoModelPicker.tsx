import { memo, useEffect, useRef, useState } from 'react'

import { PANEL_COPY, type PanelCopy } from '../strings.ts'
import type { UiLocale } from '../../i18n.ts'
import { ChevronDownIcon, CheckMarkIcon } from './icons.tsx'

/** localStorage key prefix: `omnimux_model_mode_<port>` ∈ {auto, manual} */
export const MODEL_MODE_STORAGE_PREFIX = 'omnimux_model_mode_'

export type ModelMode = 'auto' | 'manual'

export type AutoModelPickerCopy = PanelCopy['modelPicker']

export interface PickerModelRow {
  id: string
  name: string
  provider?: string
}

export interface AutoModelPickerProps {
  locale: UiLocale
  port: number
  copy?: AutoModelPickerCopy
  rpc?: (method: string, payload?: unknown) => Promise<unknown>
  fetchImpl?: typeof fetch
  selectedModel?: string
  onSelectModel?: (modelId: string, effort?: string, provider?: string) => void
  disabled?: boolean
}

/** Normalize persisted mode: anything that is not a literal 'auto'|'manual' becomes 'auto'. */
export function normalizeModelMode(value: unknown): ModelMode {
  return value === 'manual' ? 'manual' : 'auto'
}

/** PM 副标题字典中登记的品牌图标键（id → icon key）。 */
const MODEL_ICON_KEYS: Record<string, 'openai' | 'grok'> = {
  'gpt-6-astra': 'openai',
  'gpt-5.6-sol': 'openai',
  'gpt-5.6-terra': 'openai',
  'gpt-5.6-luna': 'openai',
  'gpt-5.5': 'openai',
  'gpt-5.3-codex-spark': 'openai',
  'grok-4.20-0309-non-reasoning': 'grok',
  'grok-4.20-0309-reasoning': 'grok',
  'grok-4.20-multi-agent-0309': 'grok',
  'grok-4.3': 'grok',
  'grok-4.5': 'grok',
  'grok-4.6': 'grok',
  'grok-build-0.1': 'grok',
}

/**
 * Brand icon key for a model row: dictionary hit → id-prefix fallback
 * (gpt* → openai, grok* → grok) → `null`（未登记模型不渲染图标槽位，刻意不造假图标）。
 */
export function resolveModelBrandKey(modelId: string): 'openai' | 'grok' | null {
  const registered = MODEL_ICON_KEYS[modelId]
  if (registered) return registered
  if (/^gpt/i.test(modelId)) return 'openai'
  if (/^grok/i.test(modelId)) return 'grok'
  return null
}

interface RawModelEntry {
  id?: unknown
  name?: unknown
  provider?: unknown
}

interface RawGroup {
  id?: unknown
  group?: unknown
  provider?: unknown
  models?: unknown
}

function flattenRows(raw: unknown, providerOf: (group: RawGroup) => string | undefined): PickerModelRow[] {
  if (!raw || typeof raw !== 'object') return []
  const groups = (raw as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return []
  const rows: PickerModelRow[] = []
  for (const g of groups as RawGroup[]) {
    if (!g || !Array.isArray(g.models)) continue
    const provider = providerOf(g)
    for (const m of g.models as RawModelEntry[]) {
      if (!m || typeof m.id !== 'string' || m.id === '') continue
      const name = typeof m.name === 'string' && m.name !== '' ? m.name : m.id
      const rowProvider = typeof m.provider === 'string' && m.provider !== '' ? m.provider : provider
      rows.push(rowProvider ? { id: m.id, name, provider: rowProvider } : { id: m.id, name })
    }
  }
  return rows
}

/** `session.modelCatalog` 载荷 → 拍平行；provider 取目录分组 id。 */
export function flattenCatalogGroups(payload: unknown): PickerModelRow[] {
  return flattenRows(payload, (g) =>
    (typeof g.id === 'string' && g.id !== '' ? g.id
      : typeof g.provider === 'string' && g.provider !== '' ? g.provider
        : undefined))
}

/**
 * `/ext/bridge-config` 的 `modelGroups` → 拍平行；provider 沿用
 * ModelSelector 的 group→provider 规则（ChatGPT (Codex) → chatgpt、
 * Grok (Subscription) → grok、组自带 provider 优先、其他 undefined）。
 */
export function flattenModelGroupsFallback(payload: unknown): PickerModelRow[] {
  const groups = Array.isArray(payload) ? payload : undefined
  if (!groups) return []
  const rows: PickerModelRow[] = []
  for (const g of groups as RawGroup[]) {
    if (!g || !Array.isArray(g.models)) continue
    const label = typeof g.group === 'string' ? g.group : typeof g.id === 'string' ? g.id : ''
    const provider = typeof g.provider === 'string' && g.provider !== '' ? g.provider
      : label === 'ChatGPT (Codex)' ? 'chatgpt'
        : label === 'Grok (Subscription)' ? 'grok'
          : undefined
    for (const m of g.models as RawModelEntry[]) {
      if (!m || typeof m.id !== 'string' || m.id === '') continue
      const name = typeof m.name === 'string' && m.name !== '' ? m.name : m.id
      rows.push(provider ? { id: m.id, name, provider } : { id: m.id, name })
    }
  }
  return rows
}

const BRAND_ICON_PATHS: Record<'openai' | 'grok', { path: string }> = {
  openai: {
    path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.1408 1.6465 4.4708 4.4708 0 0 1 .5765 3.0137zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z',
  },
  grok: {
    path: 'M4.94 4.96a9.97 9.97 0 0 1 10.835-2.182a8.7 8.7 0 0 1 2.033 1.11l-3.006 1.39C12.003 4.101 8.797 4.9 6.84 6.86c-2.564 2.565-3.146 6.954-.36 9.922l.278.284L.124 23c1.875-1.973 3.771-4.427 2.636-7.19c-1.52-3.698-.635-8.03 2.18-10.85M23.9.1c-2.264 3.174-3.184 5.389-2.197 9.64l-.007-.007c.753 3.201-.052 6.75-2.653 9.355c-3.279 3.285-8.526 4.016-12.847 1.06L9.21 18.75c2.758 1.084 5.775.607 7.943-1.564c2.169-2.17 2.655-5.332 1.566-7.963c-.207-.5-.828-.625-1.263-.304L8.59 15.472l12.7-12.77v.01z',
  },
}

function BrandIcon({ brand, size }: { brand: 'openai' | 'grok'; size: number }) {
  const def = BRAND_ICON_PATHS[brand]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="amp-brand-icon"
      aria-hidden="true"
    >
      <path d={def.path} />
    </svg>
  )
}

function readStoredModel(port: number): string {
  try {
    return localStorage.getItem(`omnimux_default_model_${port}`)
      || localStorage.getItem('omnimux_default_model')
      || ''
  } catch {
    return ''
  }
}

function readStoredMode(port: number): ModelMode {
  try {
    return normalizeModelMode(localStorage.getItem(`${MODEL_MODE_STORAGE_PREFIX}${port}`))
  } catch {
    return 'auto'
  }
}

export const AutoModelPicker = memo(function AutoModelPicker({
  locale,
  port,
  copy,
  rpc,
  fetchImpl,
  selectedModel = '',
  onSelectModel,
  disabled = false,
}: AutoModelPickerProps) {
  const resolvedCopy: AutoModelPickerCopy = copy ?? PANEL_COPY[locale].modelPicker
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<ModelMode>(() => readStoredMode(port))
  // 点选后立即生效的乐观选中态；父组件回写 selectedModel 后以 props 为准。
  // 初始值与 App/ModelSelector 读同一真源：omnimux_default_model(_<port>)。
  const [pickedModelId, setPickedModelId] = useState<string>(() => readStoredModel(port))
  const [rows, setRows] = useState<PickerModelRow[]>([])
  const [listState, setListState] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'unavailable'>('idle')
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const rpcRef = useRef(rpc)
  const fetchRef = useRef(fetchImpl)
  rpcRef.current = rpc
  fetchRef.current = fetchImpl

  // 实例切换时同步该端口的持久化模式与手动偏好，避免把上一实例的选择推给新宿主。
  useEffect(() => {
    setMode(readStoredMode(port))
    setPickedModelId(readStoredModel(port))
  }, [port])

  // 外部真源变化（设置页 ModelSelector 或 settings 回填）以 props 为准，
  // 乐观选中态只覆盖到父组件回写为止。
  useEffect(() => {
    if (selectedModel !== '') setPickedModelId(selectedModel)
  }, [selectedModel])

  // 宿主可能尚未实现 bridge.modelMode —— 每次失败静默即可（fire-and-forget）。
  useEffect(() => {
    const call = rpcRef.current
    if (!call) return
    void call('bridge.modelMode', { auto: mode === 'auto' }).catch(() => {})
  }, [mode, port])

  // 列表数据源两级兜底：session.modelCatalog → /ext/bridge-config 的 modelGroups。
  // 并发请求（初始加载/打开重载/端口切换）以代次丢弃过期响应，
  // 避免慢请求把上一实例的目录写进当前面板。
  const loadGenRef = useRef(0)
  const loadModels = () => {
    const call = rpcRef.current
    const fetcher = fetchRef.current ?? fetch
    const generation = ++loadGenRef.current
    setListState('loading')
    const fallback = async (): Promise<PickerModelRow[] | null> => {
      try {
        const res = await fetcher(`http://127.0.0.1:${port}/ext/bridge-config`, {
          signal: AbortSignal.timeout(1200),
        })
        if (!res.ok) return null
        const data = await res.json() as { modelGroups?: unknown }
        return flattenModelGroupsFallback(data?.modelGroups)
      } catch {
        return null
      }
    }
    void (async () => {
      let catalogRows: PickerModelRow[] | null = null
      if (call) {
        try {
          catalogRows = flattenCatalogGroups(await call('session.modelCatalog', {}))
        } catch {
          catalogRows = null
        }
      }
      const fallbackRows = catalogRows && catalogRows.length > 0 ? null : await fallback()
      if (generation !== loadGenRef.current) return
      const resolved = catalogRows && catalogRows.length > 0 ? catalogRows : fallbackRows
      if (resolved && resolved.length > 0) {
        setRows(resolved)
        setListState('ok')
      } else {
        setRows([])
        setListState(catalogRows !== null || fallbackRows !== null ? 'empty' : 'unavailable')
      }
    })()
  }

  useEffect(() => {
    loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port])

  // 打开面板时聚焦首个可交互元素；关闭由 Esc/外点/点选统一走 closePanel。
  useEffect(() => {
    if (!isOpen) return
    const first = panelRef.current?.querySelector<HTMLElement>('button, [role="option"]')
    first?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const panelEl = panelRef.current
      if (!panelEl) return
      const focusable = [...panelEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelEl.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panelEl.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const setModelMode = (next: ModelMode) => {
    setMode(next)
    try {
      localStorage.setItem(`${MODEL_MODE_STORAGE_PREFIX}${port}`, next)
    } catch {
      // Ignore
    }
  }

  const handlePick = (row: PickerModelRow) => {
    if (mode !== 'manual') setModelMode('manual')
    setPickedModelId(row.id)
    setIsOpen(false)
    triggerRef.current?.focus()
    onSelectModel?.(row.id, undefined, row.provider)
  }

  const handleToggle = () => {
    const next = !isOpen
    setIsOpen(next)
    if (next) {
      loadModels()
      // 桥断线重连后宿主模式可能已回默认：每次打开都补发当前模式。
      const call = rpcRef.current
      if (call) void call('bridge.modelMode', { auto: mode === 'auto' }).catch(() => {})
    }
  }

  const effectiveModel = pickedModelId !== '' ? pickedModelId : selectedModel
  const isManual = mode === 'manual' && effectiveModel !== ''
  const selectedRow = isManual ? rows.find((r) => r.id === effectiveModel) : undefined
  const triggerBrand = isManual ? resolveModelBrandKey(effectiveModel) : null
  const triggerLabel = isManual ? (selectedRow?.name ?? effectiveModel) : resolvedCopy.triggerAuto

  return (
    <span className="amp-wrap" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`amp-trigger${isOpen ? ' open' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={resolvedCopy.triggerAriaLabel}
        onClick={handleToggle}
      >
        {triggerBrand && <BrandIcon brand={triggerBrand} size={14} />}
        <span className="amp-trigger-label">{triggerLabel}</span>
        <ChevronDownIcon size={12} className="amp-chevron" />
      </button>
      {isOpen && (
        <div
          className="amp-panel"
          role="dialog"
          aria-label={resolvedCopy.panelTitle}
          ref={panelRef}
        >
          <div className="amp-panel-inner">
            <div className="amp-title">{resolvedCopy.panelTitle}</div>
            <div className="amp-auto-row">
              <span className="amp-auto-label">{resolvedCopy.autoLabel}</span>
              <button
                type="button"
                className={`amp-switch${mode === 'auto' ? ' on' : ''}`}
                role="switch"
                aria-checked={mode === 'auto'}
                aria-label={resolvedCopy.autoLabel}
                onClick={() => setModelMode(mode === 'auto' ? 'manual' : 'auto')}
              >
                <span className="amp-switch-thumb" aria-hidden="true" />
              </button>
            </div>
            <div className="amp-help">{resolvedCopy.autoHelp}</div>
            {mode === 'manual' && (
              <>
                <div className="amp-divider" />
                <div className="amp-list" role="listbox" aria-label={resolvedCopy.panelTitle}>
                  {listState === 'ok' && rows.map((row) => {
                    const selected = effectiveModel !== '' && row.id === effectiveModel
                    const brand = resolveModelBrandKey(row.id)
                    const subtitle = resolvedCopy.modelSubtitles[row.id] ?? resolvedCopy.fallbackSubtitle
                    return (
                      <button
                        type="button"
                        key={row.id}
                        role="option"
                        aria-selected={selected}
                        aria-label={selected ? `${row.name}, ${resolvedCopy.rowSelectedAria}` : row.name}
                        className={`amp-row${selected ? ' selected' : ''}`}
                        onClick={() => handlePick(row)}
                      >
                        {brand && <span className="amp-row-icon"><BrandIcon brand={brand} size={20} /></span>}
                        <span className="amp-row-text">
                          <span className="amp-row-name">{row.name}</span>
                          <span className="amp-row-sub">{subtitle}</span>
                        </span>
                        {selected && <CheckMarkIcon size={12} className="amp-check" />}
                      </button>
                    )
                  })}
                  {listState === 'empty' && (
                    <div className="amp-empty">{resolvedCopy.listEmpty}</div>
                  )}
                  {listState === 'unavailable' && (
                    <div className="amp-empty">{resolvedCopy.listUnavailable}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </span>
  )
})
