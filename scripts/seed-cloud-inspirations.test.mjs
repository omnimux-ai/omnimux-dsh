import test from 'node:test'
import assert from 'node:assert/strict'
import { mapGxgenRows, r2CoverReference } from './seed-cloud-inspirations.mjs'

function source(id, key = 'publications/genviral/videos/example/cover.jpg') {
  return { id, title: 'Source title', cover_r2_key: key, assets: {
    tiktok_video_id: '7577949457010953486', creator: { handle: 'example' },
    analysis: { attraction_analysis: 'hook', global_goal: 'goal', narrative_structure: 'story', visual_analysis: 'visual', replication_strategy: 'strategy' },
  } }
}

test('maps the top-level original R2 key and preserves TikTok identity', async () => {
  const row = source('original-row')
  row.assets.cover_url = 'https://expired.example/temporary.jpg'
  const items = await mapGxgenRows([row], { timestamp: 123, fetchMetadata: async () => ({ author_name: 'creator', video_title: 'metadata' }) })
  assert.equal(items.length, 1)
  assert.equal(items[0].cover_key, 'r2/publications/genviral/videos/example/cover.jpg')
  assert.equal(items[0].source_url, 'https://www.tiktok.com/@example/video/7577949457010953486?sync=123_1')
  assert.equal(items[0].analysis.hook_highlight, 'hook')
})

test('rejects the entire selected batch before metadata calls if a source key is absent', async () => {
  let calls = 0
  const bad = source('missing-row', null)
  bad.assets.cover_r2_key = 'publications/wrong-level.jpg'
  await assert.rejects(mapGxgenRows([source('valid'), bad], { fetchMetadata: async () => { calls++; return {} } }), /missing-row/)
  assert.equal(calls, 0)
})

test('rejects transient URLs, malformed keys and overflow', () => {
  for (const key of [undefined, '', 'https://cdn.example/a.jpg', 'publications/../x', 'publications/%2e%2e/x', 'publications//x', 'publications/x\\y', 'publications/x?sig=x', 'publications/ x', 'publications/' + 'x'.repeat(250)]) {
    assert.throws(() => r2CoverReference({ ...source('invalid'), cover_r2_key: key }), /cover_r2_key/)
  }
})


test('uses the same UTF-8 byte limit as the Go reference parser', () => {
  assert.throws(() => r2CoverReference(source('multibyte-overflow', 'publications/' + '图'.repeat(90) + '.jpg')), /cover_r2_key/)
  assert.equal(r2CoverReference(source('multibyte-valid', 'publications/' + '图'.repeat(20) + '.jpg')), 'r2/publications/' + '图'.repeat(20) + '.jpg')
})
