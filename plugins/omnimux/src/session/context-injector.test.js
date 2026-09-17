import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountSessionModelInjector } from './context-injector.js'
import { createSessionModelPreference } from './model-preference.js'

/** Minimal Cordis-like context capturing the `agent/pre-step` handler. */
function fixture() {
  const listeners = new Map()
  const ctx = {
    on(name, handler) {
      listeners.set(name, handler)
      return () => listeners.delete(name)
    },
  }
  const preference = createSessionModelPreference()
  mountSessionModelInjector(ctx, { preference })
  return { listeners, preference }
}

const pin = (preference, sessionId = 's1') =>
  preference.set(sessionId, { auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5' })

const step = (handler, { sessionId = 's1', stepNo = 1, messages = [] } = {}) =>
  handler(
    { agent: { session: { id: sessionId } }, step: stepNo, signal: undefined },
    async () => ({ kind: 'accept', messages }),
  )

describe('session model context injector', () => {
  it('tells the agent which model the user pinned', async () => {
    const { listeners, preference } = fixture()
    pin(preference)

    const decision = await step(listeners.get('agent/pre-step'))
    assert.equal(decision.messages.length, 1)

    const text = decision.messages[0].content[0].text
    assert.match(text, /本会话模型指定与计费/)
    assert.match(text, /Seedance 2\.5/)
    assert.match(text, /seedance-2-5/)
    assert.match(text, /计费标准：按秒计费/)
    assert.match(text, /5 秒约 16 积分/)
    assert.match(text, /30 秒约 94 积分/)
    assert.equal(decision.messages[0].source.plugin, 'omnimux')
  })

  it('injects nothing when the session is on automatic', async () => {
    const { listeners, preference } = fixture()
    preference.set('s1', { auto: true })

    const decision = await step(listeners.get('agent/pre-step'))
    assert.deepEqual(decision.messages, [])
  })

  it('injects nothing for a session that was never recorded', async () => {
    const { listeners } = fixture()

    const decision = await step(listeners.get('agent/pre-step'))
    assert.deepEqual(decision.messages, [])
  })

  it('only injects on the first step of a turn', async () => {
    const { listeners, preference } = fixture()
    pin(preference)

    const decision = await step(listeners.get('agent/pre-step'), { stepNo: 2 })
    assert.deepEqual(decision.messages, [])
  })

  it('keeps messages the previous handler already decided on', async () => {
    const { listeners, preference } = fixture()
    pin(preference)

    const decision = await step(listeners.get('agent/pre-step'), {
      messages: [{ id: 'existing', role: 'user', content: [{ type: 'text', text: 'prior' }] }],
    })
    assert.equal(decision.messages.length, 2)
    assert.equal(decision.messages[0].id, 'existing')
  })

  it('shows the bare id when no distinct label was recorded', async () => {
    const { listeners, preference } = fixture()
    preference.set('s1', { auto: false, modelId: 'minimax-h3' })

    const decision = await step(listeners.get('agent/pre-step'))
    const text = decision.messages[0].content[0].text
    assert.match(text, /minimax-h3/)
    // No duplicated "id (id)" rendering.
    assert.doesNotMatch(text, /minimax-h3（minimax-h3）/)
  })

  it('mounts nothing without a usable preference', () => {
    const listeners = new Map()
    const ctx = { on: (name, handler) => { listeners.set(name, handler) } }

    mountSessionModelInjector(ctx, {})
    mountSessionModelInjector(ctx, { preference: {} })
    mountSessionModelInjector(null, { preference: {} })

    assert.equal(listeners.size, 0)
  })
})
