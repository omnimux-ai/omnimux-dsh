import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, statSync, utimesSync, chmodSync, existsSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { AssetsRuntime } from './storage-runtime.js'
import { MigrationService } from './storage-migration.js'

async function fixture(t, paths = ['a.png']) {
  const dir = mkdtempSync(join(tmpdir(), 'assets-final-qa-'))
  const target = join(dir, 'target'); mkdirSync(target)
  const runtimes = []
  const start = async () => {
    const runtime = new AssetsRuntime(join(dir, 'home'))
    const service = new MigrationService(runtime); runtimes.push(runtime)
    await runtime.initialize(); assert.equal(runtime.error, null)
    return { runtime, service }
  }
  const { runtime, service } = await start()
  t.after(async () => {
    for (const r of runtimes) {
      const child = r.fs.child
      const ended = child && child.exitCode === null && child.signalCode === null ? once(child, 'exit') : null
      r.dispose(); if (ended) await ended
    }
    rmSync(dir, { recursive: true, force: true })
  })
  const source = runtime.config.active.path
  const assets = paths.map((rel, i) => {
    mkdirSync(join(source, rel, '..'), { recursive: true }); writeFileSync(join(source, rel), `SOURCE-${i}`)
    return { id: `asset${i}`, name: `QA ${i}`, type: 'custom', tags: ['retain'], description: 'semantic record', cover_file_id: `file${i}`, files: [{ id: `file${i}`, relative_path: rel, ownership: 'managed' }] }
  })
  const ledger = (root, name, value) => runtime.fs.atomicJson(root, name, value)
  await ledger(source, 'library.json', { schema: 3, revision: 1, migrated_mappings: true, assets, file_inventory: [] })
  const preflight = async () => { await service.preflight(target, 0, 'qa'); await service.running; assert.equal(service.task.state, 'awaiting_confirmation', JSON.stringify(service.task.error)) }
  const confirm = async () => { await service.confirm(service.task.id, { confirm: true, planHash: service.plan.planHash, expectedDecisionRevision: service.task.decisionRevision }); await service.running }
  const decide = (entries) => service.decide(service.task.id, { planHash: service.plan.planHash, expectedDecisionRevision: service.task.decisionRevision, entries })
  return { dir, runtime, service, source, target, start, ledger, preflight, confirm, decide }
}

for (const mode of ['same-inode', 'external-inode']) test(`QA-DIR01 directory install lost receipt restart ${mode}`, async (t) => {
  const f = await fixture(t, ['中文/deep/a.png']); chmodSync(join(f.source, '中文'), 0o750); utimesSync(join(f.source, '中文'), 91, 91)
  await f.preflight()
  const request = f.runtime.fs.request.bind(f.runtime.fs)
  f.runtime.fs.request = async (op, args, ...rest) => {
    const result = await request(op, args, ...rest)
    if (op === 'install_directory' && args.rel === '中文') throw new Error('QA lost successful directory installation response')
    return result
  }
  await f.confirm(); assert.equal(f.service.task.state, 'failed_recoverable')
  if (mode === 'external-inode') {
    renameSync(join(f.target, '中文'), join(f.target, 'retained-owned'))
    mkdirSync(join(f.target, '中文'), { mode: 0o755 }); utimesSync(join(f.target, '中文'), 51, 51)
  }
  const end = once(f.runtime.fs.child, 'exit'); f.runtime.dispose(); await end
  const { runtime, service } = await f.start()
  await service.resume(service.task.id); await service.running
  if (mode === 'same-inode') {
    assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
    assert.equal(statSync(join(f.target, '中文')).mode & 0o777, 0o750)
    assert.equal(statSync(join(f.target, '中文')).mtimeMs, 91000)
    assert.equal(readFileSync(join(f.target, '中文/deep/a.png'), 'utf8'), 'SOURCE-0')
  } else {
    assert.equal(service.task.state, 'failed_recoverable')
    assert.equal(service.task.error.code, 'plan-stale'); assert.equal(runtime.config.epoch, 0)
    assert.equal(statSync(join(f.target, '中文')).mtimeMs, 51000)
    assert.equal(existsSync(join(f.target, '中文/deep/a.png')), false)
  }
})

for (const phase of ['verifying', 'commit_intent', 'before_root']) test(`QA-DIR02 created empty directory mode edit at ${phase} must block publication`, async (t) => {
  const f = await fixture(t, [])
  mkdirSync(join(f.source, 'empty'), { mode: 0o750 })
  await f.ledger(f.source, 'library.json', { schema: 3, revision: 2, assets: [{ id: 'empty', name: 'empty', files: [{ id: 'dir', relative_path: 'empty', ownership: 'managed' }] }] })
  await f.preflight()
  f.service.fault = async (step) => { if (step === phase) chmodSync(join(f.target, 'empty'), 0o711) }
  await f.confirm()
  assert.equal(f.runtime.config.epoch, 0, `published after external directory mode edit: ${f.service.task.state}`)
  assert.equal(statSync(join(f.target, 'empty')).mode & 0o777, 0o711)
})

