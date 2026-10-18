import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ensureLocalInspiration, materializeCreationReferences, prepareCreationReferences, saveCreationDraft, translateInspiration, triggerAnalyzeInspiration } from './api.js'

test('scope, original translation and creation requests retain exact user selection', async () => {
  const original = globalThis.fetch, calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return { ok: true, status: 200, json: async () => ({ data: { id: 'item' } }) } }
  try {
    const selection = { scope: 'media', media_index: 2, directions: ['expression'] }
    const draft = { references: [{ kind: 'media', media_index: 2 }], purpose: 'visual', text: '自己的草稿' }
    await triggerAnalyzeInspiration('item', selection)
    await translateInspiration('item', 'zh', { scope: 'body' })
    await saveCreationDraft('item', draft)
    await prepareCreationReferences('item', draft)
    await materializeCreationReferences('item', 'session', 'ref')
    assert.deepEqual(calls.map(call => JSON.parse(call.body)), [selection, { scope: 'body', lang: 'zh' }, { draft }, { draft }, { sessionId: 'session', reference_id: 'ref' }])
    assert.equal(calls[0].url, '/omnimux/inspiration/local/item/analyze')
    assert.equal(calls[4].url, '/omnimux/inspiration/local/item/creation-attachments')
  } finally { globalThis.fetch = original }
})

test('cloud records are imported without automatic analysis before returning a real local identity', async () => {
  const original = globalThis.fetch, calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return { ok: true, status: 200, json: async () => ({ data: { id: 'insp_saved', import_status: 'ready', content: '完整原帖' } }) } }
  try {
    const result = await ensureLocalInspiration({ id: 'cloud', is_local: false, source_url: 'https://x.com/a/status/1' })
    assert.equal(result.id, 'insp_saved')
    assert.equal(result.is_local, true)
    assert.equal(calls.length, 1)
    assert.equal(JSON.parse(calls[0].body).auto_analyze, false)
    assert.equal(JSON.parse(calls[0].body).return_existing, true)
  } finally { globalThis.fetch = original }
})

test('ensuring a cloud post reuses its complete saved record through the import contract', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    const reuse = JSON.parse(options.body).return_existing === true
    return { ok: reuse, status: reuse ? 200 : 409, json: async () => reuse
      ? { data: { id: 'local-existing', import_status: 'ready', content: '已保存原帖' } }
      : { error: '该链接已导入', data: { id: 'local-existing' } } }
  }
  try {
    assert.equal((await ensureLocalInspiration({ is_local: false, source_url: 'https://x.com/a/status/1' })).id, 'local-existing')
  } finally { globalThis.fetch = original }
})

test('localization never invents a source URL or a local identity', async () => {
  await assert.rejects(ensureLocalInspiration({ is_local: false, id: 'cloud' }), /缺少原帖链接/)
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: '来源暂不可访问' }) })
  try { await assert.rejects(ensureLocalInspiration({ is_local: false, source_url: 'https://x.com/a/status/1' }), /来源暂不可访问/) }
  finally { globalThis.fetch = original }
})
