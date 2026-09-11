import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getCreativePresetsStore } from './presets-store.js'
import { getComposerModeStore } from '../composer-mode/composer-mode-store.js'
import { CreativeDimensionModal } from './CreativeDimensionModal.jsx'
import { ensurePresetsStyles } from './styles.js'
import { FormatIcon, HookIcon, StyleIcon } from './icons.jsx'

/**
 * 营销视频三大创意预设 —— 工具栏 3 独立触发按钮组件
 * 注册于官方标准槽位 `conversation.input.left` (order: 30)
 * 水平紧随加号(+)、技能(order 10)、模型(order 20)之后，与它们平级并列
 * 默认在 'agent' / 'drama' 模式下隐藏，仅在 'marketing' (营销) 模式下展开
 */
export function ComposerPresetsTriggers(props) {
  const store = useMemo(() => getCreativePresetsStore(), [])
  const modeStore = useMemo(() => getComposerModeStore(), [])
  const sessionId =
    props?.sessionId ||
    props?.session?.id ||
    props?.session?.sessionId ||
    (typeof window !== 'undefined' ? (window.__omnimuxStage?.activeSession || 'default') : 'default')

  const [activeModal, setActiveModal] = useState(null) // null | 'format' | 'hook' | 'style'

  useEffect(() => {
    ensurePresetsStyles()
  }, [])

  const subscribe = useCallback(
    (callback) => store.subscribe(sessionId, callback),
    [store, sessionId]
  )

  const getSnapshot = useCallback(
    () => store.getSnapshot(sessionId),
    [store, sessionId]
  )

  const presets = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const modeSubscribe = useCallback(
    (callback) => modeStore.subscribe(sessionId, callback),
    [modeStore, sessionId]
  )

  const modeSnapshot = useCallback(
    () => modeStore.getMode(sessionId),
    [modeStore, sessionId]
  )

  const activeMode = useSyncExternalStore(modeSubscribe, modeSnapshot, modeSnapshot)

  // 默认 Agent 模式与短剧模式不显示营销预设按钮；仅在营销模式下显式呈现
  if (activeMode !== 'marketing') {
    return null
  }

  const handleOpenDimension = (dimension) => {
    setActiveModal(dimension)
  }

  const handleCloseModal = () => {
    setActiveModal(null)
  }

  return (
    <>
      {/* 1. 广告格式按钮 (严格复用同位置工具栏 .sh-picker-trigger 规范) */}
      <div className="sh-picker-wrap">
        <button /* exempt-ui01: Composer工具栏广告格式触发按钮 */
          type="button"
          className={`sh-picker-trigger omnimux-composer-preset-trigger ${presets.format ? 'on has-active' : ''}`}
          onClick={() => handleOpenDimension('format')}
          title="选择广告视频叙事格式 (共 96 款)"
        >
          <FormatIcon size={14} />
          <span className="sh-picker-trigger-label">
            {presets.format ? (presets.format.titleZh || presets.format.title) : '广告格式'}
          </span>
        </button>
      </div>

      {/* 2. 开场亮点按钮 (严格复用同位置工具栏 .sh-picker-trigger 规范) */}
      <div className="sh-picker-wrap">
        <button /* exempt-ui01: Composer工具栏开场亮点触发按钮 */
          type="button"
          className={`sh-picker-trigger omnimux-composer-preset-trigger ${presets.hook ? 'on has-active' : ''}`}
          onClick={() => handleOpenDimension('hook')}
          title="选择黄金 3 秒开场抓手 Hook (共 75 款)"
        >
          <HookIcon size={14} />
          <span className="sh-picker-trigger-label">
            {presets.hook ? (presets.hook.titleZh || presets.hook.title) : '亮点'}
          </span>
        </button>
      </div>

      {/* 3. 视觉风格按钮 (严格复用同位置工具栏 .sh-picker-trigger 规范) */}
      <div className="sh-picker-wrap">
        <button /* exempt-ui01: Composer工具栏视觉风格触发按钮 */
          type="button"
          className={`sh-picker-trigger omnimux-composer-preset-trigger ${presets.style ? 'on has-active' : ''}`}
          onClick={() => handleOpenDimension('style')}
          title="选择画面视觉美学与光影调色 (共 20 款)"
        >
          <StyleIcon size={14} />
          <span className="sh-picker-trigger-label">
            {presets.style ? (presets.style.titleZh || presets.style.title) : '视觉风格'}
          </span>
        </button>
      </div>

      {/* 专属独立弹窗渲染 */}
      {activeModal && (
        <CreativeDimensionModal
          isOpen={Boolean(activeModal)}
          onClose={handleCloseModal}
          dimension={activeModal}
          sessionId={sessionId}
        />
      )}
    </>
  )
}
