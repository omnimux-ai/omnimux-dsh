import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queueSessionPrefill } from './session-prefill.js'
test('inspiration delegates prefill to the public hub seam', async t => {
  const old = globalThis.window
  t.after(() => { globalThis.window = old })
  let seen
  globalThis.window = { __omnimuxSessionPrefill: { queueSessionPrefill: request => { seen = request; return Promise.resolve({ ok: true }) } } }
  const request = { targetSessionId: 's', prompt: 'p', attach() {} }
  assert.deepEqual(await queueSessionPrefill(request), { ok: true })
  assert.equal(seen, request)
})
test('missing hub seam fails explicitly', async t => {
  const old = globalThis.window
  t.after(() => { globalThis.window = old })
  globalThis.window = {}
  assert.deepEqual(await queueSessionPrefill({}), { ok: false, error: 'composer-missing' })
})
