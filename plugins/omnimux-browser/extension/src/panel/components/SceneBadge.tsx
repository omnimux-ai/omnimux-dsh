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

const PLATFORM_NAMES: Record<string, { zh: string; en: string }> = {
  twitter: { zh: 'Twitter / X', en: 'Twitter / X' },
  tiktok: { zh: 'TikTok', en: 'TikTok' },
  zhihu: { zh: '知乎', en: 'Zhihu' },
  wechat: { zh: '微信公众号', en: 'WeChat' },
  generic: { zh: '网页', en: 'Web' }
}

const PAGE_TYPE_NAMES: Record<string, { zh: string; en: string }> = {
  home: { zh: '信息流主页', en: 'Home Feed' },
  profile: { zh: '创作者主页', en: 'Creator Profile' },
  status: { zh: '帖子详情页', en: 'Tweet Status' },
  detail: { zh: '视频播放页', en: 'Video Detail' },
  article: { zh: '正文文章', en: 'Article' },
  unknown: { zh: '深度感知中', en: 'Active' }
}

export const SceneBadge = memo(function SceneBadge({
  scene,
  locale = 'zh',
  onClearContext
}: {
  scene?: PageSceneInfo | null
  locale?: 'zh' | 'en'
  onClearContext?: () => void
}) {
  const isEn = locale === 'en'

  if (!scene) {
    return (
      <div className="scene-badge-pill generic">
        <span className="scene-dot" />
        <span className="scene-label">{isEn ? 'Page Context Ready' : '网页感知就绪'}</span>
      </div>
    )
  }

  const pObj = PLATFORM_NAMES[scene.platform] || PLATFORM_NAMES.generic
  const tObj = PAGE_TYPE_NAMES[scene.pageType] || PAGE_TYPE_NAMES.unknown
  const pName = isEn ? pObj.en : pObj.zh
  const tName = isEn ? tObj.en : tObj.zh

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
            {scene.postText ? scene.postText.slice(0, 36) + (scene.postText.length > 36 ? '...' : '') : (isEn ? 'Page context linked' : '已关联帖子上下文')}
          </span>
          {onClearContext && (
            <button className="context-clear-btn" onClick={onClearContext} title={isEn ? 'Clear context' : '解除上下文锁定'}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
})
