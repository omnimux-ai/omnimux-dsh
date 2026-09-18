import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchRealSocialMetadata } from '../src/breakdown/socialMetadata.js'

describe('youtube cross-plugin seam and tool consumption', () => {
  it('prefers ctx.get("youtube").getVideo seam when available', async () => {
    let seamCalledWith = null
    const ctx = {
      get(name) {
        if (name === 'youtube') {
          return {
            async getVideo(url) {
              seamCalledWith = url
              return {
                data: {
                  title: 'YouTube Sample Title',
                  duration: 120,
                  cover_url: 'https://img.youtube.com/vi/abc/0.jpg',
                  video_url: 'https://example.com/video.mp4',
                  author: {
                    name: 'Test Creator',
                    handle: '@test',
                  },
                },
              }
            },
          }
        }
        return undefined
      },
    }

    const res = await fetchRealSocialMetadata('https://www.youtube.com/watch?v=abc', ctx)
    assert.equal(seamCalledWith, 'https://www.youtube.com/watch?v=abc')
    assert.ok(res)
    assert.equal(res.title, 'YouTube Sample Title')
    assert.equal(res.duration, 120)
    assert.equal(res.video_url, 'https://example.com/video.mp4')
  })

  it('falls back to ctx.tools.get("omnimux_youtube_video") tool when seam is absent', async () => {
    let toolCalledWith = null
    const ctx = {
      get() { return undefined },
      tools: {
        get(name) {
          if (name === 'omnimux_youtube_video') {
            return {
              async execute(args) {
                toolCalledWith = args
                return {
                  data: {
                    title: 'YouTube Tool Title',
                    duration: 60,
                    video_url: 'https://example.com/stream.mp4',
                  },
                }
              },
            }
          }
          return undefined
        },
      },
    }

    const res = await fetchRealSocialMetadata('https://youtu.be/xyz123', ctx)
    assert.ok(toolCalledWith)
    assert.ok(res)
    assert.equal(res.title, 'YouTube Tool Title')
    assert.equal(res.duration, 60)
    assert.equal(res.video_url, 'https://example.com/stream.mp4')
  })
})
