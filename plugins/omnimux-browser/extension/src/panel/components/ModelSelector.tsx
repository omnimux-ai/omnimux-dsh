import { memo, useEffect, useState } from 'react'
import { loopbackFetch } from '../../shared/loopback-fetch.ts'
import type { PanelApi } from '../api.ts'

export interface EffortOption {
  id: string
  name: string
  description?: string
}

export interface ModelItem {
  id: string
  name: string
  reasoning?: {
    efforts?: EffortOption[]
    defaultEffort?: string
  }
}

export interface ModelGroup {
  group: string
  models: ModelItem[]
}

export const DEFAULT_FALLBACK_EFFORTS: EffortOption[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

/** 本地真实订阅模型（与 ~/.dsh/plugins/subscriptions/models.json 1:1 对齐） */
export const REAL_LOCAL_SUBSCRIPTION_GROUPS: ModelGroup[] = [
  {
    group: 'ChatGPT (Codex)',
    models: [
      {
        id: 'gpt-6-astra',
        name: 'GPT-6-Astra',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
            { id: 'max', name: 'Max' },
            { id: 'ultra', name: 'Ultra' },
          ],
          defaultEffort: 'medium',
        },
      },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6-Sol',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
            { id: 'max', name: 'Max' },
            { id: 'ultra', name: 'Ultra' },
          ],
          defaultEffort: 'low',
        },
      },
      {
        id: 'gpt-5.6-terra',
        name: 'GPT-5.6-Terra',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
            { id: 'max', name: 'Max' },
          ],
          defaultEffort: 'medium',
        },
      },
      {
        id: 'gpt-5.6-luna',
        name: 'GPT-5.6-Luna',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
            { id: 'max', name: 'Max' },
          ],
          defaultEffort: 'medium',
        },
      },
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
          ],
          defaultEffort: 'medium',
        },
      },
      {
        id: 'gpt-5.3-codex-spark',
        name: 'GPT-5.3-Codex-Spark',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
          ],
          defaultEffort: 'high',
        },
      },
    ],
  },
  {
    group: 'Grok (Subscription)',
    models: [
      { id: 'grok-4.20-0309-non-reasoning', name: 'grok-4.20-0309-non-reasoning' },
      { id: 'grok-4.20-0309-reasoning', name: 'grok-4.20-0309-reasoning' },
      { id: 'grok-4.20-multi-agent-0309', name: 'grok-4.20-multi-agent-0309' },
      { id: 'grok-4.3', name: 'grok-4.3' },
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
          ],
          defaultEffort: 'high',
        },
      },
      {
        id: 'grok-4.6',
        name: 'Grok 4.6',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Extra High' },
          ],
          defaultEffort: 'high',
        },
      },
      { id: 'grok-build-0.1', name: 'grok-build-0.1' },
    ],
  },
]

/**
 * `session.modelCatalog` 载荷 → ModelSelector 分组。
 *
 * 实时目录是当前实例真正可路由的模型（含 DeepSeek / 订阅组等），
 * 分组 id 用作 provider 回退，reasoning 原样透传。
 */
