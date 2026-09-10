import React from 'react'
import { IconEditOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'

/** 缺省创作页占位封面 */
function PageCoverDefault() {
  return (
    <div className="omnimux-page-cover-placeholder" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" className="omnimux-page-cover-icon">
        <rect x="6" y="8" width="36" height="32" rx="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
        <circle cx="17" cy="19" r="3.5" fill="currentColor" fillOpacity="0.4" />
        <path d="M10 34L20 23L30 33L36 27L42 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
      </svg>
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
        {displayPages.map((page) => {
          const dateStr = page.createdAt || page.updatedAt
            ? new Date(page.createdAt || page.updatedAt)
                .toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
                .replace(/\//g, '.')
            : '2026.9.10'

          const coverSrc = page.coverUrl || page.thumbnailUrl || page.previewUrl || page.image || ''

          return (
            <div
              key={page.id}
              className={`omnimux-page-card omnimux-workflow-card ${page.id === activePageId ? 'omnimux-page-card--active' : ''}`}
              onClick={() => onOpenPage(page)}
              title={`点击打开创作页：${page.title}`}
            >
              {/* 卡片封面：首选真实缩略图/封面，无则展示优美占位图 */}
              <div className="omnimux-page-card-cover">
                {coverSrc ? (
                  <img src={coverSrc} alt={page.title} className="omnimux-page-card-img" />
                ) : (
                  <PageCoverDefault />
                )}
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
