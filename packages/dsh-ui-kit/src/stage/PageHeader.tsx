import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import {
  IconCloseOutline16,
  IconLoadingOutline16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from '../button/Button.tsx'
import { Tabs } from '../tabs/Tabs.tsx'
import type { PageHeaderTabItem } from '../tabs/Tabs.tsx'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './PageHeader.module.css'

export type { PageHeaderTabItem } from '../tabs/Tabs.tsx'

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  tabs?: { items: PageHeaderTabItem[]; activeId: string; onChange: (id: string) => void }
  actions?: ReactNode
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  refreshTitle?: string
  onClose?: () => void
  closeTitle?: string
  breadcrumb?: ReactNode
}

const PAGE_HEADER_CLASS = cssClass(css.pageHeader, 'pageHeader')
const HEADING_CLASS = cssClass(css.heading, 'heading')
const BREADCRUMB_CLASS = cssClass(css.breadcrumb, 'breadcrumb')
const TITLE_ROW_CLASS = cssClass(css.titleRow, 'titleRow')
const TITLE_CLASS = cssClass(css.title, 'title')
const SUBTITLE_CLASS = cssClass(css.subtitle, 'subtitle')
const TABS_CONTAINER_CLASS = cssClass(css.tabsContainer, 'tabsContainer')
const CONTROLS_CLASS = cssClass(css.controls, 'controls')

/**
 * Standard Layer 1 Page Header for OmniMux first-level product stages.
 * Typography single source of truth: 20px / 600 / 28px.
 * Layout: heading (breadcrumb + title + subtitle) | tabs | controls (actions + refresh + close).
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  {
    title,
    subtitle,
    badge,
    tabs,
    actions,
    onRefresh,
    refreshing = false,
    refreshTitle = 'Refresh',
    onClose,
    closeTitle = 'Close',
    breadcrumb,
    className,
    ...rest
  },
  ref,
) {
  return (
    <header {...rest} ref={ref} className={cx(PAGE_HEADER_CLASS, className)}>
      <div className={HEADING_CLASS}>
        {breadcrumb && (
          <div className={BREADCRUMB_CLASS}>
            {breadcrumb}
          </div>
        )}
        <div className={TITLE_ROW_CLASS}>
          {typeof title === 'string' ? <h1 className={TITLE_CLASS}>{title}</h1> : title}
          {badge}
        </div>
        {subtitle && (typeof subtitle === 'string' ? <p className={SUBTITLE_CLASS}>{subtitle}</p> : subtitle)}
      </div>

      {tabs && (
        <div className={TABS_CONTAINER_CLASS}>
          <Tabs
            items={tabs.items}
            activeId={tabs.activeId}
            onChange={tabs.onChange}
            size="sm"
          />
        </div>
      )}

      <div className={CONTROLS_CLASS}>
        {actions}

        {onRefresh && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={refreshTitle}
            title={refreshTitle}
            disabled={refreshing}
            onClick={() => {
              void onRefresh()
            }}
          >
            {refreshing ? <IconLoadingOutline16 /> : <IconRefreshOutline16 />}
          </IconButton>
        )}

        {onClose && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={closeTitle}
            title={closeTitle}
            onClick={() => {
              onClose()
            }}
          >
            <IconCloseOutline16 />
          </IconButton>
        )}
      </div>
    </header>
  )
})
