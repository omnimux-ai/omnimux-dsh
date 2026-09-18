import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import {
  extractTweetId,
  extractTikTokShopProductId,
  fetchSocialData,
  normalizeShopShareLink,
  pickSocialPayload,
  resolveSocialDataModel,
} from './social-data.js'

describe('social data catalog', () => {
  it('resolves documented platform pairs and business fields', () => {
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'video', url: 'https://tiktok.com/@a/video/7123' }).model, 'tiktok-video')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'video', url: 'https://tiktok.com/@a/video/7123' }).field, 'aweme_id')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'video', url: 'https://tiktok.com/@a/video/7123' }).value, '7123')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'user', id: 'ada' }).model, 'tiktok-user')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'user', id: 'ada' }).field, 'uniqueId')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'posts', id: 'ada' }).field, 'unique_id')
    assert.equal(resolveSocialDataModel({ platform: 'tiktok', capability: 'search', query: 'trend' }).field, 'keyword')

    assert.equal(resolveSocialDataModel({ platform: 'instagram', capability: 'post', url: 'https://i' }).field, 'url')
    assert.equal(resolveSocialDataModel({ platform: 'instagram', capability: 'user', id: 'ada' }).field, 'username')
    assert.equal(resolveSocialDataModel({ platform: 'instagram', capability: 'posts', id: 'ada' }).field, 'username')
    assert.equal(resolveSocialDataModel({ platform: 'instagram', capability: 'search', query: 'art' }).field, 'query')

    assert.equal(resolveSocialDataModel({ platform: 'youtube', capability: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).field, 'video_id')
    assert.equal(resolveSocialDataModel({ platform: 'youtube', capability: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).value, 'dQw4w9WgXcQ')
    assert.equal(resolveSocialDataModel({ platform: 'youtube', capability: 'user', id: 'ada' }).field, 'channel_id')
    assert.equal(resolveSocialDataModel({ platform: 'youtube', capability: 'posts', id: 'ada' }).field, 'channel_id')
    assert.equal(resolveSocialDataModel({ platform: 'youtube', capability: 'search', query: 'news' }).field, 'search_query')

    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'tweet', url: 'https://x.com/u/status/2094156823020323038?s=20' }).model, 'x-tweet')
    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'tweet', url: 'https://x.com/u/status/2094156823020323038?s=20' }).field, 'tweet_id')
    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'tweet', url: 'https://x.com/u/status/2094156823020323038?s=20' }).value, '2094156823020323038')
    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'user', id: 'ada' }).field, 'screen_name')
    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'posts', id: 'ada' }).field, 'screen_name')
    assert.equal(resolveSocialDataModel({ platform: 'x', capability: 'search', query: 'ai' }).field, 'keyword')
  })

  it('extracts tweet ids from status urls', () => {
    assert.equal(extractTweetId('2094156823020323038'), '2094156823020323038')
    assert.equal(
      extractTweetId('https://x.com/topbustymodels/status/2094156823020323038?s=20'),
      '2094156823020323038',
    )
    assert.equal(extractTweetId('https://twitter.com/u/status/1'), '1')
    assert.equal(extractTweetId('https://x.com/home'), '')
  })

  it('rejects an unknown pair before HTTP', () => {
    assert.throws(
      () => resolveSocialDataModel({ platform: 'tiktok', capability: 'invalid_cap', url: 'https://t' }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.throws(
      () => resolveSocialDataModel({ platform: 'unknown_platform', capability: 'video', url: 'https://t' }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
  })

  it('posts top-level business fields and prefers envelope data', async () => {
    const seen = []
    const result = await fetchSocialData({
      async withSk(path, opts) {
        seen.push({ path, opts })
        return {
          code: 200,
          data: {
            text: 'hello',
            media: {
              video: [{
                media_url_https: 'https://pbs.twimg.com/thumb.jpg',
                variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/a.mp4' }],
              }],
            },
          },
        }
      },
    }, { platform: 'x', capability: 'tweet', url: 'https://x.com/u/status/2094156823020323038' })

    assert.equal(seen[0].path, '/v1/chat/completions')
    assert.equal(seen[0].opts.body.model, 'x-tweet')
    assert.equal(seen[0].opts.body.messages[0].content, '.')
    assert.equal(seen[0].opts.body.tweet_id, '2094156823020323038')
    assert.equal(result.field, 'tweet_id')
    assert.equal(result.value, '2094156823020323038')
    assert.equal(result.data.text, 'hello')
    assert.equal(result.data.media.video[0].variants[0].url, 'https://video.twimg.com/a.mp4')
  })

  it('still parses chat-completions content when envelope data is absent', async () => {
    const result = await fetchSocialData({
      async withSk() {
        return {
          choices: [{ message: { content: '{"title":"clip"}' } }],
        }
      },
    }, { platform: 'tiktok', capability: 'video', id: '7123456789012345678' })
    assert.equal(result.data.title, 'clip')
    assert.equal(result.field, 'aweme_id')
    assert.equal(result.value, '7123456789012345678')
  })

  it('pickSocialPayload prefers envelope data over choices', () => {
    const payload = pickSocialPayload({
      code: 200,
      data: { id: '1', text: 't' },
      choices: [{ message: { content: '{"title":"ignored"}' } }],
    })
    assert.equal(payload.id, '1')
    assert.equal(payload.text, 't')
  })
})


  it('resolves TikTok Shop product models and region extras', () => {
    const v3 = resolveSocialDataModel({
      platform: 'tiktok',
      capability: 'shop_product',
      url: 'https://shop.tiktok.com/sg/pdp/1733226176534972037',
    })
    assert.equal(v3.model, 'tiktok-shop-product-v3')
    assert.equal(v3.field, 'product_id')
    assert.equal(v3.value, '1733226176534972037')
    assert.equal(v3.extras.region, 'SG')

    const link = resolveSocialDataModel({
      platform: 'tiktok',
      capability: 'shop_product_link',
      url: 'https://shop.tiktok.com/sg/pdp/1733226176534972037',
    })
    assert.equal(link.model, 'tiktok-shop-product-link')
    assert.equal(link.field, 'share_link')
    assert.match(link.value, /view\/product\/1733226176534972037/)
    assert.equal(extractTikTokShopProductId('https://shop.tiktok.com/view/product/1733226176534972037'), '1733226176534972037')
    assert.match(
      normalizeShopShareLink('https://shop.tiktok.com/sg/pdp/1733226176534972037'),
      /view\/product\/1733226176534972037/,
    )
  })

  it('posts product_id and region for shop_product', async () => {
    const seen = []
    await fetchSocialData({
      async withSk(path, opts) {
        seen.push({ path, opts })
        return { code: 200, data: { ok: true } }
      },
    }, {
      platform: 'tiktok',
      capability: 'shop_product',
      url: 'https://shop.tiktok.com/sg/pdp/1733226176534972037',
    })
    assert.equal(seen[0].opts.body.model, 'tiktok-shop-product-v3')
    assert.equal(seen[0].opts.body.product_id, '1733226176534972037')
    assert.equal(seen[0].opts.body.region, 'SG')
  })
