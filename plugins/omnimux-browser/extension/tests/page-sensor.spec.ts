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
})
