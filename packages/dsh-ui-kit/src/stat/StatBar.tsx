import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronUpOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './StatBar.module.css'

export interface StatItem {
  key: string
  label: ReactNode
  value: ReactNode
  trend?: { direction: 'up' | 'down' | 'neutral'; value: string }
  extra?: ReactNode
}

export interface StatBarProps extends HTMLAttributes<HTMLDivElement> {
  items: StatItem[]
  className?: string
}

const STAT_BAR_CLASS = cssClass(css.statBar, 'statBar')
const ITEM_CLASS = cssClass(css.item, 'item')
const LABEL_CLASS = cssClass(css.label, 'label')
const VALUE_ROW_CLASS = cssClass(css.valueRow, 'valueRow')
const VALUE_CLASS = cssClass(css.value, 'value')
const TREND_CLASS = cssClass(css.trend, 'trend')
const TREND_UP_CLASS = cssClass(css.trendUp, 'trendUp')
const TREND_DOWN_CLASS = cssClass(css.trendDown, 'trendDown')
const TREND_NEUTRAL_CLASS = cssClass(css.trendNeutral, 'trendNeutral')
const TREND_ICON_CLASS = cssClass(css.trendIcon, 'trendIcon')
const EXTRA_CLASS = cssClass(css.extra, 'extra')

/**
 * Metric indicator bar for accounts, analytics, and overview panels.
 * Trends strictly consume official IconChevron* SVG icons and DSW semantic status tokens.
 */
export const StatBar = forwardRef<HTMLDivElement, StatBarProps>(function StatBar(
  { items, className, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} className={cx(STAT_BAR_CLASS, className)}>
      {items.map((item) => {
        const trend = item.trend
        return (
          <div key={item.key} className={ITEM_CLASS}>
            <div className={LABEL_CLASS}>{item.label}</div>
            <div className={VALUE_ROW_CLASS}>
              <div className={VALUE_CLASS}>{item.value}</div>
              {trend && (
                <div
                  className={cx(
                    TREND_CLASS,
                    trend.direction === 'up' && TREND_UP_CLASS,
                    trend.direction === 'down' && TREND_DOWN_CLASS,
                    trend.direction === 'neutral' && TREND_NEUTRAL_CLASS,
                  )}
                >
                  {trend.direction === 'up' && (
                    <span className={TREND_ICON_CLASS} aria-hidden="true">
                      <IconChevronUpOutline14 size={14} />
                    </span>
                  )}
                  {trend.direction === 'down' && (
                    <span className={TREND_ICON_CLASS} aria-hidden="true">
                      <IconChevronDownOutline14 size={14} />
                    </span>
                  )}
                  <span>{trend.value}</span>
                </div>
              )}
            </div>
            {item.extra != null && item.extra !== '' ? (
              <div className={EXTRA_CLASS}>{item.extra}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
})
