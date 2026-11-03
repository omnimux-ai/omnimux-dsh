import React, { useEffect, useRef, useState } from 'react'
import { Button, IconButton, IconEditOutline16, IconLoadingOutline16, IconTrashOutline16 } from 'dsh-ui-kit'
import { ProjectCover } from './ProjectCover.jsx'

/** 「打开中」遮罩：卡片打开期间盖住整张卡并吸收点击，阻止重复触发。 */
const OPENING_MASK_STYLE = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  borderRadius: 'inherit',
  background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45))',
  color: 'var(--dsw-alias-label-primary, #ffffff)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'progress',
}

function ProjectPageCard({ page, active, busy = false, onOpenPage, onRenamePage, onDeletePage, t }) {
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

  const requestOpen = () => {
    if (busy) return
    onOpenPage(page)
  }

  const closeMenu = () => {
    setMenu(false)
    root.current?.querySelector('[aria-haspopup="menu"]')?.focus()
  }

  return (
    <div
      ref={root}
      className={`omnimux-page-card omnimux-workflow-card ${active ? 'omnimux-page-card--active' : ''}${busy ? ' omnimux-page-card--opening' : ''}`}
      onClick={requestOpen}
      aria-busy={busy ? 'true' : undefined}
      title={busy ? undefined : `点击打开创作页：${page.title}`}
    >
      {/* 卡片封面：首选真实缩略图/封面，无则展示优美占位图 */}
      <div className="omnimux-page-card-cover">
        <Button
          variant="ghost"
          className="omnimux-page-open"
          aria-label={`${t?.('projects.open') || '打开'} ${page.title}`}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            requestOpen()
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

      {/* 打开中遮罩：点击落到遮罩上即被吸收，避免重复发起打开 */}
      {busy ? (
        <div
          className="omnimux-page-card-opening"
          role="status"
          style={OPENING_MASK_STYLE}
          onClick={(event) => event.stopPropagation()}
        >
          <IconLoadingOutline16 size={16} />
          <span>{t?.('projects.opening') || '打开中'}</span>
        </div>
      ) : null}

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
            {t?.('projects.deletePage') || '删除'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ProjectPagesTab({
  pages = [],
  activePageId,
  openingPageId = null,
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
            busy={openingPageId !== null && page.id === openingPageId}
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
