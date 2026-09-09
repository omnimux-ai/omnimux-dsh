import test from 'node:test'
import assert from 'node:assert/strict'
import { createAttachmentAdmission } from './attachment-admission.js'
const observable = initial => {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() }, listeners }
}
test('attachment retirement requires correlated Host admission and preserves later additions', () => {
  const session = observable({ pendingSubmissions: [], queue: [] })
  const eventSource = observable({ entries: [] })
  const removed = []
  const drafts = new Map([['A', 'block']])
  const admission = createAttachmentAdmission({ getSessions: () => ({ binding: () => ({ session, eventSource }) }),
    store: { removeAttachment: (...args) => removed.push(args) }, drafts })
  admission.arm('A', 'draft', [{ id: 'one' }], 'block')
  session.set({ pendingSubmissions: [{ requestId: 'req1', text: 'draft' }], queue: [] })
  session.set({ pendingSubmissions: [], queue: [], promptError: { op: 'send' } })
  assert.deepEqual(removed, [], 'failed optimistic send must preserve attachments')
  admission.arm('A', 'draft', [{ id: 'one' }], 'block')
  session.set({ pendingSubmissions: [{ requestId: 'req2', text: 'draft' }], queue: [] })
  eventSource.set({ entries: [{ type: 'event', event: { type: 'user/message', data: { source: { kind: 'user', rpcId: 'unrelated' } } } }] })
  assert.deepEqual(removed, [])
  drafts.set('A', 'new block')
  session.set({ pendingSubmissions: [], queue: [{ rpcId: 'req2' }] })
  assert.deepEqual(removed, [['A', 'one']])
  assert.equal(drafts.get('A'), 'new block')
  session.set({ pendingSubmissions: [], queue: [{ rpcId: 'req2' }] })
  assert.equal(removed.length, 1)
  admission.dispose()
  assert.equal(session.listeners.size, 0)
  assert.equal(eventSource.listeners.size, 0)
})
