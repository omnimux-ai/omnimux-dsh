import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeStatus, filterAccounts, pickAccount, pickAccountsView, pickConnectView } from './public-account.js'

describe('pickAccount', () => {
  it('preserves provider identity for same-name accounts without inventing missing providers', () => {
    const accounts = pickAccountsView({ accounts: [
      { id: 1, platform: 'tiktok', display_name: 'same', provider: 'zernio', access_token: 'hidden' },
      { id: 2, platform: 'tiktok', display_name: 'same', provider: 'tiktok_direct', access_token: 'hidden' },
      { id: 3, platform: 'tiktok', display_name: 'same' },
    ] }).accounts
    assert.deepEqual(accounts.map(({ id, provider }) => ({ id, provider })), [
      { id: '1', provider: 'zernio' },
      { id: '2', provider: 'tiktok_direct' },
      { id: '3', provider: undefined },
    ])
    assert.ok(accounts.every((row) => !('access_token' in row)))
    assert.equal('provider' in accounts[2], false)
  })

  it('keeps public fields and drops secrets', () => {
    const picked = pickAccount({
      id: 9,
      platform: 'tiktok',
      display_name: 'Ada',
      group: 'ops',
      access_token: 'pat-nope',
      avatar_url: 'https://cdn.example/a.png',
      email: 'hidden@x',
    })
    assert.equal(picked.id, '9')
    assert.equal(picked.platform, 'tiktok')
    assert.equal(picked.avatar_url, 'https://cdn.example/a.png')
    assert.equal('access_token' in picked, false)
    assert.equal('email' in picked, false)
  })

  it('drops a non-https avatar', () => {
    const picked = pickAccount({ id: 'a', avatar_url: 'http://insecure/a.png' })
    assert.equal('avatar_url' in picked, false)
  })

  it('keeps a same-origin relative avatar whose id matches the row', () => {
    const picked = pickAccount({ id: 'acc-1', avatar_url: '/omnimux/accounts/acc-1/avatar' })
    assert.equal(picked.avatar_url, '/omnimux/accounts/acc-1/avatar')
    const encoded = pickAccount({ id: 'a/b', avatar_url: '/omnimux/accounts/a%2Fb/avatar' })
    assert.equal(encoded.avatar_url, '/omnimux/accounts/a%2Fb/avatar')
  })

  it('drops relative avatars that point at another id, and every non-https scheme', () => {
    assert.equal('avatar_url' in pickAccount({ id: 'acc-1', avatar_url: '/omnimux/accounts/acc-2/avatar' }), false)
    assert.equal('avatar_url' in pickAccount({ id: 'acc-1', avatar_url: '/omnimux/accounts/acc-1/avatar/extra' }), false)
    assert.equal('avatar_url' in pickAccount({ id: 'acc-1', avatar_url: 'data:image/png;base64,abc' }), false)
    assert.equal('avatar_url' in pickAccount({ id: 'acc-1', avatar_url: 'blob:https://cdn.example/a' }), false)
    assert.equal('avatar_url' in pickAccount({ id: 'acc-1', avatar_url: 'file:///tmp/a.png' }), false)
    assert.equal(
      'avatar_url' in pickAccount({ id: 'acc-1', avatar_url: 'http://127.0.0.1/omnimux/accounts/acc-1/avatar' }),
      false,
    )
    assert.equal(
      'avatar_url' in pickAccount({ id: 'acc-1', avatar_url: 'https://evil.example/omnimux/accounts/acc-1/avatar' }),
      true,
      'https CDN URLs still pass; Host rewrite is what switches them to relative',
    )
  })

  it('passes through optional timing fields when the site sends them', () => {
    const picked = pickAccount({
      id: 'a',
      expires_at: '2026-09-15T00:00:00Z',
      connected_at: '2026-07-12T09:15:00Z',
    })
    assert.equal(picked.expires_at, '2026-09-15T00:00:00Z')
    assert.equal(picked.connected_at, '2026-07-12T09:15:00Z')
    const missing = pickAccount({ id: 'b' })
    assert.equal('expires_at' in missing, false)
    assert.equal('connected_at' in missing, false)
  })
})

