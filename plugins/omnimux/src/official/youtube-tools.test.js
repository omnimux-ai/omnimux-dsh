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

describe('omnimux youtube tools and seams', () => {
  it('registers all 4 first-class youtube tools and provides socialData and youtube seams', async () => {
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

    // Check tools registration
    assert.ok(registeredTools.has('omnimux_youtube_video'))
    assert.ok(registeredTools.has('omnimux_youtube_channel'))
    assert.ok(registeredTools.has('omnimux_youtube_posts'))
    assert.ok(registeredTools.has('omnimux_youtube_search'))

    // Check seams
    assert.ok(provided.has('socialData'))
    assert.ok(typeof provided.get('socialData').fetch === 'function')

    assert.ok(provided.has('youtube'))
    const ytSeam = provided.get('youtube')
    assert.ok(typeof ytSeam.getVideo === 'function')
    assert.ok(typeof ytSeam.getChannel === 'function')
    assert.ok(typeof ytSeam.getPosts === 'function')
    assert.ok(typeof ytSeam.search === 'function')
  })

  it('executes omnimux_youtube_video tool with video URL', async () => {
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
            title: 'Never Gonna Give You Up',
            duration: 213,
            video_url: 'https://example.com/stream.mp4',
          },
        }),
      }
    }

    mountOfficial(ctx, deps)

    const videoTool = registeredTools.get('omnimux_youtube_video')
    const result = await videoTool.execute({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })

    assert.ok(lastPost)
    assert.equal(lastPost.body.model, 'youtube-video')
    assert.equal(lastPost.body.video_id, 'dQw4w9WgXcQ')
    assert.equal(result.platform, 'youtube')
    assert.equal(result.capability, 'video')
    assert.equal(result.data.title, 'Never Gonna Give You Up')
    assert.equal(result.data.video_url, 'https://example.com/stream.mp4')
  })

  it('executes omnimux_youtube_channel tool with channel handle', async () => {
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
            channel_name: 'MKBHD',
            subscribers: '19M',
          },
        }),
      }
    }

    mountOfficial(ctx, deps)

    const channelTool = registeredTools.get('omnimux_youtube_channel')
    const result = await channelTool.execute({ url: 'https://www.youtube.com/@mkbhd' })

    assert.ok(lastPost)
    assert.equal(lastPost.body.model, 'youtube-user')
    assert.equal(lastPost.body.channel_id, '@mkbhd')
    assert.equal(result.platform, 'youtube')
    assert.equal(result.capability, 'user')
    assert.equal(result.data.channel_name, 'MKBHD')
  })

  it('calls youtube seam methods across plugins', async () => {
    const provided = new Map()
    let calls = []

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
          data: { query: parsed.search_query, id: parsed.video_id },
        }),
      }
    }

    mountOfficial(ctx, deps)

    const ytSeam = provided.get('youtube')

    // Search via string query
    await ytSeam.search('ai news')
    assert.equal(calls[0].model, 'youtube-search')
    assert.equal(calls[0].search_query, 'ai news')

    // Get video via URL string
    await ytSeam.getVideo('https://youtu.be/dQw4w9WgXcQ')
    assert.equal(calls[1].model, 'youtube-video')
    assert.equal(calls[1].video_id, 'dQw4w9WgXcQ')
  })
})
