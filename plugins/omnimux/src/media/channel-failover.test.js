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
          status: 'completed',
          outputs: [{ type: 'image', url: 'data:image/png;base64,cG5n' }],
        }
      },
    }

    // #3516 评审修正：seedance-2-5 每档固定分辨率（480p/720p），跨档 failover 必须拒绝
    // 而不是静默改写用户分辨率（见 candidate-intent-constraints 测试）。现役仍可合法
    // failover 的是 gpt-image-2.5 的 economy → standard 池：请求 1K 同时满足两档。
    const result = await executeOmnimuxMedia('image', {
      prompt: 'a cinematic lamp',
      dest: '/tmp/test-out.png',
      model: 'gpt-image-2.5',
      group: 'economy',
      allowedGroups: ['economy', 'standard'],
      strategy: 'cost_first',
      runtime,
      wait: true,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async () => {
        throw new Error('Unexpected HTTP in the offline failover fixture')
      },
    })

    assert.equal(result.mode, 'live')
    assert.ok(attempts.length >= 2, 'should have attempted at least two candidates')
    // Issue #1851: the media path sends the bare model id and carries the group
    // as X-Omnimux-Group, so the injected runtime must never see the candidate
    // string — and a shared injection must survive every failover attempt.
    assert.deepEqual(attempts, ['gpt-image-2.5', 'gpt-image-2.5'])
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
      mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAA' } }],
      apiKey: 'sk-test',
      fetcher,
    })

    assert.equal(result.mode, 'live')
    assert.equal(result.model, 'claude-opus-4-6')
    assert.equal(result.routedModel, 'claude-opus-4-6@standard')
    assert.equal(result.text, 'hello from standard')
    assert.deepEqual(attempts, ['claude-opus-4-6@pro', 'claude-opus-4-6@standard'])
  })

  it('switches groups when this key may not use the selected group', async () => {
    const attempts = []
    const fetcher = async (_url, init) => {
      attempts.push(JSON.parse(init.body).model)
      if (attempts.length === 1) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: '无权访问该分组' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
      };
    };

    const result = await completeTextViaChat({
      model: 'claude-opus-4-6',
      candidates: ['claude-opus-4-6@claude-max-open', 'claude-opus-4-6@standard'],
      prompt: 'say hi',
      maxTokens: 10,
      mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAA' } }],
      apiKey: 'sk-test',
      fetcher,
    });

    assert.equal(result.routedModel, 'claude-opus-4-6@standard');
    assert.deepEqual(attempts, ['claude-opus-4-6@claude-max-open', 'claude-opus-4-6@standard']);
  })

  it('a single-model request still refuses a 403 instead of retrying itself', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { message: '无权访问该分组' } }),
      };
    };

    await assert.rejects(
      () => completeTextViaChat({
        model: 'claude-opus-4-6',
        prompt: 'say hi',
        maxTokens: 10,
        mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAA' } }],
        apiKey: 'sk-test',
        fetcher,
      }),
      (error) => error.code === 'official-permission-denied',
    );
    assert.equal(calls, 1);
  })
})
