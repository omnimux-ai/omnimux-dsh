import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { executeOmnimuxText } from './execute.js'
import { mountTextComplete } from './mount.js'
import { parseTextConfig } from './catalog.js'
import { parseGateConfig } from '../gate/config.js'

function collectStream(seen) {
  return {
    async * stream(options) {
      seen.push(options)
      yield { type: 'text-delta', index: 0, text: 'gemini reply from hub' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

describe('Text Channel & Local Agent Orthogonal Coexistence (Issue #2694)', () => {
  const origKey = process.env.OMNIMUX_API_KEY

  it('routes official model to hub stream in agent mode when official token is present', async () => {
    try {
      process.env.OMNIMUX_API_KEY = 'sk-official-hub-key-12345'
      const seen = []
      let agentCalled = false

      const agentSettings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'codex',
        runtimeAgentVerified: true,
      }

      const result = await executeOmnimuxText({
        prompt: 'hello gemini',
        model: 'gemini-3.8-flash',
        operation: 'vision_chat',
        settings: { get: (key) => (key === 'omnimux' ? agentSettings : undefined) },
        agentRun: async () => {
          agentCalled = true
          return 'should not be called'
        },
        llm: collectStream(seen),
      })

      assert.equal(agentCalled, false, 'official model request must NOT be hijacked by local agent CLI')
      assert.equal(seen.length, 1, 'must route to hub stream')
      assert.equal(seen[0].model, 'gemini-3.8-flash')
      assert.equal(result.text, 'gemini reply from hub')
    } finally {
      if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
      else delete process.env.OMNIMUX_API_KEY
    }
  })

  it('routes explicit official channel to hub in agent mode', async () => {
    try {
      process.env.OMNIMUX_API_KEY = 'sk-official-hub-key-12345'
      let agentCalled = false
      let chatCalled = false

      const agentSettings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'codex',
        runtimeAgentVerified: true,
      }

      // 显式指定官方专线渠道组，例如 @standard 或 @cheap
      const seen = []
      const result = await executeOmnimuxText({
        prompt: 'hello gemini with channel',
        model: 'gemini-3.8-flash@standard',
        operation: 'vision_chat',
        settings: { get: (key) => (key === 'omnimux' ? agentSettings : undefined) },
        agentRun: async () => {
          agentCalled = true
          return 'should not be called'
        },
        fetcher: async (url, opts) => {
          chatCalled = true
          return new Response(JSON.stringify({
            id: 'chatcmpl-test',
            choices: [{ message: { content: 'channel reply from official gateway' } }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        },
        llm: collectStream(seen),
      })

      assert.equal(agentCalled, false, 'official channel must not route to agent')
      assert.equal(chatCalled, true, 'routed official channel must invoke gateway chat')
      assert.equal(result.text, 'channel reply from official gateway')
    } finally {
      if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
      else delete process.env.OMNIMUX_API_KEY
    }
  })

  it('routes to agent when request explicitly specifies agent or local channel', async () => {
    let agentCalled = false
    const agentSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'codex',
      runtimeAgentVerified: true,
      runtimeAgentModel: 'gpt-4o',
    }

    const result = await executeOmnimuxText({
      prompt: 'hello local agent',
      model: '@agent',
      settings: { get: (key) => (key === 'omnimux' ? agentSettings : undefined) },
      agentRun: async ({ id, prompt, model }) => {
        agentCalled = true
        assert.equal(id, 'codex')
        assert.equal(model, 'gpt-4o')
        return 'agent response'
      },
    })

    assert.equal(agentCalled, true)
    assert.equal(result.text, 'agent response')
  })

  it('mountTextComplete bypasses runtime gate for official models when official token exists', async () => {
    const origKey = process.env.OMNIMUX_API_KEY
    try {
      process.env.OMNIMUX_API_KEY = 'sk-authentic-token-12345'
      let executed = false

      const currentSettings = {
        runtimeMode: 'agent',
        runtimeAgentVerified: false, // 假设本地 agent 未就绪
      }

      const tools = []
      let providedApi = null
      const ctx = {
        tools: { register(t) { tools.push(t) } },
        provide(name, api) {
          if (name === 'textComplete') providedApi = api
        },
        get(key) {
          if (key === 'settings') return { get: () => currentSettings }
          if (key === 'llm') return collectStream([])
          return undefined
        },
      }

      const hub = {
        text: parseTextConfig(undefined),
        gate: parseGateConfig(undefined),
      }

      mountTextComplete(ctx, hub, {}, () => {})
      assert.ok(providedApi)

      // 即使全局 runtimeMode: 'agent' 且未验证，官方文本模型具备官方 Token 直接放行
      const result = await providedApi.execute({
        prompt: 'test prompt',
        model: 'gemini-3.8-flash',
        operation: 'vision_chat',
      })
      assert.equal(result.text, 'gemini reply from hub')
    } finally {
      if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
      else delete process.env.OMNIMUX_API_KEY
    }
  })
})
