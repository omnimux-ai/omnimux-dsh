import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SafeStorageFS } from './storage-fs.js'

async function fixture(t) {
  const root = mkdtempSync(fileURLToPath(new URL('./.storage-fs-', import.meta.url)))
  const fs = new SafeStorageFS()
  t.after(() => { fs.dispose(); rmSync(root, { recursive: true, force: true }) })
  await fs.probe()
  return { root, fs }
}

test('held lock detects external lock inode replacement', async (t) => {
  const { root, fs } = await fixture(t)
  await fs.lock(root)
  const path = join(root, '.omnimux-assets/owner.lock')
  renameSync(path, `${path}.retained`); writeFileSync(path, '')
  await assert.rejects(fs.lock(root), { code: 'recovery-required' })
})

test('unlink guards reject changed target and ledger without deleting source', async (t) => {
  const { root, fs } = await fixture(t)
  writeFileSync(join(root, 'source'), 'source'); writeFileSync(join(root, 'guard'), 'first')
  const expected = await fs.hash(root, 'source'); const guard = await fs.hash(root, 'guard')
  writeFileSync(join(root, 'guard'), 'second')
  await assert.rejects(fs.unlinkOwned({ root, rel: 'source', expected, guards: [{ root, rel: 'guard', expected: guard }] }), { code: 'plan-stale' })
  assert.equal(readFileSync(join(root, 'source'), 'utf8'), 'source')
})

test('optional stat recognizes absent parent without swallowing a root outage', async (t) => {
  const { root, fs } = await fixture(t)
  assert.equal(await fs.request('stat', { root, rel: 'absent/leaf', optional: true }), null)
  await assert.rejects(fs.identity(join(root, 'absent')), { code: 'storage-offline' })
})

test('exclusive copy preserves an existing partial destination', async (t) => {
  const { root, fs } = await fixture(t)
  writeFileSync(join(root, 'source'), 'complete'); writeFileSync(join(root, 'partial'), 'part')
  await assert.rejects(fs.copyVerify({ root, targetRel: 'partial', sourceRoot: root, sourceRel: 'source', expected: await fs.hash(root, 'source') }), { code: 'plan-stale' })
  assert.equal(readFileSync(join(root, 'partial'), 'utf8'), 'part')
})
