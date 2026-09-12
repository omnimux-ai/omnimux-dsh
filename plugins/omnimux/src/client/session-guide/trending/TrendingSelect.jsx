import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

const ICON_CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** 把索引夹到 [0, length-1]；空集合返回 -1。 */
function clampIndex(index, length) {
  if (length <= 0) return -1
  return Math.max(0, Math.min(index, length - 1))
}

/**
 * 爆款对标轻量下拉选择器。
 *
 * session-guide 子树刻意不引入 dsh-ui-kit（保持 Hero 首屏零重型依赖），
 * 因此这里用原生 button + role=listbox 自建。
 *
 * 键盘契约与 ARIA listbox 对齐，避免出现「声明了 role 却不支持方向键」的空壳：
 *   - 触发器：Enter / Space / ArrowDown / ArrowUp 打开并定位到当前选中项
 *   - 菜单内：ArrowDown / ArrowUp 移动激活项，Home / End 跳首尾
 *   - Enter / Space 选中并关闭，Escape 关闭并回焦触发器，Tab 关闭
 *
 * @param {{
 *   value: string,
 *   options: Array<{ value: string, label: string }>,
 *   onChange: (value: string) => void,
 *   placeholder?: string,
 *   ariaLabel: string,
 *   className?: string,
 *   align?: 'start' | 'end',
 * }} props
 */
export function TrendingSelect({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  className,
  align = 'start',
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const listId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const matched = selectedIndex >= 0 ? options[selectedIndex] : null
  const label = matched?.label ?? placeholder ?? ''

  const close = useCallback(({ refocus = false } = {}) => {
    setOpen(false)
    setActiveIndex(-1)
    if (refocus) triggerRef.current?.focus?.()
  }, [])

  const openAt = useCallback((index) => {
    setActiveIndex(clampIndex(index, options.length))
    setOpen(true)
  }, [options.length])

  // 外部点击关闭（不抢焦点）；Escape 在捕获阶段先于宿主处理，回焦触发器
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const doc = document
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) close()
    }
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close({ refocus: true })
    }
    doc.addEventListener('mousedown', handlePointer, true)
    doc.addEventListener('keydown', handleEscape, true)
    return () => {
      doc.removeEventListener('mousedown', handlePointer, true)
      doc.removeEventListener('keydown', handleEscape, true)
    }
  }, [open, close])

  // 展开后把 DOM 焦点交给当前激活项，方向键即可接管
  useEffect(() => {
    if (!open || activeIndex < 0) return
    optionRefs.current[activeIndex]?.focus?.()
  }, [open, activeIndex])

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(selectedIndex >= 0 ? selectedIndex : 0)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt(selectedIndex >= 0 ? selectedIndex : 0)
    }
  }

  const handleListKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => clampIndex(prev + 1, options.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => clampIndex(prev - 1, options.length))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(clampIndex(0, options.length))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(clampIndex(options.length - 1, options.length))
      return
    }
    if (event.key === 'Tab') close()
  }

  const commit = (option) => {
    close({ refocus: true })
    onChange?.(option.value)
  }

  return (
    <div
      ref={rootRef}
      className={`omnimux-trending-select${align === 'end' ? ' is-end' : ''}${className ? ` ${className}` : ''}`}
    >
      <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生选择触发器 */
        ref={triggerRef}
        type="button"
        className="omnimux-trending-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        onClick={() => (open ? close({ refocus: true }) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="omnimux-trending-select-label">{label}</span>
        <span className="omnimux-trending-select-caret" aria-hidden="true">{ICON_CHEVRON}</span>
      </button>

      {open ? (
        <ul
          className="omnimux-trending-select-menu"
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => (
            <li key={option.value || '__all__'} role="none">
              <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生选项按钮 */
                ref={(node) => { optionRefs.current[index] = node }}
                type="button"
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-selected={option.value === value ? 'true' : 'false'}
                className={`omnimux-trending-select-option${option.value === value ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
