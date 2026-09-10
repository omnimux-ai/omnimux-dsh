import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listQueryString,
  listInspirations,
  mediaKeyFromHostPath,
  rewriteMediaUrlsForHost,
} from './inspiration.js'

describe('inspiration query + rewrite', () => {
  it('encodes list filters and skips empties', () => {
    assert.equal(listQueryString({}), '')
    assert.equal(listQueryString({ type: 'video', q: '猫', page: 2, tag: '' }), '?type=video&q=%E7%8C%AB&page=2')
    assert.equal(
      listQueryString({
        country: 'US',
        category: '美妆护肤',
        duration_min: 15,
        duration_max: 30,
        views_min: 100000,
        traffic_type: 'ad',
        sort: 'views',
        posted_after: '2026-09-01',
      }),
      '?sort=views&country=US&category=%E7%BE%8E%E5%A6%86%E6%8A%A4%E8%82%A4&duration_min=15&duration_max=30&views_min=100000&traffic_type=ad&posted_after=2026-09-01',
    )
  })

  it('rewrites gateway media URLs onto the Host prefix', () => {
    const payload = {
      success: true,
      data: {
        items: [{
          cover_url: '/api/inspiration/v1/media/covers/a.jpg',
          media_urls: ['https://omnimux.ai/api/inspiration/v1/media/clips/a.mp4'],
        }],
      },
    }
    const rewritten = rewriteMediaUrlsForHost(payload)
    assert.equal(rewritten.data.items[0].cover_url, '/omnimux/inspiration/media/covers/a.jpg')
    assert.equal(rewritten.data.items[0].media_urls[0], '/omnimux/inspiration/media/clips/a.mp4')
  })

  it('leaves a payload without media URLs alone', () => {
    const payload = { success: true, data: { total: 0, items: [] } }
    assert.deepEqual(rewriteMediaUrlsForHost(payload), payload)
  })

  it('pulls the media key from the Host path', () => {
    assert.equal(mediaKeyFromHostPath('/omnimux/inspiration/media/covers/a.jpg'), 'covers/a.jpg')
    assert.equal(mediaKeyFromHostPath('/omnimux/inspiration/status'), '')
  })

  it('lists through the official client', async () => {
    /** @type {string[]} */
    const seen = []
    const json = await listInspirations({
      withPat: async (path) => {
        seen.push(path)
        return { success: true, data: { total: 0, items: [] } }
      },
    }, { type: 'image', sort: 'hot' })
    assert.deepEqual(seen, ['/api/inspiration/v1/inspirations?type=image&sort=hot'])
    assert.equal(json.success, true)
  })
})
