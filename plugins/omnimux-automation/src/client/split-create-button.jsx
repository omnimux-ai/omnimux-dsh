/**
 * 分裂「创建」按钮：左半是主操作，右半是下拉开关。
 *
 * 左半与右半同底同色、只被一条细分隔线切开，视觉上仍是一颗胶囊；
 * 主操作固定为「手动设置」（用户点主按钮的直觉是打开配置弹窗），
 * 下拉浮层提供「使用对话创建」与「手动设置」两项。
 * 浮层用 portal 挂到 body 并定位于按钮右下角，视口不够高时自动翻到上方。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './controls.jsx'

/** 浮层与按钮的间距，以及浮层离视口边缘的最小留白。 */
const MENU_GAP = 6
const VIEWPORT_MARGIN = 8

/**
 * 计算浮层的固定定位：右边缘对齐按钮右边缘，空间不足时垂直翻转。
 *
 * @param {HTMLElement} anchor 按钮容器
 * @param {HTMLElement | null} menu 浮层
 * @returns {{ position: 'fixed', top: number, right: number }}
 */
function placeFlyout(anchor, menu) {
  const rect = anchor.getBoundingClientRect()
  const height = menu?.offsetHeight ?? 120
  let top = rect.bottom + MENU_GAP
  if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, rect.top - height - MENU_GAP)
  }
  const right = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right)
  return { position: 'fixed', top, right }
}

/**
 * @param {object} props
 * @param {string} props.label 主按钮文案
 * @param {string} props.menuLabel 下拉开关的无障碍名称
 * @param {boolean} [props.disabled] 整个按钮组是否禁用
 * @param {() => void} props.onPrimary 主按钮的默认动作（手动设置，打开配置弹窗）
 * @param {{ label: string, icon: import('react').ReactNode, onSelect: () => void }[]} props.options 下拉项
 * @returns {import('react').ReactElement}
 */
export function SplitCreateButton({ label, menuLabel, disabled = false, onPrimary, options }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const menuRef = useRef(null)
  const [style, setStyle] = useState(/** @type {{ position: string, top: number, right: number } | null} */ (null))

  useEffect(() => {
    if (!open) {
      setStyle(null)
      return undefined
    }
    /** 点击浮层与按钮之外，或按下 Escape，都收起菜单。 */
    const dismiss = (event) => {
      if (root.current?.contains(event.target) === true) return
      if (menuRef.current?.contains(event.target) === true) return
      setOpen(false)
    }
    const dismissOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      root.current?.querySelector('.dsh-st-split-main')?.focus?.()
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    const update = () => {
      if (root.current === null) return
      const next = placeFlyout(root.current, menuRef.current)
      setStyle(current => (current?.top === next.top && current?.right === next.right ? current : next))
    }
    const onScroll = (event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target) === true) return
      update()
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const choose = (option) => {
    setOpen(false)
    option.onSelect()
  }

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        className="dsh-st-split-menu is-float"
        role="menu"
        aria-label={menuLabel}
        style={style ?? undefined}
      >
        {options.map(option => (
          <Button
            key={option.label}
            className="dsh-st-split-item"
            role="menuitem"
            onClick={() => choose(option)}
          >
            <span className="dsh-st-split-item-icon" aria-hidden="true">{option.icon}</span>
            <span className="dsh-st-split-item-label">{option.label}</span>
          </Button>
        ))}
      </div>,
      document.body,
    )
    : null

  return (
    <div className={`dsh-st-split${open ? ' is-open' : ''}`} ref={root}>
      <Button
        className="dsh-st-btn dsh-st-btn--primary dsh-st-split-main"
        disabled={disabled}
        onClick={() => { setOpen(false); onPrimary() }}
      >{label}</Button>
      <Button
        className="dsh-st-btn dsh-st-btn--primary dsh-st-split-toggle"
        disabled={disabled}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <svg className="dsh-st-split-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Button>
      {menu}
    </div>
  )
}
