import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createStorageController, inspectStoragePlan } from './use-storage-task.js'
import { en, zh } from './locales.js'

const require = createRequire(import.meta.url)
const compiled = await build({ entryPoints: [new URL('./StorageSettingsDialog.jsx', import.meta.url).pathname], bundle: true,
  write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'] })
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)((name) => name === 'dsh-ui-kit' ? {} : require(name), module, module.exports)
const { STORAGE_PHASES, storageProgress, validDestination, storageErrorText } = module.exports
const ok = (body) => ({ ok: true, status: 200, body })
const task = { id: 'task-1', seq: 7, decisionRevision: 0, planHash: 'plan', state: 'awaiting_confirmation' }
const entry = (id, operation = 'copy', decision = null) => ({ id, operation, decision, fingerprint: `fp-${id}`, targetFingerprint: { size: '20' } })
const page = (entries, nextCursor = null) => ({ entries, nextCursor, blockers: [], planHash: 'plan', decisionRevision: 0, conflictSetHash: 'set' })
const tick = () => new Promise((resolve) => setImmediate(resolve))

function fixture(rows = [entry('a')]) {
  const calls = []
  let seq = 7
  const request = async (path, options) => {
    calls.push({ path, options })
    if (options?.method === 'POST') { seq += 1; return ok({ ok: true }) }
    if (path.endsWith('/storage')) return ok({ activeTask: 'task-1', epoch: 1, root: { path: '/sample' } })
    if (path.includes('/entries?')) {
      const query = new URL(path, 'http://local').searchParams
      const start = Number(query.get('cursor'))
      const selected = query.get('kind') === 'conflict' ? rows.filter((row) => row.operation.includes('conflict')) : rows
      return ok(page(selected.slice(start, start + 200), start + 200 < selected.length ? start + 200 : null))
    }
    return ok({ task: { ...task, seq } })
  }
  return { request, calls }
}

test('all server phases and operation/error copy have both languages', () => {
  for (const phase of STORAGE_PHASES) {
    assert.ok(zh[`storage.phase.${phase}`]); assert.ok(en[`storage.phase.${phase}`])
  }
  for (const key of Object.keys(zh).filter((key) => key.startsWith('storage.') || key.startsWith('browse.'))) assert.ok(en[key], key)
  for (const key of Object.keys(en).filter((key) => key.startsWith('storage.') || key.startsWith('browse.'))) assert.ok(zh[key], key)
  assert.equal(storageErrorText((key) => en[key] || key, { code: 'plan-stale' }), en['storage.error.plan-stale'])
})

test('unknown totals stay indeterminate and byte completion is phase-specific', () => {
  assert.deepEqual(storageProgress({ phase: 'checking', scannedItems: 100 }), {})
  assert.deepEqual(storageProgress({ phase: 'copying', copyBytes: 10 }), {})
  assert.deepEqual(storageProgress({ phase: 'copying', copyBytes: 500, totalCopyBytes: 100 }), { value: 100, max: 100 })
  assert.deepEqual(storageProgress({ phase: 'verifying', verifyBytes: 4, totalVerifyBytes: 10 }), { value: 4, max: 10 })
  assert.deepEqual(storageProgress({ phase: 'committing', copyBytes: 10, totalCopyBytes: 10 }), {})
})

test('keep-both accepts safe new relative destinations only', () => {
  for (const name of ['', '/abs', '../up', 'a/../b', 'a//b', 'C:/x', 'a\\b', 'a\0b', '.omnimux-assets/x', 'library.json']) assert.equal(validDestination(name), false, name)
  assert.equal(validDestination('same', 'same'), false)
  assert.equal(validDestination('中文/素材 (2).png', '中文/素材.png'), true)
})

test('plan inspection includes conflicts and skips after page 200 without conflating structures', async () => {
  const rows = Array.from({ length: 201 }, (_, i) => entry(String(i)))
  rows[0] = entry('0', 'conflict', { action: 'overwrite' })
  rows[199] = entry('199', 'unmigrated')
  rows[200] = entry('200', 'structure-conflict')
  const f = fixture(rows)
  const summary = await inspectStoragePlan(task, f.request)
  assert.deepEqual({ total: summary.total, unresolved: summary.unresolved, ordinary: summary.ordinary, structure: summary.structure,
    skipped: summary.skipped, recoveryBytes: summary.recoveryBytes }, { total: 201, unresolved: 1, ordinary: 1, structure: 1, skipped: 1, recoveryBytes: 20 })
  assert.equal(f.calls.filter((call) => call.path.includes('/entries?')).length, 2)
})

test('plan inspection rejects changed plans, decision revisions and nonadvancing cursors', async () => {
  await assert.rejects(inspectStoragePlan(task, async () => ok({ ...page([]), planHash: 'new' })), { code: 'plan-stale' })
  await assert.rejects(inspectStoragePlan(task, async () => ok(page([], 0))), { code: 'invalid-page' })
  await assert.rejects(inspectStoragePlan(task, async (path) => path.includes('/entries?') ? ok(page([])) : ok({ task: { ...task, seq: 8, decisionRevision: 1 } })), { code: 'plan-stale' })
})

test('plan inspection accepts heartbeat-only changes and captures the displayed partial hash', async () => {
  const snapshot = { ...task, unmigratedSetHash: 'shown' }
  const summary = await inspectStoragePlan(snapshot, async (path) => path.includes('/entries?')
    ? ok({ ...page([{ id: 'legacy', status: 'unmigrated' }]), unmigratedSetHash: 'shown' })
    : ok({ task: { ...snapshot, seq: 999 } }), 'unmigrated')
  assert.equal(summary.unmigratedSetHash, 'shown')
  assert.equal(summary.unavailable.length, 1)
  const source = readFileSync(new URL('./StorageSettingsDialog.jsx', import.meta.url), 'utf8')
  assert.match(source, /unmigratedSetHash: saved\.unmigratedSetHash/)
  assert.doesNotMatch(source, /unmigratedSetHash: task\.unmigratedSetHash/)
})

test('controller reopens by discovering Host task and closes without cancelling', async () => {
  const f = fixture()
  const first = createStorageController(f.request)
  await first.refresh()
  assert.equal(first.snapshot().task.id, task.id)
  first.dispose()
  const reopened = createStorageController(f.request)
  await reopened.refresh()
  assert.equal(reopened.snapshot().task.id, task.id)
  assert.equal(f.calls.filter((call) => call.options?.method === 'POST').length, 0)
  reopened.dispose()
})

test('controller keeps operation errors after a successful polling refresh', async () => {
  const f = fixture()
  const controller = createStorageController((path, options) => options?.method === 'POST'
    ? Promise.resolve({ ok: false, status: 409, body: { error: 'plan-stale', message: 'changed' } }) : f.request(path))
  await controller.refresh()
  assert.equal(await controller.send('/tasks/task-1/confirm', {}), null)
  await controller.refresh()
  assert.equal(controller.snapshot().error.code, 'plan-stale')
  controller.dismissError()
  assert.equal(controller.snapshot().error, null)
  controller.dispose()
})

test('rapid duplicate mutations submit once and refresh the new revision', async () => {
  const f = fixture()
  let release
  let writes = 0
  const controller = createStorageController(async (path, options) => {
    if (options?.method === 'POST') { writes += 1; await new Promise((resolve) => { release = resolve }) }
    return f.request(path, options)
  })
  await controller.refresh()
  const pending = controller.send('/tasks/task-1/decisions', { action: 'skip' })
  assert.equal(await controller.send('/tasks/task-1/decisions', { action: 'overwrite' }), null)
  release()
  await pending
  assert.equal(writes, 1)
  assert.equal(controller.snapshot().task.seq, 8)
  assert.equal(controller.snapshot().busy, false)
  controller.dispose()
})

test('changing page during a read discards the old page and fetches the requested page', async () => {
  const f = fixture(Array.from({ length: 201 }, (_, i) => entry(String(i))))
  let release
  let held = false
  const controller = createStorageController(async (path, options) => {
    if (held && path.includes('/entries?') && path.includes('cursor=0')) {
      held = false
      await new Promise((resolve) => { release = resolve })
    }
    return f.request(path, options)
  })
  await controller.refresh()
  held = true
  const pending = controller.refresh()
  while (!release) await tick()
  controller.setView({ cursor: 200 })
  release()
  await pending
  await tick()
  assert.equal(controller.snapshot().cursor, 200)
  assert.deepEqual(controller.snapshot().entries.entries.map((row) => row.id), ['200'])
  controller.dispose()
})

test('late responses after dispose cannot publish UI state', async () => {
  let release
  const controller = createStorageController(() => new Promise((resolve) => { release = resolve }))
  let updates = 0
  controller.subscribe(() => { updates += 1 })
  const pending = controller.refresh()
  controller.dispose()
  release(ok({ activeTask: null }))
  await pending
  assert.equal(updates, 0)
})

test('dialog review gates cover all actions, immutable tokens, focus and unavailable entries', () => {
  const source = readFileSync(new URL('./StorageSettingsDialog.jsx', import.meta.url), 'utf8')
  for (const action of ['overwrite', 'skip', 'keep-both', 'start', 'partial']) assert.ok(source.includes(`review('${action}'`), action)
  assert.match(source, /saved\.scope\.conflictSetHash/)
  assert.match(source, /confirmation\.scope\.unresolved > 0/)
  assert.match(source, /saved\.entry\.fingerprint/)
  assert.match(source, /trigger\.focus\?\.\(\)/)
  assert.match(source, /closeButton\.current\?\.focus\(\)/)
  assert.doesNotMatch(source, /const phases =|<select\b/)
})
