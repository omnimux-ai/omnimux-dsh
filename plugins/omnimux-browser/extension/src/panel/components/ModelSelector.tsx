import { memo, useEffect, useState } from 'react'
import { loopbackFetch } from '../../shared/loopback-fetch.ts'
import { providerFromCatalogGroup } from '../../shared/model-catalog.ts'
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
  /** Host provider id when the group came from the live catalog. */
  provider?: string
  models: ModelItem[]
}

/**
 * Model 支持的 effort 归一化：无 reasoning 元数据一律为空，绝不继承旧值。
 */
export function resolveEffortForModel(item: ModelItem | undefined, current: string): string {
  const efforts = item?.reasoning?.efforts ?? []
  if (efforts.length === 0) return ''
  if (current !== '' && efforts.some((effort) => effort.id === current)) return current
  const preferred = item?.reasoning?.defaultEffort
  if (typeof preferred === 'string' && efforts.some((effort) => effort.id === preferred)) return preferred
  return efforts[0]?.id ?? ''
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
    if (models.length > 0) {
      const provider = typeof group.id === 'string' && group.id.trim() !== '' ? group.id.trim() : undefined
      result.push(provider === undefined ? { group: label, models } : { group: label, provider, models })
    }
  }
  return result
}

export function getDefaultModelForInstance(port: number): string {
  return 'gpt-6-astra'
}

/**
 * Where the selector's own persistence lives.
 *
 * `chat` is the historical behavior: the choice is mirrored into the panel's
 * `localStorage` keys and pushed to the host's `agent-default-model`. `text`
 * is the controlled text-generation row (#3629): the caller owns the value and
 * its storage, so this component must not touch either chat key.
 */
export type ModelSelectorStorageScope = 'chat' | 'text'

