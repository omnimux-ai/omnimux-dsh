import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getComposerModeStore, COMPOSER_MODES } from './composer-mode-store.js'
import { ensureComposerModeStyles } from './styles.js'
import { installWorkbenchGlobal } from '../workbench.js'

/**
 * 创作模式切换胶囊栏（Agent / 营销 / 短剧）
 * 1:1 对标参考图布局设计，全圆角磨砂胶囊与无障碍 TabList 结构
 * 
 * 关键规则：
 * 1. 只有在全屏会话状态下才显示这三个 Tab；
 * 2. 当右侧打开分屏侧边栏/工作台（如资产库/产品库/灵感社区等，即 panelOpen === true）时，自动隐藏；
 * 3. 视觉位置：在 Hero 阶段通过精准 DOM 锚点挂载于品牌大标题正下方、工作区与角色选择行上方。
 */
export function ComposerModeTabs(props) {
  const store = useMemo(() => getComposerModeStore(), [])
  const workbench = useMemo(() => props?.workbench || installWorkbenchGlobal(), [props?.workbench])
  const [heroMount, setHeroMount] = useState(null)

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

  // 3. Hero 阶段位置重定向：大标题正下方、heroWorkspaceRow 正上方
  useLayoutEffect(() => {
    if (isPanelOpen) {
      setHeroMount(null)
      return
    }

    if (typeof document === 'undefined') return

    const heroRow = document.querySelector('[class*="heroWorkspaceRow"]')
    if (heroRow?.parentElement) {
      let anchor = document.getElementById('omnimux-composer-mode-anchor')
      if (!anchor) {
        anchor = document.createElement('div')
        anchor.id = 'omnimux-composer-mode-anchor'
        heroRow.parentElement.insertBefore(anchor, heroRow)
      }
      setHeroMount(anchor)
      return () => {
        if (anchor?.parentElement) {
          anchor.remove()
        }
      }
    } else {
      setHeroMount(null)
    }
  }, [sessionId, isPanelOpen])

  // 核心约束：分屏状态下不显示，只有全屏会话状态（无右侧分屏，isPanelOpen === false）才显示这三个 tab
  if (isPanelOpen) {
    return null
  }

  const handleSelectMode = (modeId) => {
    store.setMode(sessionId, modeId)
  }

  const content = (
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

  if (heroMount) {
    return createPortal(content, heroMount)
  }

  return content
}
