import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, statSync, symlinkSync, chmodSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { AssetsRuntime } from './storage-runtime.js'
import { MigrationService } from './storage-migration.js'
import { createAssetsDispatcher } from './http-routes.js'

async function fixture(t, files = ['a.png']) {
  const dir = mkdtempSync(join(tmpdir(), 'assets-closeout-'))
  const target = join(dir, 'target'); mkdirSync(target)
  const runtime = new AssetsRuntime(join(dir, 'home')); const service = new MigrationService(runtime)
  await runtime.initialize()
  t.after(() => { runtime.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const source = runtime.config.active.path
  const assets = files.map((rel, index) => {
    mkdirSync(join(source, rel, '..'), { recursive: true }); writeFileSync(join(source, rel), `source-${index}`)
    return { id: `a${index}`, name: `asset ${index}`, files: [{ id: `f${index}`, relative_path: rel, ownership: 'managed' }] }
  })
  await runtime.fs.atomicJson(source, 'library.json', { schema: 3, revision: 1, assets, file_inventory: [] })
  const preflight = async () => { await service.preflight(target, 0, 'fixture'); await service.running; assert.equal(service.task.state, 'awaiting_confirmation', JSON.stringify(service.task.error)) }
  const confirm = async () => { await service.confirm(service.task.id, { confirm: true, planHash: service.plan.planHash, expectedDecisionRevision: service.task.decisionRevision }); await service.running }
  return { dir, target, runtime, service, source, preflight, confirm }
}

test('directory install before completion receipt survives restart with source metadata', async (t) => {
  const f = await fixture(t, ['folder/a.png'])
  chmodSync(join(f.source, 'folder'), 0o750); utimesSync(join(f.source, 'folder'), 100, 100)
  await f.preflight()
  const request = f.runtime.fs.request.bind(f.runtime.fs); let interrupted = false
  f.runtime.fs.request = async (op, args, ...rest) => {
    const result = await request(op, args, ...rest)
    if (!interrupted && ['mkdir', 'install_directory'].includes(op) && args.root === f.service.plan.target.path && args.rel === 'folder') {
      interrupted = true; throw new Error('directory installed before Host completion receipt')
    }
    return result
  }
  await f.confirm(); assert.equal(interrupted, true); assert.equal(f.service.task.state, 'failed_recoverable')
  const exit = once(f.runtime.fs.child, 'exit'); f.runtime.dispose(); await exit
  const runtime = new AssetsRuntime(join(f.dir, 'home')); const service = new MigrationService(runtime)
  t.after(() => runtime.dispose()); await runtime.initialize(); await service.resume(service.task.id); await service.running
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(statSync(join(f.target, 'folder')).mode & 0o777, 0o750)
  assert.equal(statSync(join(f.target, 'folder')).mtimeMs, 100000)
  assert.equal(readFileSync(join(f.target, 'folder/a.png'), 'utf8'), 'source-0')
})

test('directory recovery never claims an external replacement inode', async (t) => {
  const f = await fixture(t, ['folder/a.png']); await f.preflight()
  const request = f.runtime.fs.request.bind(f.runtime.fs)
  f.runtime.fs.request = async (op, args, ...rest) => {
    const result = await request(op, args, ...rest)
    if (op === 'install_directory' && args.rel === 'folder') throw new Error('interrupted reply')
    return result
  }
  await f.confirm(); renameSync(join(f.target, 'folder'), join(f.target, 'owned-retained'))
  mkdirSync(join(f.target, 'folder'), { mode: 0o755 }); utimesSync(join(f.target, 'folder'), 77, 77)
  f.runtime.fs.request = request; await f.service.resume(f.service.task.id); await f.service.running
  assert.equal(f.service.task.state, 'failed_recoverable'); assert.equal(f.service.task.error.code, 'plan-stale')
  assert.equal(statSync(join(f.target, 'folder')).mtimeMs, 77000)
  assert.equal(statSync(join(f.target, 'folder')).mode & 0o777, 0o755)
})

for (const change of ['mode', 'mtime', 'xattr']) test(`installed payload ${change}-only edit blocks commit without discarding changes`, async (t) => {
  const f = await fixture(t); await f.preflight()
  f.service.fault = async (phase) => {
    if (phase !== 'installed_verified') return
    const path = join(f.target, 'a.png')
    if (change === 'mode') chmodSync(path, 0o400)
    else if (change === 'mtime') utimesSync(path, 321, 321)
    else execFileSync('/usr/bin/xattr', ['-w', 'user.after-install', 'retain', path])
  }
  await f.confirm()
  assert.equal(f.service.task.state, 'failed_recoverable', JSON.stringify(f.service.task.error))
  assert.equal(f.service.task.error.code, 'plan-stale'); assert.equal(f.runtime.config.epoch, 0)
  assert.equal(readFileSync(join(f.target, 'a.png'), 'utf8'), 'source-0')
})

test('in-place directory external mtime edit blocks publication without restoring over it', async (t) => {
  const f = await fixture(t, ['folder/a.png']); mkdirSync(join(f.target, 'folder')); utimesSync(join(f.target, 'folder'), 55, 55)
  await f.preflight(); f.service.fault = async (phase) => { if (phase === 'installed_verified') utimesSync(join(f.target, 'folder'), 123, 123) }
  await f.confirm(); assert.equal(f.service.task.state, 'failed_recoverable'); assert.equal(f.service.task.error.code, 'plan-stale')
  assert.equal(statSync(join(f.target, 'folder')).mtimeMs, 123000); assert.equal(f.runtime.config.epoch, 0)
})

test('existing target directory mode and mtime survive child installation', async (t) => {
  const f = await fixture(t, ['folder/a.png']); mkdirSync(join(f.target, 'folder'), { mode: 0o751 }); utimesSync(join(f.target, 'folder'), 99, 99)
  await f.preflight(); await f.confirm()
  assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(statSync(join(f.target, 'folder')).mtimeMs, 99000)
  assert.equal(statSync(join(f.target, 'folder')).mode & 0o777, 0o751)
})

for (const origin of ['source', 'target']) for (const invalid of ['ambiguous', 'missing']) test(`${origin} bare ${invalid} input ref blocks before writes`, async (t) => {
  const f = await fixture(t); const root = origin === 'source' ? f.source : f.target
  await f.runtime.fs.atomicJson(root, 'library.json', { schema: 3, revision: 1, assets: [{ id: 'same', name: 'same', files: [] }] })
  await f.runtime.fs.atomicJson(root, 'mappings.json', { schema: 2, revision: 1, mappings: [{ id: 'same', real_path: '/unavailable' }] })
  await f.runtime.fs.atomicJson(root, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: [invalid === 'missing' ? 'absent' : 'same'] }] })
  await f.preflight(); assert.ok(f.service.plan.blockers.some((row) => row.origin === origin && row.reason.includes(invalid)))
  await assert.rejects(f.confirm(), { code: 'conflict-required' }); assert.equal(f.runtime.config.epoch, 0)
})

