import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InventoryService } from '../workshop-inventory.js'
import { emptyWorkshopState } from '../workshop-store.js'
import type { WorkshopReadScope } from '../types.js'

const md = (name = 'fixture') => `---\nname: ${name}\ndescription: Fixture description\n---\nSynthetic body.\n`
async function fixture(run: (root: string, scope: WorkshopReadScope) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'workshop-inventory-'))
  try { await run(root, { scopeKey: 'scope', label: 'Fixture only', complete: true, reasons: [], roots: [{ id: 'fixture-root', path: root }] }) }
  finally { await rm(root, { recursive: true, force: true }) }
}
async function skill(root: string, token: string, text = md(token)): Promise<void> {
  await mkdir(join(root, token)); await writeFile(join(root, token, 'SKILL.md'), text)
}
test('unknown scope is explicit error, not successful zero inventory', async () => {
  const result = await new InventoryService({ scope: null }).reconcile()
  assert.equal(result.status, 'error'); assert.deepEqual(result.reasons, ['SCOPE_UNVERIFIED'])
})
test('actual authorized empty root can be complete, revision stable across reads', async () => fixture(async (_root, scope) => {
  const service = new InventoryService({ scope })
  const first = await service.reconcile(), second = await service.reconcile()
  assert.equal(first.status, 'complete'); assert.equal(first.records.length, 0); assert.equal(second.revision, first.revision)
}))
test('actual historical file is inventoried without guessing origin/version/time/enabled', async () => fixture(async (root, scope) => {
  await skill(root, 'history')
  const service = new InventoryService({ scope })
  const result = await service.reconcile(), row = result.records[0]
  assert.equal(result.status, 'complete'); assert.equal(row.origin, 'unknown'); assert.equal(row.skill.installed, true)
  assert.equal(row.skill.enabled, null); assert.equal(row.skill.version, null); assert.equal(row.skill.updatedAt, null)
  assert.equal(row.skill.sourceRef, null); assert.deepEqual(result.sourceOptions, ['all', 'unknown'])
  assert(!JSON.stringify(result).includes(root)); assert(!JSON.stringify(result).includes('Synthetic body'))
  assert.deepEqual(service.get(row.installId), row)
}))
test('proven installed origin persists independently from discover winner; policy is not enabled proof', async () => fixture(async (root, scope) => {
  await skill(root, 'fixture')
  const state = emptyWorkshopState(scope.scopeKey)
  state.records.push({ installId: 'saved', token: 'fixture', skillKey: 'fixture', origin: 'workbuddy', relativePath: 'fixture-root/fixture',
    version: null, contentHash: 'a'.repeat(64), enabled: false, installedAt: null, updatedAt: null, verification: 'verified', revision: 0,
    sourceRef: { kind: 'catalog', catalogId: 'sk-fixture', revision: 'old' } })
  state.policyTombstones.push({ scopeKey: scope.scopeKey, token: 'fixture', skillKey: 'fixture', reason: 'uninstalled', operationId: 'remove', revision: 0 })
  const result = await new InventoryService({ scope, store: { read: async () => state } }).reconcile()
  assert.equal(result.records[0].origin, 'workbuddy'); assert.equal(result.records[0].skill.enabled, null)
  assert(result.records[0].reasons.includes('POLICY_UNVERIFIED'))
  assert.deepEqual(result.sourceOptions, ['all', 'workbuddy'])
}))
test('local files unchanged, no schema migration and revision invalidates after metadata edit', async () => fixture(async (root, scope) => {
  await skill(root, 'fixture')
  const service = new InventoryService({ scope })
  const before = await readFile(join(root, 'fixture/SKILL.md'))
  const a = await service.reconcile(); await service.reconcile()
  assert.deepEqual(await readFile(join(root, 'fixture/SKILL.md')), before)
  await writeFile(join(root, 'fixture/SKILL.md'), md('different'))
  const b = await service.reconcile(); assert(b.revision > a.revision)
}))
test('invalid packages retained as invalid and partial, not swallowed into empty', async () => fixture(async (root, scope) => {
  await skill(root, 'broken', 'not a valid skill')
  const result = await new InventoryService({ scope }).reconcile()
  assert.equal(result.status, 'partial'); assert.equal(result.records[0].verification, 'invalid')
  assert(result.reasons.includes('INVALID_SKILL'))
}))
test('symlink not followed, valid sibling retained and status partial', async () => fixture(async (root, scope) => {
  await skill(root, 'fixture')
  await symlink(join(root, 'fixture'), join(root, 'external'))
  const result = await new InventoryService({ scope }).reconcile()
  assert.equal(result.status, 'partial'); assert.equal(result.records.length, 1)
  assert(result.reasons.includes('EXTERNAL_LINK_UNVERIFIED'))
}))
test('unknown provider layers cannot be promoted to full inventory', async () => fixture(async (root, scope) => {
  await skill(root, 'fixture')
  const result = await new InventoryService({ scope: { ...scope, complete: false } }).reconcile()
  assert.equal(result.status, 'partial'); assert.equal(result.scopeVerified, false)
  assert(result.reasons.includes('PROVIDER_SCOPE_UNVERIFIED'))
}))
test('unreadable root and state errors do not mean empty inventory', async () => fixture(async (root, scope) => {
  const missing = await new InventoryService({ scope: { ...scope, roots: [{ id: 'missing', path: join(root, 'missing') }] } }).reconcile()
  assert.equal(missing.status, 'error'); assert(missing.reasons.includes('ROOT_UNREADABLE'))
  await skill(root, 'fixture')
  const failed = await new InventoryService({ scope, store: { read: async () => { throw new Error('private path') } } }).reconcile()
  assert.equal(failed.status, 'partial'); assert(failed.reasons.includes('STATE_UNREADABLE'))
  assert(!JSON.stringify(failed).includes('private path'))
}))
test('duplicate logical identities are conflicts, not silent winner installation', async () => fixture(async (root, scope) => {
  await skill(root, 'fixture'); await mkdir(join(root, 'second')); await skill(join(root, 'second'), 'fixture')
  const result = await new InventoryService({ scope: { ...scope, roots: [...scope.roots, { id: 'second', path: join(root, 'second') }] } }).reconcile()
  assert.equal(result.status, 'partial'); assert(result.reasons.includes('IDENTITY_CONFLICT'))
}))
