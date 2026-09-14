import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { testNetworkAttempts } from '../../scripts/test-network-guard.mjs'
import { mountCanvasGenerationEvents } from './generation-events.js'

const message = (rpcId, kind = 'user') => ({ source: { kind, rpcId } })
const event = (phase, requestIds, turn = 1, sessionId = 'session-a') => ({
  type: 'omnimux:canvas:generation', payload: { sessionId, requestIds, turn, phase },
})

function fixture(t, { fallback = false, throws = false } = {}) {
  const listeners = new Map()
  const events = []
  let initiator
  const agents = { requireInitiator() { if (throws) throw new Error('no initiator'); return initiator } }
  const ctx = {
    on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name) },
    ...(fallback ? { agents } : { get: () => agents }),
  }
  const dispose = mountCanvasGenerationEvents(ctx, { hubEvents: { emit: (value) => events.push(value) } })
  t.after(dispose)
  const call = (name, ...args) => listeners.get(name)?.(...args)
  const middleware = (name, input) => {
    let count = 0
    const result = call(name, input, () => { count++; return 'continued' })
    assert.equal(count, 1, `${name} must continue exactly once`)
    assert.equal(result, 'continued')
  }
  return {
    events, listeners, dispose, call,
    claim: (agent, turn, messages, signal) => middleware('agent/pre-step', { agent, turn, messages, signal }),
    execute: (exec, owner = exec.agent) => { initiator = owner; middleware('tools/execute', exec) },
    end: (session, turn) => call('session/event', session, { type: 'turn/end', data: { turn } }),
  }
}

afterEach(() => assert.deepEqual(testNetworkAttempts(), [], 'offline regressions must not request network'))

test('inbox claims merge with the complete pre-step batch without claiming running', (t) => {
  const f = fixture(t)
  const agent = { session: { id: 'session-a' } }
  const signal = new AbortController().signal
  f.call('agent/inbox/claimed', { agent, turn: 1, message: message('one') })
  f.call('agent/inbox/claimed', { agent, turn: 1, message: message('one') })
  assert.deepEqual(f.events, [])
  f.claim(agent, 1, [message('two'), message('one'), message('ignored', 'system'), message(''), {}], signal)
  assert.deepEqual(f.events, [event('claimed', ['one', 'two'])])
  f.claim(agent, 1, [message('three')], signal)
  assert.deepEqual(f.events.at(-1), event('claimed', ['one', 'two', 'three']))
  assert.equal(f.events.some((item) => item.payload.phase === 'running'), false)
})

test('same-session agents retain separate request batches and turn identities', (t) => {
  const f = fixture(t)
  const session = { id: 'session-a' }
  const a = { session }; const b = { session }
  const sa = new AbortController().signal; const sb = new AbortController().signal
  f.claim(a, 1, [message('a')], sa)
  f.claim(b, 1, [message('b')], sb)
  f.execute({ name: 'image_generate', agent: a, signal: sa })
  f.execute({ name: 'video_generate', agent: b, signal: sb })
  assert.deepEqual(f.events, [event('claimed', ['a']), event('claimed', ['b']), event('running', ['a']), event('running', ['b'])])
  const nextSignal = new AbortController().signal
  f.claim(a, 2, [message('a-next')], nextSignal)
  const count = f.events.length
  f.execute({ name: 'image_generate', agent: a, signal: sa })
  assert.equal(f.events.length, count)
  f.execute({ name: 'image_generate', agent: a, signal: nextSignal })
  assert.deepEqual(f.events.at(-1), event('running', ['a-next'], 2))
})

for (const name of ['omnimux_image_submit', 'omnimux_video_submit', 'image_generate', 'video_generate']) {
  test(`matching top-level execution emits running for ${name}`, (t) => {
    const f = fixture(t, { fallback: name === 'video_generate' })
    const agent = { session: { id: 'session-a' } }
    const signal = new AbortController().signal
    f.claim(agent, 1, [message('request')], signal)
    f.execute({ name, agent, signal })
    assert.deepEqual(f.events, [event('claimed', ['request']), event('running', ['request'])])
  })
}