describe('computeStatus', () => {
  const now = Date.parse('2026-08-20T12:00:00Z')

  it('passes known site statuses through and normalizes unknown ones to error', () => {
    assert.equal(computeStatus({ status: 'active' }, now), 'active')
    assert.equal(computeStatus({ status: 'Expiring ' }, now), 'expiring')
    assert.equal(computeStatus({ status: 'EXPIRED' }, now), 'expired')
    assert.equal(computeStatus({ status: 'error' }, now), 'error')
    assert.equal(computeStatus({ status: 'kaleidoscope' }, now), 'error')
  })

  it('derives expiring / expired from expires_at when no status is set', () => {
    assert.equal(computeStatus({ expires_at: '2026-08-20T11:59:59Z' }, now), 'expired')
    assert.equal(computeStatus({ expires_at: '2026-08-21T00:00:00Z' }, now), 'expiring')
    assert.equal(computeStatus({ expires_at: '2026-08-21T12:00:01Z' }, now), 'active')
    assert.equal(computeStatus({ expires_at: 'not-a-date' }, now), 'active')
  })

  it('treats the exact boundaries as expired / expiring (<= semantics)', () => {
    const DAY_MS = 24 * 60 * 60 * 1000
    // exactly now → already expired
    assert.equal(computeStatus({ expires_at: '2026-08-20T12:00:00Z' }, now), 'expired')
    // exactly now + 24h → last moment of the expiring window
    assert.equal(computeStatus({ expires_at: '2026-08-21T12:00:00Z' }, now), 'expiring')
    // one millisecond past the window → active
    assert.equal(computeStatus({ expires_at: new Date(now + DAY_MS + 1).toISOString() }, now), 'active')
  })

  it('defaults to active with neither status nor expires_at', () => {
    assert.equal(computeStatus({}, now), 'active')
    assert.equal(computeStatus(undefined, now), 'active')
    assert.equal(computeStatus({ status: '', expires_at: null }, now), 'active')
  })

  it('prefers the site status over expires_at', () => {
    assert.equal(computeStatus({ status: 'active', expires_at: '2020-01-01T00:00:00Z' }, now), 'active')
  })
})

describe('pickAccountsView', () => {
  it('unwraps data.accounts and filters by platform or group', () => {
    const raw = {
      data: {
        accounts: [
          { id: 'a', platform: 'tiktok', group: 'ops' },
          { id: 'b', platform: 'youtube', group: 'ads' },
        ],
      },
    }
    assert.deepEqual(pickAccountsView(raw).accounts.map((row) => row.id), ['a', 'b'])
    assert.deepEqual(filterAccounts(raw, { platform: 'TikTok' }).accounts.map((row) => row.id), ['a'])
    assert.deepEqual(filterAccounts(raw, { group: 'ADS' }).accounts.map((row) => row.id), ['b'])
  })

  it('computes a status for every row', () => {
    const raw = { accounts: [{ id: 'a' }, { id: 'b', status: 'error' }] }
    assert.deepEqual(pickAccountsView(raw).accounts.map((row) => row.status), ['active', 'error'])
  })

  it('overlays local meta over site fields', () => {
    const raw = {
      accounts: [
        { id: 'a', platform: 'tiktok', group: 'site-group' },
        { id: 'b', platform: 'youtube' },
      ],
    }
    const meta = {
      a: { group: 'local-group', agent_usable: false, last_used_at: '2026-08-19T14:30:00Z', updated_at: '2026-08-20T10:00:00Z' },
    }
    const view = pickAccountsView(raw, { meta })
    const a = view.accounts.find((row) => row.id === 'a')
    assert.equal(a.group, 'local-group')
    assert.equal(a.agent_usable, false)
    assert.equal(a.last_used_at, '2026-08-19T14:30:00Z')
    assert.equal('updated_at' in a, false)
    const b = view.accounts.find((row) => row.id === 'b')
    assert.equal('group' in b, false)
    assert.equal('agent_usable' in b, false)
  })

  it('filters merged rows through filterAccounts opts', () => {
    const raw = { accounts: [{ id: 'a', platform: 'tiktok' }, { id: 'b', platform: 'youtube' }] }
    const meta = { a: { group: 'ops' } }
    assert.deepEqual(
      filterAccounts(raw, { group: 'ops' }, { meta }).accounts.map((row) => row.id),
      ['a'],
    )
  })
})

describe('pickConnectView', () => {
  it('keeps only an https auth_url', () => {
    assert.equal(pickConnectView({ data: { auth_url: 'https://omnimux.ai/connect' } }).auth_url, 'https://omnimux.ai/connect')
    assert.equal(pickConnectView({ auth_url: 'http://evil' }).auth_url, '')
  })
})
