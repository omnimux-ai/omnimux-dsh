import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCanonicalItemKey, isSameSocialContent, normalizeUrl } from './url-normalizer.js'

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

    const threadsUrl = 'https://threads.net/@zuck/post/Cx12345'
    const keyThreads = getCanonicalItemKey(threadsUrl)
    assert.equal(keyThreads.platform, 'threads')
    assert.equal(keyThreads.key, 'threads:url:https://threads.net/@zuck/post/Cx12345')

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
})
