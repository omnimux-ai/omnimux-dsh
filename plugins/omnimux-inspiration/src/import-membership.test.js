import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'

const URL = 'https://x.com/creator/status/2098246364895547904'
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const videoMeta = { data: { text: '重新导入视频', media: { video: [{ variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/reference.mp4' }] }] } } }

function setup(patch = {}, socialFetcher = async () => assert.fail('duplicate must not call a remote service')) {
  const dir = mkdtempSync(join(tmpdir(), 'inspiration-import-membership-'))
  roots.push(dir)
  const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), coversDir: join(dir, 'media/covers'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images') }
  const store = createLocalStore({ paths })
  store.add({ id: 'member', title: '原有成员', type: 'video', source_url: URL, import_status: 'ready', ...patch })
  store.add({ id: 'peer', title: '第二个成员' })
  const collection = store.createCollection('真实归属', ['member', 'peer']).data
  const dispatcher = createLocalInspirationDispatcher({
    localStore: store, socialFetcher,
    resolver: async () => [{ address: '93.184.216.34', family: 4 }],
    fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('offline media fixture') }),
  })
  const post = (body = {}) => dispatcher.dispatch({ method: 'POST', url: '/omnimux/inspiration/local/import-url', body: { url: URL, auto_analyze: false, ...body } })
  const assertRaw = () => assert.ok(JSON.parse(readFileSync(paths.libraryFile, 'utf8')).items.every((row) => !Object.hasOwn(row, 'collection_id')))
  return { store, collection, post, assertRaw }
}

async function settled(store, id) {
  for (let n = 0; n < 100; n++) {
    const row = store.get(id)
    if (row && row.import_status !== 'importing') return row
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail('background import did not settle')
}

describe('import immediate replies preserve authoritative collection membership', () => {
  it('projects 409 existing and 200 return_existing for both synchronous and background submissions without remote calls', async () => {
    const ctx = setup()
    for (const background of [false, true]) for (const return_existing of [false, true]) {
      const response = await ctx.post({ background, return_existing })
      assert.equal(response.status, return_existing ? 200 : 409)
      assert.equal(response.body.data.id, 'member')
      assert.equal(response.body.data.collection_id, ctx.collection.id)
      assert.equal(response.body.is_duplicate, true)
      assert.equal(response.body.existing, return_existing ? true : undefined)
    }
    assert.equal(ctx.store.list({ root_only: true }).total, 0)
    ctx.assertRaw()
  })

  it('projects a repeated 202 pending response while keeping its original import state', async () => {
    const ctx = setup({ import_status: 'importing', import_stage: 'downloading', import_started_at: new Date().toISOString() })
    const response = await ctx.post({ background: true })
    assert.equal(response.status, 202)
    assert.equal(response.body.data.collection_id, ctx.collection.id)
    assert.equal(response.body.data.import_status, 'importing')
    assert.equal(response.body.data.import_stage, 'downloading')
    assert.equal(response.body.is_duplicate, true)
    ctx.assertRaw()
  })

  it('projects 202 failed retry and degraded upgrade without persisting the projection', async () => {
    for (const patch of [{ import_status: 'failed', import_error: '上次失败' }, { import_status: 'degraded', type: 'link' }]) {
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const ctx = setup(patch, async () => { await gate; return videoMeta })
      try {
        const response = await ctx.post({ background: true })
        assert.equal(response.status, 202)
        assert.equal(response.body.data.id, 'member')
        assert.equal(response.body.data.collection_id, ctx.collection.id)
        assert.equal(response.body.data.import_status, 'importing')
        assert.equal(response.body.data.import_stage, 'resolving')
        ctx.assertRaw()
      } finally {
        release()
        const row = await settled(ctx.store, 'member')
        assert.equal(row.import_status, 'ready')
      }
      assert.equal(ctx.store.get('member').collection_id, ctx.collection.id)
      ctx.assertRaw()
    }
  })

  it('projects a completed synchronous in-place upgrade and preserves root item shape after moving out', async () => {
    const ctx = setup({ import_status: 'degraded', type: 'link' }, async () => videoMeta)
    const response = await ctx.post()
    assert.equal(response.status, 200)
    assert.equal(response.body.data.id, 'member')
    assert.equal(response.body.data.collection_id, ctx.collection.id)
    assert.equal(response.body.data.import_status, 'ready')
    ctx.store.removeCollectionItems(ctx.collection.id, ['member'])
    const duplicate = await ctx.post()
    assert.equal(duplicate.status, 409)
    assert.equal(Object.hasOwn(duplicate.body.data, 'collection_id'), false)
    ctx.assertRaw()
  })

  it('projects duplicates discovered only after resolving a different URL', async () => {
    const ctx = setup({}, async () => ({ data: { canonical_url: URL, text: '解析后命中已存在素材' } }))
    for (const return_existing of [false, true]) {
      const response = await ctx.post({ url: 'https://t.co/collection-reference', return_existing })
      assert.equal(response.status, return_existing ? 200 : 409)
      assert.equal(response.body.data.id, 'member')
      assert.equal(response.body.data.collection_id, ctx.collection.id)
    }
    assert.equal(ctx.store.list().total, 2)
    ctx.assertRaw()
  })

  it('uses membership changed during the import rather than its original relation', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const ctx = setup({ import_status: 'degraded', type: 'link' }, async () => { await gate; return videoMeta })
    const pending = ctx.post()
    try {
      ctx.store.removeCollectionItems(ctx.collection.id, ['member'])
      ctx.store.add({ id: 'other', title: '另一合集素材' })
      const next = ctx.store.createCollection('新归属', ['other', 'member']).data
      release()
      const response = await pending
      assert.equal(response.status, 200)
      assert.equal(response.body.data.collection_id, next.id)
      ctx.assertRaw()
    } finally { release(); await pending }
  })
})
