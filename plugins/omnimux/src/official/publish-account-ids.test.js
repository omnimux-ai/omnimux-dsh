import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPost } from './publish.js'

/**
 * Gateway binds `account_ids` as int64 while local views keep string ids.
 * These cases pin the widening (numeric strings → numbers) and the deliberate
 * pass-through for non-numeric ids, so a future refactor cannot silently
 * reintroduce the wire mismatch that made every direct post fail binding.
 */
function clientWith(accounts, replies = {}) {
  const calls = []
  return {
    calls,
    async withPat(path, opts = {}) {
      calls.push({ path, opts })
      if (path.startsWith('/api/social/v1/accounts')) return { accounts }
      if (path.startsWith('/api/social/v1/posts')) return replies.post ?? { success: true, data: { id: 'post-1' } }
      return { success: true }
    },
  }
}

const STORE = { readForAuthorization: () => ({}) }

describe('createPost wire account ids', () => {
  it('widens numeric string ids to numbers for the gateway', async () => {
    const client = clientWith([{ id: 12, platform: 'tiktok', provider: 'tiktok_direct', status: 'active' }])
    await createPost(client, { provider: 'tiktok_direct', account_ids: ['12'], content: 'hello' }, STORE)
    const post = client.calls.find((call) => call.path === '/api/social/v1/posts')
    assert.deepEqual(post.opts.body.account_ids, [12])
    assert.equal(typeof post.opts.body.account_ids[0], 'number')
  })

  it('deduplicates before widening and keeps the provider', async () => {
    const client = clientWith([{ id: 7, platform: 'tiktok', provider: 'tiktok_direct', status: 'active' }])
    await createPost(client, { provider: 'tiktok_direct', account_ids: ['7', '7'], content: 'hello' }, STORE)
    const post = client.calls.find((call) => call.path === '/api/social/v1/posts')
    assert.deepEqual(post.opts.body.account_ids, [7])
    assert.equal(post.opts.body.provider, 'tiktok_direct')
  })

  it('passes non-numeric ids through unchanged', async () => {
    const client = clientWith([{ id: 'acc-1', platform: 'tiktok', provider: 'tiktok_direct', status: 'active' }])
    await createPost(client, { provider: 'tiktok_direct', account_ids: ['acc-1'], content: 'hello' }, STORE)
    const post = client.calls.find((call) => call.path === '/api/social/v1/posts')
    assert.deepEqual(post.opts.body.account_ids, ['acc-1'])
  })

  it('still rejects unknown ids before touching the posts endpoint', async () => {
    const client = clientWith([{ id: 12, platform: 'tiktok', provider: 'tiktok_direct', status: 'active' }])
    await assert.rejects(
      createPost(client, { provider: 'tiktok_direct', account_ids: ['99'], content: 'hello' }, STORE),
      (error) => error.code === 'account-provider-mismatch',
    )
    assert.equal(client.calls.filter((call) => call.path === '/api/social/v1/posts').length, 0)
  })
})

describe('createPost wire account ids — bounds and provider scope', () => {
  it('rejects ids beyond the safe integer range instead of rounding', async () => {
    const huge = '9007199254740993'
    const client = clientWith([{ id: huge, platform: 'tiktok', provider: 'tiktok_direct', status: 'active' }])
    await assert.rejects(
      createPost(client, { provider: 'tiktok_direct', account_ids: [huge], content: 'x' }, STORE),
      (error) => error.code === 'invalid-account-ids',
    )
    assert.equal(client.calls.filter((call) => call.path === '/api/social/v1/posts').length, 0)
  })

  it('applies the same widening on the zernio path', async () => {
    const client = clientWith([{ id: 9, platform: 'tiktok', provider: 'zernio', status: 'active' }])
    await createPost(client, { provider: 'zernio', account_ids: ['9'], content: 'x' }, STORE)
    const post = client.calls.find((call) => call.path === '/api/social/v1/posts')
    assert.deepEqual(post.opts.body.account_ids, [9])
  })
})
