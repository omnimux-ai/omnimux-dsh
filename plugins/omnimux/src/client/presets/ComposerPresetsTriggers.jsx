import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getCreativePresetsStore } from './presets-store.js'
import { CreativeDimensionModal } from './CreativeDimensionModal.jsx'
import { ensurePresetsStyles } from './styles.js'

/**
 * 营销视频三大创意预设 —— 工具栏 3 独立触发按钮组件
 * 注册于官方标准槽位 `conversation.input.left` (order: 30)
 * 水平紧随加号(+)、技能(order 10)、模型(order 20)之后，与它们平级并列
 */
export function ComposerPresetsTriggers(props) {
  const store = useMemo(() => getCreativePresetsStore(), [])
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

  const handleOpenDimension = (dimension) => {
    setActiveModal(dimension)
  }

  const handleCloseModal = () => {
    setActiveModal(null)
  }

  return (
    <div className="omnimux-composer-presets-row" role="toolbar" aria-label="营销创意预设选项">
      {/* 1. 广告格式按钮 */}
      <button /* exempt-ui01: Composer工具栏广告格式触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.format ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('format')}
        title="选择广告视频叙事格式 (共 96 款)"
      >
        <span>⭐</span>
        <span>{presets.format ? (presets.format.titleZh || presets.format.title) : '广告格式'}</span>
        {presets.format && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>

      {/* 2. 开场亮点按钮 */}
      <button /* exempt-ui01: Composer工具栏开场亮点触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.hook ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('hook')}
        title="选择黄金 3 秒开场抓手 Hook (共 75 款)"
      >
        <span>🎯</span>
        <span>{presets.hook ? (presets.hook.titleZh || presets.hook.title) : '亮点'}</span>
        {presets.hook && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>

      {/* 3. 视觉风格按钮 */}
      <button /* exempt-ui01: Composer工具栏视觉风格触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.style ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('style')}
        title="选择画面视觉美学与光影调色 (共 20 款)"
      >
        <span>🎨</span>
        <span>{presets.style ? (presets.style.titleZh || presets.style.title) : '视觉风格'}</span>
        {presets.style && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>

      {/* 专属独立弹窗渲染 */}
      {activeModal && (
        <CreativeDimensionModal
          isOpen={Boolean(activeModal)}
          onClose={handleCloseModal}
          dimension={activeModal}
          sessionId={sessionId}
        />
      )}
    </div>
  )
}