test('missing typed path is blocked and existing input-only typed payload is migrated', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.source, 'input.png'), 'input-only')
  await f.runtime.fs.atomicJson(f.source, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: ['asset://custom/input.png'] }] })
  await f.preflight(); assert.equal(f.service.plan.blockers.length, 0)
  await f.confirm(); assert.equal(f.service.task.state, 'completed')
  assert.equal(readFileSync(join(f.target, 'input.png'), 'utf8'), 'input-only')
  const missing = await fixture(t)
  await missing.runtime.fs.atomicJson(missing.source, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: ['asset://custom/missing.png'] }] })
  await missing.preflight(); assert.ok(missing.service.plan.blockers.some((row) => row.reason === 'missing typed input reference'))
})

test('source artifact dependencies propagate partial transitively while retaining original refs', async (t) => {
  const f = await fixture(t, ['a.png', 'b.png']); writeFileSync(join(f.target, 'a.png'), 'target')
  await f.runtime.fs.atomicJson(f.source, 'artifacts.json', { schema: 2, revision: 1, artifacts: [
    { id: 'child', content_ref: 'b.png', input_refs: ['parent'] },
    { id: 'parent', content_ref: 'b.png', input_refs: ['a0'] },
  ] })
  await f.preflight(); await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, conflictSetHash: f.service.plan.conflictSetHash, action: 'skip' })
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial', JSON.stringify(f.service.task.error))
  assert.deepEqual(new Set(f.service.task.unmigrated.filter((row) => row.ledger === 'artifacts.json').map((row) => row.recordId)), new Set(['parent', 'child']))
  const after = await f.service.buildLedgers()
  assert.deepEqual(after['artifacts.json'].artifacts[0].input_refs, ['parent'])
  assert.ok(after['artifacts.json'].artifacts.every((row) => row.status === 'unmigrated' && !row.content_ref))
})

