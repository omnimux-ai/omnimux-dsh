import { memo, useEffect, useState } from 'react'

export interface ModelOption {
  id: string
  nameZh: string
  nameEn: string
  isRecommended?: boolean
  isCustom?: boolean
}

export const INSTANCE_MODELS: Record<number, ModelOption[]> = {
  // 45120: OmniMux Dev
  45120: [
    {
      id: 'gemini-3.8-flash-high',
      nameZh: 'Gemini 3.8 Flash (Dev 默认)',
      nameEn: 'Gemini 3.8 Flash (Dev Default)',
      isRecommended: true,
    },
    {
      id: 'deepseek-chat',
      nameZh: 'DeepSeek-V3 (通用推理)',
      nameEn: 'DeepSeek-V3 (General)',
    },
    {
      id: 'deepseek-reasoner',
      nameZh: 'DeepSeek-R1 (深度思考)',
      nameEn: 'DeepSeek-R1 (Reasoner)',
    },
    {
      id: 'claude-3-7-sonnet',
      nameZh: 'Claude 3.7 Sonnet (高质量编码)',
      nameEn: 'Claude 3.7 Sonnet (Coding)',
    },
    {
      id: 'gpt-4o',
      nameZh: 'GPT-4o (多模态通用)',
      nameEn: 'GPT-4o (Multimodal)',
    },
  ],
  // 43120: DSH Desktop
  43120: [
    {
      id: 'deepseek-v4.1-flash',
      nameZh: 'DeepSeek V4.1 Flash (原生默认)',
      nameEn: 'DeepSeek V4.1 Flash (Desktop Default)',
      isRecommended: true,
    },
    {
      id: 'deepseek-chat',
      nameZh: 'DeepSeek-V3 (官方底座)',
      nameEn: 'DeepSeek-V3 (Official)',
    },
    {
      id: 'deepseek-v4-flash-vision-exp',
      nameZh: 'DeepSeek V4 Vision (多模态视觉)',
      nameEn: 'DeepSeek V4 Vision (Multimodal)',
    },
    {
      id: 'gemini-3.8-flash-high',
      nameZh: 'Gemini 3.8 Flash (高性能通道)',
      nameEn: 'Gemini 3.8 Flash (Fast)',
    },
  ],
  // 43128: OmniMux PRD
  43128: [
    {
      id: 'gemini-3.1-pro-preview',
      nameZh: 'Gemini 3.1 Pro (PRD 生产默认)',
      nameEn: 'Gemini 3.1 Pro (PRD Default)',
      isRecommended: true,
    },
    {
      id: 'gemini-3.8-flash-high',
      nameZh: 'Gemini 3.8 Flash (高可用极速)',
      nameEn: 'Gemini 3.8 Flash (High Availability)',
    },
    {
      id: 'deepseek-chat',
      nameZh: 'DeepSeek-V3 (稳定版)',
      nameEn: 'DeepSeek-V3 (Stable)',
    },
  ],
}

export function getDefaultModelForPort(port: number): string {
  const list = INSTANCE_MODELS[port]
  if (list && list.length > 0) {
    const rec = list.find((m) => m.isRecommended) || list[0]
    return rec.id
  }
  return 'gemini-3.8-flash-high'
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

  // 从本地缓存加载该端口专属的默认模型设置
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const savedForPort = localStorage.getItem(`omnimux_default_model_${activePort}`)
      if (savedForPort) return savedForPort
      const savedGlobal = localStorage.getItem('omnimux_default_model')
      if (savedGlobal) return savedGlobal
    } catch {
      // Ignore
    }
    return hostDefaultModel || getDefaultModelForPort(activePort)
  })

  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')

  // 当外部实例端口切换时，自动匹配并刷新该实例的推荐模型
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
    const defaultModel = hostDefaultModel || getDefaultModelForPort(activePort)
    setSelectedModel(defaultModel)
    onSelectModel?.(defaultModel)
  }, [activePort, hostDefaultModel])

  // 计算当前实例的全部候选模型
  const currentInstanceModels: ModelOption[] = [...(INSTANCE_MODELS[activePort] || INSTANCE_MODELS[45120])]

  // 融入从当前 Host 实例动态获取的补充模型
  for (const dm of dynamicModels) {
    if (!currentInstanceModels.some((m) => m.id === dm.id)) {
      currentInstanceModels.push({
        id: dm.id,
        nameZh: dm.name || dm.id,
        nameEn: dm.name || dm.id,
      })
    }
  }

  // 如果当前选中的是自定义模型且不在预设列表中，动态加入
  const isPreset = currentInstanceModels.some((m) => m.id === selectedModel)
  if (!isPreset && selectedModel && selectedModel !== '__custom__') {
    currentInstanceModels.push({
      id: selectedModel,
      nameZh: `${selectedModel} (自定义)`,
      nameEn: `${selectedModel} (Custom)`,
      isCustom: true,
    })
  }

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
          {currentInstanceModels.map((m) => (
            <option key={m.id} value={m.id}>
              {isEn ? m.nameEn : m.nameZh}
            </option>
          ))}
          <option value="__custom__">
            ＋ {isEn ? 'Custom Model...' : '自定义模型...'}
          </option>
        </select>
      ) : (
        <div className="custom-port-input-row" style={{ marginTop: '7px' }}>
          <input
            type="text"
            className="custom-port-input"
            placeholder={isEn ? 'Model ID (e.g. claude-3-7-sonnet)' : '输入模型 ID (如 claude-3-7-sonnet)'}
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
