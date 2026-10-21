// @vitest-environment jsdom
// @ts-nocheck
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { SessionTextCollector } from '../src/background/session-completion.ts'

const frame = (sessionId, event) => ({
  t: 'event',
  frame: { method: 'session/event', payload: { type: 'session/event', sessionId, event } },
})

describe('SessionTextCollector', () => {
  it('joins assistant text blocks and completes on turn/end', () => {
    const collector = new SessionTextCollector('session-1')
    assert.equal(collector.push(frame('session-1', {
      type: 'assistant/message',
      data: { message: { role: 'assistant', content: [{ type: 'text', text: '正常' }] } },
    })), true)
    assert.equal(collector.push(frame('session-1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })), true)
    assert.equal(collector.text, '正常')
    assert.deepEqual(collector.outcome, { ok: true })
  })

  it('surfaces the provider error from turn/end', () => {
    const collector = new SessionTextCollector('session-2')
    collector.push(frame('session-2', {
      type: 'turn/end',
      data: { reason: { kind: 'error', error: { message: 'provider x does not support max' } } },
    }))
    assert.deepEqual(collector.outcome, { ok: false, error: 'provider x does not support max' })
  })

  it('ignores frames from another session and non-session frames', () => {
    const collector = new SessionTextCollector('session-3')
    assert.equal(collector.push(frame('session-other', { type: 'turn/end', data: { reason: { kind: 'completed' } } })), false)
    assert.equal(collector.push({ t: 'event', frame: { method: 'session/assistant-stream' } }), false)
    assert.equal(collector.outcome, null)
  })

  it('reports an empty completed turn as empty text for the caller', () => {
    const collector = new SessionTextCollector('session-4')
    collector.push(frame('session-4', { type: 'turn/end', data: { reason: { kind: 'completed' } } }))
    assert.deepEqual(collector.outcome, { ok: true })
    assert.equal(collector.text, '')
  })
})
