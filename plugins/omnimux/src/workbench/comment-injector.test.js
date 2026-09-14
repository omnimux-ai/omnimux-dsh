import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountCommentInjector } from './comment-injector.js'
import { COMMENT_FILE_PREFIX, COMMENT_SCHEMA } from './comment-snapshot.js'

function fixture() {
  const snapshot = {
    schema: COMMENT_SCHEMA,
    sessionId: 'session-a',
    media: [{
      id: 'image-a', title: '参考图片',
      comments: Array.from({ length: 9 }, (_, i) => ({
        id: `comment-${i + 1}`, index: i + 1, text: `COMMENT_${i + 1}`,
        xPercent: 91.2, yPercent: 87.6,
      })),
    }],
  }
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
  const message = {
    id: 'current-message', role: 'user', source: { kind: 'user' },
    content: [{ type: 'file', attachment: { name: `${COMMENT_FILE_PREFIX}test.json`, bytes: bytes.length } }],
  }
  const listeners = new Map()
  let reads = 0
  let tailError = null
  const ctx = {
    on: (event, handler) => { listeners.set(event, handler); return () => {} },
    get: () => ({
      async *readFileStream() {
        reads += 1
        yield bytes
        if (tailError) throw tailError
      },
    }),
  }
  mountCommentInjector(ctx)
  const handler = listeners.get('agent/pre-step')
  const payload = {
    agent: { session: { id: 'session-a' } }, messages: [message],
    turn: 1, step: 1, signal: new AbortController().signal,
  }
  const next = async () => ({ kind: 'enter', messages: [message] })
  return { message, handler, payload, next, reads: () => reads, failAtTail: error => { tailError = error } }
}

describe('Comment Injector', () => {
  it('expands every comment including the final coordinates without mutating the admitted message', async () => {
    const f = fixture()
    const before = structuredClone(f.message)
    const result = await f.handler(f.payload, f.next)
    const text = result.messages[0].content.at(-1).text
    for (let i = 1; i <= 9; i += 1) {
      assert.ok(text.includes(`编号 ${i} [水平 91.2%, 垂直 87.6%]：COMMENT_${i}`))
    }
    assert.equal(result.messages[0].content.length, 2)
    assert.deepEqual(f.message, before)
  })

  it('repeats the same original proposal without accumulating expanded text', async () => {
    const f = fixture()
    const first = await f.handler(f.payload, f.next)
    const second = await f.handler(f.payload, f.next)
    assert.deepEqual(second, first)
    assert.equal(second.messages[0].content.length, 2)
    assert.equal(f.message.content.length, 1)
  })

  it('does not read or expand historical messages absent from the current claims', async () => {
    const f = fixture()
    const result = await f.handler({ ...f.payload, messages: [] }, f.next)
    assert.equal(f.reads(), 0)
    assert.equal(result.messages[0], f.message)
  })

  it('rejects a snapshot belonging to another session', async () => {
    const f = fixture()
    await assert.rejects(
      f.handler({ ...f.payload, agent: { session: { id: 'session-b' } } }, f.next),
      /评论附件格式或会话不匹配/,
    )
    assert.equal(f.message.content.length, 1)
  })

  it('propagates an integrity failure after the last byte without injecting partial content', async () => {
    const f = fixture()
    const error = Object.assign(new Error('Stored file attachment failed integrity verification.'), { code: 'ATTACHMENT_CORRUPT' })
    f.failAtTail(error)
    await assert.rejects(f.handler(f.payload, f.next), actual => actual === error)
    assert.equal(f.message.content.length, 1)
  })

  it('waits for the inner decision before adding text to the returned message', async () => {
    const f = fixture()
    let observedText
    const result = await f.handler(f.payload, async () => {
      observedText = f.message.content.filter(part => part.type === 'text')
      return f.next()
    })
    assert.deepEqual(observedText, [])
    assert.match(result.messages[0].content.at(-1).text, /COMMENT_9/)
  })
})