export const ModelSelector = memo(function ModelSelector({
  locale = 'zh',
  activePort = 43128,
  hostDefaultModel,
  hostDefaultEffort,
  dynamicModels = [],
  onSelectModel,
  onSelectEffort,
  api,
  storageScope = 'chat',
  selectedModel: selectedModelProp,
  selectedEffort: selectedEffortProp,
  allowEmptyOption = false,
  emptyOptionLabel,
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
  /** Storage range this instance owns; the text row injects `text`. */
  storageScope?: ModelSelectorStorageScope
  /**
   * Controlled selected model. When provided the component never decides the
   * value, never writes the chat storage keys, and reports every change through
   * the callbacks — that is what keeps the two settings rows independent.
   */
  selectedModel?: string
  /** Controlled reasoning effort; only read while {@link selectedModel} is set. */
  selectedEffort?: string
  /** Offer an empty "follow the chat model" choice (text-generation row). */
  allowEmptyOption?: boolean
  emptyOptionLabel?: string
}) {
  const isEn = locale === 'en'
  const controlled = selectedModelProp !== undefined
  // Only the uncontrolled chat usage owns the localStorage keys; a controlled
  // or text-scoped instance must never touch them.
  const persistLocally = !controlled && storageScope === 'chat'
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>(REAL_LOCAL_SUBSCRIPTION_GROUPS)

  // 默认模型初始化
  const [internalModel, setInternalModel] = useState<string>(() => {
    try {
      if (!persistLocally) return hostDefaultModel || getDefaultModelForInstance(activePort)
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
  const [internalEffort, setInternalEffort] = useState<string>(() => {
    try {
      if (!persistLocally) return hostDefaultEffort || 'medium'
      const savedForPort = localStorage.getItem(`omnimux_default_effort_${activePort}`)
      if (savedForPort) return savedForPort
      const savedGlobal = localStorage.getItem('omnimux_default_effort')
      if (savedGlobal) return savedGlobal
    } catch {
      // Ignore
    }
    return hostDefaultEffort || 'medium'
  })

  // The value on screen: the caller's in controlled mode, ours otherwise.
  const selectedModel: string = controlled ? (selectedModelProp ?? '') : internalModel
  const selectedEffort: string = controlled ? (selectedEffortProp ?? '') : internalEffort

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

  // 当外部实例端口切换时，同步更新默认模型与推理等级。
  // 受控实例的取值由调用方决定，这里既不改写它的值也不回写对话存储。
  useEffect(() => {
    if (controlled) return
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) {
        if (!hostDefaultModel || savedForPort !== 'gpt-6-astra' || hostDefaultModel === 'gpt-6-astra') {
          setInternalModel(savedForPort)
          const savedEffort = localStorage.getItem(`omnimux_default_effort_${activePort}`) || hostDefaultEffort || 'medium'
          setInternalEffort(savedEffort)
          onSelectModel?.(savedForPort, savedEffort)
          return
        }
      }
    } catch {
      // Ignore
    }
    const defaultModel = hostDefaultModel || getDefaultModelForInstance(activePort)
    const defaultEffort = hostDefaultEffort || 'medium'
    setInternalModel(defaultModel)
    setInternalEffort(defaultEffort)
    onSelectModel?.(defaultModel, defaultEffort)
  }, [activePort, hostDefaultModel, hostDefaultEffort, controlled])

  // 找到当前选中的模型对象与其支持的推理等级
  let currentModelItem: ModelItem | undefined
  for (const g of modelGroups) {
    const found = g.models.find((m) => m.id === selectedModel)
    if (found) {
      currentModelItem = found
      break
    }
  }

  const modelEfforts: EffortOption[] = currentModelItem?.reasoning?.efforts ?? []

  // 合并可能存在的动态模型
  const allKnownIds = new Set<string>()
  modelGroups.forEach((g) => g.models.forEach((m) => allKnownIds.add(m.id)))
  const unassignedDynamic = dynamicModels.filter((dm) => !allKnownIds.has(dm.id))

  // 实时目录加载后，按模型元数据纠正历史/默认 effort；无 reasoning 的模型清空。
  // 受控实例不在组件内纠正：调用方拥有该值，组件只上报用户的选择。
  useEffect(() => {
    if (controlled) return
    if (currentModelItem === undefined) return
    const nextEffort = resolveEffortForModel(currentModelItem, selectedEffort)
    if (nextEffort === selectedEffort) return
    setInternalEffort(nextEffort)
    try {
      if (nextEffort === '') {
        localStorage.removeItem(`omnimux_default_effort_${activePort}`)
        localStorage.removeItem('omnimux_default_effort')
      } else {
        localStorage.setItem(`omnimux_default_effort_${activePort}`, nextEffort)
        localStorage.setItem('omnimux_default_effort', nextEffort)
      }
    } catch {
      // Ignore
    }
    const group = modelGroups.find((candidate) => candidate.models.some((model) => model.id === selectedModel))
    onSelectModel?.(selectedModel, nextEffort === '' ? undefined : nextEffort, group?.provider)
  }, [modelGroups, selectedModel, selectedEffort, controlled])

  const handleSelectModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__custom__') {
      setShowCustomInput(true)
      return
    }
    if (!controlled) setInternalModel(val)
    setShowCustomInput(false)

    // 无 reasoning 元数据的模型必须清空 effort，不能继承旧值。
    const found = modelGroups.flatMap((g) => g.models).find((m) => m.id === val)
    const newEffort = resolveEffortForModel(found, selectedEffort)
    if (!controlled) setInternalEffort(newEffort)

    if (persistLocally) {
      try {
        localStorage.setItem(`omnimux_default_model_${activePort}`, val)
        localStorage.setItem('omnimux_default_model', val)
        if (newEffort === '') {
          localStorage.removeItem(`omnimux_default_effort_${activePort}`)
          localStorage.removeItem('omnimux_default_effort')
        } else {
          localStorage.setItem(`omnimux_default_effort_${activePort}`, newEffort)
          localStorage.setItem('omnimux_default_effort', newEffort)
        }
      } catch {
        // Ignore
      }
    }

    const group = modelGroups.find((candidate) => candidate.models.some((model) => model.id === val))
    // provider 解析规则与 background 的钉定路径共用同一实现（#3629）：目录组 id
    // 优先，组名映射兜底；两处若各写一份就会漂移。
    const matchedProvider = providerFromCatalogGroup(group)
    onSelectModel?.(val, newEffort === '' ? undefined : newEffort, matchedProvider)
  }

  const handleEffortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (!controlled) setInternalEffort(val)
    if (persistLocally) {
      try {
        localStorage.setItem(`omnimux_default_effort_${activePort}`, val)
        localStorage.setItem('omnimux_default_effort', val)
      } catch {
        // Ignore
      }
    }
    onSelectEffort?.(val)
    onSelectModel?.(selectedModel, val)
  }

  const handleApplyCustom = () => {
    const trimmed = customModelInput.trim()
    if (!trimmed) return
    if (!controlled) setInternalModel(trimmed)
    setShowCustomInput(false)
    setCustomModelInput('')
    if (persistLocally) {
      try {
        localStorage.setItem(`omnimux_default_model_${activePort}`, trimmed)
        localStorage.setItem('omnimux_default_model', trimmed)
      } catch {
        // Ignore
      }
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
              {allowEmptyOption && (
                <option value="">
                  {emptyOptionLabel ?? (isEn ? 'Follow Chat Model' : '跟随对话模型')}
                </option>
              )}
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

          {modelEfforts.length > 0 && (
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
          )}
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
