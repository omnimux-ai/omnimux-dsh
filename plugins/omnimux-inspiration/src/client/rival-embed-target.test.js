import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rivalEmbedTarget } from './rival-embed.js'

/** @param {string} platform @param {string} url */
const row = (platform, url) => ({ source_platform: platform, source_url: url })

describe('rivalEmbedTarget — 官方嵌入目标解析（#3542）', () => {
  it('parses an X status URL into a whole-card embed', () => {
    const target = rivalEmbedTarget(row('x', 'https://x.com/higgsfield_ai/status/2112335003086643577?s=20'))
    assert.deepEqual(target, {
      platform: 'x',
      kind: 'card',
      id: '2112335003086643577',
      url: 'https://platform.twitter.com/embed/Tweet.html?id=2112335003086643577',
    })
  })

  it('treats the twitter alias as X and keeps the card kind', () => {
    const target = rivalEmbedTarget(row('twitter', 'https://mobile.twitter.com/a/status/42'))
    assert.equal(target?.platform, 'x')
    assert.equal(target?.kind, 'card')
    assert.equal(target?.id, '42')
  })

  it('falls back to the row post id when the URL carries no status id', () => {
    const target = rivalEmbedTarget({ source_platform: 'x', id: 'ra_x:2112' })
    assert.equal(target?.id, '2112')
    assert.equal(target?.kind, 'card')
  })

  it('parses TikTok and YouTube into player embeds', () => {
    const tiktok = rivalEmbedTarget(row('tiktok', 'https://www.tiktok.com/@a/video/7698442056158465'))
    assert.equal(tiktok?.kind, 'player')
    assert.equal(tiktok?.id, '7698442056158465')
    const youtube = rivalEmbedTarget(row('youtube', 'https://youtu.be/abc123'))
    assert.equal(youtube?.kind, 'player')
    assert.equal(youtube?.id, 'abc123')
    assert.match(youtube?.url || '', /^https:\/\/www\.youtube\.com\/embed\/abc123\?rel=0$/)
  })

  it('parses an Instagram post/reel shortcode into a card embed', () => {
    const reel = rivalEmbedTarget(row('instagram', 'https://www.instagram.com/reel/CqX0YyYvZzZ/'))
    assert.equal(reel?.kind, 'card')
    assert.equal(reel?.id, 'CqX0YyYvZzZ')
    assert.match(reel?.url || '', /instagram\.com\/reel\/CqX0YyYvZzZ\/embed\/$/)
    const post = rivalEmbedTarget(row('instagram', 'https://www.instagram.com/p/CqX0YyYvZzZ/'))
    assert.equal(post?.id, 'CqX0YyYvZzZ')
  })

  it('returns null for platforms without an official embed', () => {
    assert.equal(rivalEmbedTarget(row('douyin', 'https://www.douyin.com/video/7300000000000000000')), null)
    assert.equal(rivalEmbedTarget(row('xiaohongshu', 'https://www.xiaohongshu.com/explore/abc')), null)
    assert.equal(rivalEmbedTarget(null), null)
  })

  it('returns null for a wrong host or a non-http scheme', () => {
    assert.equal(rivalEmbedTarget(row('x', 'https://evil.example/status/1')), null)
    assert.equal(rivalEmbedTarget(row('tiktok', 'file:///tmp/video.mp4')), null)
    assert.equal(rivalEmbedTarget(row('instagram', 'https://www.instagram.com/someone/')), null)
  })
})