export function catalogToModelGroups(payload: unknown): ModelGroup[] {
  if (typeof payload !== 'object' || payload === null) return []
  const groups = (payload as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return []
  const result: ModelGroup[] = []
  for (const raw of groups) {
    if (typeof raw !== 'object' || raw === null) continue
    const group = raw as { id?: unknown; group?: unknown; name?: unknown; provider?: unknown; models?: unknown }
    if (!Array.isArray(group.models)) continue
    const label = typeof group.group === 'string' && group.group !== ''
      ? group.group
      : typeof group.name === 'string' && group.name !== ''
        ? group.name
        : typeof group.id === 'string' ? group.id : ''
    if (label === '') continue
    const models: ModelItem[] = []
    for (const rawModel of group.models) {
      if (typeof rawModel !== 'object' || rawModel === null) continue
      const model = rawModel as { id?: unknown; name?: unknown; reasoning?: unknown }
      if (typeof model.id !== 'string' || model.id === '') continue
      const item: ModelItem = {
        id: model.id,
        name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
      }
      if (typeof model.reasoning === 'object' && model.reasoning !== null) {
        item.reasoning = model.reasoning as ModelItem['reasoning']
      }
      models.push(item)
    }
    if (models.length > 0) result.push({ group: label, models })
  }
  return result
}

export function getDefaultModelForInstance(port: number): string {
  return 'gpt-6-astra'
}

export const ModelSelector = memo(function ModelSelector({
  locale = 'zh',
  activePort = 43128,
  hostDefaultModel,
  hostDefaultEffort,
  dynamicModels = [],
  onSelectModel,
  onSelectEffort,
  api,
}: {
  locale?: 'zh' | 'en'
  activePort?: number
  hostDefaultModel?: string
  hostDefaultEffort?: string
  dynamicModels?: Array<{ id: string; name?: string }>
  onSelectModel?: (modelId: string, effort?: string, provider?: string) => void
  onSelectEffort?: (effort: string) => void
  /** Host RPC client; when present the live `session.modelCatalog` wins. */
  api?: PanelApi
}) {
  const isEn = locale === 'en'
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>(REAL_LOCAL_SUBSCRIPTION_GROUPS)

  // 默认模型初始化
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) {
        if (!hostDefaultModel || savedForPort !== 'gpt-6-astra' || hostDefaultModel === 'gpt-6-astra') {
          return savedForPort
        }
      }
      const savedGlobal = localStorage.getItem('omnimux_default_model')
      if (savedGlobal) {
        if (!hostDefaultModel || savedGlobal !== 'gpt-6-astra' || hostDefaultModel === 'gpt-6-astra') {
          return savedGlobal
        }
      }
    } catch {
      // Ignore
    }
    return hostDefaultModel || getDefaultModelForInstance(activePort)
  })

  // 推理等级初始化
  const [selectedEffort, setSelectedEffort] = useState<string>(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_effort_${activePort}`)
      if (savedForPort) return savedForPort
      const savedGlobal = localStorage.getItem('omnimux_default_effort')
      if (savedGlobal) return savedGlobal
    } catch {
      // Ignore
    }
    return hostDefaultEffort || 'medium'
  })

  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')

  // 列表真源顺序：当前实例实时目录 → /ext/bridge-config 订阅目录 → 硬编码兜底。
  // 硬编码快照只用于宿主不可达时的离线展示，不能覆盖实时配置。
  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      if (api !== undefined) {
        try {
          const catalog = await api.rpc<unknown>('session.modelCatalog', {})
          const groups = catalogToModelGroups(catalog)
          if (active && groups.length > 0) {
            setModelGroups(groups)
            return
          }
        } catch {
          // Bridge down: fall through to the unauthenticated discovery snapshot.
        }
      }
      try {
        const res = await loopbackFetch(`http://127.0.0.1:${activePort}/ext/bridge-config`, {
          signal: AbortSignal.timeout(1200),
        })
        if (!res.ok) return
        const data = (await res.json()) as { modelGroups?: unknown }
        if (!active || !Array.isArray(data.modelGroups) || data.modelGroups.length === 0) return
        setModelGroups(data.modelGroups as ModelGroup[])
      } catch {
        // Keep the initial fallback groups.
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [activePort, api])

  // 当外部实例端口切换时，同步更新默认模型与推理等级
  useEffect(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) {
        if (!hostDefaultModel || savedForPort !== 'gpt-6-astra' || hostDefaultModel === 'gpt-6-astra') {
          setSelectedModel(savedForPort)
          const savedEffort = localStorage.getItem(`omnimux_default_effort_${activePort}`) || hostDefaultEffort || 'medium'
          setSelectedEffort(savedEffort)
          onSelectModel?.(savedForPort, savedEffort)
          return
        }
      }
    } catch {
      // Ignore
    }
    const defaultModel = hostDefaultModel || getDefaultModelForInstance(activePort)
    const defaultEffort = hostDefaultEffort || 'medium'
    setSelectedModel(defaultModel)
    setSelectedEffort(defaultEffort)
    onSelectModel?.(defaultModel, defaultEffort)
  }, [activePort, hostDefaultModel, hostDefaultEffort])

  // 找到当前选中的模型对象与其支持的推理等级
  let currentModelItem: ModelItem | undefined
  for (const g of modelGroups) {
    const found = g.models.find((m) => m.id === selectedModel)
    if (found) {
      currentModelItem = found
      break
    }
  }

  const modelEfforts: EffortOption[] = currentModelItem?.reasoning?.efforts?.length
    ? currentModelItem.reasoning.efforts
    : DEFAULT_FALLBACK_EFFORTS

  // 合并可能存在的动态模型
  const allKnownIds = new Set<string>()
  modelGroups.forEach((g) => g.models.forEach((m) => allKnownIds.add(m.id)))
  const unassignedDynamic = dynamicModels.filter((dm) => !allKnownIds.has(dm.id))

  const handleSelectModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__custom__') {
      setShowCustomInput(true)
      return
    }
    setSelectedModel(val)
    setShowCustomInput(false)

    // 检查新模型是否声明 defaultEffort 或是否包含当前选中的 effort
    let newEffort = selectedEffort
    for (const g of modelGroups) {
      const found = g.models.find((m) => m.id === val)
      if (found?.reasoning?.efforts?.length) {
        const hasCurrent = found.reasoning.efforts.some((eff) => eff.id === selectedEffort)
        if (!hasCurrent) {
          newEffort = found.reasoning.defaultEffort || found.reasoning.efforts[0]?.id || 'medium'
          setSelectedEffort(newEffort)
        }
      }
    }

    try {
      localStorage.setItem(`omnimux_default_model_${activePort}`, val)
      localStorage.setItem('omnimux_default_model', val)
      localStorage.setItem(`omnimux_default_effort_${activePort}`, newEffort)
      localStorage.setItem('omnimux_default_effort', newEffort)
    } catch {
      // Ignore
    }

    let matchedProvider: string | undefined
    for (const g of modelGroups) {
      if (g.models.some((m) => m.id === val)) {
        matchedProvider = (g as unknown as { provider?: string }).provider
          || (g.group === 'ChatGPT (Codex)' ? 'chatgpt' : g.group === 'Grok (Subscription)' ? 'grok' : undefined)
        break
      }
    }
    onSelectModel?.(val, newEffort, matchedProvider)
  }

  const handleEffortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectedEffort(val)
    try {
      localStorage.setItem(`omnimux_default_effort_${activePort}`, val)
      localStorage.setItem('omnimux_default_effort', val)
    } catch {
      // Ignore
    }
    onSelectEffort?.(val)
    onSelectModel?.(selectedModel, val)
  }

  const handleApplyCustom = () => {
    const trimmed = customModelInput.trim()
    if (!trimmed) return
    setSelectedModel(trimmed)
    setShowCustomInput(false)
    setCustomModelInput('')
    try {
      localStorage.setItem(`omnimux_default_model_${activePort}`, trimmed)
      localStorage.setItem('omnimux_default_model', trimmed)
    } catch {
      // Ignore
    }
    onSelectModel?.(trimmed, selectedEffort)
  }

  return (
    <div className="model-selector-container">
      {!showCustomInput ? (
        <div className="model-selector-row">
          <div className="model-selector-main">
            <select
              className="model-select-control"
              value={selectedModel}
              onChange={handleSelectModelChange}
            >
              {modelGroups.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}

              {unassignedDynamic.length > 0 && (
                <optgroup label={isEn ? 'Other Local Models' : '其他本地配置模型'}>
                  {unassignedDynamic.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </optgroup>
              )}

              {!allKnownIds.has(selectedModel) && selectedModel && selectedModel !== '__custom__' && (
                <optgroup label={isEn ? 'Custom Selected' : '自定义当前模型'}>
                  <option value={selectedModel}>{selectedModel}</option>
                </optgroup>
              )}

              <option value="__custom__">
                ＋ {isEn ? 'Custom Model...' : '自定义模型...'}
              </option>
            </select>
          </div>

          <div className="reasoning-effort-container">
            <select
              className="effort-select-control"
              value={selectedEffort}
              onChange={handleEffortChange}
              title={isEn ? 'Reasoning Effort Level' : '思考/推理等级'}
            >
              {modelEfforts.map((eff) => (
                <option key={eff.id} value={eff.id}>
                  {eff.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="custom-port-input-row" style={{ marginTop: '7px' }}>
          <input
            type="text"
            className="custom-port-input"
            placeholder={isEn ? 'Model ID (e.g. gpt-6-astra)' : '输入模型 ID (如 gpt-6-astra)'}
            value={customModelInput}
            onChange={(e) => setCustomModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyCustom()
            }}
            autoFocus
          />
          <button
            type="button"
            className="custom-port-apply-btn"
            onClick={handleApplyCustom}
          >
            {isEn ? 'OK' : '确认'}
          </button>
          <button
            type="button"
            className="custom-port-cancel-btn"
            onClick={() => setShowCustomInput(false)}
          >
            {isEn ? 'Cancel' : '取消'}
          </button>
        </div>
      )}
    </div>
  )
})
