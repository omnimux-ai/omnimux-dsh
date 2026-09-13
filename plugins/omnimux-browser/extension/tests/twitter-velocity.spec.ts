// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  toHoursAlive,
  classifyTier,
  computeExposure,
  formatMetricNumber,
} from '../src/content/twitter-velocity/algorithm.ts'
import {
  extractViews,
  extractReplies,
  extractCreatedAtMs,
  extractTweetVelocityData,
} from '../src/content/twitter-velocity/extractor.ts'
import { mountTweetBadge } from '../src/content/twitter-velocity/badge.ts'

describe('Twitter Velocity Algorithm & Extraction', () => {
  it('A1: 极新爆款计算准确', () => {
    // views=120000, R=2, pace=60000, replies=3
    const hours = toHoursAlive(2 * 3600000, 0)
    expect(hours).toBe(2)
    const pace = 120000 / hours
    expect(pace).toBe(60000)
    expect(classifyTier(pace)).toBe('viral')

    const exposure = computeExposure(pace, hours, 3)
    expect(exposure).toBe(14980)
  })

  it('A2: 老帖飙升计算准确', () => {
    // views=200000, R=40, pace=5000, replies=900
    const hours = toHoursAlive(40 * 3600000, 0)
    expect(hours).toBe(40)
    const pace = 200000 / hours
    expect(pace).toBe(5000)
    expect(classifyTier(pace)).toBe('surging')

    const exposure = computeExposure(pace, hours, 900)
    expect(exposure).toBe(65)
  })

  it('A3: 零曝光兜底为 20', () => {
    const exposure = computeExposure(0, 10, 0)
    expect(exposure).toBe(20)
  })

  it('A4: 未来时间戳 clamp 到 1/60', () => {
    // now = 0, created = 3h in future
    const hours = toHoursAlive(0, 3 * 3600000)
    expect(hours).toBe(1 / 60)
  })

  it('formatMetricNumber 格式化数值', () => {
    expect(formatMetricNumber(753)).toBe('753')
    expect(formatMetricNumber(2600)).toBe('2.6k')
    expect(formatMetricNumber(10000)).toBe('10k')
    expect(formatMetricNumber(36000)).toBe('36k')
    expect(formatMetricNumber(1200000)).toBe('1.2m')
  })

  describe('DOM Extractor & Badge Mounting', () => {
    let container: HTMLDivElement

    beforeEach(() => {
      document.body.innerHTML = ''
      container = document.createElement('div')
      document.body.appendChild(container)
    })

    it('能从推特 DOM 元素正确提取 views 和 replies', () => {
      const tweet = document.createElement('article')
      tweet.setAttribute('data-testid', 'tweet')
      tweet.innerHTML = `
        <div data-testid="User-Name">Test Author @tester</div>
        <div data-testid="tweetText">这是一条关于科技和AI的测试推特正文内容。</div>
        <a href="/tester/status/1234567890">12:00</a>
        <time datetime="2026-09-13T05:00:00.000Z"></time>
        <div role="group">
          <button data-testid="reply" aria-label="15 条回复">15</button>
          <a href="/tester/status/1234567890/analytics" aria-label="3.6万 次查看">3.6万</a>
        </div>
      `
      container.appendChild(tweet)

      const views = extractViews(tweet)
      expect(views).toBe(36000)

      const replies = extractReplies(tweet)
      expect(replies).toBe(15)

      const createdAtMs = extractCreatedAtMs(tweet)
      expect(createdAtMs).toBe(new Date('2026-09-13T05:00:00.000Z').getTime())

      const data = extractTweetVelocityData(tweet, new Date('2026-09-13T07:00:00.000Z').getTime())
      expect(data).not.toBeNull()
      expect(data?.views).toBe(36000)
      expect(data?.replies).toBe(15)
      expect(data?.pace).toBe(18000) // 36000 / 2h
      expect(data?.tier).toBe('viral')
    })

    it('挂载徽章并防止重复挂载', () => {
      const tweet = document.createElement('article')
      tweet.setAttribute('data-testid', 'tweet')
      tweet.innerHTML = `
        <div data-testid="User-Name">Zen @supezen</div>
        <div data-testid="tweetText">测试推文</div>
        <a href="/supezen/status/987654321">链接</a>
        <time datetime="2026-09-13T06:00:00.000Z"></time>
        <div role="group">
          <button data-testid="reply">5</button>
          <a href="/supezen/status/987654321/analytics">12k</a>
        </div>
      `
      container.appendChild(tweet)

      mountTweetBadge(tweet)
      expect(tweet.getAttribute('data-omnimux-velocity-attached')).toBe('1')
      expect(tweet.querySelector('.omnimux-velocity-badge')).not.toBeNull()

      // 第二次调用不应重复创建
      mountTweetBadge(tweet)
      expect(tweet.querySelectorAll('.omnimux-velocity-badge').length).toBe(1)
    })
  })
})
