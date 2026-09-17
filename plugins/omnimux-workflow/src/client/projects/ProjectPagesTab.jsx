import React, { useEffect, useRef, useState } from 'react'
import { IconEditOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton } from 'dsh-ui-kit'
import { ProjectCover } from './ProjectCover.jsx'

function ProjectPageCard({ page, active, onOpenPage, onRenamePage, onDeletePage, t }) {
  const [menu, setMenu] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!menu) return undefined
    root.current?.querySelector('[role="menuitem"]')?.focus()
    const outside = (event) => { if (!root.current?.contains(event.target)) setMenu(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])

  const dateStr = page.createdAt || page.updatedAt
    ? new Date(page.createdAt || page.updatedAt)
        .toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
        .replace(/\//g, '.')
    : '2026.9.10'

  const closeMenu = () => {
    setMenu(false)
    root.current?.querySelector('[aria-haspopup="menu"]')?.focus()
  }

  return (
    <div
      ref={root}
      className={`omnimux-page-card omnimux-workflow-card ${active ? 'omnimux-page-card--active' : ''}`}
      onClick={() => onOpenPage(page)}
      title={`点击打开创作页：${page.title}`}
    >
      {/* 卡片封面：首选真实缩略图/封面，无则展示优美占位图 */}
      <div className="omnimux-page-card-cover">
        <Button
          variant="ghost"
          className="omnimux-page-open"
          aria-label={`${t?.('projects.open') || '打开'} ${page.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenPage(page)
          }}
        >
          <ProjectCover cover={page.cover} />
        </Button>
      </div>

      {/* 卡片下部信息 */}
      <div className="omnimux-page-card-info">
        <div className="omnimux-page-card-title" title={page.title}>
          {page.title}
        </div>
        <div className="omnimux-page-card-meta">
          <span className="omnimux-page-card-date">{dateStr}</span>
        </div>
      </div>

      {/* 规范卡片更多操作入口（悬停露出，三点圆形按钮） */}
      <div
        className="omnimux-workflow-card-actions omnimux-page-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          variant="ghost"
          className="omnimux-page-more"
          aria-label={t?.('projects.more') || '更多操作'}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={(e) => {
            e.stopPropagation()
            setMenu(!menu)
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </IconButton>
      </div>

      {/* 规范毛玻璃操作菜单浮层 */}
      {menu && (
        <div
          className="omnimux-folder-menu omnimux-page-card-menu"
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeMenu() }
            if (event.key === 'Tab') setMenu(false)
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]
              const index = items.indexOf(document.activeElement)
              items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus()
            }
          }}
        >
          <Button
            variant="ghost"
            role="menuitem"
            leadingIcon={<IconEditOutline16 size={16} />}
            onClick={() => {
              closeMenu()
              onRenamePage(page)
            }}
          >
            {t?.('projects.rename') || '重命名'}
          </Button>
          <Button
            variant="ghost"
            role="menuitem"
            className="omnimux-folder-menu-item--danger"
            data-danger="true"
            leadingIcon={<IconTrashOutline16 size={16} />}
            onClick={() => {
              closeMenu()
              onDeletePage(page)
            }}
          >
            {t?.('projects.delete') || '删除'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ProjectPagesTab({
  pages = [],
  activePageId,
  onOpenPage,
  onRenamePage,
  onDeletePage,
  t,
}) {
  const displayPages = Array.isArray(pages) && pages.length > 0 ? pages : [
    { id: 'page-default', title: '创作页 1', canvasWorkspaceId: 'ws_default' },
  ]

  return (
    <div className="omnimux-project-pages-tab">
      {/* 创作页卡片网格 */}
      <div className="omnimux-pages-grid">
        {displayPages.map((page) => (
          <ProjectPageCard
            key={page.id}
            page={page}
            active={page.id === activePageId}
            onOpenPage={onOpenPage}
            onRenamePage={onRenamePage}
            onDeletePage={onDeletePage}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
