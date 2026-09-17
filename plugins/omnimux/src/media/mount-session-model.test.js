import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSessionModelPreference } from '../session/model-preference.js'
import { mountMedia } from './mount.js'

/**
 * Mount one media tool and capture what the executor received, so the test can
 * assert on the model the submit actually routed with.
 */
function harness({ sessionModel } = {}) {
  const tools = []
  const calls = []
  mountMedia({
    tools: { register(tool) { tools.push(tool) } },
    provide() {},
  }, {
    kind: 'video',
    execute: async (request) => { calls.push(request); return { mode: 'live' } },
    media: {},
    jsonOut: {},
    ...(sessionModel ? { sessionModel } : {}),
  })
  return { tool: tools[0], calls }
}

const pinned = (modelId) => {
  const preference = createSessionModelPreference()
  preference.set('s1', { auto: false, modelId, label: modelId })
  return preference
}

const exec = (sessionId = 's1') => ({ agent: { session: { id: sessionId } } })

describe('media submit model resolution', () => {
  it('uses the session pin when the caller passes no model', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4' }, exec())

    assert.equal(calls[0].model, 'seedance-2-5')
  })

  it('lets an explicit model win over the session pin', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4', model: 'minimax-h3' }, exec())

    assert.equal(calls[0].model, 'minimax-h3')
  })

  it('treats a blank explicit model as absent and falls back to the pin', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4', model: '   ' }, exec())

    assert.equal(calls[0].model, 'seedance-2-5')
  })

  it('keeps the pin scoped to its own session', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4' }, exec('someone-else'))

    assert.equal(calls[0].model, undefined)
  })

  it('injects nothing when no preference is mounted', async () => {
    const { tool, calls } = harness()

    await tool.execute({ dest: '/tmp/a.mp4' }, exec())

    assert.equal(calls[0].model, undefined)
  })

  it('leaves the request unchanged when there is no session identity', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4' }, {})

    assert.equal(calls[0].model, undefined)
  })

  it('does not disturb the other request fields', async () => {
    const { tool, calls } = harness({ sessionModel: pinned('seedance-2-5') })

    await tool.execute({ dest: '/tmp/a.mp4', prompt: 'a cat', duration: 5, group: 'pro' }, exec())

    assert.equal(calls[0].prompt, 'a cat')
    assert.equal(calls[0].duration, 5)
    assert.equal(calls[0].group, 'pro')
    assert.equal(calls[0].dest, '/tmp/a.mp4')
  })
})
