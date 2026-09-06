import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { installWebSocketHmr } from './client.js'

async function settle() { for (let i = 0; i < 8; i++) await setImmediate() }

function fixture(t) {
  const listeners = new Map()
  const trace = []
  const errors = []
  const events = {
    isHealthy: () => false,
    subscribe(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
      return () => listeners.get(type).delete(listener)
    },
    emit(type, payload) { for (const listener of [...(listeners.get(type) ?? [])]) listener({ payload }) },
  }
  const fiber = () => ({ runtime: { callback() {} }, await: async () => {} })
  const entry = {
    options: { name: 'omnimux' },
    fiber: fiber(),
    async refresh() { trace.push('refresh'); entry.fiber = fiber() },
  }
  const ctx = {
    loader: { entries: () => [entry] },
    modules: {
      manifest: { modules: [{ id: 'omnimux', rev: 'initial' }] },
      invalidate(id, rev) { trace.push(`invalidate:${rev}`) },
      async prefetch() { trace.push('prefetch') },
    },
    registry: { delete() { trace.push('unregister') } },
    logger: { warn: message => errors.push(message), error: error => errors.push(error) },
  }
  let snapshot = { epoch: 'host-1', entries: [{ id: 'omnimux', rev: 'initial' }] }
  const document = {
    defaultView: {
      fetch: async () => ({ ok: true, json: async () => snapshot }),
      location: { reload: () => trace.push('page-reload') },
    },
    querySelectorAll: () => [
      { getAttribute: () => 'omnimux', remove: () => trace.push('remove-style') },
      { getAttribute: () => 'other', remove: () => { throw new Error('removed unrelated style') } },
    ],
  }
  let dispose = () => {}
  function mount() { dispose = installWebSocketHmr(ctx, events, document) }
  t.after(() => dispose())
  const rebuilt = rev => events.emit('omnimux:hmr:rebuilt', { id: 'omnimux', rev })
  return { ctx, entry, document, events, listeners, trace, errors, rebuilt, mount, dispose: () => dispose(), setSnapshot: value => { snapshot = value } }
}

test('legacy pages wait for the new Host graph without activating a second HMR driver', async t => {
  const f = fixture(t)
  const native = { id: '@deepseek-ai/dsh-client-hmr', rev: 'old' }
  f.ctx.modules.manifest.modules.push(native)
  f.setSnapshot({ epoch: 'old-host', entries: [native, { id: 'omnimux', rev: 'v2' }] })
  f.mount()
  assert.equal(f.listeners.has('omnimux:hmr:rebuilt'), false)
  f.rebuilt('v2')
  f.events.emit('omnimux:connected')
  await settle()
  assert.deepEqual(f.trace, [])
  f.setSnapshot({ epoch: 'new-host', entries: [{ id: 'omnimux', rev: 'v3' }] })
  f.events.emit('omnimux:connected')
  await settle()
  assert.deepEqual(f.trace, ['page-reload'])
})

test('sync before Host upgrade cannot start a page reload loop', async t => {
  const f = fixture(t)
  f.ctx.modules.manifest.modules.push({ id: '@deepseek-ai/dsh-client-hmr', rev: 'old' })
  f.events.isHealthy = () => true
  const fetch = f.document.defaultView.fetch
  let hostUpgraded = false
  f.document.defaultView.fetch = async () => hostUpgraded ? fetch() : { ok: false, status: 404 }
  f.mount()
  await settle()
  assert.deepEqual(f.trace, [])
  assert.ok(f.errors.some(error => String(error).includes('HTTP 404')))
  hostUpgraded = true
  f.events.emit('omnimux:connected')
  await settle()
  assert.deepEqual(f.trace, ['page-reload'])
})

test('unmount cancels a pending legacy page migration', async t => {
  const f = fixture(t)
  f.ctx.modules.manifest.modules.push({ id: '@deepseek-ai/dsh-client-hmr', rev: 'old' })
  let respond
  f.document.defaultView.fetch = () => new Promise(resolve => { respond = resolve })
  f.mount()
  f.events.emit('omnimux:connected')
  f.dispose()
  respond({ ok: true, json: async () => ({ epoch: 'new-host', entries: [] }) })
  await settle()
  assert.deepEqual(f.trace, [])
})

