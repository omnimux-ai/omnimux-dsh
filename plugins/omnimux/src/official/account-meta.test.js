import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { accountsMetaFile, createAccountMetaStore, mergeMeta } from './account-meta.js'

describe('account meta store', () => {
  it('persists per-id rows with updated_at and isolates them', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-meta-'))
    try {
      const ticks = ['2026-08-20T10:00:00Z', '2026-08-20T11:00:00Z']
      let tick = 0
      const store = createAccountMetaStore({ home, now: () => ticks[Math.min(tick++, ticks.length - 1)] })
      assert.deepEqual(store.read(), {})
      store.update('a', { group: 'ops', agent_usable: true })
      store.update('b', { agent_usable: false })
      assert.deepEqual(store.read()['a'], { group: 'ops', agent_usable: true, updated_at: '2026-08-20T10:00:00Z' })
      assert.deepEqual(store.read()['b'], { agent_usable: false, updated_at: '2026-08-20T11:00:00Z' })
      // merging keeps untouched keys and refreshes updated_at
      store.update('a', { group: 'brand' })
      assert.deepEqual(store.read()['a'], { group: 'brand', agent_usable: true, updated_at: '2026-08-20T11:00:00Z' })
      // a fresh store over the same home sees the same document
      assert.deepEqual(createAccountMetaStore({ home }).read()['b'], { agent_usable: false, updated_at: '2026-08-20T11:00:00Z' })
      store.remove('a')
      assert.equal('a' in store.read(), false)
      assert.equal('b' in store.read(), true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('normalizes group clearing and drops non-whitelisted keys', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-meta-norm-'))
    try {
      const store = createAccountMetaStore({ home, now: () => '2026-08-20T10:00:00Z' })
      store.update('a', { group: '  ops  ', scopes: ['read'], agent_usable: 'yes' })
      assert.deepEqual(store.read()['a'], { group: 'ops', updated_at: '2026-08-20T10:00:00Z' })
      store.update('a', { group: null })
      assert.deepEqual(store.read()['a'], { updated_at: '2026-08-20T10:00:00Z' })
      store.update('a', { group: '' })
      assert.deepEqual(store.read()['a'], { updated_at: '2026-08-20T10:00:00Z' })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('removes only the named account without touching other sources', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-meta-prune-'))
    try {
      const store = createAccountMetaStore({ home, now: () => '2026-08-20T10:00:00Z' })
      store.update('a', { group: 'ops' })
      store.update('b', { group: 'ads' })
      store.update('c', { agent_usable: false })
      store.remove('b')
      assert.deepEqual(Object.keys(store.read()).sort(), ['a', 'c'])
      store.remove('b')
      assert.deepEqual(Object.keys(store.read()).sort(), ['a', 'c'])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('treats a missing or corrupt file as empty and writes 0600/0700', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-meta-bad-'))
    try {
      const store = createAccountMetaStore({ home })
      assert.deepEqual(store.read(), {})
      mkdirSync(join(home, 'omnimux'), { recursive: true, mode: 0o700 })
      writeFileSync(accountsMetaFile(home), 'not-json', { mode: 0o600 })
      assert.deepEqual(store.read(), {})
      store.update('a', { group: 'ops' })
      assert.equal(store.read()['a'].group, 'ops')
      const raw = JSON.parse(readFileSync(accountsMetaFile(home), 'utf8'))
      assert.equal(raw.a.group, 'ops')
      const fileMode = statSync(accountsMetaFile(home)).mode & 0o777
      assert.equal(fileMode, 0o600)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('mergeMeta', () => {
  it('overlays local group, agent_usable and last_used_at onto a site row', () => {
    const merged = mergeMeta(
      { id: 'a', platform: 'tiktok', group: 'site-group', display_name: 'Ada' },
      { group: 'local-group', agent_usable: false, last_used_at: '2026-08-19T14:30:00Z', updated_at: '2026-08-20T10:00:00Z' },
    )
    assert.deepEqual(merged, {
      id: 'a',
      platform: 'tiktok',
      group: 'local-group',
      display_name: 'Ada',
      agent_usable: false,
      last_used_at: '2026-08-19T14:30:00Z',
    })
  })

  it('leaves the row untouched for missing or empty meta', () => {
    const row = { id: 'a', group: 'ops' }
    assert.deepEqual(mergeMeta(row, undefined), row)
    assert.deepEqual(mergeMeta(row, {}), row)
    assert.deepEqual(mergeMeta(row, { group: '', agent_usable: 'x' }), row)
    assert.notEqual(mergeMeta(row, {}), row, 'returns a copy')
  })
})
