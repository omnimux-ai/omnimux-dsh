import test from 'node:test'
import assert from 'node:assert/strict'
import { readStorageSettings, saveStorageSettings } from '../client/reference-storage-api.js'

test('settings client reads protected endpoint without caching', async () => {
  const value = await readStorageSettings(async (url, init) => {
    assert.equal(url, '/omnimux/reference-storage/config')
    assert.equal(init.cache, 'no-store')
    return new Response(JSON.stringify({ config: { enabled: false }, revision: 1 }), { status: 200 })
  })
  assert.equal(value.config.enabled, false)
})
test('save refuses HTTP errors rather than showing success', async () => {
  await assert.rejects(saveStorageSettings({ enabled: false, expectedRevision: 1 }, async (url, init) => {
    assert.equal(init.method, 'PUT')
    return new Response(JSON.stringify({ error: '设置已被更新，请刷新后重试' }), { status: 409 })
  }), /设置已被更新/)
})