for (const boundary of ['wrong initiator', 'missing initiator', 'throwing initiator', 'wrong agent', 'missing agent', 'wrong signal', 'missing signal', 'aborted', 'parent', 'unlisted tool', 'unclaimed agent']) {
  test(`execution cannot report running with ${boundary}`, (t) => {
    const f = fixture(t, { throws: boundary === 'throwing initiator' })
    const agent = { session: { id: 'session-a' } }
    const controller = new AbortController()
    f.claim(agent, 1, [message('request')], controller.signal)
    const exec = { name: 'image_generate', agent, signal: controller.signal }
    let owner = agent
    if (boundary === 'wrong initiator') owner = { session: agent.session }
    if (boundary === 'missing initiator') owner = null
    if (boundary === 'wrong agent') exec.agent = { session: agent.session }
    if (boundary === 'missing agent') delete exec.agent
    if (boundary === 'wrong signal') exec.signal = new AbortController().signal
    if (boundary === 'missing signal') delete exec.signal
    if (boundary === 'aborted') controller.abort()
    if (boundary === 'parent') exec.parent = { name: 'parent' }
    if (boundary === 'unlisted tool') exec.name = 'read_file'
    if (boundary === 'unclaimed agent') { exec.agent = { session: agent.session }; owner = exec.agent }
    f.execute(exec, owner)
    assert.deepEqual(f.events, [event('claimed', ['request'])])
  })
}

test('invalid turns, sessions, missing signals and non-user batches do not emit', (t) => {
  const f = fixture(t)
  const signal = new AbortController().signal
  for (const turn of [0, -1, 1.5, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) {
    f.claim({ session: { id: 'session-a' } }, turn, [message('bad')], signal)
  }
  for (const agent of [{}, { session: {} }, { session: { id: 1 } }]) f.claim(agent, 1, [message('bad')], signal)
  const agent = { session: { id: 'session-a' } }
  f.claim(agent, 1, [message('request')], undefined)
  f.execute({ name: 'image_generate', agent, signal })
  f.claim(agent, 2, [message('system', 'system'), message(null), {}], signal)
  f.execute({ name: 'image_generate', agent, signal })
  assert.deepEqual(f.events, [])
})

test('session end uses the final claim mapping, ignores mismatches and clears its execution signal', (t) => {
  const f = fixture(t)
  const session = { id: 'session-a' }
  const a = { session }; const b = { session }
  const sa = new AbortController().signal; const sb = new AbortController().signal
  f.claim(a, 1, [message('a')], sa)
  f.claim(b, 2, [message('b')], sb)
  f.end(session, 1)
  f.end({ id: 'session-a' }, 2)
  f.call('session/event', session, { type: 'turn/start', data: { turn: 2 } })
  assert.equal(f.events.length, 2)
  f.end(session, 2)
  assert.deepEqual(f.events.at(-1), event('settled', ['b'], 2))
  f.end(session, 2)
  f.execute({ name: 'video_generate', agent: b, signal: sb })
  assert.equal(f.events.length, 3)
  f.claim(b, 3, [message('next')], new AbortController().signal)
  f.end(session, 3)
  assert.deepEqual(f.events.at(-1), event('settled', ['next'], 3))
})

test('dispose removes every listener and prevents later emissions', (t) => {
  const f = fixture(t)
  const agent = { session: { id: 'session-a' } }
  f.claim(agent, 1, [message('request')], new AbortController().signal)
  assert.equal(f.listeners.size, 4)
  f.dispose()
  assert.equal(f.listeners.size, 0)
  f.call('agent/inbox/claimed', { agent, turn: 1, message: message('late') })
  f.end(agent.session, 1)
  assert.deepEqual(f.events, [event('claimed', ['request'])])
  assert.doesNotThrow(f.dispose)
})

test('unavailable context or event sink returns a safe disposer', () => {
  assert.doesNotThrow(mountCanvasGenerationEvents(null, { hubEvents: {} }))
  assert.doesNotThrow(mountCanvasGenerationEvents({ on() { throw new Error('must not subscribe') } }, { hubEvents: {} }))
})
