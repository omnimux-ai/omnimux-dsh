import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getCreativePresetsStore } from './presets-store.js'
import { CreativeDimensionModal } from './CreativeDimensionModal.jsx'
import { ensurePresetsStyles } from './styles.js'

/**
 * 营销视频三大创意预设 —— 输入框上方已选 Chips 胶囊组件
 * 当 format / hook / style 任意一项被选中时浮现于输入框内壁上方
 */
export function ComposerPresetsChips(props) {
  const store = useMemo(() => getCreativePresetsStore(), [])
  const sessionId =
    props?.sessionId ||
    props?.session?.id ||
    props?.session?.sessionId ||
    (typeof window !== 'undefined' ? (window.__omnimuxStage?.activeSession || 'default') : 'default')

  const [activeModal, setActiveModal] = useState(null)

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

  const presets = useSyncExternalStore(subscribe, getSnapshot, () => ({
    format: null,
    hook: null,
    style: null,
  }))

  const hasAny = Boolean(presets.format || presets.hook || presets.style)

  if (!hasAny) {
    return null
  }

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

  return (
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

      {/* 弹窗修改 */}
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
