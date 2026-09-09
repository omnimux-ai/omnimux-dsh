import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetsRuntime } from './storage-runtime.js'
import { MigrationService } from './storage-migration.js'
import { SafeStorageFS } from './storage-fs.js'

async function fixture(t, overwrite = false, count = 1) {
  const dir = mkdtempSync(fileURLToPath(new URL('./.storage-recovery-', import.meta.url)))
  const target = join(dir, 'target'); mkdirSync(target)
  const runtime = new AssetsRuntime(join(dir, 'home'))
  const service = new MigrationService(runtime)
  t.after(() => { runtime.dispose(); rmSync(dir, { recursive: true, force: true }) })
  await runtime.initialize()
  for (let i = 0; i < count; i++) {
    const input = join(dir, `input${i}.txt`); writeFileSync(input, `source-${i}`)
    const asset = await runtime.write(({ library }) => library.add({ name: `asset${i}`, files: [input] }))
    if (overwrite) { const path = join(target, asset.files[0].relative_path); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, `target-${i}`) }
  }
  await service.preflight(target, 0, 'test'); await service.running
  assert.equal(service.task.state, 'awaiting_confirmation')
  if (overwrite) await service.decide(service.task.id, { planHash: service.plan.planHash, conflictSetHash: service.plan.conflictSetHash, action: 'overwrite' })
  return { dir, target, runtime, service }
}
async function confirm(service) {
  await service.confirm(service.task.id, { confirm: true, planHash: service.plan.planHash }); await service.running
}
async function resume(service) { service.fault = async () => {}; await service.resume(service.task.id); await service.running }
async function restart(t, runtime) {
  const exit = new Promise((resolve) => runtime.fs.child.once('exit', resolve)); runtime.dispose(); await exit
  const next = new AssetsRuntime(runtime.paths.home); new MigrationService(next); t.after(() => next.dispose()); await next.initialize(); return next
}

