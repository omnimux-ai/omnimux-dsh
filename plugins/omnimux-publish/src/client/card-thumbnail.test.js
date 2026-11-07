import assert from 'node:assert/strict'
import test from 'node:test'
import { pickThumbnailId } from './card-thumbnail.js'

test('pickThumbnailId: cover_media_id 优先于首图', () => {
  assert.equal(pickThumbnailId({ type: 'image', cover_media_id: 'cover-1', media_ids: ['first'] }), 'cover-1')
})

test('pickThumbnailId: 图文无封面时用 media_ids[0] 兜底', () => {
  assert.equal(pickThumbnailId({ type: 'image', cover_media_id: null, media_ids: ['first-img', 'second'] }), 'first-img')
})

test('pickThumbnailId: 视频无封面不回退首图', () => {
  assert.equal(pickThumbnailId({ type: 'video', cover_media_id: null, media_ids: ['clip'] }), '')
})

test('pickThumbnailId: 视频有封面仍用封面', () => {
  assert.equal(pickThumbnailId({ type: 'video', cover_media_id: 'v-cover', media_ids: ['clip'] }), 'v-cover')
})

test('pickThumbnailId: 空/异常输入安全返回空串', () => {
  assert.equal(pickThumbnailId(null), '')
  assert.equal(pickThumbnailId(undefined), '')
  assert.equal(pickThumbnailId({ type: 'image', media_ids: [] }), '')
  assert.equal(pickThumbnailId({ type: 'image', media_ids: 'not-array' }), '')
  assert.equal(pickThumbnailId({ type: 'image', media_ids: [123] }), '')
  assert.equal(pickThumbnailId({ type: 'image', cover_media_id: 42, media_ids: ['ok'] }), 'ok')
})
