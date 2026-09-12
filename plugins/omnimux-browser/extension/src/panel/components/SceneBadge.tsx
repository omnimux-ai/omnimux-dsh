import { memo } from 'react'

export interface PageSceneInfo {
  url: string
  title: string
  platform: 'twitter' | 'tiktok' | 'zhihu' | 'wechat' | 'generic'
  pageType: 'home' | 'profile' | 'status' | 'detail' | 'article' | 'unknown'
  selectedText?: string
  author?: string
  postText?: string
}

const PLATFORM_NAMES: Record<string, string> = {
  twitter: 'Twitter / X',
  tiktok: 'TikTok',
  zhihu: '知乎',
  wechat: '微信公众号',
  generic: '网页'
}

const PAGE_TYPE_NAMES: Record<string, string> = {
  home: '信息流主页',
  profile: '创作者主页',
  status: '帖子详情页',
  detail: '视频播放页',
  article: '正文文章',
  unknown: '深度感知中'
}

export const SceneBadge = memo(function SceneBadge({
  scene,
  onClearContext
}: {
  scene?: PageSceneInfo | null
  onClearContext?: () => void
}) {
  if (!scene) {
    return (
      <div className="scene-badge-pill generic">
        <span className="scene-dot" />
        <span className="scene-label">网页感知就绪</span>
      </div>
    )
  }

  const pName = PLATFORM_NAMES[scene.platform] || '网页'
  const tName = PAGE_TYPE_NAMES[scene.pageType] || '页面'

  return (
    <div className="scene-header-bar">
      <div className={`scene-badge-pill ${scene.platform}`} title={scene.url}>
        <span className="scene-dot" />
        <span className="scene-label">{pName} · {tName}</span>
      </div>

      {(scene.postText || scene.author) && (
        <div className="scene-context-snippet" title={scene.postText || ''}>
          <span className="context-icon">🎯</span>
          <span className="context-text">
            {scene.author ? `@${scene.author}: ` : ''}
            {scene.postText ? scene.postText.slice(0, 36) + (scene.postText.length > 36 ? '...' : '') : '已关联帖子上下文'}
          </span>
          {onClearContext && (
            <button className="context-clear-btn" onClick={onClearContext} title="解除上下文锁定">
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
})
