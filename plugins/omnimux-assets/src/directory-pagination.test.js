import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { AssetsRuntime } from './storage-runtime.js'
import { createAssetsDispatcher, registerAssetsRoutes } from './http-routes.js'
import { createDirectoryFeed } from './client/directory-feed.js'
import { listAssetFiles } from './client/api.js'
import { StoragePlanner } from './storage-plan.js'
import { AssetsError } from './storage-types.js'

async function fixture(t, count = 0, logical = false) {
  const home = mkdtempSync(new URL('../.pagination-fixture-', import.meta.url).pathname)
  const runtime = new AssetsRuntime(home)
  let server
  t.after(async () => { if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }; runtime.dispose(); rmSync(home, { recursive: true, force: true }) })
  assert.equal((await runtime.initialize()).availability, 'online')
  const root = runtime.config.active.path
  mkdirSync(join(root, 'folder'))
  const files = []
  for (let i = 0; i < count; i += 1) {
    const name = `image-${String(i).padStart(5, '0')}.png`
    writeFileSync(join(root, 'folder', name), `fixture ${i}`)
    if (logical) files.push({ id: `fil_${i}`, relative_path: `folder/${name}`, logical_path: `素材/${name}`, kind: 'image', status: 'available' })
  }
  if (!logical) files.push({ id: 'fil_folder', relative_path: 'folder', original_name: 'folder', kind: 'directory', status: 'available' })
  const ledger = { schema: 3, revision: 1, migrated_mappings: true, assets: [{ id: 'ast_page', name: 'Generated', type: 'custom', files }], file_inventory: [] }
  const save = () => writeFileSync(join(root, 'library.json'), JSON.stringify(ledger))
  save()
  let handler
  registerAssetsRoutes({ register(route) { handler = route.handler; return () => {} } }, createAssetsDispatcher({ runtime }))
  server = createServer((req, res) => { void handler(req, res) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const fetchOriginal = globalThis.fetch
  const requests = []
  t.mock.method(globalThis, 'fetch', (path, options) => { requests.push(String(path)); return fetchOriginal(new URL(path, base), options) })
  const get = async (query) => { const res = await fetchOriginal(`${base}/omnimux/assets/library/files?id=ast_page&${query}`); return { status: res.status, body: await res.json() } }
  return { root, runtime, ledger, save, get, requests, base, fetchOriginal }
}

test('2001 real files traverse registered HTTP through the client feed without truncation', async (t) => {
  const { requests } = await fixture(t, 2001)
  const feed = createDirectoryFeed(listAssetFiles)
  await feed.navigate({ assetId: 'ast_page', fileId: 'fil_folder', path: '', logical: false })
  const names = []
  let pages = 0
  do {
    const page = feed.getSnapshot()
    assert.equal(page.error, '')
    assert.ok(page.entries.length <= 100)
    names.push(...page.entries.map((row) => row.name))
    pages += 1
    if (!page.nextCursor) break
    await feed.next()
  } while (pages < 30)
  assert.equal(pages, 21)
  assert.equal(names.length, 2001)
  assert.equal(new Set(names).size, 2001)
  assert.equal(names.at(-1), 'image-02000.png')
  assert.equal(requests.length, 21)
  assert.ok(requests.slice(1).every((path) => path.includes('cursor=') && path.includes('limit=100')))
  await feed.previous()
  assert.equal(feed.getSnapshot().page, 19)
  assert.equal(feed.getSnapshot().entries[0].name, 'image-01900.png')
})

for (const logical of [false, true]) test(`10000 real files paginate completely in ${logical ? 'logical' : 'physical'} mode`, async (t) => {
  const { get, root } = await fixture(t, 10000, logical)
  const seen = new Set()
  let cursor = ''
  let pages = 0
  do {
    const query = logical ? 'logical=1&path=素材' : 'file=fil_folder'
    const response = await get(`${query}&limit=200&cursor=${cursor}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.entries.length, 200)
    assert.equal(response.body.epoch, 0)
    for (const row of response.body.entries) {
      const key = logical ? row.fileId : row.relative_path
      assert.equal(seen.has(key), false)
      seen.add(key)
      assert.equal(row.real_path, undefined)
    }
    cursor = response.body.nextCursor
    pages += 1
  } while (cursor && pages <= 50)
  assert.equal(pages, 50)
  assert.equal(cursor, null)
  assert.equal(seen.size, 10000)
  if (logical) {
    const top = await get('logical=1')
    assert.equal(top.body.entries[0].virtual, true)
    assert.equal(top.body.entries[0].real_path, undefined)
    assert.equal(top.body.entries[0].fileId, undefined)
  }
  assert.ok(root)
})

test('2001 logical leaves bind client paging and preview the real fileId at a different physical path', async (t) => {
  const { base, fetchOriginal, requests } = await fixture(t, 2001, true)
  const feed = createDirectoryFeed()
  await feed.navigate({ assetId: 'ast_page', logical: true, path: '素材' })
  const ids = []
  do {
    const page = feed.getSnapshot()
    assert.equal(page.error, '')
    ids.push(...page.entries.map((row) => row.fileId))
    if (!page.nextCursor) break
    await feed.next()
  } while (ids.length <= 2001)
  assert.equal(new Set(ids).size, 2001)
  assert.equal(requests.length, 21)
  assert.ok(requests.every((path) => path.includes('logical=1')))
  const preview = await fetchOriginal(`${base}/omnimux/assets/library/preview?id=ast_page&file=${ids.at(-1)}&epoch=0`)
  assert.equal(preview.status, 200)
  assert.equal(await preview.text(), 'fixture 2000')
})

test('directory mutation invalidates cursors and client refresh starts a fresh first page', async (t) => {
  const { root, get } = await fixture(t, 201)
  const feed = createDirectoryFeed()
  await feed.navigate({ assetId: 'ast_page', fileId: 'fil_folder' })
  const token = feed.getSnapshot().nextCursor
  writeFileSync(join(root, 'folder', 'new.png'), 'changed')
  assert.equal((await get(`file=fil_folder&cursor=${token}`)).status, 409)
  await feed.next()
  assert.match(feed.getSnapshot().error, /refresh/)
  assert.deepEqual(feed.getSnapshot().entries, [])
  await feed.refresh()
  assert.equal(feed.getSnapshot().error, '')
  assert.equal(feed.getSnapshot().page, 0)
  assert.equal(feed.getSnapshot().total, 202)
  for (const limit of ['0', '201', '-1', '1.5', 'x']) assert.equal((await get(`file=fil_folder&limit=${limit}`)).status, 400)
  assert.equal((await get('file=fil_folder&cursor=broken')).status, 400)
  assert.equal((await get('file=fil_folder&epoch=999')).status, 409)
})

test('planner retains empty subdirectories and per-item exclusion metadata in HTTP logical layers', async (t) => {
  const { root, runtime, ledger, save, get } = await fixture(t, 1)
  mkdirSync(join(root, 'folder', 'empty'))
  symlinkSync('/outside-sentinel', join(root, 'folder', 'excluded.png'))
  const target = join(root, '..', 'target')
  mkdirSync(target)
  mkdirSync(join(target, 'adopt', 'empty'), { recursive: true })
  writeFileSync(join(target, 'adopt', 'image.png'), 'adopted')
  symlinkSync('/outside-sentinel', join(target, 'adopt', 'excluded.png'))
  const retained = { id: 'old-excluded', status: 'excluded', logical_path: 'folder/old.png', recovery_ref: { taskId: 'old-task', entryId: 'old-entry', reason: 'old reason' } }
  ledger.assets[0].files.push(retained)
  save()
  const planner = new StoragePlanner(runtime.fs)
  const plan = planner.build(await planner.scan(root, target))
  const source = plan.sourceValues['library.json'].assets[0]
  assert.deepEqual(source.files.find((file) => file.id === retained.id), retained)
  assert.ok(source.files.some((file) => file.logical_path === 'folder/empty' && file.kind === 'directory'))
  const exclusion = source.files.find((file) => file.status === 'excluded')
  assert.equal(exclusion.logical_path, 'folder/excluded.png')
  assert.ok(exclusion.recovery_ref.entryId)
  assert.ok(exclusion.recovery_ref.reason)
  const adopted = plan.targetValues['library.json'].assets.find((asset) => asset.name === 'adopt')
  assert.ok(adopted.files.some((file) => file.logical_path === 'adopt/empty' && file.kind === 'directory'))
  assert.ok(adopted.files.find((file) => file.status === 'excluded').recovery_ref.entryId)
  ledger.assets[0].files = source.files
  save()
  const response = await get('logical=1&path=folder')
  assert.equal(response.status, 200)
  assert.ok(response.body.entries.some((row) => row.name === 'empty' && row.is_dir && row.fileId))
  assert.ok(response.body.entries.some((row) => row.name === 'excluded.png' && row.status === 'excluded'))
})

test('HTTP directory IO failures remain explicit and logical cursors expire with ledger changes', async (t) => {
  const { runtime, ledger, save, get } = await fixture(t, 201, true)
  const first = await get('logical=1&path=素材&limit=100')
  ledger.revision += 1
  ledger.assets[0].files[0].status = 'unmigrated'
  save()
  assert.equal((await get(`logical=1&path=素材&cursor=${first.body.nextCursor}`)).status, 409)
  const original = runtime.fs.request.bind(runtime.fs)
  runtime.fs.request = (op, args, ...rest) => op === 'stat' && args.rel.startsWith('folder/')
    ? Promise.reject(new AssetsError('directory-unreadable', 'EIO fixture')) : original(op, args, ...rest)
  const failed = await get('logical=1&path=素材')
  assert.equal(failed.status, 503)
  assert.equal(failed.body.error, 'directory-unreadable')
  assert.match(failed.body.message, /EIO/)
  assert.equal(failed.body.entries, undefined)
})

test('empty, unavailable, denied and unsafe directories are not silently conflated', async (t) => {
  const { root, get, ledger, save } = await fixture(t)
  assert.deepEqual((await get('file=fil_folder')).body.entries, [])
  symlinkSync('/outside-sentinel', join(root, 'folder', 'link.png'))
  const excluded = await get('file=fil_folder')
  assert.equal(excluded.body.entries[0].status, 'excluded')
  chmodSync(join(root, 'folder'), 0)
  try { assert.equal((await get('file=fil_folder')).status, 503) } finally { chmodSync(join(root, 'folder'), 0o700) }
  ledger.assets[0].files.push({ id: 'skip', status: 'unmigrated', logical_path: '素材/skipped.png', recovery_ref: { taskId: 'task', entryId: 'entry', reason: 'skipped' } })
  save()
  const logical = await get('logical=1&path=素材')
  assert.equal(logical.body.entries[0].fileId, 'skip')
  assert.equal(logical.body.entries[0].status, 'unmigrated')
  assert.equal(logical.body.entries[0].recovery_ref.entryId, 'entry')
  assert.equal(logical.body.entries[0].real_path, undefined)
})
