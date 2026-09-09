import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetsRuntime } from './storage-runtime.js'
import { MigrationService } from './storage-migration.js'
import { SafeStorageFS } from './storage-fs.js'
import { createAssetsDispatcher } from './http-routes.js'

const base = fileURLToPath(new URL('./.storage-test-', import.meta.url))
async function fixture(t) {
  const dir = mkdtempSync(base)
  const home = join(dir, 'home')
  const target = join(dir, 'target')
  mkdirSync(target)
  const runtime = new AssetsRuntime(home)
  const service = new MigrationService(runtime)
  t.after(() => { runtime.dispose(); rmSync(dir, { recursive: true, force: true }) })
  await runtime.initialize()
  assert.equal(runtime.status().availability, 'online', JSON.stringify(runtime.status()))
  return { dir, home, target, runtime, service }
}
async function plan(service, target) {
  await service.preflight(target, service.runtime.config.epoch, 'request-1')
  await service.running
  assert.equal(service.task.state, 'awaiting_confirmation', JSON.stringify(service.task.error))
}
async function confirm(service) {
  await service.confirm(service.task.id, { planHash: service.plan.planHash, expectedSeq: service.task.seq, confirm: true })
  await service.running
}

test('empty library adopts target content without copying or changing inode', async (t) => {
  const { target, runtime, service } = await fixture(t)
  const path = join(target, '中文素材.txt')
  writeFileSync(path, 'original')
  const before = statSync(path)
  await plan(service, target)
  await confirm(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(runtime.config.active.path, target)
  assert.equal(statSync(path).ino, before.ino)
  assert.equal((await runtime.bundle.library.list())[0].files[0].ownership, 'adopted')
  await runtime.bundle.library.remove((await runtime.bundle.library.list())[0].id)
  assert.equal(readFileSync(path, 'utf8'), 'original')
})

test('copy source, reuse identical target, preserve independent source record', async (t) => {
  const { dir, target, runtime, service } = await fixture(t)
  const input = join(dir, 'source.txt')
  writeFileSync(input, 'identical-content')
  await runtime.write(({ library }) => library.add({ name: 'source', files: [input] }))
  writeFileSync(join(target, 'same.txt'), 'identical-content')
  const sourceFile = (await runtime.bundle.library.getView('source')).files[0].real_path
  const timestamp = new Date('2020-01-01T00:00:00Z')
  utimesSync(sourceFile, timestamp, timestamp)
  utimesSync(join(target, 'same.txt'), timestamp, timestamp)
  await plan(service, target)
  assert.equal(service.plan.entries[0].operation, 'reuse')
  await confirm(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  const source = await runtime.bundle.library.getView('source')
  assert.equal(source.files[0].relative_path, 'same.txt')
  assert.equal(readFileSync(input, 'utf8'), 'identical-content')
  assert.equal((await runtime.bundle.library.list()).length, 2)
})

test('skip never points source reference to different target bytes', async (t) => {
  const { dir, target, runtime, service } = await fixture(t)
  const input = join(dir, 'item.txt')
  writeFileSync(input, 'source')
  const asset = await runtime.write(({ library }) => library.add({ name: 'source', files: [input] }))
  const rel = asset.files[0].relative_path
  mkdirSync(join(target, rel, '..'), { recursive: true })
  writeFileSync(join(target, rel), 'target')
  await plan(service, target)
  const entry = service.plan.entries[0]
  await service.decide(service.task.id, { planHash: service.plan.planHash, entries: [{ id: entry.id, action: 'skip', expectedFingerprint: entry.fingerprint }] })
  await confirm(service)
  assert.equal(service.task.state, 'awaiting_partial', JSON.stringify(service.task.error))
  await service.acceptPartial(service.task.id, { confirm: true, planHash: service.plan.planHash, unmigratedSetHash: service.task.unmigratedSetHash })
  await service.running
  assert.equal(service.task.state, 'completed_with_skips', JSON.stringify(service.task.error))
  const view = await runtime.bundle.library.getView(asset.id)
  assert.equal(view.files.length, 0)
  assert.equal(view.unavailable_files[0].status, 'unmigrated')
  assert.equal(readFileSync(join(target, rel), 'utf8'), 'target')
})

test('overwrite retains adopted old content in a referenced version', async (t) => {
  const { dir, target, runtime, service } = await fixture(t)
  const input = join(dir, 'item.txt')
  writeFileSync(input, 'new-content')
  const asset = await runtime.write(({ library }) => library.add({ name: 'source', files: [input] }))
  const rel = asset.files[0].relative_path
  mkdirSync(join(target, rel, '..'), { recursive: true })
  writeFileSync(join(target, rel), 'old-content')
  await plan(service, target)
  const entry = service.plan.entries[0]
  await service.decide(service.task.id, { planHash: service.plan.planHash, conflictSetHash: service.plan.conflictSetHash, action: 'overwrite' })
  await confirm(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(readFileSync(join(target, rel), 'utf8'), 'new-content')
  const adopted = (await runtime.bundle.library.list()).find((row) => row.source === 'adopted')
  assert.equal(readFileSync(adopted.files[0].real_path, 'utf8'), 'old-content')
  assert.match(adopted.files[0].relative_path, /^\.omnimux-assets\/versions\//)
  assert.equal((await service.receipt(entry)).phase, 'installed_verified')
})

test('root commit interruption rolls forward from durable intent on new runtime', async (t) => {
  const { home, target, runtime, service } = await fixture(t)
  writeFileSync(join(target, 'sample.txt'), 'sample')
  await plan(service, target)
  service.fault = async (phase) => { if (phase === 'ledger_artifacts.json') throw new Error('injected crash') }
  await confirm(service)
  assert.equal(service.task.state, 'recovery_required')
  const closed = new Promise((resolve) => runtime.fs.child.once('exit', resolve))
  runtime.dispose()
  await closed
  const restarted = new AssetsRuntime(home)
  new MigrationService(restarted)
  t.after(() => restarted.dispose())
  await restarted.initialize()
  assert.equal(restarted.status().availability, 'online', JSON.stringify(restarted.status()))
  assert.equal(restarted.config.active.path, target)
  assert.equal(restarted.migration.task.state, 'completed')
})

test('freeze blocks HTTP mutations and releases after unconfirmed abandon', async (t) => {
  const { target, runtime, service } = await fixture(t)
  const dispatcher = createAssetsDispatcher({ runtime })
  await plan(service, target)
  await runtime.freeze(service.task.id)
  const result = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/assets/library', body: { name: 'blocked' } })
  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'storage-busy')
  await service.abandon(service.task.id, { confirm: true })
  assert.equal(runtime.frozen, null)
})

test('unsafe root, parent-child roots, and malformed target ledgers are rejected', async (t) => {
  const { dir, target, runtime, service } = await fixture(t)
  const link = join(dir, 'link')
  symlinkSync(target, link)
  await assert.rejects(service.preflight(link, 0, 'link'), { code: 'path-denied' })
  const child = join(runtime.config.active.path, 'child')
  mkdirSync(child)
  await service.preflight(child, 0, 'nested')
  await service.running
  assert.equal(service.task.error.code, 'path-denied')
  await service.abandon(service.task.id, { confirm: true })
  writeFileSync(join(target, 'library.json'), '{broken')
  await service.preflight(target, 0, 'broken')
  await service.running
  assert.equal(service.task.error.code, 'ledger-corrupt')
})

test('terminal migration cannot replay old ledgers after a new write', async (t) => {
  const { target, runtime, service } = await fixture(t)
  await plan(service, target)
  await confirm(service)
  assert.equal(service.task.state, 'completed')
  await runtime.write(({ library }) => library.add({ name: 'after-commit' }))
  await assert.rejects(service.resume(service.task.id), { code: 'storage-busy' })
  await assert.rejects(service.pause(service.task.id), { code: 'storage-busy' })
  assert.equal((await runtime.bundle.library.list())[0].name, 'after-commit')
})

test('install intent interruption before rename resumes without duplicate content', async (t) => {
  const { dir, target, runtime, service } = await fixture(t)
  const input = join(dir, 'source.txt')
  writeFileSync(input, 'payload')
  const asset = await runtime.write(({ library }) => library.add({ name: 'payload', files: [input] }))
  await plan(service, target)
  service.fault = async (phase) => { if (phase === 'installing') throw new Error('interrupt before install') }
  await confirm(service)
  assert.equal(service.task.state, 'failed_recoverable')
  service.fault = async () => {}
  await service.resume(service.task.id)
  await service.running
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(readFileSync((await runtime.bundle.library.getView(asset.id)).files[0].real_path, 'utf8'), 'payload')
})

test('resume after stale preflight cannot bypass validation', async (t) => {
  const { target, service } = await fixture(t)
  writeFileSync(join(target, 'item.txt'), 'before')
  await plan(service, target)
  writeFileSync(join(target, 'item.txt'), 'after')
  await confirm(service)
  assert.equal(service.task.error.code, 'plan-stale')
  await service.resume(service.task.id)
  await service.running
  assert.equal(service.task.error.code, 'plan-stale')
  assert.equal(service.runtime.config.epoch, 0)
  assert.equal(readFileSync(join(target, 'item.txt'), 'utf8'), 'after')
})

test('missing registered ledger fails closed and is not recreated', async (t) => {
  const { runtime } = await fixture(t)
  const ledger = join(runtime.config.active.path, 'library.json')
  rmSync(ledger)
  await assert.rejects(runtime.write(({ library }) => library.add({ name: 'lost' })), { code: 'storage-offline' })
  assert.throws(() => statSync(ledger), { code: 'ENOENT' })
})

test('target control namespace and trailing-slash root symlink are refused', async (t) => {
  const { dir, target, service } = await fixture(t)
  const link = join(dir, 'alias')
  symlinkSync(target, link)
  await assert.rejects(service.preflight(`${link}/`, 0, 'alias'), { code: 'path-denied' })
  mkdirSync(join(target, '.omnimux-assets'))
  writeFileSync(join(target, '.omnimux-assets', 'personal.txt'), 'untouched')
  await service.preflight(target, 0, 'reserved')
  await service.running
  assert.equal(service.task.error.code, 'reserved-name-conflict')
  assert.equal(readFileSync(join(target, '.omnimux-assets', 'personal.txt'), 'utf8'), 'untouched')
})

test('helper rejects traversal and internal symbolic links without touching sentinel', async (t) => {
  const { dir, target } = await fixture(t)
  const fs = new SafeStorageFS()
  t.after(() => fs.dispose())
  writeFileSync(join(dir, 'sentinel'), 'outside')
  symlinkSync(join(dir, 'sentinel'), join(target, 'escape'))
  await assert.rejects(fs.hash(target, '../sentinel'), { code: 'path-denied' })
  const scan = await fs.scan(target)
  assert.equal(scan.excluded.length, 1)
  assert.equal(readFileSync(join(dir, 'sentinel'), 'utf8'), 'outside')
})
