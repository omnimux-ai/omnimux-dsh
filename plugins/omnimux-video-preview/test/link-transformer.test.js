import assert from 'node:assert/strict'
import test from 'node:test'
import { isSocialMediaVideoUrl } from '../src/client/url-matcher.js'

test('isSocialMediaVideoUrl correctly identifies TikTok, YouTube, Douyin and video URLs', () => {
  assert.equal(isSocialMediaVideoUrl('https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283'), true)
  assert.equal(isSocialMediaVideoUrl('https://v.douyin.com/abcde/'), true)
  assert.equal(isSocialMediaVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true)
  assert.equal(isSocialMediaVideoUrl('https://youtu.be/dQw4w9WgXcQ'), true)
  assert.equal(isSocialMediaVideoUrl('https://example.com/demo.vbreakdown'), true)
  assert.equal(isSocialMediaVideoUrl('https://example.com/sample.mp4'), true)
})

test('isSocialMediaVideoUrl rejects non-video URLs', () => {
  assert.equal(isSocialMediaVideoUrl('https://github.com/deepseek-ai'), false)
  assert.equal(isSocialMediaVideoUrl('https://google.com'), false)
  assert.equal(isSocialMediaVideoUrl(''), false)
  assert.equal(isSocialMediaVideoUrl(null), false)
})
