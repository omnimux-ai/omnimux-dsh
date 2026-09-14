import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { BoxIcon, ChevronDownIcon, PlusIcon, SparkIcon } from './icons.jsx'

/** 指针停留多久才展开：滑过按钮不该弹出浮层。 */
export const OPEN_DELAY_MS = 150

/** 离开容器后的收起宽限：够把指针从按钮挪进浮层而不闪断。 */
export const CLOSE_DELAY_MS = 200

/** 分流出来的两种治理形态，顺序即菜单顺序。 */
export const CREATE_KINDS = Object.freeze(['physical', 'digital'])

const MENU_ID = 'omnimux-products-create-menu-list'

const MENU_ICON = Object.freeze({
  physical: BoxIcon,
  digital: SparkIcon,
})

const MENU_TITLE_KEY = Object.freeze({
  physical: 'kind.physical',
  digital: 'kind.digital',
})

const MENU_DESC_KEY = Object.freeze({
  physical: 'add.menu.physicalDesc',
  digital: 'add.menu.digitalDesc',
})

/**
 * 新建产品的悬停分流入口。
 *
 * 触发器是一个 primary 按钮（加号 + 文案 + 矢量下拉箭头）；指针在容器上停留
 * `OPEN_DELAY_MS` 才展开，离开后 `CLOSE_DELAY_MS` 才收起。浮层本身也在同一个
 * 容器内，所以「按钮 → 浮层」的移动不会触发收起。键盘与指针是两条等价路径：
 * Enter/Space 或聚焦都会展开，Escape 或点击容器外部立即收起。
 *
 * 选择只发生在 `onSelect(kind)` 里 —— 组件自己不写任何产品数据，也不决定形态：
 * 形态由调用方（列表页）路由到对应的二级页。
 *
 * @param {{
 *   t: (key: string) => string,
 *   onSelect: (kind: 'physical' | 'digital') => void,
 *   disabled?: boolean,
 * }} props
 */
export function CreateProductMenu(props) {
  const { t, onSelect, disabled = false } = props
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

  // 卸载后还留着一个悬停计时器，等于让已经消失的组件稍后再 setState 一次。
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
        {t('add.button')}
      </Button>

      {open ? (
        <div
          id={MENU_ID}
          className="omnimux-products-menu-card"
          role="menu"
          aria-label={t('add.menu.label')}
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
                  <span className="omnimux-products-menu-item-title">{t(MENU_TITLE_KEY[kind])}</span>
                  <span className="omnimux-products-menu-item-desc">{t(MENU_DESC_KEY[kind])}</span>
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
