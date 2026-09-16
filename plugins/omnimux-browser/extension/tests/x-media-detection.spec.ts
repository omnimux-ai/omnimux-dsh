// @vitest-environment jsdom
/**
 * Verification for X/Twitter media detection, async hydration and placeholder rejection.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { extractHeroImage, getFullContext } from '../src/content/page-sensor.ts'
import { sniffViewportMedia } from '../src/content/media-sniffer.ts'

describe('X/Twitter 图片感知与占位图过滤 (x-media-detection)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/')
  })

  it('AC-1: 绝不将 Twitter 官方静态兜底占位图（SEE WHATS HAPPENING / icon-default）当作推文封面', () => {
    window.history.pushState({}, '', '/liam_fallen/status/2100173136415088858')

    // 模拟推特 SSR 阶段注入的官方通用黑底广告占位图
    const meta = document.createElement('meta')
    meta.setAttribute('property', 'og:image')
    meta.setAttribute('content', 'https://abs.twimg.com/rweb/ssr/default/v2/og/image.png')
    document.head.appendChild(meta)

    // 此时推文正文尚未在 DOM 中挂载
    const heroImg = extractHeroImage('twitter')
    // 必须被过滤拦截，绝不能把 abs.twimg.com 占位图当成推文图片返回！
    expect(heroImg).toBeUndefined()
  })

  it('AC-1b: 推文异步渲染后，优先精准提取 tweetPhoto 真实媒体大图', () => {
    window.history.pushState({}, '', '/liam_fallen/status/2100173136415088858')

    // 官方占位图仍在 meta 中
    const meta = document.createElement('meta')
    meta.setAttribute('property', 'og:image')
    meta.setAttribute('content', 'https://abs.twimg.com/rweb/ssr/default/v2/og/image.png')
    document.head.appendChild(meta)

    // 页面内推文渲染完成
    const main = document.createElement('main')
    main.setAttribute('role', 'main')

    const article = document.createElement('article')
    article.setAttribute('data-testid', 'tweet')
    article.setAttribute('tabindex', '-1')

    // 包含作者头像
    const avatarBox = document.createElement('div')
    avatarBox.setAttribute('data-testid', 'UserAvatar-Container')
    const avatarImg = document.createElement('img')
    avatarImg.src = 'https://pbs.twimg.com/profile_images/2095471460286664768/-TwotnRq_normal.jpg'
    avatarBox.appendChild(avatarImg)
    article.appendChild(avatarBox)

    // 包含推文图片 (Grok Bot 图片)
    const photoBox = document.createElement('div')
    photoBox.setAttribute('data-testid', 'tweetPhoto')
    const tweetPhoto = document.createElement('img')
    tweetPhoto.src = 'https://pbs.twimg.com/media/HSVQSFmWkAAQOH6?format=jpg&name=medium'
    photoBox.appendChild(tweetPhoto)
    article.appendChild(photoBox)

    main.appendChild(article)
    document.body.appendChild(main)

    const heroImg = extractHeroImage('twitter')
    expect(heroImg).toBe('https://pbs.twimg.com/media/HSVQSFmWkAAQOH6?format=jpg&name=medium')

    const ctx = getFullContext('https://x.com/liam_fallen/status/2100173136415088858')
    expect(ctx.platform).toBe('twitter')
    expect(ctx.heroImage).toBe('https://pbs.twimg.com/media/HSVQSFmWkAAQOH6?format=jpg&name=medium')
  })

  it('AC-2: 支持从卡片结构 [data-testid*="card.layout"] 中提取推文媒体大图', () => {
    window.history.pushState({}, '', '/user/status/123456789')

    const main = document.createElement('main')
    const article = document.createElement('article')
    article.setAttribute('data-testid', 'tweet')

    const cardBox = document.createElement('div')
    cardBox.setAttribute('data-testid', 'card.layoutLarge.media')
    const cardImg = document.createElement('img')
    cardImg.src = 'https://pbs.twimg.com/media/CARD_IMG_123.jpg'
    cardBox.appendChild(cardImg)
    article.appendChild(cardBox)

    main.appendChild(article)
    document.body.appendChild(main)

    const heroImg = extractHeroImage('twitter')
    expect(heroImg).toBe('https://pbs.twimg.com/media/CARD_IMG_123.jpg')
  })

  it('AC-3: sniffViewportMedia 识别到处于 tweetPhoto 中的真实推文图片', () => {
    window.history.pushState({}, '', '/user/status/123456789')

    const article = document.createElement('article')
    article.setAttribute('data-testid', 'tweet')

    const photoBox = document.createElement('div')
    photoBox.setAttribute('data-testid', 'tweetPhoto')
    const img = document.createElement('img')
    img.src = 'https://pbs.twimg.com/media/VALID_PHOTO.jpg'

    // Mock layout in jsdom
    img.getBoundingClientRect = () => ({
      left: 100,
      top: 200,
      right: 600,
      bottom: 500,
      width: 500,
      height: 300,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect)

    photoBox.appendChild(img)
    article.appendChild(photoBox)
    document.body.appendChild(article)

    const sniffed = sniffViewportMedia('x.com')
    expect(sniffed.length).toBeGreaterThanOrEqual(1)
    expect(sniffed.some((s) => s.src === 'https://pbs.twimg.com/media/VALID_PHOTO.jpg')).toBe(true)
  })
})
