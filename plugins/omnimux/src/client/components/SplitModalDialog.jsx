import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * 通用左右分栏弹窗组件 (SplitModalDialog)
 * 采用 100% 左右两栏布局，左侧承载场景标题/说明与推荐内容，右侧承载表单流并具备右下角固定操作栏。
 */
export function SplitModalDialog({
  isOpen,
  open,
  onClose,
  ariaLabel,
  leftTitle,
  leftSubtitle,
  leftContent,
  rightTitle,
  children,
  footer,
  className = '',
  containerClassName = '',
}) {
  const visible = isOpen ?? open ?? false

  useEffect(() => {
    if (!visible) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!visible) return null

  const modalNode = (
    <div
      className={`omnimux-split-modal-overlay ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || leftTitle || 'Dialog'}
    >
      {/* 顶层右上角固定关闭按钮 */}
      <button key="close-btn" type="button" className="omnimux-split-modal-close omnimux-insight-close" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose?.() }} aria-label="Close" /* exempt-ui01: modal close icon button */>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 左右分栏核心容器 */}
      <div className={`omnimux-split-modal-container ${containerClassName}`} onClick={(e) => e.stopPropagation()}>
        {/* 左栏 */}
        <section className="omnimux-split-modal-left" aria-label={leftTitle || 'Left pane'}>
          {(leftTitle || leftSubtitle) && (
            <header className="omnimux-split-modal-left-header">
              {leftTitle && <h1>{leftTitle}</h1>}
              {leftSubtitle && <p>{leftSubtitle}</p>}
            </header>
          )}
          <div className="omnimux-split-modal-left-body">
            {leftContent}
          </div>
        </section>

        {/* 右栏 */}
        <section className="omnimux-split-modal-right" aria-label={rightTitle || 'Right pane'}>
          {rightTitle && (
            <header className="omnimux-split-modal-right-header">
              <h2>{rightTitle}</h2>
            </header>
          )}
          <div className="omnimux-split-modal-content">
            {children}
          </div>
          {footer && (
            <footer className="omnimux-split-modal-footer">
              {footer}
            </footer>
          )}
        </section>
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body)
  }
  return modalNode
}
