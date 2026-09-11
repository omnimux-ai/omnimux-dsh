import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getComposerModeStore, COMPOSER_MODES } from './composer-mode-store.js'
import { ensureComposerModeStyles } from './styles.js'
import { installWorkbenchGlobal } from '../workbench.js'

/**
 * 输入框上方胶囊创作模式切换栏（Agent / 营销 / 短剧）
 * 1:1 对标参考图布局设计，全圆角磨砂胶囊与无障碍 TabList 结构
 * 
 * 关键规则：
 * 只有在全屏会话状态下才显示这三个 Tab；
 * 当右侧打开分屏侧边栏/工作台（如资产库/产品库/灵感社区等，即 panelOpen === true）时，自动隐藏。
 */
export function ComposerModeTabs(props) {
  const store = useMemo(() => getComposerModeStore(), [])
  const workbench = useMemo(() => props?.workbench || installWorkbenchGlobal(), [props?.workbench])

  const sessionId =
    props?.sessionId ||
    props?.session?.id ||
    props?.session?.sessionId ||
    (typeof window !== 'undefined' ? (window.__omnimuxStage?.activeSession || 'default') : 'default')

  useEffect(() => {
    ensureComposerModeStyles()
  }, [])

  // 1. 订阅模式状态 (Agent / 营销 / 短剧)
  const subscribe = useCallback(
    (callback) => store.subscribe(sessionId, callback),
    [store, sessionId]
  )

  const getSnapshot = useCallback(
    () => store.getSnapshot(sessionId),
    [store, sessionId]
  )

  const activeMode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // 2. 订阅分屏工作台状态 (当右侧侧边栏打开时 panelOpen === true)
  const subscribeWorkbench = useCallback(
    (callback) => {
      if (typeof workbench?.subscribe === 'function') {
        return workbench.subscribe(callback)
      }
      return () => {}
    },
    [workbench]
  )

  const getWorkbenchSnapshot = useCallback(() => {
    if (typeof workbench?.getSnapshot === 'function') {
      const snap = workbench.getSnapshot()
      return snap?.state?.panelOpen === true
    }
    return false
  }, [workbench])

  const isPanelOpen = useSyncExternalStore(
    subscribeWorkbench,
    getWorkbenchSnapshot,
    getWorkbenchSnapshot
  )

  // 核心约束：分屏状态下不显示，只有全屏会话状态（无右侧分屏，isPanelOpen === false）才显示这三个 tab
  if (isPanelOpen) {
    return null
  }

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
