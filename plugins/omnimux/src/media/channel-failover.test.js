import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { completeTextViaChat } from '../text/chat.js'

describe('Channel Group Routing & Failover', () => {
  it('executeOmnimuxMedia falls over to next channel when first channel returns CHANNEL_UNAVAILABLE', async () => {
    const attempts = []
    const runtime = {
      async execute(req) {
        attempts.push(req.input.model)
        if (attempts.length === 1) {
          const error = new Error('channel unavailable')
          error.code = 'CHANNEL_UNAVAILABLE'
          throw error
        }
        return {
          taskId: 'task-success',
          outputs: [{ type: 'video', url: 'https://example.com/video.mp4' }],
        }
      },
    }

    const mockBuffer = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])
    const result = await executeOmnimuxMedia('video', {
      prompt: 'a cinematic shot',
      dest: '/tmp/test-out.mp4',
      model: 'seedance-2-0',
      operation: 'text_to_video',
      strategy: 'cost_first',
      runtime,
      wait: true,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        arrayBuffer: async () => mockBuffer,
        json: async () => ({}),
      }),
    })

    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'task-success')
    assert.ok(attempts.length >= 2, 'should have attempted at least two candidates')
    assert.equal(attempts[0], 'seedance-2-0@seedance-cheap')
    assert.equal(attempts[1], 'seedance-2-0@standard')
  })

  it('completeTextViaChat falls over to next candidate when first candidate returns 503', async () => {
    const attempts = []
    const fetcher = async (url, init) => {
      const body = JSON.parse(init.body)
      attempts.push(body.model)
      if (attempts.length === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: '分组 pro 下模型无可用渠道' } }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'hello from standard' } }],
        }),
      }
    }

    const result = await completeTextViaChat({
      model: 'claude-opus-4-6',
      candidates: ['claude-opus-4-6@pro', 'claude-opus-4-6@standard'],
      prompt: 'say hi',
      maxTokens: 10,
      videoPart: { type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAA' } },
      apiKey: 'sk-test',
      fetcher,
    })

    assert.equal(result.mode, 'live')
    assert.equal(result.model, 'claude-opus-4-6')
    assert.equal(result.routedModel, 'claude-opus-4-6@standard')
    assert.equal(result.text, 'hello from standard')
    assert.deepEqual(attempts, ['claude-opus-4-6@pro', 'claude-opus-4-6@standard'])
  })
})
