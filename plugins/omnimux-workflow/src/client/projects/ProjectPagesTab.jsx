import React from 'react'
import { IconEditOutline16, IconPlusOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton } from 'dsh-ui-kit'

/** 创作页卡片上的三栏波形缩略图 (对应截图 2 封面风格) */
function PageCoverWaveform() {
  return (
    <div className="omnimux-page-cover-strips" aria-hidden="true">
      <div className="omnimux-page-cover-strip">
        <svg viewBox="0 0 40 100" fill="none" className="omnimux-page-strip-svg">
          <path d="M20 10V90M12 25V75M28 30V70M4 40V60M36 42V58" stroke="var(--dsw-alias-brand-primary, #8b5cf6)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="omnimux-page-cover-strip">
        <svg viewBox="0 0 40 100" fill="none" className="omnimux-page-strip-svg">
          <path d="M20 5V95M12 20V80M28 22V78M4 35V65M36 38V62" stroke="var(--dsw-alias-brand-primary, #8b5cf6)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="omnimux-page-cover-strip omnimux-page-cover-strip--placeholder" />
    </div>
  )
}

/** 空白占位图 (对应截图 2 虚线框) */
function PageCoverPlaceholder() {
  return (
    <div className="omnimux-page-placeholder-box" aria-hidden="true" />
  )
}

export function ProjectPagesTab({
  pages = [],
  activePageId,
  onOpenPage,
  onCreatePage,
  onRenamePage,
  onDeletePage,
  loading = false,
  t,
}) {
  return (
    <div className="omnimux-project-pages-tab">
      {/* 顶部操作行：右上角放置「+ 新建创作页」按钮 */}
      <div className="omnimux-project-pages-action-row">
        <Button
          variant="primary"
          leadingIcon={<IconPlusOutline16 />}
          disabled={loading}
          onClick={onCreatePage}
        >
          {loading ? '正在新建…' : '+ 新建创作页'}
        </Button>
      </div>

      {/* 创作页卡片网格 */}
      <div className="omnimux-pages-grid">
        {pages.map((page, index) => {
          const isFirst = index === 0
          const dateStr = page.createdAt || page.updatedAt
            ? new Date(page.createdAt || page.updatedAt).toLocaleDateString().replace(/\//g, '.')
            : '2026.9.9'

          return (
            <div
              key={page.id}
              className={`omnimux-page-card ${page.id === activePageId ? 'omnimux-page-card--active' : ''}`}
              onClick={() => onOpenPage(page)}
              title={`点击打开创作页：${page.title}`}
            >
              {/* 卡片封面：首卡展示波形条，其余展示虚线占位框 */}
              <div className="omnimux-page-card-cover">
                {isFirst ? <PageCoverWaveform /> : <PageCoverPlaceholder />}
              </div>

              {/* 卡片下部信息 */}
              <div className="omnimux-page-card-info">
                <div className="omnimux-page-card-title" title={page.title}>
                  {page.title}
                </div>
                <div className="omnimux-page-card-meta">
                  <span>{dateStr}</span>
                  <div
                    className="omnimux-workflow-card-actions omnimux-workflow-card-actions--visible"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      variant="ghost"
                      size="xs"
                      title={t('projects.rename') || '重命名'}
                      aria-label={t('projects.rename') || '重命名'}
                      onClick={() => onRenamePage(page)}
                    >
                      <IconEditOutline16 size={13} />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      title={t('projects.delete') || '删除'}
                      aria-label={t('projects.delete') || '删除'}
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