test('QA-AUTH01 batch overwrite excludes structure and hardlink, stale revision cannot authorize', async (t) => {
  const f = await fixture(t, ['a.png', 'folder/b.png', 'hard.png'])
  writeFileSync(join(f.target, 'a.png'), 'TARGET-A'); writeFileSync(join(f.target, 'folder'), 'BLOCKER')
  writeFileSync(join(f.target, 'hard.png'), 'HARD'); linkSync(join(f.target, 'hard.png'), join(f.dir, 'external-hardlink'))
  await f.preflight()
  await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, expectedDecisionRevision: 0, conflictSetHash: f.service.plan.conflictSetHash, action: 'overwrite' })
  assert.equal(Object.keys(f.service.decisions).length, 1)
  await assert.rejects(f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, expectedDecisionRevision: 0, conflictSetHash: f.service.plan.conflictSetHash, action: 'skip' }), { code: 'plan-stale' })
  await assert.rejects(f.confirm(), { code: 'conflict-required' })
  const rows = f.service.plan.entries.filter((e) => e.operation !== 'conflict')
  await f.decide(rows.map((e) => ({ id: e.id, action: 'skip', expectedFingerprint: e.fingerprint })))
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial')
  assert.equal(readFileSync(join(f.target, 'folder'), 'utf8'), 'BLOCKER')
  assert.equal(readFileSync(join(f.dir, 'external-hardlink'), 'utf8'), 'HARD')
  await assert.rejects(f.service.acceptPartial(f.service.task.id, { confirm: true, planHash: f.service.plan.planHash, unmigratedSetHash: 'wrong' }), { code: 'plan-stale' })
})

test('QA-REF01 skip preserves target bytes and source unavailable refs through partial commit', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.target, 'a.png'), 'TARGET')
  await f.preflight(); const entry = f.service.plan.entries[0]
  await f.decide([{ id: entry.id, action: 'skip', expectedFingerprint: entry.fingerprint }]); await f.confirm()
  const shown = f.service.entries(f.service.task.id, { kind: 'unmigrated' })
  await f.service.acceptPartial(f.service.task.id, { confirm: true, planHash: shown.planHash, unmigratedSetHash: shown.unmigratedSetHash }); await f.service.running
  assert.equal(f.service.task.state, 'completed_with_skips')
  const asset = await f.runtime.read((b) => b.library.getView('asset0'))
  assert.equal(asset.files.length, 0); assert.equal(asset.unavailable_files.length, 1)
  assert.equal(asset.unavailable_files[0].relative_path, undefined)
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'SOURCE-0')
  assert.equal(readFileSync(join(f.target, 'a.png'), 'utf8'), 'TARGET')
})

for (const ref of ['asset://custom/a.png', 'asset0']) test(`QA-GC01 deleting sole library record must preserve artifact input ${ref}`, async (t) => {
  const f = await fixture(t, ['a.png', 'output.png'])
  await f.ledger(f.source, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'artifact', content_ref: 'output.png', input_refs: [ref] }] })
  await f.preflight(); await f.confirm(); assert.equal(f.service.task.state, 'completed')
  const result = await f.runtime.write((b) => b.library.remove('asset0'))
  assert.equal(existsSync(join(f.target, 'a.png')), true, `artifact input deleted: ${JSON.stringify(result)}`)
  assert.equal(readFileSync(join(f.target, 'a.png'), 'utf8'), 'SOURCE-0')
})

test('QA-GC02 adopted removal and managed directory replacement never remove an external inode', async (t) => {
  const f = await fixture(t, []); writeFileSync(join(f.target, '客户.png'), 'CUSTOMER')
  await f.preflight(); await f.confirm(); assert.equal(f.service.task.state, 'completed')
  const asset = (await f.runtime.read((b) => b.library.list()))[0]
  await f.runtime.write((b) => b.library.remove(asset.id))
  assert.equal(readFileSync(join(f.target, '客户.png'), 'utf8'), 'CUSTOMER')
  const original = join(f.dir, 'original.png'); writeFileSync(original, 'managed')
  const managed = await f.runtime.write((b) => b.library.add({ name: 'managed', files: [original] }))
  const container = join(f.target, 'data/files', managed.id)
  renameSync(container, `${container}-retained`); mkdirSync(container)
  const externalInode = statSync(container).ino
  await f.runtime.write((b) => b.library.remove(managed.id))
  assert.equal(existsSync(container), true, `externally replaced empty directory inode ${externalInode} removed`)
  assert.equal(statSync(container).ino, externalInode)
})

test('QA-REF02 target existing unavailable lineage remains unchanged without claiming source partial', async (t) => {
  const f = await fixture(t, [])
  writeFileSync(join(f.target, 'out.png'), 'output')
  await f.ledger(f.target, 'library.json', { schema: 3, revision: 1, assets: [{ id: 'missing', name: 'missing', files: [{ id: 'missing-file', status: 'unmigrated', recovery_ref: { taskId: 'old-task', entryId: 'old-entry' } }] }] })
  await f.ledger(f.target, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'target-art', content_ref: 'out.png', input_refs: ['missing'] }] })
  await f.preflight(); await f.confirm()
  const after = await f.service.buildLedgers()
  assert.equal(f.service.task.state, 'completed')
  assert.deepEqual(after['artifacts.json'].artifacts.find((a) => a.id === 'target-art').input_refs, ['missing'])
  assert.equal(after['library.json'].assets.find((a) => a.id === 'missing').files[0].status, 'unmigrated')
  assert.equal(readFileSync(join(f.target, 'out.png'), 'utf8'), 'output')
})

test('QA-REF03 both source and target bare namespace ambiguity block before media writes', async (t) => {
  for (const origin of ['source', 'target']) {
    const f = await fixture(t); const root = f[origin]
    await f.ledger(root, 'library.json', { schema: 3, revision: 1, assets: [{ id: 'same', name: 'same', files: [] }] })
    await f.ledger(root, 'mappings.json', { schema: 2, revision: 1, mappings: [{ id: 'same', status: 'unmigrated' }] })
    await f.ledger(root, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: ['same'] }] })
    await f.preflight(); await assert.rejects(f.confirm(), { code: 'conflict-required' })
    assert.equal(f.runtime.config.epoch, 0)
    assert.ok(f.service.plan.blockers.some((b) => b.origin === origin && b.reason.includes('ambiguous')))
  }
})