test('backup partial file retries without deleting unknown partial bytes', async (t) => {
  const { target, runtime, service } = await fixture(t, true)
  const copy = runtime.fs.copyVerify.bind(runtime.fs); let partial
  runtime.fs.copyVerify = async (entry, progress) => {
    if (entry.targetRel.includes('/versions/')) {
      partial = join(target, entry.targetRel); mkdirSync(join(partial, '..'), { recursive: true }); writeFileSync(partial, 'partial-unknown')
      runtime.fs.copyVerify = copy; throw new Error('copy interrupted')
    }
    return copy(entry, progress)
  }
  await confirm(service); await resume(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(readFileSync(partial, 'utf8'), 'partial-unknown')
})

test('abandon detects installed bytes with missing afterIdentity and restores them', async (t) => {
  const { target, runtime, service } = await fixture(t, true)
  const install = runtime.fs.install.bind(runtime.fs)
  runtime.fs.install = async (entry) => { const result = await install(entry); runtime.fs.install = install; throw new Error('lost install response') }
  await confirm(service)
  const entry = service.plan.entries[0]
  assert.equal((await service.receipt(entry)).phase, 'installing')
  await service.abandon(service.task.id, { confirm: true })
  assert.equal(readFileSync(join(target, entry.targetRel), 'utf8'), 'target-0')
})

test('abandon compensation interrupted after restore can retry and restores marker', async (t) => {
  const { target, runtime, service } = await fixture(t, true)
  service.fault = async (phase) => { if (phase === 'verifying') throw new Error('stop before commit') }
  await confirm(service); service.fault = async () => {}
  const install = runtime.fs.install.bind(runtime.fs)
  runtime.fs.install = async (entry) => { await install(entry); runtime.fs.install = install; throw new Error('lost restore response') }
  await assert.rejects(service.abandon(service.task.id, { confirm: true }))
  await service.abandon(service.task.id, { confirm: true })
  assert.equal(service.task.state, 'abandoned')
  assert.notEqual((await runtime.fs.readJson(target, '.omnimux-assets/root.json', true))?.state, 'pending')
})

for (const corrupt of [false, true]) test(`ready commit recovers with ${corrupt ? 'corrupt' : 'missing'} Home commit intent`, async (t) => {
  const { target, runtime, service } = await fixture(t)
  service.fault = async (phase) => { if (phase === 'before_root') throw new Error('root not switched') }
  await confirm(service)
  const path = join(service.control, service.taskPath('commit.json'))
  if (corrupt) writeFileSync(path, '{broken'); else rmSync(path)
  const next = await restart(t, runtime)
  assert.equal(next.status().availability, 'online', JSON.stringify(next.status()))
  assert.equal(next.config.active.path, target)
  assert.equal(next.migration.task.state, 'completed')
})

test('cleanup resumes each deletion and repeated confirmed manifest is idempotent', async (t) => {
  const { runtime, service } = await fixture(t, false, 2)
  await confirm(service); assert.equal(service.task.state, 'completed')
  service.task.retentionUntil = new Date(Date.now() - 1).toISOString(); await service.save()
  const preview = await service.cleanup(service.task.id)
  const unlink = runtime.fs.unlinkOwned.bind(runtime.fs); let n = 0
  runtime.fs.unlinkOwned = async (entry) => { await unlink(entry); if (++n === 1) throw new Error('lost delete response') }
  await assert.rejects(service.cleanup(service.task.id, preview.manifestHash, true))
  runtime.fs.unlinkOwned = unlink
  await service.cleanup(service.task.id, preview.manifestHash, true)
  await service.cleanup(service.task.id, preview.manifestHash, true)
  for (const entry of service.plan.entries) assert.equal(existsSync(join(service.plan.source.path, entry.sourceRel)), false)
})

test('cleanup holds freeze before asynchronous reference checks and preserves changed target', async (t) => {
  const { target, runtime, service } = await fixture(t)
  await confirm(service); service.task.retentionUntil = new Date(Date.now() - 1).toISOString()
  const preview = await service.cleanup(service.task.id)
  const hash = runtime.fs.hash.bind(runtime.fs); let checked = false
  runtime.fs.hash = async (...args) => {
    if (!checked) { checked = true; assert.equal(runtime.frozen, service.task.id, 'must freeze before first hash await') }
    return hash(...args)
  }
  await service.cleanup(service.task.id, preview.manifestHash, true)
  assert.equal(checked, true)
  assert.equal(runtime.frozen, null)
})

for (const kind of ['payload', 'versions']) test(`real SIGKILL during ${kind} copy recovers in a fresh worker`, async (t) => {
  const { target, runtime, service } = await fixture(t, kind === 'versions')
  const entry = service.plan.entries[0]
  // Enlarge only generated task samples, then replan to bind the new fingerprints.
  writeFileSync(join(service.plan.source.path, entry.sourceRel), Buffer.alloc(32 * 1024 * 1024, 65))
  if (kind === 'versions') writeFileSync(join(target, entry.targetRel), Buffer.alloc(32 * 1024 * 1024, 66))
  await service.abandon(service.task.id, { confirm: true })
  await service.preflight(target, 0, 'kill'); await service.running
  if (kind === 'versions') await service.decide(service.task.id, { planHash: service.plan.planHash, conflictSetHash: service.plan.conflictSetHash, action: 'overwrite' })
  const copy = runtime.fs.copyVerify.bind(runtime.fs); let killed = false
  runtime.fs.copyVerify = (args, progress) => copy(args, (value) => {
    progress?.(value)
    if (!killed && args.targetRel.includes(`/${kind}/`) && value.copyBytes > 0) { killed = true; runtime.fs.child.kill('SIGKILL') }
  })
  await confirm(service)
  assert.equal(killed, true)
  const next = new AssetsRuntime(runtime.paths.home); const recovered = new MigrationService(next)
  t.after(() => next.dispose()); await next.initialize()
  await recovered.resume(recovered.task.id); await recovered.running
  assert.equal(recovered.task.state, 'completed', JSON.stringify(recovered.task.error))
  assert.equal((await next.fs.hash(target, recovered.plan.entries[0].targetRel)).sha256, recovered.plan.entries[0].sourceFingerprint.sha256)
})

test('backup response loss before receipt reuses complete version', async (t) => {
  const { runtime, service } = await fixture(t, true)
  const copy = runtime.fs.copyVerify.bind(runtime.fs)
  runtime.fs.copyVerify = async (args, progress) => {
    const result = await copy(args, progress)
    if (args.targetRel.includes('/versions/')) { runtime.fs.copyVerify = copy; throw new Error('lost backup response') }
    return result
  }
  await confirm(service); await resume(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal((await service.receipt(service.plan.entries[0])).retained, undefined)
})

test('abandon refuses same-content external inode replacement', async (t) => {
  const { target, service } = await fixture(t, true)
  service.fault = async (phase) => { if (phase === 'verifying') throw new Error('pause') }
  await confirm(service); service.fault = async () => {}
  const file = join(target, service.plan.entries[0].targetRel)
  rmSync(file); writeFileSync(file, 'source-0')
  await assert.rejects(service.abandon(service.task.id, { confirm: true }), { code: 'plan-stale' })
  assert.equal(readFileSync(file, 'utf8'), 'source-0')
  assert.equal(service.task.state, 'abandoning')
})

test('fresh target can be planned again after compensated abandonment', async (t) => {
  const { target, service } = await fixture(t, true)
  service.fault = async (phase) => { if (phase === 'verifying') throw new Error('pause') }
  await confirm(service); service.fault = async () => {}
  await service.abandon(service.task.id, { confirm: true })
  await service.preflight(target, 0, 'again'); await service.running
  assert.equal(service.task.state, 'awaiting_confirmation', JSON.stringify(service.task.error))
})

test('ready without either commit copy fails closed without changing old pointer', async (t) => {
  const { target, runtime, service } = await fixture(t)
  service.fault = async (phase) => { if (phase === 'before_root') throw new Error('pause') }
  await confirm(service)
  rmSync(join(service.control, service.taskPath('commit.json')))
  rmSync(join(target, `.omnimux-assets/transactions/${service.task.id}/commit.json`))
  const next = await restart(t, runtime)
  assert.equal(next.status().availability, 'recovery-required')
  assert.equal(next.config.epoch, 0)
  assert.equal(JSON.parse(readFileSync(join(target, 'library.json'))).assets.length, 1)
})

test('postcommit recovery does not overwrite newer active ledger writes', async (t) => {
  const { runtime, service } = await fixture(t)
  await confirm(service)
  await runtime.write(({ library }) => library.add({ name: 'new-after-commit' }))
  service.task.state = 'committing'; await service.save()
  const next = await restart(t, runtime)
  assert.equal(next.status().availability, 'online')
  assert.ok((await next.bundle.library.list()).some((row) => row.name === 'new-after-commit'))
})

test('foreign target writer blocks confirmation without overwriting its marker', async (t) => {
  const { target, service } = await fixture(t)
  const other = new SafeStorageFS(); t.after(() => other.dispose())
  const lease = await other.lock(target)
  await confirm(service)
  assert.equal(service.task.error.code, 'storage-busy')
  assert.equal(await other.readJson(target, '.omnimux-assets/root.json', true), null)
  await other.unlock(lease); await resume(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
})

test('marker write interruption resumes and restores pending ownership', async (t) => {
  const { target, runtime, service } = await fixture(t)
  const json = runtime.fs.atomicJson.bind(runtime.fs)
  runtime.fs.atomicJson = async (root, rel, value) => {
    if (root === target && rel === '.omnimux-assets/root.json') { runtime.fs.atomicJson = json; throw new Error('marker write interrupted') }
    return json(root, rel, value)
  }
  await confirm(service); await resume(service)
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
})

test('cleanup rejects malformed and future retention without deleting source', async (t) => {
  const { service } = await fixture(t)
  await confirm(service)
  for (const retention of ['invalid', new Date(Date.now() + 86400000).toISOString()]) {
    service.task.retentionUntil = retention
    await assert.rejects(service.cleanup(service.task.id), { code: 'conflict-required' })
  }
  assert.equal(existsSync(join(service.plan.source.path, service.plan.entries[0].sourceRel)), true)
})

test('abandon restart resumes multi-entry compensation instead of copying again', async (t) => {
  const { target, runtime, service } = await fixture(t, true, 2)
  service.fault = async (phase) => { if (phase === 'verifying') throw new Error('pause') }
  await confirm(service)
  service.fault = async (phase) => { if (phase === 'compensation_applied') throw new Error('lost compensation receipt') }
  await assert.rejects(service.abandon(service.task.id, { confirm: true }))
  const next = await restart(t, runtime)
  await next.migration.resume(next.migration.task.id); await next.migration.running
  assert.equal(next.migration.task.state, 'abandoned', JSON.stringify(next.migration.task.error))
  for (const [i, entry] of next.migration.plan.entries.entries()) assert.equal(readFileSync(join(target, entry.targetRel), 'utf8'), `target-${i}`)
})

test('cleanup keeps referenced versions and excludes their connected source component', async (t) => {
  const { target, service } = await fixture(t, true)
  await confirm(service); service.task.retentionUntil = new Date(0).toISOString()
  const receipt = await service.receipt(service.plan.entries[0])
  const preview = await service.cleanup(service.task.id)
  assert.equal(preview.entries.length, 0)
  assert.equal(readFileSync(join(target, receipt.backupRel), 'utf8'), 'target-0')
})

test('cleanup target changes after confirmation are preserved rather than deleted', async (t) => {
  const { target, service } = await fixture(t)
  await confirm(service); service.task.retentionUntil = new Date(0).toISOString()
  const preview = await service.cleanup(service.task.id)
  service.fault = async (phase) => { if (phase === 'cleanup_deleting') writeFileSync(join(target, service.plan.entries[0].targetRel), 'external-new') }
  await assert.rejects(service.cleanup(service.task.id, preview.manifestHash, true), { code: 'plan-stale' })
  assert.equal(existsSync(join(service.plan.source.path, service.plan.entries[0].sourceRel)), true)
})

test('cleanup excludes unresolved connected siblings but permits independent success', async (t) => {
  const { runtime, service } = await fixture(t, false, 3)
  await confirm(service); service.task.retentionUntil = new Date(0).toISOString()
  const values = await runtime.fs.readJson(service.plan.target.path, 'artifacts.json')
  values.artifacts.push({ id: 'dependent', status: 'unmigrated', input_refs: [service.plan.sourceValues['library.json'].assets[0].id, service.plan.sourceValues['library.json'].assets[1].id] })
  await runtime.fs.atomicJson(service.plan.target.path, 'artifacts.json', values)
  const preview = await service.cleanup(service.task.id)
  assert.deepEqual(preview.entries.map((row) => row.entryId), [service.plan.entries[2].id])
  await service.cleanup(service.task.id, preview.manifestHash, true)
  assert.equal(existsSync(join(service.plan.source.path, service.plan.entries[0].sourceRel)), true)
  assert.equal(existsSync(join(service.plan.source.path, service.plan.entries[2].sourceRel)), false)
})
