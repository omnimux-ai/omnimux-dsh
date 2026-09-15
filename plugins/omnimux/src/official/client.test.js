import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { createOfficialClient } from './client.js'

describe('official client', () => {
  it('withSk throws omnimux-unconfigured without a key', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => '',
      resolveAccess: async () => ({ token: '' }),
    })
    await assert.rejects(
      () => client.withSk('/v1/chat/completions', { method: 'POST', body: {} }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })

  it('withPat throws needs-omnimux without a token', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => {
        throw new OmnimuxError('needs-omnimux', 'sign in')
      },
    })
    await assert.rejects(
      () => client.withPat('/api/social/v1/accounts'),
      (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
    )
  })

  it('refuses a secret-bearing payload', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      apiBaseUrl: 'https://api.omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x', userId: 1 }),
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'pat-leaked' }),
      }),
    })
    await assert.rejects(
      () => client.withSk('/v1/models'),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-response',
    )
  })

  it('maps 401 to needs-omnimux', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized' }),
      }),
    })
    await assert.rejects(
      () => client.withSk('/v1/chat/completions', { method: 'POST', body: {} }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
    )
  })

  it('maps withSk 402 to quota-exceeded', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async () => ({ ok: false, status: 402, json: async () => ({ error: 'payment required' }) }),
    })
    await assert.rejects(() => client.withSk('/v1/models'), (error) => error instanceof OmnimuxError && error.code === 'quota-exceeded')
  })

  it('maps withSk 403 insufficient user quota to quota-exceeded', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async () => ({ ok: false, status: 403, json: async () => ({ code: 'insufficient_user_quota' }) }),
    })
    await assert.rejects(() => client.withSk('/v1/models'), (error) => error instanceof OmnimuxError && error.code === 'quota-exceeded')
  })

  it('keeps an evidence-free withSk 403 as request-failed', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async () => ({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) }),
    })
    await assert.rejects(() => client.withSk('/v1/models'), (error) => error instanceof OmnimuxError && error.code === 'omnimux-request-failed')
  })

  it('maps withPatRaw 402 to quota-exceeded', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async () => ({ ok: false, status: 402 }),
    })
    await assert.rejects(() => client.withPatRaw('/api/media'), (error) => error instanceof OmnimuxError && error.code === 'quota-exceeded')
  })

  it('withSkSite calls the site origin with the gateway key', async () => {
    /** @type {any[]} */
    const seen = []
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai/',
      apiBaseUrl: 'https://api.omnimux.ai/v1/',
      resolveApiKey: () => ' sk-gateway ',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async (url, init) => {
        seen.push({ url, init })
        return { ok: true, status: 200, json: async () => ({ success: true, data: { file_id: 'f1' } }) }
      },
    })

    const json = await client.withSkSite('/api/v1/files/upload/stream', { method: 'POST', body: { a: 1 } })

    assert.deepEqual(json, { success: true, data: { file_id: 'f1' } })
    assert.equal(seen[0].url, 'https://omnimux.ai/api/v1/files/upload/stream')
    assert.equal(seen[0].init.headers.authorization, 'Bearer sk-gateway')
    assert.equal(seen[0].init.headers['content-type'], 'application/json')
    assert.equal(seen[0].init.body, JSON.stringify({ a: 1 }))
  })

  it('withSkSite passes a FormData body through as multipart', async () => {
    /** @type {any[]} */
    const seen = []
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x' }),
      fetcher: async (url, init) => {
        seen.push({ url, init })
        return { ok: true, status: 200, json: async () => ({ success: true }) }
      },
    })

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([7])], { type: 'image/png' }), 'c.png')
    form.append('file_name', 'c.png')
    await client.withSkSite('/api/v1/files/upload/stream', { method: 'POST', body: form })

    assert.equal(seen[0].init.body, form)
    assert.equal('content-type' in seen[0].init.headers, false, 'fetch owns the multipart boundary header')
  })

  it('withSkSite reports the missing key like withSk', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => undefined,
      resolveAccess: async () => ({ token: 'pat-x' }),
    })
    await assert.rejects(
      () => client.withSkSite('/api/inspiration/v1/publish', { method: 'POST', body: {} }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })
})
