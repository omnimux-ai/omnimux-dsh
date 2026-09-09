import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import {
  consumeSessionPrefill,
  getPendingSessionPrefill,
  queueSessionPrefill,
  resetSessionPrefill,
  subscribeSessionPrefill,
} from './session-prefill.js'

afterEach(() => resetSessionPrefill())

function queue(request) {
  return queueSessionPrefill({
    ...request,
    attach: request.attach || (() => ({ ok: true })),
  })
}

describe('session-scoped replication prefill', () => {
  it('registers in the official input dock, which remains mounted for a blank-session Hero', () => {
    const source = readFileSync(new URL('./mount.js', import.meta.url), 'utf8')
    assert.match(source, /SESSION_PREFILL_SLOT = 'conversation\.input\.dock'/)
    assert.match(source, /ctx\.slots\.inject\(SESSION_PREFILL_SLOT,/)
    assert.doesNotMatch(source, /SESSION_PREFILL_SLOT = 'conversation\.composer\.dock'/)
  })

  it('wires queued intents into the mounted official composer consumer', () => {
    const source = readFileSync(new URL('./mount.js', import.meta.url), 'utf8')
    assert.match(
      source,
      /const intent = useSyncExternalStore\(\s*prefill.subscribeSessionPrefill,\s*prefill.getPendingSessionPrefill,/s,
    )
  })

  it('writes one exact prompt through target inputActions only', async () => {
    const prompt = '/video-deconstruct\n\n完整正文'
    const completion = queue({ targetSessionId: 'new-session', prompt })
    const writes = []

    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'old-session',
      draft: '',
      inputActions: { setDraft(next) { writes.push(next) } },
    }), 'waiting')
    assert.deepEqual(writes, [])

    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'new-session',
      draft: '',
      inputActions: { setDraft(next) { writes.push(next) } },
    }), 'consumed')
    assert.deepEqual(await completion, { ok: true, via: 'input-actions' })
    assert.deepEqual(writes, [prompt])
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'new-session', draft: '', inputActions: { setDraft() { writes.push('again') } },
    }), 'waiting')
    assert.deepEqual(writes, [prompt])
  })

  it('protects an existing target draft without attaching replacement text', async () => {
    let attachmentWrites = 0
    const completion = queue({
      targetSessionId: 'blank-reused',
      prompt: '/video-deconstruct\n\n正文',
      attach() { attachmentWrites += 1; return { ok: true } },
    })
    const writes = []
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'blank-reused',
      draft: '用户尚未发送的草稿',
      inputActions: { setDraft(next) { writes.push(next) } },
    }), 'protected')
    assert.deepEqual(await completion, { ok: false, error: 'draft-protected' })
    assert.deepEqual(writes, [])
    assert.equal(attachmentWrites, 0)
  })

  it('keeps the draft empty after an attachment-full failure so a retry can complete', async () => {
    let attachmentCount = 8
    let draft = ''
    const slot = {
      sessionId: 'new-session',
      get draft() { return draft },
      inputActions: { setDraft(next) { draft = next } },
    }
    const attach = () => {
      if (attachmentCount >= 8) return { ok: false, reason: 'quota-exceeded' }
      attachmentCount += 1
      return { ok: true }
    }

    const full = queue({ targetSessionId: 'new-session', prompt: '复刻提示词', attach })
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), slot), 'attach-full')
    assert.deepEqual(await full, { ok: false, error: 'attach-full' })
    assert.equal(draft, '')

    attachmentCount = 7
    const retry = queue({ targetSessionId: 'new-session', prompt: '复刻提示词', attach })
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), slot), 'consumed')
    assert.deepEqual(await retry, { ok: true, via: 'input-actions' })
    assert.equal(draft, '复刻提示词')
  })

  it('does not let a delayed old composer consume a newer target intent', async () => {
    const completion = queue({ targetSessionId: 'new-session', prompt: '正文' })
    const writes = []
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'old-session', draft: '', inputActions: { setDraft(next) { writes.push(next) } },
    }), 'waiting')
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'new-session', draft: '', inputActions: { setDraft(next) { writes.push(next) } },
    }), 'consumed')
    assert.deepEqual(await completion, { ok: true, via: 'input-actions' })
    assert.deepEqual(writes, ['正文'])
  })

  it('notifies an already-mounted consumer when an intent is queued', async () => {
    const writes = []
    const unsubscribe = subscribeSessionPrefill(() => {
      const intent = getPendingSessionPrefill()
      if (!intent) return
      consumeSessionPrefill(intent, {
        sessionId: 'mounted-target',
        draft: '',
        inputActions: { setDraft(next) { writes.push(next) } },
      })
    })

    const completion = queue({ targetSessionId: 'mounted-target', prompt: '挂载后排队' })
    assert.deepEqual(await completion, { ok: true, via: 'input-actions' })
    assert.deepEqual(writes, ['挂载后排队'])
    unsubscribe()
  })

  it('expires an unconsumed intent and ignores its stale target afterward', async () => {
    const completion = queue({
      targetSessionId: 'expired-target',
      prompt: '超时不应再写入',
      timeoutMs: 0,
    })
    const staleIntent = getPendingSessionPrefill()
    assert.deepEqual(await completion, { ok: false, error: 'composer-missing' })
    assert.equal(getPendingSessionPrefill(), null)

    const writes = []
    assert.equal(consumeSessionPrefill(staleIntent, {
      sessionId: 'expired-target',
      draft: '',
      inputActions: { setDraft(next) { writes.push(next) } },
    }), 'waiting')
    assert.deepEqual(writes, [])
  })

  it('fails safely when target inputActions are unavailable', async () => {
    const completion = queue({ targetSessionId: 'new-session', prompt: '正文' })
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'new-session', draft: '', inputActions: undefined,
    }), 'rejected')
    assert.deepEqual(await completion, { ok: false, error: 'composer-rejected' })
  })

  it('rejects a competing CTA without replacing the admitted intent', async () => {
    const first = queue({ targetSessionId: 'first', prompt: '一' })
    const second = queue({ targetSessionId: 'second', prompt: '二' })
    assert.deepEqual(await second, { ok: false, error: 'composer-busy' })
    assert.equal(consumeSessionPrefill(getPendingSessionPrefill(), {
      sessionId: 'first', draft: '', inputActions: { setDraft() {} },
    }), 'consumed')
    assert.deepEqual(await first, { ok: true, via: 'input-actions' })
  })
})

