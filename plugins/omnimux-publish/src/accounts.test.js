import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { accountAvailability, computeStatus, createAccountSource, listFromPayload, mergeMeta, pickAccount } from './accounts.js'
import { PublishError } from './store.js'

/**
 * @param {unknown} payload
 */
function channelReturning(payload) {
  return {
    async listAccounts() {
      if (payload instanceof Error) throw payload
      return payload
    },
  }
}

const SITE_ROWS = {
  success: true,
  data: {
    accounts: [
      { id: 1, platform: 'xiaohongshu', username: 'red-one', status: 'active', display_name: '红一号' },
      { id: '2', platform: 'douyin', username: 'dy-two', status: 'expired' },
      { id: 3, platform: 'kuaishou', username: 'ks-three' }, // 无 status → expires_at 推导 → active
    ],
  },
}

describe('pickAccount / listFromPayload / computeStatus / mergeMeta (hub 等价复刻)', () => {
  it('whitelists fields and normalizes numeric ids to strings', () => {
    const row = pickAccount({ id: 42, platform: 'x', secret: 'nope', token: 'no', display_name: 'n', status: 'active', avatar_url: 'https://ok/a.png', note: 'dropped' })
    assert.equal(row.id, '42')
    assert.equal(row.platform, 'x')
    assert.equal(row.display_name, 'n')
    assert.equal(row.avatar_url, 'https://ok/a.png')
    assert.equal('secret' in row, false)
    assert.equal('token' in row, false)
  })

  it('listFromPayload accepts envelope variations', () => {
    assert.equal(listFromPayload(SITE_ROWS).length, 3)
    assert.equal(listFromPayload({ accounts: [1, 2] }).length, 2)
    assert.equal(listFromPayload({ data: [1] }).length, 1)
    assert.equal(listFromPayload({ data: { items: [1] } }).length, 1)
    assert.equal(listFromPayload('junk').length, 0)
  })

  it('computeStatus normalizes statuses and derives from expires_at', () => {
    assert.equal(computeStatus({ status: 'ACTIVE' }), 'active')
    assert.equal(computeStatus({ status: 'weird' }), 'error')
    const past = new Date(Date.now() - 1000).toISOString()
    const soon = new Date(Date.now() + 3600 * 1000).toISOString()
    const later = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    assert.equal(computeStatus({ expires_at: past }), 'expired')
    assert.equal(computeStatus({ expires_at: soon }), 'expiring')
    assert.equal(computeStatus({ expires_at: later }), 'active')
    assert.equal(computeStatus({}), 'active')
  })

  it('mergeMeta only overrides keys that are actually set', () => {
    const row = pickAccount({ id: '1', platform: 'x' })
    const merged = mergeMeta(row, { group: '主号', agent_usable: false, last_used_at: 't' })
    assert.equal(merged.group, '主号')
    assert.equal(merged.agent_usable, false)
    assert.equal(merged.last_used_at, 't')
    const untouched = mergeMeta(row, { group: '' })
    assert.equal('group' in untouched, false)
  })
})

describe('accountAvailability', () => {
  it('active/expiring + agent_usable !== false are usable; others are not', () => {
    assert.deepEqual(accountAvailability({ status: 'active' }), { ok: true, reason: '' })
    assert.deepEqual(accountAvailability({ status: 'expiring' }), { ok: true, reason: '' })
    assert.equal(accountAvailability({ status: 'expired' }).ok, false)
    assert.equal(accountAvailability({ status: 'error', status_raw: 'x' }).ok, false)
    assert.equal(accountAvailability({ status: 'active', agent_usable: false }).ok, false)
  })
})

describe('AccountSource.list 三分支', () => {
  it('preserves same-name account providers and rejects overlay changes to provider', async () => {
    const source = createAccountSource({
      channel: channelReturning({ accounts: [
        { id: 1, platform: 'tiktok', display_name: 'same', provider: 'zernio', access_token: 'hidden' },
        { id: 2, platform: 'tiktok', display_name: 'same', provider: 'tiktok_direct' },
        { id: 3, platform: 'tiktok', display_name: 'same' },
      ] }),
      overlayPath: 'unused-test-overlay',
      fs: { readFileSync: () => JSON.stringify({ '1': { provider: 'tiktok_direct' }, '3': { provider: 'tiktok_direct' } }) },
    })
    const { accounts } = await source.list()
    assert.deepEqual(accounts.map(({ id, provider }) => ({ id, provider })), [
      { id: '1', provider: 'zernio' },
      { id: '2', provider: 'tiktok_direct' },
      { id: '3', provider: undefined },
    ])
    assert.ok(accounts.every((row) => !('access_token' in row)))
    assert.equal('provider' in accounts[2], false)
  })

  it('merges site rows with the accounts.json overlay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-publish-acc-'))
    try {
      const overlay = join(dir, 'accounts.json')
      writeFileSync(overlay, JSON.stringify({
        '1': { group: '主号组', agent_usable: false },
        '2': { group: '小号组' },
      }))
      const source = createAccountSource({ channel: channelReturning(SITE_ROWS), overlayPath: overlay })
      const { accounts, degraded } = await source.list()
      assert.equal(degraded, undefined)
      const row1 = accounts.find((a) => a.id === '1')
      assert.equal(row1.group, '主号组')
      assert.equal(row1.agent_usable, false)
      const row2 = accounts.find((a) => a.id === '2')
      assert.equal(row2.group, '小号组')
      assert.equal(row2.status, 'expired') // overlay 不覆盖计算后的 status
      const row3 = accounts.find((a) => a.id === '3')
      assert.equal(row3.status, 'active')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('needs-omnimux degrades explicitly (不静默)', async () => {
    const source = createAccountSource({
      channel: channelReturning(new PublishError('needs-omnimux', 'sign in to OmniMux')),
      overlayPath: '/nonexistent/overlay.json',
    })
    const result = await source.list()
    assert.deepEqual(result.accounts, [])
    assert.equal(result.degraded, 'needs-omnimux')
    assert.match(result.message || '', /登录/)
  })

  it('needs-hub propagates (hub 未装载要明确报错，不是空列表)', async () => {
    const source = createAccountSource({
      channel: channelReturning(new PublishError('needs-hub', 'omnimux hub 插件未装载')),
      overlayPath: '',
    })
    await assert.rejects(() => source.list(), (e) => e instanceof PublishError && e.code === 'needs-hub')
  })

  it('corrupt overlay degrades to pure site rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-publish-acc-'))
    try {
      const overlay = join(dir, 'accounts.json')
      writeFileSync(overlay, '{not json')
      const source = createAccountSource({ channel: channelReturning(SITE_ROWS), overlayPath: overlay })
      const { accounts } = await source.list()
      assert.equal(accounts.length, 3)
      assert.ok(accounts.every((row) => row.agent_usable === undefined))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('platform filter applies', async () => {
    const source = createAccountSource({ channel: channelReturning(SITE_ROWS), overlayPath: '' })
    const { accounts } = await source.list({ platform: 'douyin' })
    assert.equal(accounts.length, 1)
    assert.equal(accounts[0].platform, 'douyin')
  })

  it('get(id) finds a merged row', async () => {
    const source = createAccountSource({ channel: channelReturning(SITE_ROWS), overlayPath: '' })
    const row = await source.get('3')
    assert.equal(row.username, 'ks-three')
    assert.equal(await source.get('nope'), null)
  })
})
