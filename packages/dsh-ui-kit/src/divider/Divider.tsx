import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './Divider.module.css'

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
}

const DIVIDER_CLASS = cssClass(css.divider, 'divider')
const HORIZONTAL_CLASS = cssClass(css.horizontal, 'horizontal')
const VERTICAL_CLASS = cssClass(css.vertical, 'vertical')

/**
 * Standard 1px divider consuming var(--dsw-alias-border-l2).
 */
export const Divider = forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { orientation = 'horizontal', className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cx(
        DIVIDER_CLASS,
        orientation === 'vertical' ? VERTICAL_CLASS : HORIZONTAL_CLASS,
        className,
      )}
    />
  )
})
