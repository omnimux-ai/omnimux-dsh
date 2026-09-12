import React, { useEffect, useId, useRef, useState } from 'react'

const ICON_CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/**
 * 爆款对标轻量下拉选择器。
 *
 * session-guide 子树刻意不引入 dsh-ui-kit（保持 Hero 首屏零重型依赖），
 * 因此这里用原生 button + role=listbox 自建，行为与 DropdownSelect 对齐：
 * 点击展开、点选回调、外部点击与 Escape 关闭。
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
  const rootRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const doc = document

    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }

    doc.addEventListener('mousedown', handlePointer, true)
    doc.addEventListener('keydown', handleKey, true)
    return () => {
      doc.removeEventListener('mousedown', handlePointer, true)
      doc.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  const matched = options.find((option) => option.value === value)
  const label = matched?.label ?? placeholder ?? ''

  return (
    <div
      ref={rootRef}
      className={`omx-trending-select${align === 'end' ? ' is-end' : ''}${className ? ` ${className}` : ''}`}
    >
      <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生选择触发器 */
        type="button"
        className="omx-trending-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="omx-trending-select-label">{label}</span>
        <span className="omx-trending-select-caret" aria-hidden="true">{ICON_CHEVRON}</span>
      </button>

      {open ? (
        <ul className="omx-trending-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <li key={option.value || '__all__'} role="none">
              <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生选项按钮 */
                type="button"
                role="option"
                aria-selected={option.value === value ? 'true' : 'false'}
                className={`omx-trending-select-option${option.value === value ? ' is-active' : ''}`}
                onClick={() => {
                  setOpen(false)
                  onChange?.(option.value)
                }}
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
