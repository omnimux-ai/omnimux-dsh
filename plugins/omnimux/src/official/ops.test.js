import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { OmnimuxError } from '../media/errors.js'
import { createOfficialClient } from './client.js'
import { connectAccount, disconnectAccount, listAccounts } from './accounts.js'
import { createPost, getPost, presignMedia } from './publish.js'
import { fetchSocialData } from './social-data.js'

function mockClient(handler) {
  return createOfficialClient({
    siteBaseUrl: 'https://omnimux.ai',
    apiBaseUrl: 'https://api.omnimux.ai',
    resolveApiKey: () => 'sk-x',
    resolveAccess: async () => ({ token: 'pat-x', userId: 7 }),
    fetcher: handler,
  })
}

describe('official social ops', () => {
  it('lists, connects, and disconnects through /api/social/v1', async () => {
    const seen = []
    const client = mockClient(async (url, init) => {
      seen.push({ url: String(url), method: init.method || 'GET', headers: init.headers, body: init.body })
      return { ok: true, status: 200, json: async () => ({ success: true, accounts: [] }) }
    })
    await listAccounts(client, { provider: 'zernio' })
    await connectAccount(client, { provider: 'zernio', platform: 'tiktok', redirect_url: 'https://app/cb' })
    await disconnectAccount(client, { provider: 'zernio', id: 'acc-1' })
    assert.equal(seen[0].url, 'https://omnimux.ai/api/social/v1/accounts?provider=zernio')
    assert.equal(seen[1].url, 'https://omnimux.ai/api/social/v1/connect')
    assert.equal(seen[1].method, 'POST')
    assert.equal(JSON.parse(seen[1].body).platform, 'tiktok')
    assert.equal(JSON.parse(seen[1].body).provider, 'zernio')
    assert.equal(seen[2].url, 'https://omnimux.ai/api/social/v1/accounts/acc-1?provider=zernio')
    assert.equal(seen[2].method, 'DELETE')
    assert.equal(seen[0].headers['New-Api-User'], '7')
  })

  it('presigns, creates, and reads posts through /api/social/v1', async () => {
    const seen = []
    const client = mockClient(async (url, init) => {
      seen.push({ url: String(url), method: init.method || 'GET', body: init.body })
      return { ok: true, status: 200, json: async () => ({ id: 'post-1' }) }
    })
    await presignMedia(client, { filename: 'a.mp4', content_type: 'video/mp4' })
    await createPost(client, { provider: 'tiktok_direct', account_ids: ['acc-1'], content: 'hello' })
    await getPost(client, { provider: 'tiktok_direct', id: 'post-1' })
    assert.equal(seen[0].url, 'https://omnimux.ai/api/social/v1/media/presign')
    assert.equal(JSON.parse(seen[0].body).filename, 'a.mp4')
    assert.equal(seen[1].url, 'https://omnimux.ai/api/social/v1/posts')
    assert.equal(JSON.parse(seen[1].body).provider, 'tiktok_direct')
    assert.equal(seen[2].url, 'https://omnimux.ai/api/social/v1/posts/post-1?provider=tiktok_direct')
  })

  it('unsigned account tools throw needs-omnimux', async () => {
    const tools = {}
    const home = mkdtempSync(join(tmpdir(), 'omnimux-ops-'))
    const previousHome = process.env.DSH_HOME
const previousKey = process.env.OMNIMUX_API_KEY
    const previousToken = process.env.OMNIMUX_TOKEN
    process.env.DSH_HOME = home
    delete process.env.OMNIMUX_API_KEY
    delete process.env.OMNIMUX_TOKEN
    try {
      apply({
        tools: { register(tool) { tools[tool.name] = tool } },
        provide() {},
        get() { return undefined },
      })
      await assert.rejects(
        () => tools.omnimux_accounts_list.execute({ provider: 'zernio' }),
        (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
      )
      await assert.rejects(
        () => tools.omnimux_publish_get.execute({ id: 'p1', provider: 'tiktok_direct' }),
        (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
      )
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
if (previousKey === undefined) delete process.env.OMNIMUX_API_KEY
      else process.env.OMNIMUX_API_KEY = previousKey
      if (previousToken === undefined) delete process.env.OMNIMUX_TOKEN
      else process.env.OMNIMUX_TOKEN = previousToken
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('social data without a key is omnimux-unconfigured', async () => {
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => '',
      resolveAccess: async () => ({ token: '' }),
    })
    await assert.rejects(
      () => fetchSocialData(client, { platform: 'tiktok', capability: 'video', id: '7123456789012345678' }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })
})
