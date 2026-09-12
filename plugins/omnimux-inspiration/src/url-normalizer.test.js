import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectPlatformFromUrl, extractDomainSlug, getCanonicalItemKey, isSameSocialContent, normalizeUrl } from './url-normalizer.js'

describe('URL Normalizer & Canonical Key Extraction', () => {
  it('strips tracking query parameters', () => {
    const raw = 'https://www.tiktok.com/@user/video/7123456789012345678?utm_source=copy&is_from_webapp=1&sender_device=pc&fbclid=abc'
    const clean = normalizeUrl(raw)
    assert.equal(clean, 'https://www.tiktok.com/@user/video/7123456789012345678')
  })

  it('normalizes domain aliases for X/Twitter', () => {
    const raw1 = 'https://twitter.com/creator/status/1234567890?s=20'
    const raw2 = 'https://x.com/creator/status/1234567890'
    assert.equal(normalizeUrl(raw1), 'https://x.com/creator/status/1234567890')
    assert.equal(isSameSocialContent(raw1, raw2), true)
  })

  it('extracts canonical key from TikTok video URLs', () => {
    const urlA = 'https://www.tiktok.com/@userA/video/7234567890123456789?is_from_webapp=1'
    const urlB = 'https://m.tiktok.com/v/7234567890123456789.html'
    const keyA = getCanonicalItemKey(urlA)
    const keyB = getCanonicalItemKey(urlB)

    assert.equal(keyA.platform, 'tiktok')
    assert.equal(keyA.key, 'tiktok:video:7234567890123456789')
    assert.equal(keyB.key, 'tiktok:video:7234567890123456789')
    assert.equal(isSameSocialContent(urlA, urlB), true)
  })

  it('extracts canonical key from Instagram Reel/Post URLs', () => {
    const reelUrl = 'https://www.instagram.com/reel/C1234567890/?igsh=xyz123'
    const postUrl = 'https://www.instagram.com/p/C1234567890/'
    const keyReel = getCanonicalItemKey(reelUrl)
    const keyPost = getCanonicalItemKey(postUrl)

    assert.equal(keyReel.platform, 'instagram')
    assert.equal(keyReel.key, 'instagram:media:C1234567890')
    assert.equal(keyPost.key, 'instagram:media:C1234567890')
    assert.equal(isSameSocialContent(reelUrl, postUrl), true)
  })

  it('extracts canonical key from YouTube Video & Shorts URLs', () => {
    const watchUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'
    const shortUrl = 'https://youtu.be/dQw4w9WgXcQ'
    const shortsUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ'

    assert.equal(isSameSocialContent(watchUrl, shortUrl), true)
    assert.equal(isSameSocialContent(watchUrl, shortsUrl), true)
  })

  it('differentiates different videos on the same platform', () => {
    const video1 = 'https://www.tiktok.com/@user/video/7111111111111111111'
    const video2 = 'https://www.tiktok.com/@user/video/7222222222222222222'
    assert.equal(isSameSocialContent(video1, video2), false)
  })

  it('extracts canonical key and self-registers unknown platforms dynamically', () => {
    const biliUrl = 'https://www.bilibili.com/video/BV1xx411c7mD?utm_source=copy'
    const keyBili = getCanonicalItemKey(biliUrl)
    assert.equal(keyBili.platform, 'bilibili')
    assert.equal(keyBili.key, 'bilibili:url:https://www.bilibili.com/video/BV1xx411c7mD')

    // Threads is a known platform, so the structured post key wins over the
    // self-registered `threads:url:` fallback.
    const threadsUrl = 'https://threads.net/@zuck/post/Cx12345'
    const keyThreads = getCanonicalItemKey(threadsUrl)
    assert.equal(keyThreads.platform, 'threads')
    assert.equal(keyThreads.key, 'threads:post:Cx12345')

    const douyinUrl = 'https://v.douyin.com/iJabc12/'
    const keyDouyin = getCanonicalItemKey(douyinUrl)
    assert.equal(keyDouyin.platform, 'douyin')
    assert.equal(keyDouyin.key, 'douyin:url:https://v.douyin.com/iJabc12')

    const invalidKey = getCanonicalItemKey('not-a-valid-url')
    assert.equal(invalidKey.platform, 'unknown')
    assert.equal(invalidKey.key, 'url:not-a-valid-url')

    const emptyKey = getCanonicalItemKey('')
    assert.equal(emptyKey.platform, 'unknown')
    assert.equal(emptyKey.key, '')
  })

  it('handles subdomains with multi-part TLDs and edge cases correctly', () => {
    // Direct extractDomainSlug checks
    assert.equal(extractDomainSlug('v.weibo.com.cn'), 'weibo')
    assert.equal(extractDomainSlug('sub.domain.co.uk'), 'domain')
    assert.equal(extractDomainSlug('https://v.weibo.com.cn/video/123'), 'weibo')
    assert.equal(extractDomainSlug('https://m.weibo.cn'), 'weibo')
    assert.equal(extractDomainSlug('https://example.org'), 'example')
    assert.equal(extractDomainSlug('https://test.me'), 'test')
    assert.equal(extractDomainSlug('localhost'), 'localhost')
    assert.equal(extractDomainSlug(''), '')
    assert.equal(extractDomainSlug(null), '')

    // Single TLD with subdomains
    assert.equal(detectPlatformFromUrl('https://v.douyin.com/abc/'), 'douyin')
    assert.equal(detectPlatformFromUrl('https://www.bilibili.com/video/BV123'), 'bilibili')

    // Multi-part TLDs without subdomains
    assert.equal(detectPlatformFromUrl('https://weibo.com.cn/video/123'), 'weibo')
    assert.equal(detectPlatformFromUrl('https://bbc.co.uk/news'), 'bbc')

    // Multi-part TLDs WITH subdomains (e.g. v.weibo.com.cn, video.sohu.com.cn, news.bbc.co.uk)
    // Expected: extract the real brand domain slug (weibo, sohu, bbc) rather than subdomain prefix (v, video, news)
    assert.equal(detectPlatformFromUrl('https://v.weibo.com.cn/video/123'), 'weibo')
    assert.equal(detectPlatformFromUrl('https://video.sohu.com.cn/123'), 'sohu')
    assert.equal(detectPlatformFromUrl('https://news.bbc.co.uk/story'), 'bbc')
  })

  it('extracts canonical keys from Facebook video URLs', () => {
    const watchUrl = 'https://www.facebook.com/watch/?v=1234567890&ref=share'
    const mobileUrl = 'https://m.facebook.com/reel/1234567890/'
    const legacyUrl = 'https://www.facebook.com/creator/videos/1234567890'

    for (const candidate of [watchUrl, mobileUrl, legacyUrl]) {
      const key = getCanonicalItemKey(candidate)
      assert.equal(key.platform, 'facebook')
      assert.equal(key.key, 'facebook:video:1234567890')
    }
    assert.equal(isSameSocialContent(watchUrl, mobileUrl), true)
    assert.equal(isSameSocialContent(watchUrl, legacyUrl), true)
  })

  it('keeps the fb.watch short code as the canonical key', () => {
    const key = getCanonicalItemKey('https://fb.watch/AbCdEf123/')

    assert.equal(key.platform, 'facebook')
    assert.equal(key.key, 'facebook:video:AbCdEf123')
    assert.equal(key.canonicalUrl, 'https://fb.watch/AbCdEf123')
  })

  it('extracts canonical keys from Threads post URLs', () => {
    const netUrl = 'https://www.threads.net/@creator/post/CxYz12345?hl=zh'
    const comUrl = 'https://threads.com/t/CxYz12345'
    const keyNet = getCanonicalItemKey(netUrl)
    const keyCom = getCanonicalItemKey(comUrl)

    assert.equal(keyNet.platform, 'threads')
    assert.equal(keyNet.key, 'threads:post:CxYz12345')
    assert.equal(keyCom.key, 'threads:post:CxYz12345')
    assert.equal(isSameSocialContent(netUrl, comUrl), true)
  })

  it('self-registers unrecognized Facebook pages without a video identity', () => {
    const pageUrl = 'https://www.facebook.com/creatorpage/about'
    const key = getCanonicalItemKey(pageUrl)

    // No numeric video id -> no structured `facebook:video:` key. The page is
    // still a valid URL on a known host, so it self-registers as `facebook:url:`.
    assert.equal(key.platform, 'facebook')
    assert.ok(key.key.startsWith('facebook:url:'))
    assert.equal(isSameSocialContent(pageUrl, 'https://www.facebook.com/watch/?v=9876543210'), false)
  })
})
