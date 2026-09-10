import React from 'react'
import { IconEditOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton } from 'dsh-ui-kit'
import { ProjectCover } from './ProjectCover.jsx'

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
        {displayPages.map((page) => {
          const dateStr = page.createdAt || page.updatedAt
            ? new Date(page.createdAt || page.updatedAt)
                .toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
                .replace(/\//g, '.')
            : '2026.9.10'

          return (
            <div
              key={page.id}
              className={`omnimux-page-card omnimux-workflow-card ${page.id === activePageId ? 'omnimux-page-card--active' : ''}`}
              onClick={() => onOpenPage(page)}
              title={`点击打开创作页：${page.title}`}
            >
              {/* 卡片封面：首选真实缩略图/封面，无则展示优美占位图 */}
              <div className="omnimux-page-card-cover">
                <Button variant="ghost" className="omnimux-page-open" aria-label={`${t?.('projects.open') || '打开'} ${page.title}`} onClick={(event) => { event.stopPropagation(); onOpenPage(page) }}>
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
                  <div
                    className="omnimux-workflow-card-actions omnimux-page-card-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      variant="ghost"
                      size="xs"
                      title={t?.('projects.rename') || '重命名'}
                      aria-label={t?.('projects.rename') || '重命名'}
                      onClick={() => onRenamePage(page)}
                    >
                      <IconEditOutline16 size={13} />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      title={t?.('projects.delete') || '删除'}
                      aria-label={t?.('projects.delete') || '删除'}
                      onClick={() => onDeletePage(page)}
                    >
                      <IconTrashOutline16 size={13} />
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