test('version verification is counted once across restart and metadata tamper is rejected', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.target, 'a.png'), 'old-version')
  await f.preflight(); await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, conflictSetHash: f.service.plan.conflictSetHash, action: 'overwrite' })
  f.service.fault = async (phase) => { if (phase === 'ready') throw new Error('stop before commit') }
  await f.confirm()
  assert.equal(f.service.task.progress.versionVerifyBytes, 11)
  assert.equal(f.service.task.progress.verifyBytes, f.service.task.progress.totalVerifyBytes)
  await f.service.rebuildProgress(); assert.equal(f.service.task.progress.versionVerifyBytes, 11)
  const receipt = await f.service.receipt(f.service.plan.entries[0]); chmodSync(join(f.target, receipt.backupRel), 0o400)
  await assert.rejects(f.service.buildLedgers(), { code: 'plan-stale' })
})

for (const phase of ['commit_intent', 'ledger_library.json', 'before_root']) test(`metadata changed at ${phase} prevents root publication`, async (t) => {
  const f = await fixture(t); await f.preflight()
  f.service.fault = async (step) => { if (step === phase) chmodSync(join(f.target, 'a.png'), 0o400) }
  await f.confirm(); assert.equal(f.service.task.state, 'recovery_required'); assert.equal(f.runtime.config.epoch, 0)
  assert.equal((await f.runtime.fs.readJson(f.runtime.paths.controlDir, 'root.json')).epoch, 0)
})

test('decision pages survive heartbeat, reject changed revision, persist one atomic authorization across restart', async (t) => {
  const f = await fixture(t, Array.from({ length: 201 }, (_, i) => `${i}.png`))
  for (let i = 0; i < 201; i++) writeFileSync(join(f.target, `${i}.png`), `target-${i}`)
  await f.preflight()
  const token = { planHash: f.service.plan.planHash, decisionRevision: 0 }
  assert.equal(f.service.entries(f.service.task.id, { ...token, limit: 200 }).entries.length, 200)
  f.service.heartbeat()
  const last = f.service.entries(f.service.task.id, { ...token, cursor: 200 }).entries[0]
  assert.ok(last)
  const input = { planHash: token.planHash, expectedDecisionRevision: 0, conflictSetHash: f.service.plan.conflictSetHash, action: 'skip' }
  await f.service.decide(f.service.task.id, input)
  assert.equal(Object.keys(f.service.decisions).length, 201)
  assert.throws(() => f.service.entries(f.service.task.id, { ...token, cursor: 200 }), { code: 'plan-stale' })
  const home = f.runtime.paths.homeDir || join(f.dir, 'home')
  const exit = once(f.runtime.fs.child, 'exit'); f.runtime.dispose(); await exit
  const restarted = new AssetsRuntime(home); const recovered = new MigrationService(restarted)
  t.after(() => restarted.dispose()); await restarted.initialize()
  assert.equal(recovered.task.decisionRevision, 1)
  assert.equal(Object.keys(recovered.decisions).length, 201)
  await assert.rejects(recovered.decide(recovered.task.id, input), { code: 'plan-stale' })
})

test('task scoped preview streams exact source and target bytes and denies unknown side and entry', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.target, 'a.png'), 'target'); await f.preflight()
  const dispatch = createAssetsDispatcher({ runtime: f.runtime })
  for (const side of ['source', 'target']) {
    const result = await dispatch.dispatch({ url: `/omnimux/assets/storage/tasks/${f.service.task.id}/preview?entry=entry_0&side=${side}` })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    const chunks = []; for await (const chunk of result.stream.readable) chunks.push(chunk)
    assert.equal(Buffer.concat(chunks).toString(), side === 'source' ? 'source-0' : 'target')
    await result.stream.release()
  }
  await assert.rejects(f.service.preview(f.service.task.id, '../a.png', 'source'), { code: 'path-denied' })
  await assert.rejects(f.service.preview(f.service.task.id, 'entry_0', '../target'), { code: 'path-denied' })
})

