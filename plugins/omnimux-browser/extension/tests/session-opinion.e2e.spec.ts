// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { SessionTextCollector } from '../src/background/session-completion.ts'

const frame = (sessionId, event) => ({
  t: 'event',
  frame: { method: 'session/event', payload: { type: 'session/event', sessionId, event } },
})

describe('poster opinion session turn', () => {
  it('assembles one completed turn from the host event stream', () => {
    const collector = new SessionTextCollector('session-opinion')
    collector.push(frame('session-opinion', { type: 'turn/start', data: { turn: 1 } }))
    collector.push(frame('session-opinion', {
      type: 'assistant/message',
      data: { message: { role: 'assistant', content: [{ type: 'text', text: '我的个人观点' }] } },
    }))
    collector.push(frame('session-opinion', { type: 'turn/end', data: { reason: { kind: 'completed' } } }))
    assert.deepEqual(collector.outcome, { ok: true })
    assert.equal(collector.text, '我的个人观点')
  })
})
