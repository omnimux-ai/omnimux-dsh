import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getComposerModeStore, COMPOSER_MODES } from './composer-mode-store.js'
import { ensureComposerModeStyles } from './styles.js'
import { installWorkbenchGlobal } from '../workbench.js'
import { getCreativePresetsStore } from '../presets/presets-store.js'

/**
 * 创作模式切换胶囊栏（Agent / 营销 / 短剧）
 * 1:1 对标参考图布局设计，全圆角磨砂胶囊与无障碍 TabList 结构
 * 
 * 关键规则：
 * 1. 只有在全屏会话状态下才显示这三个 Tab；
 * 2. 当右侧打开分屏侧边栏/工作台（如资产库/产品库/灵感社区等，即 panelOpen === true）时，自动隐藏；
 * 3. 视觉位置：在 Hero 阶段通过精准 DOM 锚点挂载于品牌大标题正下方、工作区与角色选择行上方；
 * 4. 状态独立隔离：切换不同 Tab 时，输入框执行重启，各 Tab 输入内容与选择状态独立缓存与恢复。
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

  // 实时捕获输入框最新草稿
  const liveInput = typeof props?.useInput === 'function' ? props.useInput((v) => v) : null
  const liveDraftRef = useRef('')
  liveDraftRef.current = liveInput?.draft || ''

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

  // 4. 输入框读取与重启/设值辅助方法
  const getCurrentDraft = useCallback(() => {
    // 优先从 useInput 抓取
    if (typeof liveDraftRef.current === 'string' && liveDraftRef.current) {
      return liveDraftRef.current
    }
    // 兜底 1: 全局 bridge action
    if (typeof window !== 'undefined' && typeof window.__omnimuxComposerActions?.getDraft === 'function') {
      const globalDraft = window.__omnimuxComposerActions.getDraft()
      if (typeof globalDraft === 'string' && globalDraft) return globalDraft
    }
    // 兜底 2: DOM contenteditable 节点内容
    if (typeof document !== 'undefined') {
      const el =
        document.querySelector('[data-composer-input="true"] [contenteditable="true"]') ||
        document.querySelector('[contenteditable="true"]')
      if (el && typeof el.innerText === 'string') {
        return el.innerText.replace(/\r?\n$/, '')
      }
    }
    return liveDraftRef.current || ''
  }, [])

  const setComposerDraft = useCallback(
    (targetDraft) => {
      const text = typeof targetDraft === 'string' ? targetDraft : ''
      let applied = false

      // 1. 首选官方 inputActions
      if (typeof props?.inputActions?.setDraft === 'function') {
        try {
          props.inputActions.setDraft(text)
          applied = true
        } catch (err) {
          console.warn('[ComposerModeTabs] props.inputActions.setDraft failed:', err)
        }
      }

      // 2. 全局 window.__omnimuxComposerActions 兜底
      if (!applied && typeof window !== 'undefined' && typeof window.__omnimuxComposerActions?.setDraft === 'function') {
        try {
          window.__omnimuxComposerActions.setDraft(text)
          applied = true
        } catch (err) {
          console.warn('[ComposerModeTabs] window.__omnimuxComposerActions.setDraft failed:', err)
        }
      }

      // 3. 触发自定义事件广播通知
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('omnimux:composer:set-draft', {
            detail: { sessionId, draft: text },
          })
        )
      }

      // 4. 重启后让输入框重获焦点
      if (typeof document !== 'undefined') {
        setTimeout(() => {
          try {
            const editorEl =
              document.querySelector('[data-composer-input="true"] [contenteditable="true"]') ||
              document.querySelector('[contenteditable="true"]')
            if (editorEl) {
              editorEl.focus()
            }
          } catch {}
        }, 0)
      }
    },
    [props?.inputActions, sessionId]
  )

  // 5. 模式切换处理：原子化保存当前 Tab 状态、重启输入框并恢复目标 Tab 缓存
  const handleSelectMode = useCallback(
    (modeId) => {
      if (modeId === activeMode) return

      // 1. 抓取当前活跃模式的输入框内容与选择状态
      const currentDraft = getCurrentDraft()
      const presetsStore = getCreativePresetsStore()
      const currentPresets = activeMode === 'marketing' ? presetsStore.getSnapshot(sessionId) : null

      // 2. 原子化切换模式：保存当前模式缓存，并获取目标模式缓存
      const targetCache = store.switchMode(sessionId, modeId, {
        draft: currentDraft,
        presets: currentPresets,
      })

      // 3. 重启/重置输入框内容
      const targetDraft = targetCache?.draft || ''
      setComposerDraft(targetDraft)

      // 4. 恢复或隔离选择状态（创意预设等）
      if (modeId === 'marketing') {
        if (targetCache?.presets) {
          presetsStore.setAllPresets(sessionId, targetCache.presets)
        } else {
          presetsStore.clearPresets(sessionId)
        }
      } else {
        // 离开营销模式时清空活跃预设，避免后续污染（状态已在步骤2安全持久化至缓存）
        presetsStore.clearPresets(sessionId)
      }
    },
    [activeMode, getCurrentDraft, setComposerDraft, sessionId, store]
  )

  // 核心约束：分屏状态下不显示，只有全屏会话状态（无右侧分屏，isPanelOpen === false）才显示这三个 tab
  if (isPanelOpen) {
    return null
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
