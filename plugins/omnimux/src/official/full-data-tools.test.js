import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountOfficial } from './mount.js'

function createFakeDeps() {
  return {
    hub: { official: { mount: true } },
    accountMetaStore: { readForAuthorization: () => ({}) },
    identity: { require: async () => ({ id: 'u1' }) },
    store: { resolve: async () => 'mock-token' },
    siteBaseUrl: 'https://mock.omnimux.ai',
    env: { OMNIMUX_API_KEY: 'mock-key' },
    resolveApiKey: () => 'mock-key',
    objectParams: (fields) => ({ type: 'object', properties: fields }),
    jsonOut: { type: 'object' },
    rethrow: (e) => { throw e },
  }
}

describe('full 38 data models and multi-platform tools & seams', () => {
  it('registers dedicated tools for YouTube, TikTok, Instagram, and X', () => {
    const registeredTools = new Map()
    const provided = new Map()

    const ctx = {
      tools: {
        register(tool) {
          registeredTools.set(tool.name, tool)
        },
      },
      provide(name, api) {
        provided.set(name, api)
      },
    }

    mountOfficial(ctx, createFakeDeps())

    // YouTube tools
    assert.ok(registeredTools.has('omnimux_youtube_video'))
    assert.ok(registeredTools.has('omnimux_youtube_channel'))
    assert.ok(registeredTools.has('omnimux_youtube_posts'))
    assert.ok(registeredTools.has('omnimux_youtube_search'))

    // TikTok tools
    assert.ok(registeredTools.has('omnimux_tiktok_video'))
    assert.ok(registeredTools.has('omnimux_tiktok_user'))
    assert.ok(registeredTools.has('omnimux_tiktok_posts'))
    assert.ok(registeredTools.has('omnimux_tiktok_search'))
    assert.ok(registeredTools.has('omnimux_tiktok_shop_search'))
    assert.ok(registeredTools.has('omnimux_tiktok_shop_product'))

    // Instagram tools
    assert.ok(registeredTools.has('omnimux_instagram_post'))
    assert.ok(registeredTools.has('omnimux_instagram_user'))
    assert.ok(registeredTools.has('omnimux_instagram_posts'))
    assert.ok(registeredTools.has('omnimux_instagram_search'))

    // X tools
    assert.ok(registeredTools.has('omnimux_x_tweet'))
    assert.ok(registeredTools.has('omnimux_x_user'))
    assert.ok(registeredTools.has('omnimux_x_posts'))
    assert.ok(registeredTools.has('omnimux_x_search'))

    // Context provider seams
    assert.ok(provided.has('socialData'))
    assert.ok(provided.has('youtube'))
    assert.ok(provided.has('tiktok'))
    assert.ok(provided.has('instagram'))
    assert.ok(provided.has('x'))
  })

  it('executes TikTok dedicated tools and maps parameters to gateway body correctly', async () => {
    const registeredTools = new Map()
    let lastPost = null

    const ctx = {
      tools: {
        register(tool) {
          registeredTools.set(tool.name, tool)
        },
      },
      provide() {},
    }

    const deps = createFakeDeps()
    deps.fetcher = async (url, opts) => {
      lastPost = { url, body: JSON.parse(opts.body) }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            title: 'TikTok Viral Dance',
            aweme_id: '7123456789',
            video: { play_addr: { url_list: ['https://cdn.test/vid.mp4'] } },
          },
        }),
      }
    }

    mountOfficial(ctx, deps)

    const videoTool = registeredTools.get('omnimux_tiktok_video')
    const res = await videoTool.execute({ url: 'https://www.tiktok.com/@creator/video/7123456789' })

    assert.ok(lastPost)
    assert.equal(lastPost.body.model, 'tiktok-video')
    assert.equal(lastPost.body.aweme_id, '7123456789')
    assert.equal(res.platform, 'tiktok')
    assert.equal(res.data.title, 'TikTok Viral Dance')

    const shopTool = registeredTools.get('omnimux_tiktok_shop_search')
    await shopTool.execute({ query: 'cosmetics', region: 'US' })
    assert.equal(lastPost.body.model, 'tiktok-shop-search-v2')
    assert.equal(lastPost.body.search_word, 'cosmetics')
    assert.equal(lastPost.body.region, 'US')
  })

  it('executes Instagram and X dedicated tools correctly', async () => {
    const registeredTools = new Map()
    let lastPost = null

    const ctx = {
      tools: {
        register(tool) {
          registeredTools.set(tool.name, tool)
        },
      },
      provide() {},
    }

    const deps = createFakeDeps()
    deps.fetcher = async (url, opts) => {
      lastPost = { url, body: JSON.parse(opts.body) }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: { success: true },
        }),
      }
    }

    mountOfficial(ctx, deps)

    // Instagram Post
    const igPostTool = registeredTools.get('omnimux_instagram_post')
    await igPostTool.execute({ url: 'https://www.instagram.com/p/C_abc123/' })
    assert.equal(lastPost.body.model, 'instagram-post')
    assert.equal(lastPost.body.url, 'https://www.instagram.com/p/C_abc123/')

    // X Tweet
    const xTweetTool = registeredTools.get('omnimux_x_tweet')
    await xTweetTool.execute({ url: 'https://x.com/elonmusk/status/123456789' })
    assert.equal(lastPost.body.model, 'x-tweet')
    assert.equal(lastPost.body.tweet_id, '123456789')
  })

  it('calls tiktok, instagram, and x seam methods across plugins', async () => {
    const provided = new Map()
    const calls = []

    const ctx = {
      tools: { register() {} },
      provide(name, api) {
        provided.set(name, api)
      },
    }

    const deps = createFakeDeps()
    deps.fetcher = async (url, opts) => {
      const parsed = JSON.parse(opts.body)
      calls.push(parsed)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: { ok: true },
        }),
      }
    }

    mountOfficial(ctx, deps)

    const tiktokSeam = provided.get('tiktok')
    await tiktokSeam.getVideo('https://www.tiktok.com/@user/video/987654')
    assert.equal(calls[0].model, 'tiktok-video')
    assert.equal(calls[0].aweme_id, '987654')

    const igSeam = provided.get('instagram')
    await igSeam.getUser('natgeo')
    assert.equal(calls[1].model, 'instagram-user')
    assert.equal(calls[1].username, 'natgeo')

    const xSeam = provided.get('x')
    await xSeam.search('ai agents')
    assert.equal(calls[2].model, 'x-search')
    assert.equal(calls[2].keyword, 'ai agents')
  })
})