test('partial includes no-entry legacy, external mapping and each excluded source; rejects a replaced set', async (t) => {
  const f = await fixture(t, [])
  await f.runtime.fs.atomicJson(f.source, 'library.json', { schema: 3, revision: 2, assets: [{ id: 'legacy', name: 'legacy', files: [{ id: 'old', real_path: '/never-open/legacy.png' }] }] })
  await f.runtime.fs.atomicJson(f.source, 'mappings.json', { schema: 2, revision: 1, mappings: [{ id: 'mapping', real_path: '/never-open/mapping' }] })
  symlinkSync('/never-open/link', join(f.source, 'excluded-link'))
  await f.preflight(); await f.confirm()
  assert.equal(f.service.task.state, 'awaiting_partial', JSON.stringify(f.service.task.error))
  const page = f.service.entries(f.service.task.id, { kind: 'unmigrated' })
  assert.equal(page.entries.length, 3)
  assert.deepEqual(new Set(page.entries.map((row) => row.ledger)), new Set(['library.json', 'mappings.json', null]))
  const accepted = page.unmigratedSetHash
  f.service.plan.exclusions.push({ origin: 'source', relative_path: 'new-exclusion' })
  await f.service.acceptPartial(f.service.task.id, { confirm: true, planHash: f.service.plan.planHash, unmigratedSetHash: accepted })
  await f.service.running
  assert.equal(f.service.task.state, 'awaiting_partial')
  assert.notEqual(f.service.task.unmigratedSetHash, accepted)
  assert.equal(f.runtime.config.epoch, 0)
})

test('structural parent keep-both applies one prefix to all leaves and resumes without another name', async (t) => {
  const f = await fixture(t, ['folder/a.png', 'folder/deep/b.png'])
  writeFileSync(join(f.target, 'folder'), 'original blocker'); await f.preflight()
  const entry = f.service.plan.entries[0]
  assert.equal(entry.groupEntries.length, 2)
  await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, expectedDecisionRevision: 0,
    entries: [{ id: entry.id, action: 'keep-both', newName: 'renamed', expectedFingerprint: entry.fingerprint }] })
  f.service.fault = async (phase) => { if (phase === 'installing') throw new Error('isolated interruption') }
  await f.confirm(); assert.equal(f.service.task.state, 'failed_recoverable')
  f.service.fault = async () => {}; await f.service.resume(f.service.task.id); await f.service.running
  assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(readFileSync(join(f.target, 'renamed/a.png'), 'utf8'), 'source-0')
  assert.equal(readFileSync(join(f.target, 'renamed/deep/b.png'), 'utf8'), 'source-1')
  assert.equal(readFileSync(join(f.target, 'folder'), 'utf8'), 'original blocker')
})

test('empty target shares a unique planned payload while preserving two semantic records', async (t) => {
  const f = await fixture(t, ['a.png', 'b.png'])
  writeFileSync(join(f.source, 'b.png'), 'source-0')
  const time = new Date('2020-01-01T00:00:00Z')
  for (const rel of ['a.png', 'b.png']) utimesSync(join(f.source, rel), time, time)
  await f.preflight()
  assert.deepEqual(f.service.plan.entries.map((row) => row.operation), ['copy', 'reuse'])
  let copies = 0; const copy = f.runtime.fs.copyVerify.bind(f.runtime.fs)
  f.runtime.fs.copyVerify = (...args) => { copies++; return copy(...args) }
  await f.confirm(); assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(copies, 1)
  const values = await f.runtime.fs.readJson(f.target, 'library.json')
  assert.equal(values.assets.length, 2)
  assert.equal(new Set(values.assets.map((asset) => asset.files[0].relative_path)).size, 1)
  assert.equal(readFileSync(join(f.source, 'b.png'), 'utf8'), 'source-0')
})

test('target-only xattr blocks overwrite, remains visible in partial and preserves attribute bytes', async (t) => {
  const f = await fixture(t); const target = join(f.target, 'a.png'); writeFileSync(target, 'original-target')
  execFileSync('/usr/bin/xattr', ['-w', 'user.omnimux-test', 'isolated-value', target])
  const before = statSync(target)
  await f.preflight(); assert.equal(f.service.plan.entries[0].reasonCode, 'metadata-unsupported')
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial')
  assert.equal(f.service.entries(f.service.task.id, { kind: 'unmigrated' }).entries[0].reasonCode, 'metadata-unsupported')
  assert.equal(readFileSync(target, 'utf8'), 'original-target'); assert.equal(statSync(target).ino, before.ino)
  assert.equal(execFileSync('/usr/bin/xattr', ['-p', 'user.omnimux-test', target], { encoding: 'utf8' }).trim(), 'isolated-value')
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'source-0')
})

test('target-only ACL is detected and not discarded by an overwrite', async (t) => {
  const f = await fixture(t); const target = join(f.target, 'a.png'); writeFileSync(target, 'original-target')
  execFileSync('/bin/chmod', ['+a', 'everyone allow read', target])
  const before = execFileSync('/bin/ls', ['-le', target], { encoding: 'utf8' }).split('\n').slice(1).join('\n')
  await f.preflight(); assert.equal(f.service.plan.entries[0].reasonCode, 'metadata-unsupported')
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial')
  assert.equal(execFileSync('/bin/ls', ['-le', target], { encoding: 'utf8' }).split('\n').slice(1).join('\n'), before)
  assert.equal(readFileSync(target, 'utf8'), 'original-target')
})

