import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { connectTikTokAccount, disconnectHubAccount, errorText, listHubAccounts } from './api.js'

describe('fixed official account scope', () => {
  it('filters same-name accounts and ignores a caller-supplied source override', async () => {
    const previous = globalThis.fetch
    const calls = []
    globalThis.fetch = async (path, init) => {
      calls.push({ path: String(path), init })
      return new Response(JSON.stringify({ accounts: [
        { id: 'z', provider: 'zernio', platform: 'tiktok', display_name: 'same' },
        { id: 'd', provider: 'tiktok_direct', platform: 'tiktok', display_name: 'same' },
        { id: 'missing', platform: 'tiktok' },
        { id: 'unknown', provider: 'unknown', platform: 'tiktok' },
        { id: 'forged', provider: 'tiktok_direct', platform: 'instagram' },
      ] }))
    }
    try {
      const result = await listHubAccounts({ provider: 'zernio', platform: 'instagram' })
      assert.deepEqual(result.body.accounts.map((row) => row.id), ['d'])
      assert.equal(calls[0].path, '/omnimux/accounts?provider=tiktok_direct&platform=tiktok')
      await connectTikTokAccount()
      assert.deepEqual(JSON.parse(calls[1].init.body), { platform: 'tiktok', provider: 'tiktok_direct' })
    } finally { globalThis.fetch = previous }
  })

  it('keeps empty, missing-list, upstream failure and unauthenticated results distinct', async () => {
    const previous = globalThis.fetch
    try {
      for (const fixture of [
        { body: { accounts: [] }, status: 200, ok: true },
        { body: {}, status: 200, ok: false },
        { body: { success: false, message: 'paused' }, status: 200, ok: false },
        { body: { error: 'needs-omnimux' }, status: 401, ok: false },
        { body: { error: 'unavailable' }, status: 503, ok: false },
      ]) {
        globalThis.fetch = async () => new Response(JSON.stringify(fixture.body), { status: fixture.status })
        const result = await listHubAccounts()
        assert.equal(result.ok, fixture.ok)
        if (fixture.ok) assert.deepEqual(result.body.accounts, [])
        else assert.equal(Array.isArray(result.body.accounts), false)
      }
    } finally { globalThis.fetch = previous }
  })
})

describe('errorText (UI 同时露码与 message)', () => {
  it('prefers message and prefixes the error code when they differ', () => {
    assert.equal(
      errorText({ error: 'hub-tool-error', message: 'tool omnimux_accounts_list threw: boom' }, 502),
      'hub-tool-error: tool omnimux_accounts_list threw: boom',
    )
  })

  it('does not duplicate when message equals the code', () => {
    assert.equal(errorText({ error: 'not-local', message: 'not-local' }), 'not-local')
  })

  it('falls back to HTTP status when the body has neither field', () => {
    assert.equal(errorText({}, 500), 'HTTP 500')
  })
})

describe('disconnectHubAccount', () => {
  it('sends a same-origin DELETE for the exact encoded account id', async () => {
    const originalFetch = globalThis.fetch
    /** @type {{ path?: string, init?: RequestInit }} */
    const observed = {}
    globalThis.fetch = async (path, init) => {
      observed.path = String(path)
      observed.init = init
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    try {
      const result = await disconnectHubAccount('same/name?two')
      assert.equal(result.ok, true)
      assert.equal(observed.path, '/omnimux/accounts/same%2Fname%3Ftwo?provider=tiktok_direct')
      assert.equal(observed.init?.method, 'DELETE')
      assert.equal(observed.init?.body, undefined)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  for (const invalidId of [undefined, null, 7, {}, '', '   ']) {
    it(`rejects ${String(invalidId)} without calling fetch`, async () => {
      const originalFetch = globalThis.fetch
      let fetchCalls = 0
      globalThis.fetch = async () => {
        fetchCalls += 1
        throw new Error('fetch must not run for an invalid account id')
      }
      try {
        const result = await disconnectHubAccount(invalidId)
        assert.deepEqual(result, { ok: false, status: 400, body: { error: 'id is required' } })
        assert.equal(fetchCalls, 0)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  }
})