it('readback handoff does not claim success from a void setDraft call', async () => {
  let rollbacks = 0
  const completion = queueSessionPrefill({ targetSessionId: 's', prompt: 'expected', requireReadback: true, timeoutMs: 5,
    attach: () => ({ ok: true, rollback: () => { rollbacks++ } }) })
  const intent = getPendingSessionPrefill()
  assert.equal(consumeSessionPrefill(intent, { sessionId: 's', draft: '', inputActions: { setDraft() {} } }), 'waiting')
  assert.equal(getPendingSessionPrefill(), intent)
  assert.deepEqual(await completion, { ok: false, error: 'composer-missing' })
  assert.equal(rollbacks, 1)
  assert.equal(consumeSessionPrefill(intent, { sessionId: 's', draft: 'expected' }), 'waiting')
})
it('readback requires the exact prompt from the intended session and protects native images', async () => {
  const done = queueSessionPrefill({ targetSessionId: 's', prompt: 'expected', requireReadback: true, attach: () => ({ ok: true }) })
  const intent = getPendingSessionPrefill()
  consumeSessionPrefill(intent, { sessionId: 's', draft: '', inputActions: { setDraft() {} } })
  assert.equal(consumeSessionPrefill(intent, { sessionId: 'other', draft: 'expected' }), 'waiting')
  assert.equal(consumeSessionPrefill(intent, { sessionId: 's', draft: 'different' }), 'waiting')
  assert.equal(consumeSessionPrefill(intent, { sessionId: 's', draft: 'expected' }), 'consumed')
  assert.equal((await done).ok, true)
  let added = false
  const blocked = queueSessionPrefill({ targetSessionId: 's', prompt: 'expected', attach: () => { added = true; return { ok: true } } })
  consumeSessionPrefill(getPendingSessionPrefill(), { sessionId: 's', draft: '', protected: true })
  assert.deepEqual(await blocked, { ok: false, error: 'draft-protected' })
  assert.equal(added, false)
})