test('empty directory structure keep-both preserves directory mode and mtime', async (t) => {
  const f = await fixture(t, []); mkdirSync(join(f.source, 'empty'), { mode: 0o750 }); utimesSync(join(f.source, 'empty'), 100, 100)
  await f.runtime.fs.atomicJson(f.source, 'library.json', { schema: 3, revision: 1, assets: [{ id: 'dir', name: 'empty', files: [{ id: 'df', kind: 'directory', relative_path: 'empty' }] }] })
  writeFileSync(join(f.target, 'empty'), 'untouched'); await f.preflight()
  const entry = f.service.plan.entries[0]
  await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, entries: [{ id: entry.id, action: 'keep-both', newName: 'new-empty', expectedFingerprint: entry.fingerprint }] })
  await f.confirm(); assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(statSync(join(f.target, 'new-empty')).mtimeMs, 100000)
  assert.equal(statSync(join(f.target, 'new-empty')).mode & 0o777, 0o750)
  assert.equal(readFileSync(join(f.target, 'empty'), 'utf8'), 'untouched')
})

test('renamed destinations reject case aliases, new occupancy and oversized names', async (t) => {
  const f = await fixture(t); mkdirSync(join(f.target, 'a.png')); writeFileSync(join(f.target, 'Existing.png'), 'keep'); await f.preflight()
  const entry = f.service.plan.entries[0]
  const decide = (newName) => f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, entries: [{ id: entry.id, action: 'keep-both', newName, expectedFingerprint: entry.fingerprint }] })
  await assert.rejects(decide('existing.png'), { code: 'name-conflict' })
  await assert.rejects(decide('x'.repeat(300)), { code: 'name-conflict' })
  await decide('new.png'); writeFileSync(join(f.target, 'new.png'), 'external')
  await assert.rejects(f.confirm(), { code: 'name-conflict' })
  assert.equal(readFileSync(join(f.target, 'new.png'), 'utf8'), 'external')
})

test('receipt-derived logical counts do not accumulate across failed attempts and resume', async (t) => {
  const f = await fixture(t); await f.preflight()
  f.service.fault = async (phase) => { if (phase === 'installing') throw new Error('interrupt') }
  await f.confirm(); assert.equal(f.service.task.state, 'failed_recoverable')
  f.service.task.progress.copyBytes = 9000; f.service.task.progress.completedFiles = 999
  f.service.fault = async () => {}; await f.service.resume(f.service.task.id); await f.service.running
  assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(f.service.task.progress.completedFiles, 1)
  assert.equal(f.service.task.progress.copyBytes, 8)
  assert.equal(f.service.task.progress.attemptCopyBytes, 0)
})

test('volume budget merges same-volume Home and source reserves and refuses Home exhaustion before copying', async (t) => {
  const f = await fixture(t); await f.preflight()
  const space = f.service.task.summary.space
  assert.equal(space.length, 1); assert.deepEqual(new Set(space[0].roots.map((row) => row.role)), new Set(['target', 'home', 'source']))
  assert.ok(space[0].reserve >= 500 * 1024 * 1024)
  const identity = f.runtime.fs.identity.bind(f.runtime.fs)
  f.runtime.fs.identity = async (root) => ({ ...await identity(root), freeBytes: 1 })
  await assert.rejects(f.confirm(), { code: 'disk-space-insufficient' })
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'source-0')
  f.runtime.fs.identity = identity
})

