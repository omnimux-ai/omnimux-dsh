import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './EmptyState.module.css'

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  secondaryAction?: ReactNode
  compact?: boolean
}

const EMPTY_CLASS = cssClass(css.emptyState, 'emptyState')
const COMPACT_CLASS = cssClass(css.compact, 'compact')
const ICON_WRAP_CLASS = cssClass(css.iconWrap, 'iconWrap')
const TITLE_CLASS = cssClass(css.title, 'title')
const DESCRIPTION_CLASS = cssClass(css.description, 'description')
const ACTIONS_CLASS = cssClass(css.actions, 'actions')

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, secondaryAction, compact = false, className, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} className={cx(EMPTY_CLASS, compact && COMPACT_CLASS, className)}>
      {icon && <div className={ICON_WRAP_CLASS}>{icon}</div>}
      <h3 className={TITLE_CLASS}>{title}</h3>
      {description && <p className={DESCRIPTION_CLASS}>{description}</p>}
      {(action || secondaryAction) && (
        <div className={ACTIONS_CLASS}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
})
