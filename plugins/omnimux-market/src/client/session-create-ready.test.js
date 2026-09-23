import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const source = readFileSync(new URL('./session-create.js', import.meta.url), 'utf8')
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup({ install, create, attach, draft = '', protectedInput = false, receipt = true, mount = true } = {}) {
  const calls = [], listeners = new Set(), writes = []
  let current = 'a'
  const state = new Map([
    ['a', { draft: 'old draft', attachments: ['image-a'] }],
    ['b', { draft, attachments: protectedInput ? ['image-b'] : [] }],
    ['c', { draft: 'other draft', attachments: ['image-c'] }],
  ])
  const move = id => { current = id; for (const fn of listeners) fn() }
  const sessions = {
    list: { getSnapshot: () => ({ current, byId: { a: { workspaceId: 'w' } } }), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) } },
    create: async options => { calls.push(['create', options.workspaceId]); return create ? create() : 'b' },
    open: id => { calls.push(['open', id]); move(id) },
  }
  const context = { plazaSessions: sessions, setTimeout, console, api: async (method, body) => {
    calls.push([method, body.sessionId || body.slug])
    if (method === 'install') return install ? install() : { ok: true }
    if (method === 'tryAttach') return attach ? attach(body) : { attached: true, hasBody: true, sessionId: body.sessionId, slug: body.slug }
    throw Error('unexpected API')
  } }
  const exports = runInNewContext(source + '\n({createSkillSession,skillCreationInputs})', context)
  for (const [id, input] of state) {
    if (id === 'b' && !mount) continue
    exports.skillCreationInputs.set(id, {
      get draft() { return input.draft },
      get protected() { return input.attachments.length > 0 },
      write: text => {
        writes.push({ sessionId: id, text })
        if (receipt) input.draft = text
        return receipt
      },
    })
  }
  return { ...exports, calls, writes, move, state, listeners, current: () => current, run: options => exports.createSkillSession({ requireReady: true, timeoutMs: 5, ...options }) }
}

test('ready flow installs once, attaches nonempty body to B, writes once without reading stale draft, preserves A', async () => {
  const h = setup()
  const result = await h.run()
  assert.equal(result.ok, true)
  assert.equal(result.prefilled, true)
  assert.deepEqual(h.calls, [['install', 'skill-creator'], ['create', 'w'], ['tryAttach', 'b'], ['open', 'b']])
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0].sessionId, 'b')
  assert.match(h.state.get('b').draft, /^\/skill-creator\n/)
  assert.deepEqual(h.state.get('a'), { draft: 'old draft', attachments: ['image-a'] })
  assert.deepEqual(h.state.get('c'), { draft: 'other draft', attachments: ['image-c'] })
  assert.equal(h.listeners.size, 0)
})

for (const [options, error, attempts] of [
  [{ draft: 'user text' }, 'draft-protected', 0],
  [{ protectedInput: true }, 'draft-protected', 0],
  [{ receipt: false }, 'prefill-failed', 1],
  [{ mount: false }, 'input-unavailable', 0],
]) {
  test(`protected/unavailable input returns ${error}: ${JSON.stringify(options)}`, async () => {
    const h = setup(options)
    const before = structuredClone([...h.state])
    const result = await h.run()
    assert.equal(result.ok, false)
    assert.equal(result.prefilled, false)
    assert.equal(result.error, error)
    assert.equal(result.sessionId, 'b')
    assert.equal(h.writes.length, attempts)
    assert.deepEqual([...h.state], before)
    assert.deepEqual(h.calls, [['install', 'skill-creator'], ['create', 'w'], ['tryAttach', 'b'], ['open', 'b']])
    assert.equal(h.listeners.size, 0)
  })
}

test('install failure never creates or navigates', async () => {
  const h = setup({ install: async () => { throw Error('offline') } })
  await assert.rejects(h.run(), /offline/)
  assert.deepEqual(h.calls, [['install', 'skill-creator']])
  assert.equal(h.current(), 'a')
})

for (const stage of ['install', 'create', 'attach']) {
  test(`session switch during ${stage} never steals navigation, even after returning to A`, async () => {
    const pending = deferred(), entered = deferred()
    const h = setup({ [stage]: () => { entered.resolve(); return pending.promise } })
    const run = h.run()
    await entered.promise
    h.move('c'); h.move('a')
    pending.resolve(stage === 'create' ? 'b' : { attached: true, hasBody: true, sessionId: 'b', slug: 'skill-creator' })
    assert.equal((await run).cancelled, true)
    assert.equal(h.calls.some(call => call[0] === 'open'), false)
    assert.equal(h.writes.length, 0)
  })
}

test('closing panel cancels pending install without navigation', async () => {
  const pending = deferred()
  let cancelled = false
  const h = setup({ install: () => pending.promise })
  const run = h.run({ isCancelled: () => cancelled })
  cancelled = true
  pending.resolve({ ok: true })
  assert.equal((await run).cancelled, true)
  assert.deepEqual(h.calls, [['install', 'skill-creator']])
})

test('empty body or wrong-session attachment fails closed before navigation', async () => {
  for (const attached of [{ attached: true, hasBody: false, sessionId: 'b', slug: 'skill-creator' }, { attached: true, hasBody: true, sessionId: 'c', slug: 'skill-creator' }]) {
    const h = setup({ attach: async () => attached })
    await assert.rejects(h.run(), /skill-body-unavailable/)
    assert.equal(h.current(), 'a')
    assert.equal(h.writes.length, 0)
  }
})

test('no current session can create through the same public service', async () => {
  const h = setup()
  h.move('')
  assert.equal((await h.run()).ok, true)
  assert.equal(h.current(), 'b')
})

test('switch away while target input is mounting never writes or reopens target', async () => {
  const h = setup({ mount: false })
  const result = await h.run({ onTarget: () => queueMicrotask(() => h.move('c')) })
  assert.equal(result.cancelled, true)
  assert.equal(h.current(), 'c')
  assert.equal(h.writes.length, 0)
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 1)
})

test('concurrent calls cannot borrow another creation result', async () => {
  const pending = deferred()
  const h = setup({ install: () => pending.promise })
  const first = h.run()
  assert.equal((await h.run()).error, 'creation-busy')
  pending.resolve({ ok: true })
  assert.equal((await first).ok, true)
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1)
})
