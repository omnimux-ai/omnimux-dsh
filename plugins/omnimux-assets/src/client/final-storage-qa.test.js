import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { AssetsRuntime } from '../storage-runtime.js'
import { MigrationService } from '../storage-migration.js'
import { createAssetsDispatcher, registerAssetsRoutes } from '../http-routes.js'
import { createStorageController, inspectStoragePlan } from './use-storage-task.js'

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'assets-client-final-qa-'))
  const runtime = new AssetsRuntime(join(dir, 'home')); const migration = new MigrationService(runtime)
  await runtime.initialize(); assert.equal(runtime.error, null)
  const source = runtime.config.active.path; const target = join(dir, 'target'); mkdirSync(target)
  writeFileSync(join(source, 'a.png'), 'SOURCE'); writeFileSync(join(target, 'a.png'), 'TARGET')
  await runtime.fs.atomicJson(source, 'library.json', { schema: 3, revision: 1, migrated_mappings: true, assets: [{ id: 'a', name: 'a', files: [{ id: 'f', relative_path: 'a.png', ownership: 'managed' }] }] })
  let handler
  registerAssetsRoutes({ register: (r) => { handler = r.handler; return () => {} } }, createAssetsDispatcher({ runtime }))
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const request = async (path, options = {}) => {
    const response = await fetch(origin + path, { ...options, ...(options.body ? { body: JSON.stringify(options.body) } : {}), headers: { 'Content-Type': 'application/json', Origin: origin, ...options.headers } })
    return { status: response.status, ok: response.ok, body: await response.json() }
  }
  const controllers = []
  const open = () => { const c = createStorageController(request); controllers.push(c); return c }
  t.after(async () => {
    controllers.forEach((c) => c.dispose()); server.closeAllConnections(); await new Promise((r) => server.close(r))
    const stopped = once(runtime.fs.child, 'exit'); runtime.dispose(); await stopped; rmSync(dir, { recursive: true, force: true })
  })
  return { runtime, migration, source, target, request, open }
}

test('QA-UI01 actual HTTP controller plan partial review reopen and epoch refresh', async (t) => {
  const f = await fixture(t); const c = f.open(); await c.refresh()
  await c.send('/preflight', { targetPath: f.target, expectedEpoch: 0, requestId: 'qa' })
  await f.migration.running; await c.refresh()
  const task = c.snapshot().task
  assert.equal(task.state, 'awaiting_confirmation')
  const summary = await inspectStoragePlan(task, f.request); assert.equal(summary.ordinary, 1)
  const path = `/tasks/${task.id}`
  await c.send(path + '/decisions', { planHash: task.planHash, expectedDecisionRevision: task.decisionRevision, conflictSetHash: summary.conflictSetHash, action: 'skip' })
  await c.refresh(); const decided = c.snapshot().task
  await c.send(path + '/confirm', { confirm: true, planHash: decided.planHash, expectedDecisionRevision: decided.decisionRevision })
  await f.migration.running; c.dispose()
  const reopened = f.open(); await reopened.refresh()
  assert.equal(reopened.snapshot().task.state, 'awaiting_partial')
  const partial = await inspectStoragePlan(reopened.snapshot().task, f.request, 'unmigrated')
  assert.equal(partial.unavailable.length, 1)
  await reopened.send(path + '/accept-partial', { confirm: true, planHash: partial.planHash, unmigratedSetHash: 'stale' })
  assert.equal(reopened.snapshot().error.code, 'plan-stale')
  await reopened.send(path + '/accept-partial', { confirm: true, planHash: partial.planHash, unmigratedSetHash: partial.unmigratedSetHash })
  await f.migration.running; await reopened.refresh()
  assert.equal(reopened.snapshot().task.state, 'completed_with_skips'); assert.equal(reopened.snapshot().status.epoch, 1)
  assert.equal(readFileSync(join(f.target, 'a.png'), 'utf8'), 'TARGET')
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'SOURCE')
  assert.equal((await f.request('/omnimux/assets/library/preview?id=a&file=f&epoch=0')).status, 409)
})

test('QA-UI02 actual recoverable failure reports a nonzero visible error count', async (t) => {
  const f = await fixture(t); const c = f.open(); await c.refresh()
  await c.send('/preflight', { targetPath: f.target, expectedEpoch: 0, requestId: 'qa' })
  await f.migration.running; await c.refresh()
  const task = c.snapshot().task; const path = `/tasks/${task.id}`
  await c.send(path + '/decisions', { planHash: task.planHash, expectedDecisionRevision: task.decisionRevision, conflictSetHash: f.migration.plan.conflictSetHash, action: 'overwrite' })
  f.migration.fault = async (phase) => { if (phase === 'copying') throw new Error('QA synthetic storage failure') }
  await c.refresh(); const decided = c.snapshot().task
  await c.send(path + '/confirm', { confirm: true, planHash: decided.planHash, expectedDecisionRevision: decided.decisionRevision })
  await f.migration.running; await c.refresh()
  assert.equal(c.snapshot().task.state, 'failed_recoverable')
  assert.equal(c.snapshot().task.error.message, 'QA synthetic storage failure')
  assert.ok(c.snapshot().task.progress.errorCount >= 1, `failure displayed with ${c.snapshot().task.progress.errorCount} errors`)
})
