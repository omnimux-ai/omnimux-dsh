import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { createCloudCatalogStore, viewDirectoryName } from './store.js'
import { normalizePricingPayload } from './snapshot.js'

const homes = []
function temporaryHome() {
  const home = mkdtempSync(join(tmpdir(), 'omnimux-cloud-store-'))
  homes.push(home)
  return home
}
after(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

function pricingSnapshot(modelId = 'alpha-video-1', group = 'default') {
  return normalizePricingPayload({
    data: [{ id: modelId, enable_groups: [group], model_price: 0.5, billing_mode: 'per_second' }],
  }).snapshot
}

describe('viewDirectoryName', () => {
  it('keeps the anonymous view readable and hashes account views', () => {
    assert.equal(viewDirectoryName('anonymous'), 'anonymous')
    assert.equal(viewDirectoryName(''), 'anonymous')
    const account = viewDirectoryName('acct-42')
    assert.match(account, /^acct-42-[0-9a-f]{16}$/)
    assert.equal(viewDirectoryName('acct-42'), account)
    assert.notEqual(viewDirectoryName('acct-43'), account)
  })
})

describe('createCloudCatalogStore', () => {
  it('writes a snapshot with private permissions and reads it back', () => {
    const home = temporaryHome()
    const store = createCloudCatalogStore(home, { viewKey: 'anonymous' })
    const result = store.acceptRefresh(pricingSnapshot(), {
      origin: 'https://api.omnimux.ai',
      fetchedAt: '2026-10-24T00:00:00.000Z',
    })
    assert.equal(result.accepted, true)
    assert.equal(result.reason, 'written')

    const read = store.read()
    assert.equal(read.snapshot.models[0].id, 'alpha-video-1')
    assert.equal(read.meta.digest, result.digest)
    assert.equal(read.meta.viewKey, 'anonymous')
    assert.equal(read.meta.origin, 'https://api.omnimux.ai')
    assert.equal(read.meta.stale, false)

    assert.equal(statSync(store.snapshotPath).mode & 0o777, 0o600)
    assert.equal(statSync(store.dir).mode & 0o777, 0o700)
  })

  it('rejects an unchanged digest without rewriting the file', () => {
    const home = temporaryHome()
    const store = createCloudCatalogStore(home)
    const first = store.acceptRefresh(pricingSnapshot(), { fetchedAt: '2026-10-24T00:00:00.000Z' })
    assert.equal(first.accepted, true)
    const before = readFileSync(store.metaPath, 'utf8')

    const second = store.acceptRefresh(pricingSnapshot(), { fetchedAt: '2026-10-24T01:00:00.000Z' })
    assert.equal(second.accepted, false)
    assert.equal(second.reason, 'unchanged')
    assert.equal(readFileSync(store.metaPath, 'utf8'), before)
  })

  it('never lets an empty refresh replace a usable snapshot', () => {
    const home = temporaryHome()
    const store = createCloudCatalogStore(home)
    store.acceptRefresh(pricingSnapshot(), { fetchedAt: '2026-10-24T00:00:00.000Z' })

    const empty = normalizePricingPayload({ success: true }).snapshot
    const rejected = store.acceptRefresh(empty, { fetchedAt: '2026-10-24T02:00:00.000Z' })
    assert.equal(rejected.accepted, false)
    assert.equal(rejected.reason, 'empty')

    const read = store.read()
    assert.equal(read.snapshot.models[0].id, 'alpha-video-1')
    assert.equal(read.meta.fetchedAt, '2026-10-24T00:00:00.000Z')
  })

  it('rejects a snapshot from another schema version', () => {
    const store = createCloudCatalogStore(temporaryHome())
    const mismatched = Object.assign({}, pricingSnapshot(), { schemaVersion: 99 })
    const result = store.acceptRefresh(mismatched)
    assert.equal(result.accepted, false)
    assert.equal(result.reason, 'schema-mismatch')
  })

  it('keeps the previous content when a refresh is marked stale', () => {
    const home = temporaryHome()
    const store = createCloudCatalogStore(home)
    store.acceptRefresh(pricingSnapshot())
    const snapshotBefore = readFileSync(store.snapshotPath, 'utf8')

    assert.equal(store.markStale('http-503').updated, true)
    const read = store.read()
    assert.equal(read.meta.stale, true)
    assert.equal(read.meta.staleReason, 'http-503')
    assert.equal(readFileSync(store.snapshotPath, 'utf8'), snapshotBefore)
  })

  it('isolates the anonymous view from account views', () => {
    const home = temporaryHome()
    const anonymous = createCloudCatalogStore(home, { viewKey: 'anonymous' })
    const account = createCloudCatalogStore(home, { viewKey: 'acct-42' })
    anonymous.acceptRefresh(pricingSnapshot('public-model', 'default'))
    account.acceptRefresh(pricingSnapshot('member-model', 'member'))

    assert.notEqual(anonymous.dir, account.dir)
    assert.equal(anonymous.read().snapshot.models[0].id, 'public-model')
    assert.equal(account.read().snapshot.models[0].id, 'member-model')
  })

  it('treats an unreadable snapshot file as no snapshot', () => {
    const home = temporaryHome()
    const store = createCloudCatalogStore(home)
    store.acceptRefresh(pricingSnapshot())
    writeFileSync(store.snapshotPath, '{ not json')
    assert.equal(store.read(), undefined)
  })

  it('reports a missing home instead of writing outside it', () => {
    const store = createCloudCatalogStore('')
    assert.equal(store.acceptRefresh(pricingSnapshot()).reason, 'no-home')
    assert.equal(existsSync(store.snapshotPath), false)
  })
})
