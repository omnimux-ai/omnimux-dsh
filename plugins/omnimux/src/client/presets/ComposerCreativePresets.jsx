import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getCreativePresetsStore } from './presets-store.js'
import { CreativeDimensionModal } from './CreativeDimensionModal.jsx'
import { ensurePresetsStyles } from './styles.js'

/**
 * 营销视频三大创意预设 Composer 输入框集成组件
 * 包含：
 * 1. 3 个独立触发按钮：[⭐ 广告格式]、[🎯 亮点]、[🎨 视觉风格] (Portal 注入工具栏)
 * 2. 输入框上方已选 Chips 胶囊栏 (Selected Chips)
 * 3. 专属独立弹窗唤起与绑定
 */
export function ComposerCreativePresets({ sessionId = 'default', className = '' }) {
  const store = useMemo(() => getCreativePresetsStore(), [])
  const [activeModal, setActiveModal] = useState(null) // null | 'format' | 'hook' | 'style'
  const [toolsTarget, setToolsTarget] = useState(null)

  useEffect(() => {
    ensurePresetsStyles()
  }, [])

  // 侦测与连接原生输入框工具栏
  useEffect(() => {
    if (typeof document === 'undefined') return
    function findToolsElement() {
      const el = document.querySelector('[data-composer-card] [class*="tools"]')
      if (el && el !== toolsTarget) {
        setToolsTarget(el)
      }
    }
    findToolsElement()
    const observer = new MutationObserver(findToolsElement)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [toolsTarget])

  const subscribe = useCallback(
    (callback) => store.subscribe(sessionId, callback),
    [store, sessionId]
  )

  const getSnapshot = useCallback(
    () => store.getSnapshot(sessionId),
    [store, sessionId]
  )

  const presets = useSyncExternalStore(subscribe, getSnapshot, () => ({
    format: null,
    hook: null,
    style: null,
  }))

  const hasAny = Boolean(presets.format || presets.hook || presets.style)

  const handleOpenDimension = (dimension) => {
    setActiveModal(dimension)
  }

  const handleCloseModal = () => {
    setActiveModal(null)
  }

  const handleRemoveDimension = (e, dimension) => {
    e.stopPropagation()
    store.removePreset(sessionId, dimension)
  }

  // 3 个独立触发按钮节点
  const triggersNode = (
    <div className="omnimux-composer-presets-row" role="toolbar" aria-label="营销创意预设选项">
      <button /* exempt-ui01: Composer广告格式触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.format ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('format')}
        title="选择广告视频叙事格式 (共 96 款)"
      >
        <span>⭐</span>
        <span>{presets.format ? (presets.format.titleZh || presets.format.title) : '广告格式'}</span>
        {presets.format && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>

      <button /* exempt-ui01: Composer开场亮点触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.hook ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('hook')}
        title="选择黄金 3 秒开场抓手 Hook (共 75 款)"
      >
        <span>🎯</span>
        <span>{presets.hook ? (presets.hook.titleZh || presets.hook.title) : '亮点'}</span>
        {presets.hook && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>

      <button /* exempt-ui01: Composer视觉风格触发按钮 */
        type="button"
        className={`omnimux-composer-preset-trigger ${presets.style ? 'has-active' : ''}`}
        onClick={() => handleOpenDimension('style')}
        title="选择画面视觉美学与光影调色 (共 20 款)"
      >
        <span>🎨</span>
        <span>{presets.style ? (presets.style.titleZh || presets.style.title) : '视觉风格'}</span>
        {presets.style && <span className="omnimux-composer-preset-trigger-dot" />}
      </button>
    </div>
  )

  return (
    <div className={`omnimux-composer-presets-container ${className}`}>
      {/* 1. 已选中的预设胶囊 Chips 栏 (在输入框内壁上方) */}
      {hasAny && (
        <div className="omnimux-composer-chips-dock" role="status" aria-label="已选创意预设">
          {presets.format && (
            <div className="omnimux-composer-preset-chip" title="点击更改视频格式">
              <span className="omnimux-composer-chip-tag">⭐ 格式:</span>
              <span
                className="omnimux-composer-chip-val"
                onClick={() => handleOpenDimension('format')}
              >
                {presets.format.titleZh || presets.format.title}
              </span>
              <button /* exempt-ui01: 胶囊内部移除按钮 */
                type="button"
                className="omnimux-composer-chip-remove"
                onClick={(e) => handleRemoveDimension(e, 'format')}
                aria-label="移除广告格式预设"
              >
                ✕
              </button>
            </div>
          )}

          {presets.hook && (
            <div className="omnimux-composer-preset-chip" title="点击更改开场亮点">
              <span className="omnimux-composer-chip-tag">🎯 亮点:</span>
              <span
                className="omnimux-composer-chip-val"
                onClick={() => handleOpenDimension('hook')}
              >
                {presets.hook.titleZh || presets.hook.title}
              </span>
              <button /* exempt-ui01: 胶囊内部移除按钮 */
                type="button"
                className="omnimux-composer-chip-remove"
                onClick={(e) => handleRemoveDimension(e, 'hook')}
                aria-label="移除开场亮点预设"
              >
                ✕
              </button>
            </div>
          )}

          {presets.style && (
            <div className="omnimux-composer-preset-chip" title="点击更改视觉风格">
              <span className="omnimux-composer-chip-tag">🎨 风格:</span>
              <span
                className="omnimux-composer-chip-val"
                onClick={() => handleOpenDimension('style')}
              >
                {presets.style.titleZh || presets.style.title}
              </span>
              <button /* exempt-ui01: 胶囊内部移除按钮 */
                type="button"
                className="omnimux-composer-chip-remove"
                onClick={(e) => handleRemoveDimension(e, 'style')}
                aria-label="移除视觉风格预设"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Composer 工具栏 3 个独立触发按钮：优先 Portal 到原生 tools 栏，未找到时就地兜底 */}
      {toolsTarget ? createPortal(triggersNode, toolsTarget) : triggersNode}

      {/* 3. 独立专属弹窗渲染 */}
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
