import { memo, useEffect, useState } from 'react'

export interface ModelGroup {
  group: string
  models: Array<{
    id: string
    name: string
  }>
}

/** 本地真实订阅模型（与 ~/.dsh/plugins/subscriptions/models.json 1:1 对齐） */
export const REAL_LOCAL_SUBSCRIPTION_GROUPS: ModelGroup[] = [
  {
    group: 'ChatGPT (Codex)',
    models: [
      { id: 'gpt-6-astra', name: 'GPT-6-Astra' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6-Terra' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna' },
      { id: 'gpt-5.5', name: 'GPT-5.5' },
      { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3-Codex-Spark' },
    ],
  },
  {
    group: 'Grok (Subscription)',
    models: [
      { id: 'grok-4.20-0309-non-reasoning', name: 'grok-4.20-0309-non-reasoning' },
      { id: 'grok-4.20-0309-reasoning', name: 'grok-4.20-0309-reasoning' },
      { id: 'grok-4.20-multi-agent-0309', name: 'grok-4.20-multi-agent-0309' },
      { id: 'grok-4.3', name: 'grok-4.3' },
      { id: 'grok-4.5', name: 'Grok 4.5' },
      { id: 'grok-4.6', name: 'Grok 4.6' },
      { id: 'grok-build-0.1', name: 'grok-build-0.1' },
    ],
  },
]

export function getDefaultModelForInstance(port: number): string {
  // 默认推荐 GPT-5.3-Codex-Spark 或 GPT-6-Astra
  return 'gpt-5.3-codex-spark'
}

export const ModelSelector = memo(function ModelSelector({
  locale = 'zh',
  activePort = 45120,
  hostDefaultModel,
  dynamicModels = [],
  onSelectModel,
}: {
  locale?: 'zh' | 'en'
  activePort?: number
  hostDefaultModel?: string
  dynamicModels?: Array<{ id: string; name?: string }>
  onSelectModel?: (modelId: string) => void
}) {
  const isEn = locale === 'en'
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>(REAL_LOCAL_SUBSCRIPTION_GROUPS)

  // 默认模型初始化
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) return savedForPort
      const savedGlobal = localStorage.getItem('omnimux_default_model')
      if (savedGlobal) return savedGlobal
    } catch {
      // Ignore
    }
    return hostDefaultModel || getDefaultModelForInstance(activePort)
  })

  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')

  // 动态向本地真实服务探查最新模型列表
  useEffect(() => {
    let active = true
    void fetch(`http://127.0.0.1:${activePort}/ext/bridge-config`, {
      signal: AbortSignal.timeout(1200),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return
        if (Array.isArray(data.modelGroups) && data.modelGroups.length > 0) {
          setModelGroups(data.modelGroups)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [activePort])

  // 当外部实例端口切换时，同步更新默认模型
  useEffect(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) {
        setSelectedModel(savedForPort)
        onSelectModel?.(savedForPort)
        return
      }
    } catch {
      // Ignore
    }
    const defaultModel = hostDefaultModel || getDefaultModelForInstance(activePort)
    setSelectedModel(defaultModel)
    onSelectModel?.(defaultModel)
  }, [activePort, hostDefaultModel])

  // 合并可能存在的动态模型
  const allKnownIds = new Set<string>()
  modelGroups.forEach((g) => g.models.forEach((m) => allKnownIds.add(m.id)))

  const unassignedDynamic = dynamicModels.filter((dm) => !allKnownIds.has(dm.id))

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__custom__') {
      setShowCustomInput(true)
      return
    }
    setSelectedModel(val)
    setShowCustomInput(false)
    try {
      localStorage.setItem(`omnimux_default_model_${activePort}`, val)
      localStorage.setItem('omnimux_default_model', val)
    } catch {
      // Ignore
    }
    onSelectModel?.(val)
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
    onSelectModel?.(trimmed)
  }

  return (
    <div className="model-selector-container">
      {!showCustomInput ? (
        <select
          className="model-select-control"
          value={selectedModel}
          onChange={handleSelectChange}
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
