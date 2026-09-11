import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getComposerModeStore, COMPOSER_MODES } from './composer-mode-store.js'
import { ensureComposerModeStyles } from './styles.js'

/**
 * 输入框上方胶囊创作模式切换栏（Agent / 营销 / 短剧）
 * 1:1 对标参考图布局设计，全圆角磨砂胶囊与无障碍 TabList 结构
 */
export function ComposerModeTabs(props) {
  const store = useMemo(() => getComposerModeStore(), [])
  const sessionId =
    props?.sessionId ||
    props?.session?.id ||
    props?.session?.sessionId ||
    (typeof window !== 'undefined' ? (window.__omnimuxStage?.activeSession || 'default') : 'default')

  useEffect(() => {
    ensureComposerModeStyles()
  }, [])

  const subscribe = useCallback(
    (callback) => store.subscribe(sessionId, callback),
    [store, sessionId]
  )

  const getSnapshot = useCallback(
    () => store.getSnapshot(sessionId),
    [store, sessionId]
  )

  const activeMode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const handleSelectMode = (modeId) => {
    store.setMode(sessionId, modeId)
  }

  return (
    <div className="omnimux-composer-mode-wrap">
      <div
        className="omnimux-composer-mode-pill"
        role="tablist"
        aria-label="创作模式切换"
      >
        {COMPOSER_MODES.map((mode) => {
          const isActive = activeMode === mode.id
          return (
            <button /* exempt-ui01: 创作模式胶囊Tab选项按钮 */
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-composer-mode={mode.id}
              className={`omnimux-composer-mode-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleSelectMode(mode.id)}
            >
              {mode.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
