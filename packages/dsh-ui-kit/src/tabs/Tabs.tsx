import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './Tabs.module.css'

export interface PageHeaderTabItem {
  id: string
  label: ReactNode
  badge?: ReactNode | number
  disabled?: boolean
}

export type TabsVariant = 'underline' | 'pill'

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: PageHeaderTabItem[]
  activeId: string
  onChange: (id: string) => void
  size?: 'default' | 'sm' // default 32px (pill) / 44px (underline), sm 28px (pill) / 36px (underline)
  variant?: TabsVariant
  className?: string
}

const TABS_CLASS = cssClass(css.tabs, 'tabs')
const PILL_CLASS = cssClass(css.pill, 'pill')
const UNDERLINE_CLASS = cssClass(css.underline, 'underline')
const SM_CLASS = cssClass(css.sm, 'sm')
const TAB_ITEM_CLASS = cssClass(css.tabItem, 'tabItem')
const ACTIVE_CLASS = cssClass(css.active, 'active')
const BADGE_CLASS = cssClass(css.badge, 'badge')
const LABEL_CLASS = cssClass(css.label, 'label')

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    items,
    activeId,
    onChange,
    size = 'default',
    variant = 'underline',
    className,
    ...rest
  },
  ref,
) {
  const isPill = variant === 'pill'
  return (
    <div
      {...rest}
      ref={ref}
      role="tablist"
      className={cx(
        TABS_CLASS,
        isPill ? PILL_CLASS : UNDERLINE_CLASS,
        size === 'sm' && SM_CLASS,
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            className={cx(TAB_ITEM_CLASS, isActive && ACTIVE_CLASS)}
            onClick={() => {
              if (!item.disabled && item.id !== activeId) {
                onChange(item.id)
              }
            }}
          >
            <span className={LABEL_CLASS}>{item.label}</span>
            {item.badge != null && item.badge !== '' ? (
              <span className={BADGE_CLASS}>{item.badge}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
})
