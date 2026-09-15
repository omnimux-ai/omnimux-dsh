import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { BoxIcon, ChevronDownIcon, PlusIcon, SparkIcon } from './icons.jsx'

export const OPEN_DELAY_MS = 150
export const CLOSE_DELAY_MS = 200
export const CREATE_KINDS = Object.freeze(['physical', 'digital'])

const MENU_ID = 'omnimux-assets-create-product-menu-list'

const MENU_ICON = Object.freeze({
  physical: BoxIcon,
  digital: SparkIcon,
})

const MENU_TITLE = Object.freeze({
  physical: '实物产品',
  digital: '数字产品',
})

const MENU_DESC = Object.freeze({
  physical: '电商、硬件、日用消费品，自动提取商品图与规格',
  digital: 'SaaS、软件、数字资产，捕获双端首屏快照与品牌战略',
})

/**
 * 新建/添加产品的悬停分流入口，1:1 对齐原产品库设计。
 * @param {{
 *   t: (key: string) => string,
 *   onSelect: (kind: 'physical' | 'digital') => void,
 *   disabled?: boolean,
 *   label?: string,
 * }} props
 */
export function CreateProductMenu(props) {
  const { t, onSelect, disabled = false, label } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const openTimer = useRef(null)
  const closeTimer = useRef(null)

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const openSoon = useCallback(() => {
    clearTimers()
    openTimer.current = setTimeout(() => { setOpen(true) }, OPEN_DELAY_MS)
  }, [clearTimers])

  const closeSoon = useCallback(() => {
    clearTimers()
    closeTimer.current = setTimeout(() => { setOpen(false) }, CLOSE_DELAY_MS)
  }, [clearTimers])

  const closeNow = useCallback(() => {
    clearTimers()
    setOpen(false)
  }, [clearTimers])

  const toggle = useCallback(() => {
    clearTimers()
    setOpen((current) => !current)
  }, [clearTimers])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeNow()
    }
    const handlePointerDown = (event) => {
      const node = rootRef.current
      if (node && typeof node.contains === 'function' && node.contains(event.target)) return
      closeNow()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open, closeNow])

  const handleSelect = (kind) => {
    closeNow()
    onSelect?.(kind)
  }

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    event.preventDefault()
    toggle()
  }

  const displayLabel = label || t('product.create') || '添加产品'

  return (
    <div
      ref={rootRef}
      className="omnimux-products-create-menu"
      data-open={open ? 'true' : 'false'}
      onMouseEnter={openSoon}
      onMouseLeave={closeSoon}
    >
      <Button
        variant="primary"
        leadingIcon={<PlusIcon />}
        trailingIcon={<ChevronDownIcon size={12} />}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={MENU_ID}
        onClick={toggle}
        onFocus={openSoon}
        onKeyDown={handleTriggerKeyDown}
      >
        {displayLabel}
      </Button>

      {open ? (
        <div
          id={MENU_ID}
          className="omnimux-products-menu-card"
          role="menu"
          aria-label="新建产品类型"
        >
          {CREATE_KINDS.map((kind) => {
            const Glyph = MENU_ICON[kind]
            return (
              <Button
                key={kind}
                variant="ghost"
                role="menuitem"
                className="omnimux-products-menu-item"
                data-kind={kind}
                onClick={() => { handleSelect(kind) }}
              >
                <span className="omnimux-products-menu-item-icon" aria-hidden="true">
                  <Glyph size={16} />
                </span>
                <span className="omnimux-products-menu-item-text">
                  <span className="omnimux-products-menu-item-title">{MENU_TITLE[kind]}</span>
                  <span className="omnimux-products-menu-item-desc">{MENU_DESC[kind]}</span>
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
