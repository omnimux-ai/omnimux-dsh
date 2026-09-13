// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import {
  detectPlatform,
  detectPageType,
  extractHeroImage,
  getPlatformLabel,
  getFullContext
} from '../src/content/page-sensor.ts'

describe('page-sensor suite', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('detects platform correctly and provides platformLabel', () => {
    expect(detectPlatform('https://x.com/itsSaira_1')).toBe('twitter')
    expect(getPlatformLabel('twitter')).toBe('X (formerly Twitter)')
    expect(detectPlatform('https://www.tiktok.com/@creator')).toBe('tiktok')
    expect(getPlatformLabel('tiktok')).toBe('TikTok')
    expect(detectPlatform('https://example.com/blog')).toBe('generic')
    expect(getPlatformLabel('generic')).toBe('Web')
  })

  it('detects twitter profile pageType for user handle', () => {
    expect(detectPageType('twitter', 'https://x.com/itsSaira_1')).toBe('profile')
    expect(detectPageType('twitter', 'https://x.com/itsSaira_1/media')).toBe('profile')
    expect(detectPageType('twitter', 'https://x.com/home')).toBe('home')
    expect(detectPageType('twitter', 'https://x.com/i/status/123456789')).toBe('status')
  })

  it('extracts and upgrades twitter profile avatar to 400x400 HD image for heroImage', () => {
    window.history.pushState({}, '', '/itsSaira_1')
    const container = document.createElement('div')
    container.setAttribute('data-testid', 'UserAvatar-Container')
    const img = document.createElement('img')
    img.src = 'https://pbs.twimg.com/profile_images/1834567890/saira_normal.jpg'
    container.appendChild(img)
    document.body.appendChild(container)

    const heroImg = extractHeroImage('twitter')
    expect(heroImg).toBe('https://pbs.twimg.com/profile_images/1834567890/saira_400x400.jpg')

    const ctx = getFullContext('https://x.com/itsSaira_1')
    expect(ctx.platform).toBe('twitter')
    expect(ctx.platformLabel).toBe('X (formerly Twitter)')
    expect(ctx.heroImage).toBe('https://pbs.twimg.com/profile_images/1834567890/saira_400x400.jpg')
  })

  it('extracts tweet photo as heroImage on status page', () => {
    window.history.pushState({}, '', '/user/status/987654321')
    const article = document.createElement('article')
    article.setAttribute('data-testid', 'tweet')
    const photoBox = document.createElement('div')
    photoBox.setAttribute('data-testid', 'tweetPhoto')
    const photo = document.createElement('img')
    photo.src = 'https://pbs.twimg.com/media/XYZ123.jpg'
    photoBox.appendChild(photo)
    article.appendChild(photoBox)
    document.body.appendChild(article)

    const heroImg = extractHeroImage('twitter')
    expect(heroImg).toBe('https://pbs.twimg.com/media/XYZ123.jpg')
  })

  it('strictly ignores account switcher avatar in header and picks profile owner avatar', () => {
    window.history.pushState({}, '', '/yihui_indie')

    // 模拟左侧侧边栏登录用户（钟老）头像
    const header = document.createElement('header')
    header.setAttribute('role', 'banner')
    const switcher = document.createElement('div')
    switcher.setAttribute('data-testid', 'SideNav_AccountSwitcher_Button')
    const loggedInAvatar = document.createElement('img')
    loggedInAvatar.src = 'https://pbs.twimg.com/profile_images/9999/evander_normal.jpg'
    switcher.appendChild(loggedInAvatar)
    header.appendChild(switcher)
    document.body.appendChild(header)

    // 模拟博主 Yihui 的主页主头像
    const mainCol = document.createElement('main')
    mainCol.setAttribute('role', 'main')
    const profileLink = document.createElement('a')
    profileLink.setAttribute('href', '/yihui_indie/photo')
    const yihuiAvatar = document.createElement('img')
    yihuiAvatar.src = 'https://pbs.twimg.com/profile_images/8888/yihui_normal.jpg'
    profileLink.appendChild(yihuiAvatar)
    mainCol.appendChild(profileLink)
    document.body.appendChild(mainCol)

    const heroImg = extractHeroImage('twitter')
    // 必须拿到 Yihui 的头像，绝不能拿到登录用户钟老的头像！
    expect(heroImg).toBe('https://pbs.twimg.com/profile_images/8888/yihui_400x400.jpg')
    expect(heroImg?.includes('evander')).toBe(false)
  })
})
