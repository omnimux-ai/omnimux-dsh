import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton.jsx'

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
  const [isRightScrolling, setIsRightScrolling] = useState(false)
  const [isLeftScrolling, setIsLeftScrolling] = useState(false)
  const rightScrollTimerRef = useRef(null)
  const leftScrollTimerRef = useRef(null)

  useEffect(() => {
    if (!visible) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  useEffect(() => {
    return () => {
      if (rightScrollTimerRef.current) clearTimeout(rightScrollTimerRef.current)
      if (leftScrollTimerRef.current) clearTimeout(leftScrollTimerRef.current)
    }
  }, [])

  if (!visible) return null

  const handleRightScroll = () => {
    setIsRightScrolling(true)
    if (rightScrollTimerRef.current) clearTimeout(rightScrollTimerRef.current)
    rightScrollTimerRef.current = setTimeout(() => {
      setIsRightScrolling(false)
    }, 800)
  }

  const handleLeftScroll = () => {
    setIsLeftScrolling(true)
    if (leftScrollTimerRef.current) clearTimeout(leftScrollTimerRef.current)
    leftScrollTimerRef.current = setTimeout(() => {
      setIsLeftScrolling(false)
    }, 800)
  }

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
      {/* 左右分栏核心容器外层定位包装 */}
      <div className="omnimux-split-modal-wrapper" onClick={(e) => e.stopPropagation()}>
        {/* 弹窗外侧右上方独立圆形关闭按钮 (全局统一 ModalCloseButton 共享组件) */}
        <ModalCloseButton key="close-btn" onClose={onClose} placement="external" ariaLabel="Close" />

        {/* 左右分栏核心容器 */}
        <div className={`omnimux-split-modal-container ${containerClassName}`}>
          {/* 左栏 */}
          <section
            className={`omnimux-split-modal-left ${isLeftScrolling ? 'is-scrolling' : ''}`}
            onScroll={handleLeftScroll}
            aria-label={leftTitle || 'Left pane'}
          >
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
            <div
              className={`omnimux-split-modal-content ${isRightScrolling ? 'is-scrolling' : ''}`}
              onScroll={handleRightScroll}
            >
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
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body)
  }
  return modalNode
}
