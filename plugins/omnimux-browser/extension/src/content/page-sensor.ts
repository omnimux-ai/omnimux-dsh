/**
 * Page sensor: deeply inspects host URLs and DOM structures to detect
 * platform (Twitter/X, TikTok, Zhihu, WeChat, Generic) and page scene
 * (Home, Profile, Status/Detail, Article).
 */

export interface PageSceneContext {
  url: string
  title: string
  platform: 'twitter' | 'tiktok' | 'zhihu' | 'wechat' | 'generic'
  pageType: 'home' | 'profile' | 'status' | 'detail' | 'article' | 'unknown'
  selectedText: string
  author?: string
  postText?: string
  timestamp?: number
}

export function detectPlatform(url: string = window.location.href): PageSceneContext['platform'] {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('x.com') || host.includes('twitter.com')) return 'twitter'
    if (host.includes('tiktok.com')) return 'tiktok'
    if (host.includes('zhihu.com')) return 'zhihu'
    if (host.includes('weixin.qq.com') || host.includes('mp.weixin.qq.com')) return 'wechat'
    return 'generic'
  } catch {
    return 'generic'
  }
}

export function detectPageType(platform: PageSceneContext['platform'], url: string = window.location.href): PageSceneContext['pageType'] {
  try {
    const pathname = new URL(url).pathname

    if (platform === 'twitter') {
      if (pathname.includes('/status/')) return 'status'
      if (pathname === '/home' || pathname === '/' || pathname === '') return 'home'
      if (pathname.startsWith('/i/articles')) return 'article'
      const reserved = ['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'compose', 'search', 'tos', 'privacy', 'logout']
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length === 1 && !reserved.includes(segments[0].toLowerCase())) return 'profile'
      if (segments.length === 2 && ['with_replies', 'highlights', 'media', 'likes'].includes(segments[1])) return 'profile'
      return 'unknown'
    }

    if (platform === 'tiktok') {
      if (pathname.includes('/video/') || pathname.includes('/photo/')) return 'detail'
      if (pathname.includes('/@') && !pathname.includes('/video/')) return 'profile'
      if (pathname === '/' || pathname === '' || pathname.includes('/foryou') || pathname.includes('/explore')) return 'home'
      return 'unknown'
    }

    if (platform === 'zhihu') {
      if (pathname.includes('/question/') || pathname.includes('/p/')) return 'status'
      if (pathname.includes('/people/')) return 'profile'
      if (pathname === '/' || pathname === '') return 'home'
      return 'article'
    }

    if (platform === 'wechat') {
      if (pathname.includes('/s') || document.getElementById('activity-name')) return 'article'
      return 'unknown'
    }

    if (document.querySelector('article, .post-content, main')) return 'article'
    if (pathname === '/' || pathname === '') return 'home'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function extractPostData(platform: PageSceneContext['platform']): { author?: string; postText?: string } {
  try {
    if (platform === 'twitter') {
      const tweetArticle = document.querySelector('article[data-testid="tweet"]')
      if (tweetArticle) {
        const textEl = tweetArticle.querySelector('div[data-testid="tweetText"]')
        const userEl = tweetArticle.querySelector('div[data-testid="User-Name"]')
        return {
          postText: textEl?.textContent?.trim(),
          author: userEl?.textContent?.split('@')[1]?.split('·')[0]?.trim() || userEl?.textContent?.trim()
        }
      }
    }
    if (platform === 'tiktok') {
      const descEl = document.querySelector('[data-e2e="browse-video-desc"], h1[data-e2e="user-title"]')
      const authorEl = document.querySelector('[data-e2e="browser-nickname"], [data-e2e="user-title"]')
      return {
        postText: descEl?.textContent?.trim(),
        author: authorEl?.textContent?.trim()
      }
    }
  } catch {
    // Graceful fallback
  }
  return {}
}

export function getFullContext(): PageSceneContext {
  const url = window.location.href
  const platform = detectPlatform(url)
  const pageType = detectPageType(platform, url)
  const selection = window.getSelection()?.toString().trim() || ''
  const extra = extractPostData(platform)

  return {
    url,
    title: document.title,
    platform,
    pageType,
    selectedText: selection,
    author: extra.author,
    postText: extra.postText,
    timestamp: Date.now()
  }
}
