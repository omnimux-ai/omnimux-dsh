import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, get } from 'node:http'
import { once } from 'node:events'
import { AssetsRuntime } from './storage-runtime.js'
import { createAssetsDispatcher, registerAssetsRoutes } from './http-routes.js'

/** Serve only generated fixture data through the actual registered HTTP route. */
async function fixture(t, files) {
  const home = mkdtempSync(join(tmpdir(), 'assets-storage-http-'))
  const runtime = new AssetsRuntime(home)
  t.after(() => { runtime.dispose(); rmSync(home, { recursive: true, force: true }) })
  assert.equal((await runtime.initialize()).availability, 'online')
  const root = runtime.config.active.path
  writeFileSync(join(root, 'library.json'), JSON.stringify({ schema: 3, revision: 1, migrated_mappings: true,
    assets: [{ id: 'ast_http', name: 'Generated', type: 'custom', files }], file_inventory: [] }))
  const dispatcher = createAssetsDispatcher({ runtime })
  let handler = null
  registerAssetsRoutes({ register: (route) => { handler = route.handler; return () => {} } }, dispatcher)
  const server = createServer((req, res) => { void handler(req, res) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}/omnimux/assets`
  return { runtime, root, home, base, dispatcher }
}

async function response(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.once('error', reject)
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }))
    })
    req.once('error', reject)
  })
}

test('available migrated refs list and preview through registered HTTP with real helper bytes', async (t) => {
  const { runtime, root, base } = await fixture(t, [{ id: 'fil_http', relative_path: 'image.png', status: 'available' }])
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 43)
  writeFileSync(join(root, 'image.png'), bytes)
  const listing = await response(`${base}/library/files?id=ast_http&file=fil_http`)
  assert.equal(listing.status, 200)
  assert.equal(JSON.parse(listing.bytes).entries[0].name, 'image.png')
  const preview = await response(`${base}/library/preview?id=ast_http&file=fil_http&epoch=${runtime.config.epoch}`)
  assert.equal(preview.status, 200)
  assert.equal(preview.headers['content-type'], 'image/png')
  assert.equal(Number(preview.headers['content-length']), bytes.length)
  assert.deepEqual(preview.bytes, bytes)
  await runtime.beginCommit()
  assert.equal(runtime.readers, 0)
  assert.equal(runtime.fs.streams.size, 0)
})

test('available directory ref browses and previews nested bytes without a logical path reopen', async (t) => {
  const { root, base } = await fixture(t, [{ id: 'fil_dir', relative_path: 'folder', status: 'available' }])
  mkdirSync(join(root, 'folder', 'nested'), { recursive: true })
  writeFileSync(join(root, 'folder', 'nested', 'image.png'), 'nested fixture')
  const listing = await response(`${base}/library/files?id=ast_http&file=fil_dir&path=nested`)
  assert.equal(listing.status, 200)
  assert.equal(JSON.parse(listing.bytes).entries[0].relative_path, 'nested/image.png')
  const preview = await response(`${base}/library/preview?id=ast_http&file=fil_dir&path=nested/image.png`)
  assert.equal(preview.status, 200)
  assert.equal(preview.bytes.toString(), 'nested fixture')
})

test('HTTP abort waits for real helper FD close before releasing commit barrier', async (t) => {
  const { runtime, root, base } = await fixture(t, [{ id: 'fil_http', relative_path: 'image.png', status: 'available' }])
  writeFileSync(join(root, 'image.png'), Buffer.alloc(4 * 1024 * 1024, 51))
  const originalOpen = runtime.fs.openReadStream.bind(runtime.fs)
  let finishClose
  let enteredClose
  const allowClose = new Promise((resolve) => { finishClose = resolve })
  const closing = new Promise((resolve) => { enteredClose = resolve })
  t.after(() => finishClose())
  runtime.fs.openReadStream = async (...args) => {
    const opened = await originalOpen(...args)
    return { ...opened, close: async () => { enteredClose(); await allowClose; await opened.close() } }
  }
  await new Promise((resolve, reject) => {
    const req = get(`${base}/library/preview?id=ast_http&file=fil_http`, (res) => {
      assert.equal(res.statusCode, 200)
      res.once('data', () => { res.destroy(); resolve() })
      res.once('error', reject)
    })
    req.once('error', reject)
  })
  await closing
  let committed = false
  const committing = runtime.beginCommit().then(() => { committed = true })
  assert.equal(runtime.readers, 1)
  assert.equal(committed, false)
  const busy = await response(`${base}/library/preview?id=ast_http&file=fil_http`)
  assert.equal(busy.status, 409)
  finishClose()
  await committing
  assert.equal(runtime.readers, 0)
  assert.equal(runtime.fs.streams.size, 0)
})

test('HTTP preview refuses stale epochs, unavailable refs and symlinks without opening a lease', async (t) => {
  const { runtime, root, home, base } = await fixture(t, [
    { id: 'fil_http', relative_path: 'image.png', status: 'available' },
    { id: 'fil_skip', status: 'unmigrated', logical_path: 'old/image.png' },
    { id: 'fil_excluded', relative_path: 'image.png', status: 'excluded' },
  ])
  writeFileSync(join(home, 'outside.png'), 'outside sentinel')
  symlinkSync(join(home, 'outside.png'), join(root, 'image.png'))
  const stale = await response(`${base}/library/preview?id=ast_http&file=fil_http&epoch=${runtime.config.epoch + 1}`)
  assert.equal(stale.status, 409)
  assert.equal(JSON.parse(stale.bytes).error, 'stale-root')
  for (const id of ['fil_skip', 'fil_excluded']) {
    const result = await response(`${base}/library/preview?id=ast_http&file=${id}`)
    assert.equal(result.status, 400)
    assert.equal(JSON.parse(result.bytes).error, 'path-not-found')
  }
  const denied = await response(`${base}/library/preview?id=ast_http&file=fil_http`)
  assert.equal(denied.status, 422)
  assert.equal(JSON.parse(denied.bytes).error, 'path-denied')
  assert.equal(runtime.readers, 0)
  assert.equal(runtime.fs.streams.size, 0)
})
