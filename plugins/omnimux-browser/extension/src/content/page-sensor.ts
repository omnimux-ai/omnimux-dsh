/**
 * Page sensor: deeply inspects host URLs and DOM structures to detect
 * platform (Twitter/X, TikTok, Zhihu, WeChat, Generic) and page scene
 * (Home, Profile, Status/Detail, Article).
 */

export interface PageSceneContext {
  url: string
  title: string
  platform: 'twitter' | 'tiktok' | 'zhihu' | 'wechat' | 'generic'
  platformLabel: string
  pageType: 'home' | 'profile' | 'status' | 'detail' | 'article' | 'unknown'
  selectedText: string
  author?: string
  postText?: string
  heroImage?: string
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

export function getPlatformLabel(platform: PageSceneContext['platform']): string {
  if (platform === 'twitter') return 'X (formerly Twitter)'
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'zhihu') return '知乎 · Zhihu'
  if (platform === 'wechat') return '微信公众号'
  return 'Web'
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

export function extractHeroImage(platform: PageSceneContext['platform']): string | undefined {
  try {
    if (platform === 'twitter') {
      const pathname = window.location.pathname
      const isProfile = !pathname.includes('/status/') && pathname !== '/home' && pathname !== '/'

      // 1. Profile 优先提取高清大头像 (替换 _normal 或 _bigger 为 _400x400 高清大特写)
      const avatarImg = document.querySelector<HTMLImageElement>(
        'div[data-testid="UserAvatar-Container"] img, a[href$="/photo"] img, img[src*="profile_images"]'
      )
      if (isProfile && avatarImg?.src) {
        return avatarImg.src.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.')
      }

      // 2. Status 详情页首选推文大图或视频海报
      const tweetArticle = document.querySelector('article[data-testid="tweet"]')
      if (tweetArticle) {
        const photo = tweetArticle.querySelector<HTMLImageElement>('div[data-testid="tweetPhoto"] img, img[src*="media"]')
        if (photo?.src) return photo.src
        const video = tweetArticle.querySelector<HTMLVideoElement>('video')
        if (video?.poster) return video.poster
        const tweetAvatar = tweetArticle.querySelector<HTMLImageElement>('div[data-testid="UserAvatar-Container"] img')
        if (tweetAvatar?.src) {
          return tweetAvatar.src.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.')
        }
      }

      // 3. 用户 Banner 背景图
      const bannerImg = document.querySelector<HTMLImageElement>('a[href$="/header_photo"] img, img[src*="profile_banners"]')
      if (bannerImg?.src) return bannerImg.src

      // 4. 头像兜底
      if (avatarImg?.src) {
        return avatarImg.src.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.')
      }
    }

    if (platform === 'tiktok') {
      const poster = document.querySelector<HTMLVideoElement>('video')?.getAttribute('poster')
      if (poster) return poster
      const avatar = document.querySelector<HTMLImageElement>('[data-e2e="user-avatar"] img, [data-e2e="browser-avatar"] img')
      if (avatar?.src) return avatar.src
    }

    // 5. OpenGraph / Twitter Card 元数据
    const ogImg = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"]'
    )?.content
    if (ogImg) return ogImg

    // 6. 页面内首张有效大图
    const firstImg = Array.from(document.querySelectorAll<HTMLImageElement>('main img, article img, img')).find(
      (img) => (img.naturalWidth > 180 || img.width > 180) && (img.naturalHeight > 120 || img.height > 120) && !img.src.includes('svg')
    )
    if (firstImg?.src) return firstImg.src
  } catch {
    // Graceful fallback
  }
  return undefined
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
      // Profile 场景下提取博主账号
      const pathname = window.location.pathname
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length === 1) {
        return { author: segments[0] }
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

export function getFullContext(url: string = window.location.href): PageSceneContext {
  const platform = detectPlatform(url)
  const platformLabel = getPlatformLabel(platform)
  const pageType = detectPageType(platform, url)
  const selection = window.getSelection()?.toString().trim() || ''
  const extra = extractPostData(platform)
  const heroImage = extractHeroImage(platform)

  return {
    url,
    title: document.title,
    platform,
    platformLabel,
    pageType,
    selectedText: selection,
    author: extra.author,
    postText: extra.postText,
    heroImage,
    timestamp: Date.now()
  }
}
