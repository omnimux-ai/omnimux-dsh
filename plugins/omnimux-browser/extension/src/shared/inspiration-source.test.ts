import { describe, expect, it } from 'vitest'
import { canonicalInspirationUrl, sameInspirationSource } from './inspiration-source.ts'

const SAME_SOURCES = [
  ['https://x.com/creator/status/2111569272732553535?s=20', 'https://x.com/i/status/2111569272732553535'],
  ['https://mobile.twitter.com/oldname/status/123/photo/1', 'https://x.com/newname/status/123'],
  ['https://www.tiktok.com/@alice/video/7412345678901234567?is_from_webapp=1&sender_device=pc', 'https://m.tiktok.com/v/7412345678901234567/'],
  ['https://youtu.be/abcdefghijk?si=tracking', 'https://www.youtube.com/watch?v=abcdefghijk&feature=share'],
  ['https://www.youtube.com/shorts/abcdefghijk/?utm_source=test', 'https://www.youtube.com/watch?v=abcdefghijk'],
  ['https://www.instagram.com/reel/ABC_def/?igsh=tracking', 'https://www.instagram.com/p/ABC_def'],
  ['https://m.facebook.com/alice/videos/12345678/?ref=share', 'https://www.facebook.com/watch/?v=12345678'],
  ['https://www.threads.com/@alice/post/ABC_123?utm_source=test', 'https://www.threads.net/t/ABC_123'],
  ['https://example.com/post/?id=123&utm_campaign=share#fragment', 'https://example.com/post?id=123'],
]

describe('library-compatible inspiration identities', () => {
  it.each(SAME_SOURCES)('matches known identity %s and %s', (left, right) => {
    expect(sameInspirationSource(left, right)).toBe(true)
    expect(sameInspirationSource(right, left)).toBe(true)
  })
  it('uses an immutable X id for the submitted and stored address', () => {
    expect(canonicalInspirationUrl('https://x.com/name/status/123?ref=share')).toBe('https://x.com/i/status/123')
  })
  it.each([
    ['https://x.com/creator/status/123', 'https://x.com/creator/status/124'],
    ['https://x.com/redirect?target=https://x.com/creator/status/123', 'https://x.com/creator/status/123'],
    ['https://youtube.com/redirect?target=https://youtube.com/watch?v=abcdefghijk', 'https://youtube.com/watch?v=abcdefghijk'],
    ['https://youtube.com.evil.example/watch?v=abcdefghijk', 'https://youtube.com/watch?v=abcdefghijk'],
    ['https://example.com/post?id=123', 'https://example.com/post?id=456'],
    ['https://www.youtube.com/watch?v=abcdefghijk&v=12345678901', 'https://www.youtube.com/watch?v=abcdefghijk'],
    ['https://x.com/creator/status/123garbage', 'https://x.com/creator/status/123'],
    ['https://x.com/creator/status/123/redirect/https://x.com/other/status/123', 'https://x.com/creator/status/123'],
    ['https://www.instagram.com/p/ABC/redirect/def', 'https://www.instagram.com/p/ABC'],
    ['https://x.com/i/web/status/123', 'https://x.com/i/status/123'],
    ['https://user:password@x.com/creator/status/123', 'https://x.com/creator/status/123'],
  ])('rejects different or embedded identities %s and %s', (left, right) => {
    expect(sameInspirationSource(left, right)).toBe(false)
  })
})