test('ledger-specific IDs, cover file IDs, business fields and typed path refs survive overwrite', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.target, 'a.png'), 'old-target')
  const targetAsset = { id: 'a0', name: 'target name', type: 'character', description: 'description', tags: ['tag'], custom: { id: 'opaque' }, cover_file_id: 'f0', files: [{ id: 'f0', relative_path: 'a.png', ownership: 'adopted' }] }
  await f.runtime.fs.atomicJson(f.target, 'library.json', { schema: 3, revision: 1, assets: [targetAsset] })
  await f.runtime.fs.atomicJson(f.target, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: ['a0', 'asset://custom/a.png'], title: 'artifact' }] })
  await f.runtime.fs.atomicJson(f.target, 'mappings.json', { schema: 2, revision: 1, mappings: [{ id: 'mapping0', relative_path: 'a.png' }] })
  await f.preflight()
  await f.service.decide(f.service.task.id, { planHash: f.service.plan.planHash, conflictSetHash: f.service.plan.conflictSetHash, action: 'overwrite' })
  await f.confirm(); assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  const library = await f.runtime.fs.readJson(f.target, 'library.json')
  const target = library.assets[1]
  assert.notEqual(target.id, 'a0'); assert.notEqual(target.files[0].id, 'f0'); assert.equal(target.cover_file_id, target.files[0].id)
  assert.equal(target.description, 'description'); assert.deepEqual(target.tags, ['tag']); assert.deepEqual(target.custom, { id: 'opaque' })
  const artifact = (await f.runtime.fs.readJson(f.target, 'artifacts.json')).artifacts[0]
  assert.equal(artifact.input_refs[0], target.id)
  assert.equal(artifact.input_refs[1], `asset://custom/${target.files[0].relative_path}`)
  assert.equal(readFileSync(join(f.target, target.files[0].relative_path), 'utf8'), 'old-target')
  assert.equal((await f.runtime.fs.readJson(f.target, 'mappings.json')).mappings[0].id, 'mapping0')
})

test('directory xattr protects all related leaves but permits unrelated migration', async (t) => {
  const f = await fixture(t, ['folder/a.png', 'independent.png'])
  execFileSync('/usr/bin/xattr', ['-w', 'user.omnimux-dir', 'retained', join(f.source, 'folder')])
  await f.preflight(); assert.equal(f.service.plan.entries[0].operation, 'unmigrated'); assert.equal(f.service.plan.entries[1].operation, 'copy')
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial')
  assert.equal(readFileSync(join(f.target, 'independent.png'), 'utf8'), 'source-1')
  assert.equal(execFileSync('/usr/bin/xattr', ['-p', 'user.omnimux-dir', join(f.source, 'folder')], { encoding: 'utf8' }).trim(), 'retained')
})

test('Home receipt fsync failure preserves source and recovers without duplicate completed counts', async (t) => {
  const f = await fixture(t); await f.preflight()
  const atomic = f.runtime.fs.atomicJson.bind(f.runtime.fs); let failed = false
  f.runtime.fs.atomicJson = async (root, rel, value) => {
    if (!failed && rel.endsWith('entries/entry_0.json') && value.phase === 'installed_verified') {
      failed = true; throw Object.assign(new Error('isolated fsync EIO'), { code: 'storage-offline' })
    }
    return atomic(root, rel, value)
  }
  await f.confirm(); assert.equal(f.service.task.state, 'waiting_volume')
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'source-0')
  f.runtime.fs.atomicJson = atomic; await f.service.resume(f.service.task.id); await f.service.running
  assert.equal(f.service.task.state, 'completed', JSON.stringify(f.service.task.error))
  assert.equal(f.service.task.progress.completedFiles, 1); assert.equal(f.service.task.progress.copyBytes, 8)
})

test('unknown structured references remain verbatim and block before any target media change', async (t) => {
  const f = await fixture(t)
  const value = { id: 'opaque', nested: { path: 'do-not-guess' } }
  await f.runtime.fs.atomicJson(f.source, 'artifacts.json', { schema: 2, revision: 1, artifacts: [{ id: 'art', content_ref: 'a.png', input_refs: [value] }] })
  await f.preflight(); assert.ok(f.service.plan.blockers.some((row) => row.recordId === 'art'))
  await assert.rejects(f.confirm(), { code: 'conflict-required' })
  assert.deepEqual((await f.runtime.fs.readJson(f.source, 'artifacts.json')).artifacts[0].input_refs[0], value)
  assert.equal(f.runtime.config.epoch, 0)
})

test('reuse with different mtime is explicit partial and preserves both originals', async (t) => {
  const f = await fixture(t); writeFileSync(join(f.target, 'same.png'), 'source-0')
  utimesSync(join(f.target, 'same.png'), 1, 1)
  const before = statSync(join(f.target, 'same.png')).mtimeMs
  await f.preflight(); assert.equal(f.service.plan.entries[0].reasonCode, 'metadata-incompatible')
  await f.confirm(); assert.equal(f.service.task.state, 'awaiting_partial')
  assert.equal(statSync(join(f.target, 'same.png')).mtimeMs, before)
  assert.equal(readFileSync(join(f.source, 'a.png'), 'utf8'), 'source-0')
})
