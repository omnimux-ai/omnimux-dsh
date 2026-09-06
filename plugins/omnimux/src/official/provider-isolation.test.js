import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createOfficialDispatcher } from './http-routes.js'
import { listAccounts, connectAccount, disconnectAccount } from './accounts.js'
import { createPost, getPost } from './publish.js'
import { OmnimuxError } from '../media/errors.js'

const ORIGIN = 'http://127.0.0.1:44201'
const ROWS = [
  { id: 1, provider: 'zernio', platform: 'tiktok', display_name: 'same' },
  { id: 2, provider: 'tiktok_direct', platform: 'tiktok', display_name: 'same' },
  { id: 3, platform: 'tiktok', display_name: 'same' },
  { id: 4, provider: 'unknown', platform: 'tiktok', display_name: 'same' },
  { id: 5, provider: 'tiktok_direct', platform: 'instagram', display_name: 'same' },
]

describe('explicit source contract shared by HTTP and tools', () => {
  it('rejects missing and unknown providers before client access', async () => {
    let calls = 0
    const client = { withPat: async () => { calls++; return { accounts: [] } } }
    for (const provider of [undefined, '', 'unknown', 'TikTok', null]) {
      for (const [operation, args] of [
        [listAccounts, {}], [connectAccount, { platform: 'tiktok' }],
        [disconnectAccount, { id: '1' }], [createPost, { account_ids: ['1'], content: 'test' }],
        [getPost, { id: '1' }],
      ]) {
        await assert.rejects(operation(client, { ...args, provider }), (error) => error.code === 'invalid-provider')
      }
    }
    assert.equal(calls, 0)
  })

  it('routes both binding sources explicitly and excludes invalid official rows', async () => {
    const calls = []
    const client = { withPat: async (path, options) => { calls.push({ path, options }); return { accounts: ROWS } } }
    for (const [provider, expectedIds] of [['zernio', ['1']], ['tiktok_direct', ['2']]]) {
      const list = await listAccounts(client, { provider })
      assert.deepEqual(list.accounts.map((row) => row.id), expectedIds)
      assert.equal(calls.at(-1).path, `/api/social/v1/accounts?provider=${provider}`)
      await connectAccount(client, { provider, platform: 'tiktok' })
      assert.equal(calls.at(-1).options.body.provider, provider)
    }
    const count = calls.length
    await assert.rejects(connectAccount(client, { provider: 'tiktok_direct', platform: 'instagram' }), (error) => error.code === 'invalid-provider')
    assert.equal(calls.length, count)
  })

  it('does not turn failed or malformed lists into successful emptiness', async () => {
    for (const payload of [{ success: false, message: 'paused' }, {}, null]) {
      await assert.rejects(listAccounts({ withPat: async () => payload }, { provider: 'tiktok_direct' }))
    }
    assert.deepEqual(await listAccounts({ withPat: async () => ({ accounts: [] }) }, { provider: 'tiktok_direct' }), { accounts: [] })
  })

  it('scoped empty, refresh, rejection and failure preserve both sources of local data', async () => {
    const metadata = { '1': { group: 'z-group' }, '2': { group: 'd-group' } }
    const avatars = new Set(['1', '2'])
    const writes = []
    let rows = ROWS
    let fail = false
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: { withPat: async (_path, options = {}) => {
        if (options.method === 'DELETE') throw new OmnimuxError('account-provider-mismatch', 'account-provider-mismatch')
        if (fail) throw new OmnimuxError('omnimux-request-failed', 'upstream unavailable')
        return { accounts: rows }
      } },
      metaStore: { read: () => metadata, update: (id) => { writes.push(id) }, remove: (id) => { writes.push(id); delete metadata[id] } },
      avatarStore: { has: (id) => avatars.has(id), localUrlFor: (id) => `/omnimux/accounts/${id}/avatar`, sourceUrl: () => '', remove: (id) => { writes.push(id); avatars.delete(id) }, putFromUrl: async () => ({ ok: true }) },
    })
    for (const provider of ['zernio', 'tiktok_direct']) {
      const result = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/accounts?provider=${provider}` })
      assert.equal(result.status, 200)
      assert.equal(result.body.accounts.length, 1)
      assert.equal(result.body.accounts[0].provider, provider)
    }
    rows = []
    const empty = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=tiktok_direct' })
    assert.deepEqual(empty.body.accounts, [])
    rows = ROWS
    const crossPatch = await dispatcher.dispatch({ method: 'PATCH', url: '/omnimux/accounts/1?provider=tiktok_direct', origin: ORIGIN, body: { group: 'spoof' } })
    assert.equal(crossPatch.status, 409)
    for (const body of [{ provider: 'zernio' }, { platform: 'instagram' }, { id: '1' }]) {
      const patch = await dispatcher.dispatch({ method: 'PATCH', url: '/omnimux/accounts/2?provider=tiktok_direct', origin: ORIGIN, body })
      assert.equal(patch.status, 400)
    }
    const disconnected = await dispatcher.dispatch({ method: 'DELETE', url: '/omnimux/accounts/1?provider=tiktok_direct', origin: ORIGIN })
    assert.equal(disconnected.status, 409)
    fail = true
    const failed = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(failed.status, 502)
    assert.equal(failed.body.accounts, undefined)
    assert.deepEqual(writes, [])
    assert.deepEqual(metadata, { '1': { group: 'z-group' }, '2': { group: 'd-group' } })
    assert.deepEqual([...avatars], ['1', '2'])
  })
})
