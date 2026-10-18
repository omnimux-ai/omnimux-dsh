import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { analysisInputFingerprint, analysisMediaItems } from './analysis-input.js'

describe('legacy analysis input media shape', () => {
  it('keeps old image/gallery URLs as images in source order', () => {
    const urls = ['https://pbs.twimg.com/first.jpg', '/omnimux/inspiration/local/media/images/second.png']
    for (const shape of [{ type: 'image' }, { type: 'photo' }, { type: 'gallery' }, { content_shape: 'photo' }, { content_shape: 'gallery' }, { media_kind: 'image' }]) {
      assert.deepEqual(analysisMediaItems({ ...shape, media_urls: urls }), urls.map((url) => ({ type: 'image', url })))
    }
  })
  it('uses an image cover only for an actual photo record, normalizing old media keys', () => {
    assert.deepEqual(analysisMediaItems({ type: 'image', cover_url: 'https://pbs.twimg.com/old.jpg' }), [{ type: 'image', url: 'https://pbs.twimg.com/old.jpg' }])
    assert.deepEqual(analysisMediaItems({ content_shape: 'photo', cover_key: 'photos/old.jpg' }), [{ type: 'image', url: '/omnimux/inspiration/media/photos/old.jpg' }])
    assert.deepEqual(analysisMediaItems({ type: 'gallery', media_urls: ['/api/inspiration/v1/media/one.jpg', 'photos/two.jpg'] }), [
      { type: 'image', url: '/omnimux/inspiration/media/one.jpg' }, { type: 'image', url: '/omnimux/inspiration/media/photos/two.jpg' },
    ])
  })
  it('does not treat text/link previews or video posters as independent pictures', () => {
    for (const row of [{ type: 'text' }, { type: 'link' }, { type: 'link', content_shape: 'text' }, { type: 'video' }, { type: 'video', content_shape: 'gallery' }]) {
      assert.deepEqual(analysisMediaItems({ ...row, cover_url: 'https://pbs.twimg.com/poster.jpg' }), [])
    }
    assert.deepEqual(analysisMediaItems({ type: 'video', media_urls: ['https://video.twimg.com/clip.mp4'], cover_url: 'https://pbs.twimg.com/poster.jpg' }), [{ type: 'video', url: 'https://video.twimg.com/clip.mp4' }])
  })
  it('preserves legacy video sequences and first local-video fallback without changing typed indexes', () => {
    const urls = ['https://video.twimg.com/one.mp4', '/omnimux/inspiration/local/media/videos/two.mp4']
    assert.deepEqual(analysisMediaItems({ type: 'video', media_urls: urls }), urls.map((url) => ({ type: 'video', url })))
    assert.deepEqual(analysisMediaItems({ local_paths: { video: '/saved/videos/old.mp4' } }), [{ type: 'video', url: '/omnimux/inspiration/local/media/videos/old.mp4' }])
    const media_items = [{ type: 'image', url: 'https://pbs.twimg.com/one.jpg' }, { type: 'video', url: urls[0] }]
    assert.equal(analysisMediaItems({ type: 'video', media_items, media_urls: urls }), media_items)
  })
  it('ignores unsafe legacy photo sources and keeps identity consistent with corrected type', () => {
    assert.deepEqual(analysisMediaItems({ type: 'image', media_urls: ['javascript:alert(1)', 'file:///tmp/a.jpg', '../outside.jpg'] }), [])
    const photo = { type: 'image', media_urls: ['https://pbs.twimg.com/one.jpg'] }
    const target = { scope: 'media', media_index: 0 }
    assert.notEqual(analysisInputFingerprint(photo, target), analysisInputFingerprint({ ...photo, type: 'video' }, target))
  })
})
