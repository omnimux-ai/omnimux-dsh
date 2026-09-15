/**
 * 「项目」页「AI应用」分类的卡片。
 *
 * 复用组件库 `MediaCard`（整卡点击 + 悬停 actions 槽 + 封面）与官方 primitives
 * 的 `Menu`（带 portal / 键盘导航），不新增自造卡片皮肤，也不手写菜单键盘逻辑。
 */
import React, { useCallback, useState } from 'react'
import { IconButton, MediaCard } from 'dsh-ui-kit'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconTrashOutline16,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { appCategoryLabelKey } from './appLibrary.js'

/**
 * @param {{
 *   app: { appId: string, name: string, category: string, coverUrl: string },
 *   t: (key: string) => string,
 *   onOpen: (app: object) => void,
 *   onEdit: (app: object) => void,
 *   onDelete: (app: object) => void,
 * }} props
 */
export function AIAppCard({ app, t, onOpen, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleToggle = useCallback((event) => {
    event.stopPropagation()
    setMenuOpen((open) => !open)
  }, [])

  const handleClose = useCallback((event) => {
    event?.stopPropagation?.()
    setMenuOpen(false)
  }, [])

  const handleSelect = useCallback((id) => {
    setMenuOpen(false)
    if (id === 'edit') onEdit(app)
    else if (id === 'delete') onDelete(app)
  }, [app, onDelete, onEdit])

  const items = [
    { id: 'edit', label: t('projects.appEdit'), icon: <IconEditOutline16 /> },
    { id: 'delete', label: t('projects.appDelete'), icon: <IconTrashOutline16 />, danger: true },
  ]

  return (
    <MediaCard
      className="omnimux-workflow-app-card"
      title={app.name}
      subtitle={t(appCategoryLabelKey(app.category))}
      coverUrl={app.coverUrl || undefined}
      onClick={() => onOpen(app)}
      actions={(
        <Menu
          open={menuOpen}
          portal
          dense
          align="end"
          items={items}
          onSelect={handleSelect}
          onClose={handleClose}
          anchor={(
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('projects.appMore')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={handleToggle}
            >
              <IconEllipsisOutline16 />
            </IconButton>
          )}
        />
      )}
    />
  )
}