test('reloads in lifecycle order, keeps unrelated styles, and deduplicates repeated notices', async t => {
  const f = fixture(t)
  f.mount()
  f.rebuilt('v2')
  f.rebuilt('v2')
  await settle()
  assert.deepEqual(f.trace, ['invalidate:v2', 'prefetch', 'unregister', 'remove-style', 'refresh'])
  assert.deepEqual(f.errors, [])
})

test('does not let a delayed snapshot roll a newer live notification backwards', async t => {
  const f = fixture(t)
  let respond
  f.document.defaultView.fetch = () => new Promise(resolve => { respond = resolve })
  f.mount()
  f.events.emit('omnimux:connected')
  f.rebuilt('v3')
  await settle()
  respond({ ok: true, json: async () => ({ epoch: 'host-1', entries: [{ id: 'omnimux', rev: 'v2' }] }) })
  await settle()
  assert.deepEqual(f.trace.filter(x => x.startsWith('invalidate')), ['invalidate:v3'])
})

test('reconnect catches missed revisions and a replaced Host refreshes the page', async t => {
  const f = fixture(t)
  f.mount()
  f.events.emit('omnimux:connected')
  await settle()
  f.setSnapshot({ epoch: 'host-1', entries: [{ id: 'omnimux', rev: 'missed' }] })
  f.events.emit('omnimux:connected')
  await settle()
  assert.ok(f.trace.includes('invalidate:missed'))
  f.setSnapshot({ epoch: 'host-2', entries: [{ id: 'omnimux', rev: 'new-startup' }] })
  f.events.emit('omnimux:connected')
  await settle()
  assert.equal(f.trace.at(-1), 'page-reload')
  assert.equal(f.trace.includes('invalidate:new-startup'), false)
})

test('hub self-reload keeps revision state across driver replacement', async t => {
  const f = fixture(t)
  const refresh = f.entry.refresh
  f.entry.refresh = async () => {
    f.dispose()
    await refresh()
    f.mount()
    f.events.emit('omnimux:connected')
  }
  f.setSnapshot({ epoch: 'host-1', entries: [{ id: 'omnimux', rev: 'v2' }] })
  f.mount()
  f.rebuilt('v2')
  await settle()
  assert.equal(f.trace.filter(x => x === 'refresh').length, 1)
  assert.deepEqual(f.errors, [])
})

test('unmount during prefetch cancels queued teardown', async t => {
  const f = fixture(t)
  let release
  f.ctx.modules.prefetch = () => new Promise(resolve => { release = resolve })
  f.mount()
  f.rebuilt('v2')
  await settle()
  f.dispose()
  release()
  await settle()
  assert.deepEqual(f.trace, ['invalidate:v2'])
})

test('fiberless materialization is reported and the same revision can retry', async t => {
  const f = fixture(t)
  const refresh = f.entry.refresh
  f.entry.refresh = async () => {}
  f.mount()
  f.rebuilt('v2')
  await settle()
  assert.ok(f.errors.some(error => String(error).includes('failed to materialize')))
  f.entry.refresh = refresh
  f.rebuilt('v2')
  await settle()
  assert.equal(f.trace.filter(x => x === 'invalidate:v2').length, 2)
  assert.ok(f.entry.fiber)
})

test('failed prefetch remains retryable and malformed notices are reported', async t => {
  const f = fixture(t)
  const prefetch = f.ctx.modules.prefetch
  f.ctx.modules.prefetch = async () => { throw new Error('missing bundle') }
  f.mount()
  f.rebuilt('v2')
  await settle()
  assert.equal(f.trace.includes('unregister'), false)
  f.ctx.modules.prefetch = prefetch
  f.rebuilt('v2')
  f.events.emit('omnimux:hmr:rebuilt', { id: 'omnimux' })
  await settle()
  assert.equal(f.trace.filter(x => x === 'invalidate:v2').length, 2)
  assert.ok(f.errors.some(error => String(error).includes('invalid HMR notification')))
})
