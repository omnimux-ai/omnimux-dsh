import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './ActionRow.module.css'

export interface ActionRowProps extends HTMLAttributes<HTMLDivElement> {
  primaryAction?: ReactNode
  secondaryActions?: ReactNode
  rightActions?: ReactNode
}

const ACTION_ROW_CLASS = cssClass(css.actionRow, 'actionRow')
const LEFT_GROUP_CLASS = cssClass(css.leftGroup, 'leftGroup')
const RIGHT_GROUP_CLASS = cssClass(css.rightGroup, 'rightGroup')

/**
 * Secondary action row container.
 * Single row (flex-wrap: nowrap) with primary & secondary actions on the left
 * and rightActions pushed to the right.
 */
export const ActionRow = forwardRef<HTMLDivElement, ActionRowProps>(function ActionRow(
  {
    primaryAction,
    secondaryActions,
    rightActions,
    className,
    children,
    ...rest
  },
  ref,
) {
  const hasLeft = primaryAction != null || secondaryActions != null
  const hasRight = rightActions != null

  return (
    <div {...rest} ref={ref} className={cx(ACTION_ROW_CLASS, className)}>
      {hasLeft && (
        <div className={LEFT_GROUP_CLASS}>
          {primaryAction}
          {secondaryActions}
        </div>
      )}
      {children}
      {hasRight && (
        <div className={RIGHT_GROUP_CLASS}>
          {rightActions}
        </div>
      )}
    </div>
  )
})
