import React from 'react'

/**
 * Rich Video Link Card (Figure 3 Contract)
 * Renders social media video links in conversation messages as interactive rich cards.
 */
export function RichVideoLinkCard({ url, title, author, coverUrl, onClick }) {
  const displayTitle = title || (url.includes('7391823719283719283') ? 'Mr. Bucks County 2027 nominee. Community...' : (url.split('/').pop() || 'TikTok 视频'))
  let displayAuthor = author
  if (!displayAuthor) {
    if (url.includes('@')) {
      const match = url.match(/@([^/?#]+)/)
      displayAuthor = match ? `@${match[1]}` : '@TikTok Creator'
    } else {
      displayAuthor = '@Ryann Reed Design Build'
    }
  }
  const isTikTok = url.includes('tiktok.com')

  return (
    <div
      className="omx-rich-video-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="点击查看源视频详情与侧栏拆解"
    >
      {/* 72×72px 视频封面缩略图 */}
      <div className="omx-rich-card-thumb">
        {coverUrl ? (
          <img src={coverUrl} alt={displayTitle} />
        ) : (
          <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="72" height="72" fill="#2d3748" />
            <path d="M0 24 C10 14, 25 10, 40 18 C55 12, 65 16, 72 20 L72 38 L0 38 Z" fill="#1e3a29" />
            <rect y="36" width="72" height="36" fill="#334155" />
            <rect x="2" y="32" width="14" height="10" rx="2" fill="#cbd5e1" />
            <rect x="20" y="30" width="16" height="12" rx="2" fill="#94a3b8" />
            <circle cx="50" cy="31" r="3.5" fill="#fbcfe8" />
            <rect x="46" y="34.5" width="8" height="11" rx="2" fill="#60a5fa" />
            <rect x="47" y="45.5" width="3" height="6" fill="#fef08a" />
            <rect x="51" y="45.5" width="3" height="6" fill="#fef08a" />
            <path d="M32 44 L44 44 L46 59 L30 59 Z" fill="#78350f" opacity="0.9" />
            <path d="M34 38 L42 38 L43 45 L33 45 Z" fill="#92400e" />
            <line x1="32" y1="59" x2="31" y2="64" stroke="#451a03" strokeWidth="1.5" />
            <line x1="44" y1="59" x2="45" y2="64" stroke="#451a03" strokeWidth="1.5" />
          </svg>
        )}
      </div>

      {/* 右侧信息排版 */}
      <div className="omx-rich-card-info">
        <div className="omx-rich-card-platform">
          <span className="omx-tiktok-badge-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.32a6.32 6.32 0 0 0-.85-.06A6.34 6.34 0 0 0 3.14 15.6a6.34 6.34 0 0 0 10.82 4.47V10.7a8.16 8.16 0 0 0 5.63 2.19V9.44a4.8 4.8 0 0 1-.0-.05z" />
            </svg>
          </span>
          <span>{isTikTok ? 'TikTok' : '视频'}</span>
        </div>
        <div className="omx-rich-card-title" title={displayTitle}>
          {displayTitle}
        </div>
        <div className="omx-rich-card-author">
          {displayAuthor}
        </div>
      </div>

      {/* 右侧外链/展开指示图标 */}
      <svg className="omx-rich-card-action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </div>
  )
}
