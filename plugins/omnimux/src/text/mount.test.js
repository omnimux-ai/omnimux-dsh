import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGateConfig } from '../gate/config.js'
import { OmnimuxError } from '../media/errors.js'
import { parseTextConfig } from './catalog.js'
import { mountTextComplete } from './mount.js'

describe('mountTextComplete capability gate', () => {
  it('registers omnimux_text_complete tool and provides textComplete seam by default', () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    const hub = {
      text: parseTextConfig(undefined),
      gate: parseGateConfig(undefined),
    }

    mountTextComplete(ctx, hub, {}, () => {})
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'omnimux_text_complete')
    assert.ok(provided.textComplete)
    assert.equal(tools[0].parameters.properties.model.enum.length, 13)
    assert.equal(tools[0].parameters.properties.metadata, undefined)
    assert.ok(tools[0].parameters.properties.strategy)
    assert.ok(tools[0].parameters.properties.group)
    assert.ok(tools[0].parameters.properties.allowed_groups)
  })

  it('skips register and provide when omnimux_text_complete tool is disabled in gate', () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    const hub = {
      text: parseTextConfig(undefined),
      gate: parseGateConfig({ tools: { omnimux_text_complete: false } }),
    }

    mountTextComplete(ctx, hub, {}, () => {})
    assert.equal(tools.length, 0)
    assert.equal(provided.textComplete, undefined)
  })

  it('filters enum in tool parameters when gate disables specific models', () => {
    const tools = []
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide() {},
    }
    const hub = {
      text: parseTextConfig(undefined),
      gate: parseGateConfig({
        models: {
          textComplete: {
            'grok-4.6': false,
            'claude-opus-5': false,
          },
        },
      }),
    }

    mountTextComplete(ctx, hub, {}, () => {})
    assert.equal(tools.length, 1)
    const enumModels = tools[0].parameters.properties.model.enum
    assert.equal(enumModels.length, 11)
    assert.ok(!enumModels.includes('grok-4.6'))
    assert.ok(!enumModels.includes('claude-opus-5'))
    assert.ok(enumModels.includes('gemini-3.7-flash'))
  })

  it('throws capability-disabled at execution time when calling a disabled model', async () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    const hub = {
      text: parseTextConfig(undefined),
      gate: parseGateConfig({
        models: {
          textComplete: {
            'grok-4.6': false,
          },
        },
      }),
    }

    mountTextComplete(ctx, hub, {}, () => {})

    await assert.rejects(
      async () => {
        await tools[0].execute({ prompt: 'test', reason: 'benchmark', model: 'grok-4.6' })
      },
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        assert.equal(err.message, "Model 'grok-4.6' on textComplete is disabled by capability gate")
        return true
      },
    )

    await assert.rejects(
      async () => {
        await provided.textComplete.execute({ prompt: 'test', model: 'grok-4.6' })
      },
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        return true
      },
    )
  })

  it('registered tool and seam reject an incompatible operation before llm.stream', async () => {
    const tools = []
    const provided = {}
    let vendorCalls = 0
    const ctx = {
      tools: { register(tool) { tools.push(tool) } },
      provide(name, api) { provided[name] = api },
      get(name) {
        if (name !== 'llm') return undefined
        return {
          async * stream() {
            vendorCalls += 1
            yield { type: 'text-delta', text: 'must not run' }
          },
        }
      },
    }
    const hub = { text: parseTextConfig(undefined), gate: parseGateConfig(undefined) }
    mountTextComplete(ctx, hub, {}, (error) => { throw error })
    const request = {
      prompt: 'describe',
      model: 'gemini-3.7-flash',
      operation: 'digital_human',
      bypassSubmitGuard: true,
      reason: 'guard regression',
    }
    await assert.rejects(
      () => tools[0].execute(request, {}),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    await assert.rejects(
      () => provided.textComplete.execute(request),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
  })
})

describe('mountTextComplete toolModel bypass', () => {
  it('execute() skips the runtime-mode gate when omnimux.toolModel is configured', async () => {
    const tools = []
    const provided = {}
    const seen = []
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
      get(name) {
        if (name === 'llm') {
          return {
            async * stream(options) {
              seen.push(options)
              yield { type: 'text-delta', text: 'tool answer' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            },
          }
        }
        if (name === 'settings') {
          return {
            get(key) {
              return key === 'omnimux'
                ? { runtimeMode: 'agent', runtimeAgentId: '', runtimeAgentVerified: false, toolModel: 'cpa:gpt-6.1-sol' }
                : undefined
            },
          }
        }
        return undefined
      },
    }
    const hub = { text: parseTextConfig(undefined), gate: parseGateConfig(undefined) }
    mountTextComplete(ctx, hub, {}, (error) => { throw error })

    const result = await provided.textComplete.execute({ prompt: 'say hi' })
    assert.equal(result.model, 'cpa:gpt-6.1-sol')
    assert.equal(result.text, 'tool answer')
    assert.equal(seen[0].provider, 'cpa')
    assert.equal(seen[0].model, 'gpt-6.1-sol')
  })

  it('gate-disabled tool still intercepts before any model routing', async () => {
    const provided = {}
    const ctx = {
      tools: { register() {} },
      provide(name, api) { provided[name] = api },
      get(name) {
        if (name === 'settings') return { get: () => ({ runtimeMode: 'agent', toolModel: 'cpa:x' }) }
        return undefined
      },
    }
    const hub = { text: parseTextConfig(undefined), gate: parseGateConfig({ tools: { omnimux_text_complete: false } }) }
    mountTextComplete(ctx, hub, {}, () => {})
    assert.equal(provided.textComplete, undefined)
  })
})
