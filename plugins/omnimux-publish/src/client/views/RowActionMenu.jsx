import React, { useState } from 'react'
import { IconEllipsisOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { displayStatus } from '../status-display.js'

/**
 * 行末操作菜单 (⋮)
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   record: Record<string, unknown>,
 *   onView: (record: Record<string, unknown>) => void,
 *   onEdit: (record: Record<string, unknown>) => void,
 *   onDelete: (record: Record<string, unknown>) => void,
 *   onRetry: (record: Record<string, unknown>) => void,
 * }} props
 */
export function RowActionMenu({ t, record, onView, onEdit, onDelete, onRetry }) {
  const [open, setOpen] = useState(false)

  const status = displayStatus(record)
  const isDraft = status === 'draft' || record.status === 'draft'
  const hasFailedTasks = Array.isArray(record.subtasks) && record.subtasks.some((st) => st.status === 'failed')
  const isRetryable = status === 'failed' || status === 'partial_failed' || hasFailedTasks

  const handleOpen = (e) => {
    e.stopPropagation()
    setOpen((prev) => !prev)
  }

  const handleClose = (e) => {
    if (e && e.stopPropagation) e.stopPropagation()
    setOpen(false)
  }

  const handleAction = (id) => {
    setOpen(false)
    const actionFn = { view: onView, edit: onEdit, delete: onDelete, retry: onRetry }[id]
    if (typeof actionFn === 'function') {
      actionFn(record)
    }
  }

  const items = [
    {
      id: 'view',
      label: t('records.action.view'),
    },
    isDraft
      ? {
          id: 'edit',
          label: t('records.action.edit'),
        }
      : null,
    isDraft
      ? {
          id: 'delete',
          label: t('records.action.delete'),
          danger: true,
        }
      : null,
    isRetryable && !isDraft
      ? {
          id: 'retry',
          label: t('records.action.retry'),
        }
      : null,
  ].filter(Boolean)

  return (
    <div className="omnimux-publish-row-menu-wrap" onClick={(e) => e.stopPropagation()}>
      <Menu
        open={open}
        portal
        align="end"
        dense
        items={items}
        onSelect={handleAction}
        onClose={handleClose}
        anchor={
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('records.more')}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={handleOpen}
          >
            <IconEllipsisOutline16 />
          </IconButton>
        }
      />
    </div>
  )
}
