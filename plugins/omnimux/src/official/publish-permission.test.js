import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPost } from './publish.js'
import { createOfficialClient } from './client.js'
import { createAccountMetaStore } from './account-meta.js'

for (const provider of ['zernio', 'tiktok_direct']) {
  test(`publication checks every current account and permission: ${provider}`, async (t) => {
    const home = mkdtempSync(join(tmpdir(), 'permission-'))
    t.after(() => rmSync(home, { recursive: true, force: true }))
    const store = createAccountMetaStore({ home })
    const sent = []
    let duringList = () => {}
    const client = { async withPat(path, init) {
      if (path.includes('/accounts?')) {
        duringList()
        return { accounts: [{ id: 'a', provider, platform: 'tiktok' }, { id: 'b', provider, platform: 'tiktok' }, { id: 'wrong', provider: 'other' }] }
      }
      sent.push(init.body)
      return { success: true, id: 'post' }
    } }
    const run = (ids) => createPost(client, { provider, account_ids: ids, content: 'test' }, store)
    await run(['a', 'a'])
    assert.deepEqual(sent.pop().account_ids, ['a'])
    store.update('a', { agent_usable: false })
    await assert.rejects(run(['a']), /does not allow/)
    await assert.rejects(run(['b', 'a']), /does not allow/)
    for (const ids of [undefined, [], [''], [3], [null], ['wrong'], ['unknown'], ['b', {}]]) await assert.rejects(run(ids))
    assert.equal(sent.length, 0)
    store.update('a', { agent_usable: true })
    await run(['a', 'b'])
    assert.deepEqual(sent.pop().account_ids, ['a', 'b'])
    duringList = () => store.update('a', { agent_usable: false })
    await assert.rejects(run(['a']), /does not allow/)
    assert.equal(sent.length, 0)
    await assert.rejects(createPost(client, { provider, account_ids: ['b'] }), /permissions are unavailable/)
    for (const payload of [{ success: false }, {}, { accounts: [] }]) {
      await assert.rejects(createPost({ withPat: async () => payload }, { provider, account_ids: ['b'] }, store))
    }
  })
}

for (const createStore of [createAccountMetaStore]) {
  test(`permission documents fail closed without erasing corrupt policy: ${createStore.name}`, (t) => {
    const home = mkdtempSync(join(tmpdir(), 'policy-'))
    t.after(() => rmSync(home, { recursive: true, force: true }))
    const store = createStore({ home })
    assert.deepEqual(store.readForAuthorization(), {})
    mkdirSync(join(home, 'omnimux'))
    const file = join(home, 'omnimux/accounts.json')
    for (const content of ['{', 'null', '[]', '{"a":null}', '{"a":{"agent_usable":"false"}}']) {
      writeFileSync(file, content)
      assert.throws(() => store.readForAuthorization(), /account-policy-unavailable/)
      assert.throws(() => (store.update || store.patch)('a', { group: 'new' }), /account-policy-unavailable/)
      assert.equal(readFileSync(file, 'utf8'), content)
    }
  })
}

for (const revoked of [true, false]) {
  test(`final permission is checked after credential resolution: revoked=${revoked}`, async () => {
    let allowed = true
    let resolutions = 0
    let posts = 0
    const paused = Promise.withResolvers()
    const resume = Promise.withResolvers()
    const client = createOfficialClient({
      siteBaseUrl: 'https://example.invalid',
      resolveApiKey: () => undefined,
      async resolveAccess() {
        if (++resolutions === 2) { paused.resolve(); await resume.promise }
        return { token: 'synthetic-token' }
      },
      async fetcher(url) {
        if (String(url).includes('/accounts?')) return { ok: true, json: async () => ({ accounts: [{ id: 'a', provider: 'zernio' }] }) }
        posts++
        return { ok: true, json: async () => ({ success: true, id: 'p' }) }
      },
    })
    const pending = createPost(client, { provider: 'zernio', account_ids: ['a'], beforeSend: 'untrusted override' }, {
      readForAuthorization: () => ({ a: { agent_usable: allowed } }),
    })
    await paused.promise
    allowed = !revoked
    resume.resolve()
    if (revoked) await assert.rejects(pending, /does not allow/)
    else assert.equal((await pending).id, 'p')
    assert.equal(posts, revoked ? 0 : 1)
  })
}
