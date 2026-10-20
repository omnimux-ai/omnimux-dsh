import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rivalEmbedAspectRatio, rivalEmbedIsCard, rivalEmbedUrl } from './rival-embed.js'

/**
 * Official platform embed URLs (#3462). The dialog plays every post through
 * these; unknown URLs must return null so the caller keeps the cover fallback.
 */
describe('rival-embed: official player URLs (#3462)', () => {
  const row = (platform, url, extra = {}) => ({ source_platform: platform, url, ...extra })

  it('maps TikTok video and photo posts to the official player embed', () => {
    assert.equal(
      rivalEmbedUrl(row('tiktok', 'https://www.tiktok.com/@judy/video/7698442056158465294?_r=1&share_item_id=7698442056158465294')),
      'https://www.tiktok.com/player/v1/7698442056158465294',
    )
    assert.equal(
      rivalEmbedUrl(row('tiktok', 'https://www.tiktok.com/@judy/photo/7698442056158465294')),
      'https://www.tiktok.com/player/v1/7698442056158465294',
    )
  })

  it('maps X status URLs to the platform tweet embed', () => {
    assert.equal(
      rivalEmbedUrl(row('x', 'https://x.com/i/status/2112335003086643577')),
      'https://platform.twitter.com/embed/Tweet.html?id=2112335003086643577',
    )
  })

  it('maps all YouTube URL shapes to the embed player', () => {
    assert.equal(rivalEmbedUrl(row('youtube', 'https://www.youtube.com/watch?v=abc123&t=4')), 'https://www.youtube.com/embed/abc123?rel=0')
    assert.equal(rivalEmbedUrl(row('youtube', 'https://youtu.be/abc123')), 'https://www.youtube.com/embed/abc123?rel=0')
    assert.equal(rivalEmbedUrl(row('youtube', 'https://www.youtube.com/shorts/abc123')), 'https://www.youtube.com/embed/abc123?rel=0')
  })

  it('maps Instagram p/reel/tv URLs to the embed player', () => {
    assert.equal(rivalEmbedUrl(row('instagram', 'https://www.instagram.com/p/CqX0YyYvZzZ/')), 'https://www.instagram.com/p/CqX0YyYvZzZ/embed/')
    assert.equal(rivalEmbedUrl(row('instagram', 'https://www.instagram.com/reel/CqX0YyYvZzZ/')), 'https://www.instagram.com/reel/CqX0YyYvZzZ/embed/')
  })

  it('falls back to the post id only when the platform is known', () => {
    assert.equal(rivalEmbedUrl(row('tiktok', '', { id: '7700000000000000001' })), 'https://www.tiktok.com/player/v1/7700000000000000001')
    assert.equal(rivalEmbedUrl(row('x', '', { id: 'ra_x:2112335003086643577' })), 'https://platform.twitter.com/embed/Tweet.html?id=2112335003086643577')
  })

  it('returns null for unknown platforms / malformed URLs (cover fallback)', () => {
    assert.equal(rivalEmbedUrl(row('bilibili', 'https://www.bilibili.com/video/BV1xx')), null)
    assert.equal(rivalEmbedUrl(row('tiktok', 'not-a-url')), null)
    assert.equal(rivalEmbedUrl({}), null)
    assert.equal(rivalEmbedUrl(row('tiktok', 'javascript:alert(/video/123)')), null, 'non-http schemes are rejected')
    assert.equal(rivalEmbedUrl(row('tiktok', 'https://evil.example/@a/video/7700000000000000001')), null, 'wrong host is rejected')
    assert.equal(rivalEmbedUrl(row('youtube', 'https://evil.example/watch?v=abc')), null, 'wrong YouTube host is rejected')
  })

  it('flags card-style embeds for X and Instagram', () => {
    assert.equal(rivalEmbedIsCard({ source_platform: 'x' }), true)
    assert.equal(rivalEmbedIsCard({ source_platform: 'twitter' }), true)
    assert.equal(rivalEmbedIsCard({ source_platform: 'instagram' }), true)
    assert.equal(rivalEmbedIsCard({ source_platform: 'tiktok' }), false)
    assert.equal(rivalEmbedIsCard({ source_platform: 'youtube' }), false)
  })

  it('accepts mobile/short hosts but rejects non-http schemes', () => {
    assert.equal(rivalEmbedUrl(row('tiktok', 'https://vm.tiktok.com/@a/video/7700000000000000001')), 'https://www.tiktok.com/player/v1/7700000000000000001')
    assert.equal(rivalEmbedUrl(row('x', 'https://mobile.twitter.com/a/status/2112335003086643577')), 'https://platform.twitter.com/embed/Tweet.html?id=2112335003086643577')
    assert.equal(rivalEmbedUrl(row('tiktok', 'file://www.tiktok.com/video/1')), null, 'file:// is rejected')
  })

  it('keeps a sane player ratio per platform', () => {
    assert.equal(rivalEmbedAspectRatio({ ratio: 0.8 }), 0.8)
    assert.equal(rivalEmbedAspectRatio({ source_platform: 'youtube' }), 16 / 9)
    assert.equal(rivalEmbedAspectRatio({ source_platform: 'tiktok' }), 9 / 16)
    assert.equal(rivalEmbedAspectRatio({ ratio: 9 }), 9 / 16)
  })
})
