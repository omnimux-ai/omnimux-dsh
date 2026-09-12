import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TrendingCover } from './TrendingCover.jsx'
import { buildClonePrompt } from './trending-data.js'

const ICON_CLOSE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

const ICON_SEND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

const ICON_ATTACH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ICON_EXPERT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
  </svg>
)

const ICON_CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/**
 * 吸底浮动输入框（Docked Floating Composer）。
 *
 * 复刻 TopView 的「输入框迁移」交互：点击卡片 Recreate 后，
 * 顶部 Hero 输入框让位（由宿主 CSS 收起），本组件吸附在会话视口底部接管输入；
 * 提交或取消后顶部输入框复原。
 *
 * 横向边界取自会话宿主的实时矩形，避免在带侧栏的桌面壳中偏出会话列。
 *
 * @param {{
 *   item: object,
 *   t: (key: string, fallback?: string) => string,
 *   hostSelector?: string,
 *   modelLabel?: string,
 *   onSubmit: (prompt: string, item: object) => void,
 *   onCancel: () => void,
 * }} props
 */
export function DockedComposer({
  item,
  t,
  hostSelector = '[data-phase]',
  modelLabel,
  onSubmit,
  onCancel,
}) {
  const dockRef = useRef(null)
  const textareaRef = useRef(null)
  const [draft, setDraft] = useState(() => buildClonePrompt(item))
  const [geometry, setGeometry] = useState(null)

  // 样本切换时重新灌装克隆指令（用户在编辑中不覆盖）
  useEffect(() => {
    setDraft(buildClonePrompt(item))
  }, [item?.id])

  // 横向对齐会话宿主
  useLayoutEffect(() => {
    const node = dockRef.current
    if (!node || typeof window === 'undefined') return undefined
    const doc = node.ownerDocument

    const measure = () => {
      const host = doc.querySelector(hostSelector)
      if (!host) {
        setGeometry(null)
        return
      }
      const rect = host.getBoundingClientRect()
      if (!rect || rect.width <= 0) {
        setGeometry(null)
        return
      }
      setGeometry({ left: `${Math.round(rect.left)}px`, width: `${Math.round(rect.width)}px` })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [hostSelector, item?.id])

  // 打开即聚焦，键盘可全流程闭环
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    try {
      node.focus()
      node.setSelectionRange(node.value.length, node.value.length)
    } catch {
      // 某些环境不允许聚焦，忽略
    }
  }, [item?.id])

  const dockStyle = useMemo(() => {
    if (!geometry) return undefined
    return { '--omnimux-dock-left': geometry.left, '--omnimux-dock-width': geometry.width }
  }, [geometry])

  if (!item) return null

  const trimmed = String(draft || '').trim()
  const canSubmit = trimmed.length > 0

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel?.()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (canSubmit) onSubmit?.(trimmed, item)
    }
  }

  return (
    <div
      ref={dockRef}
      className="omx-trending-dock"
      style={dockStyle}
      data-omnimux-trending-dock=""
      role="dialog"
      aria-label={t('trending.dock.title')}
      onKeyDown={handleKeyDown}
    >
      <div className="omx-trending-dock-card">
        <div className="omx-trending-dock-chips">
          <span className="omx-trending-dock-thumb">
            <TrendingCover item={item} />
          </span>
          <span className="omx-trending-dock-chip">
            <span className="omx-trending-dock-chip-region">{String(item.region || '').toUpperCase()}</span>
            <span className="omx-trending-dock-chip-label">{item.product || item.title}</span>
          </span>
        </div>

        <textarea
          ref={textareaRef}
          className="omx-trending-dock-input"
          value={draft}
          rows={3}
          spellCheck={false}
          aria-label={t('trending.dock.title')}
          placeholder={t('trending.dock.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
        />

        <div className="omx-trending-dock-footer">
          <div className="omx-trending-dock-footer-left">
            <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生图标动作按钮 */
              type="button"
              className="omx-trending-dock-icon"
              aria-label={t('trending.dock.attach')}
              title={t('trending.dock.attach')}
            >
              {ICON_ATTACH}
            </button>
            <span className="omx-trending-dock-expert">
              <span className="omx-trending-dock-expert-icon" aria-hidden="true">{ICON_EXPERT}</span>
              <span>{t('trending.dock.expert')}</span>
            </span>
          </div>

          <div className="omx-trending-dock-footer-right">
            {modelLabel ? (
              <span className="omx-trending-dock-model">
                <span>{modelLabel}</span>
                <span className="omx-trending-dock-model-caret" aria-hidden="true">{ICON_CHEVRON}</span>
              </span>
            ) : null}
            <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生图标动作按钮 */
              type="button"
              className="omx-trending-dock-icon"
              aria-label={t('trending.dock.cancel')}
              title={t('trending.dock.cancel')}
              onClick={() => onCancel?.()}
            >
              {ICON_CLOSE}
            </button>
            <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生主行动按钮 */
              type="button"
              className="omx-trending-dock-send"
              aria-label={t('trending.dock.submit')}
              title={t('trending.dock.submit')}
              disabled={!canSubmit}
              onClick={() => onSubmit?.(trimmed, item)}
            >
              {ICON_SEND}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
