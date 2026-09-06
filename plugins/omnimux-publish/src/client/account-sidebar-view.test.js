import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountDisplayName,
  accountHandle,
  accountStatusTone,
  extractAccounts,
  filterAccounts,
  findNewAccount,
  isNeedsLogin,
  matchesAccountQuery,
  pickAuthUrl,
  snapshotAccountIds,
} from './account-sidebar-view.js'

const ROW_A = { id: 'a1', provider: 'tiktok_direct', platform: 'tiktok', display_name: 'Mia Store', username: 'mia.store', name: 'Mia', group: '带货', status: 'connected' }
const ROW_B = { id: 'b2', provider: 'tiktok_direct', platform: 'tiktok', display_name: 'Daily Vlog', username: 'dailyvlog', name: '', group: '', status: 'expired' }
const ROW_C = { id: 'c3', provider: 'tiktok_direct', platform: 'tiktok', display_name: '', username: '', name: 'NoHandle', group: '好物', status: 'error' }

describe('extractAccounts', () => {
  it('returns rows from { accounts: [...] }', () => {
    assert.deepEqual(extractAccounts({ accounts: [ROW_A, ROW_B] }), [ROW_A, ROW_B])
  })

  it('normalizes malformed bodies to []', () => {
    assert.deepEqual(extractAccounts(null), [])
    assert.deepEqual(extractAccounts({}), [])
    assert.deepEqual(extractAccounts({ accounts: 'nope' }), [])
    assert.deepEqual(extractAccounts([ROW_A]), [])
    assert.deepEqual(extractAccounts({ accounts: [null, 42, ROW_A] }), [ROW_A])
  })
})

describe('matchesAccountQuery（大小写不敏感 substring）', () => {
  it('matches display_name / username / name case-insensitively', () => {
    assert.equal(matchesAccountQuery(ROW_A, 'MIA'), true)
    assert.equal(matchesAccountQuery(ROW_A, 'mia.store'), true)
    assert.equal(matchesAccountQuery(ROW_C, 'nohandle'), true)
    assert.equal(matchesAccountQuery(ROW_A, 'vlog'), false)
  })

  it('empty / blank query matches everything', () => {
    assert.equal(matchesAccountQuery(ROW_A, ''), true)
    assert.equal(matchesAccountQuery(ROW_A, '   '), true)
    assert.equal(matchesAccountQuery(ROW_A, null), true)
  })
})

describe('filterAccounts（搜索过滤全量列表）', () => {
  const rows = [ROW_A, ROW_B, ROW_C]

  it('empty query returns every row', () => {
    assert.deepEqual(filterAccounts(rows), rows)
    assert.deepEqual(filterAccounts(rows, ''), rows)
  })

  it('query narrows the list case-insensitively', () => {
    assert.deepEqual(filterAccounts(rows, 'vlog'), [ROW_B])
    assert.deepEqual(filterAccounts(rows, 'NOHANDLE'), [ROW_C])
    assert.deepEqual(filterAccounts(rows, 'MIA STORE'), [ROW_A])
    assert.deepEqual(filterAccounts(rows, 'zzz'), [])
  })

  it('tolerates malformed input', () => {
    assert.deepEqual(filterAccounts(null), [])
    assert.deepEqual(filterAccounts(undefined, 'vlog'), [])
    assert.deepEqual(filterAccounts(rows, null), rows)
  })
})

describe('display name / handle fallback', () => {
  it('prefers display_name, then name, then username, then id', () => {
    assert.equal(accountDisplayName(ROW_A), 'Mia Store')
    assert.equal(accountDisplayName(ROW_C), 'NoHandle')
    assert.equal(accountDisplayName({ id: 'x9', username: 'u9' }), 'u9')
    assert.equal(accountDisplayName({ id: 'x9' }), 'x9')
    assert.equal(accountDisplayName({}), '')
  })

  it('handle prefixes @ and hides when empty', () => {
    assert.equal(accountHandle(ROW_A), '@mia.store')
    assert.equal(accountHandle(ROW_C), '')
  })
})

describe('accountStatusTone', () => {
  it('maps known statuses to tones', () => {
    assert.equal(accountStatusTone(ROW_A), 'success')
    assert.equal(accountStatusTone(ROW_B), 'warn')
    assert.equal(accountStatusTone(ROW_C), 'error')
    assert.equal(accountStatusTone({ status: 'whatever' }), 'muted')
    assert.equal(accountStatusTone({}), 'muted')
  })
})

describe('pickAuthUrl（仅 https 透出）', () => {
  it('accepts https auth_url', () => {
    assert.equal(pickAuthUrl({ auth_url: 'https://www.tiktok.com/auth?x=1' }), 'https://www.tiktok.com/auth?x=1')
  })

  it('rejects non-https and malformed bodies', () => {
    assert.equal(pickAuthUrl({ auth_url: 'http://evil.example' }), '')
    assert.equal(pickAuthUrl({ auth_url: 'javascript:alert(1)' }), '')
    assert.equal(pickAuthUrl({ auth_url: 42 }), '')
    assert.equal(pickAuthUrl({}), '')
    assert.equal(pickAuthUrl(null), '')
  })
})

describe('isNeedsLogin', () => {
  it('detects 401 / 403 / needs-omnimux', () => {
    assert.equal(isNeedsLogin({ ok: false, status: 401, body: {} }), true)
    assert.equal(isNeedsLogin({ ok: false, status: 403, body: {} }), true)
    assert.equal(isNeedsLogin({ ok: false, status: 401, body: { error: 'needs-omnimux' } }), true)
    assert.equal(isNeedsLogin({ ok: false, status: 500, body: { error: 'needs-omnimux' } }), true)
    assert.equal(isNeedsLogin({ ok: false, status: 500, body: { error: 'boom' } }), false)
    assert.equal(isNeedsLogin({ ok: true, status: 200, body: {} }), false)
  })
})

describe('轮询检测（findNewAccount / snapshotAccountIds）', () => {
  it('detects the first row whose id is not in the baseline', () => {
    const baseline = snapshotAccountIds([ROW_A, ROW_B])
    assert.deepEqual(findNewAccount(baseline, [ROW_A, ROW_B]), null)
    assert.deepEqual(findNewAccount(baseline, [ROW_A, ROW_B, ROW_C]), ROW_C)
  })

  it('handles empty baselines and malformed rows', () => {
    assert.deepEqual(findNewAccount(new Set(), [ROW_A]), ROW_A)
    assert.deepEqual(findNewAccount(null, [null, ROW_A]), ROW_A)
    assert.deepEqual(findNewAccount(new Set(), null), null)
    assert.deepEqual(snapshotAccountIds(null), new Set())
  })
})
