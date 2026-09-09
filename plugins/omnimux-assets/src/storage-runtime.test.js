import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, openSync, closeSync, writeSync, symlinkSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as immediate } from 'node:timers/promises'
import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { createHash } from 'node:crypto'
import { AssetsRuntime } from './storage-runtime.js'
import { SafeStorageFS } from './storage-fs.js'
import { createAssetsDispatcher, sendPreview } from './http-routes.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'assets-runtime-'))
  const runtime = new AssetsRuntime(home)
  t.after(() => { runtime.dispose(); rmSync(home, { recursive: true, force: true }) })
  assert.equal((await runtime.initialize()).availability, 'online')
  return { home, runtime, root: runtime.config.active.path, dispatcher: createAssetsDispatcher({ runtime }) }
}

function seedAsset(root, files, extra = {}) {
  writeFileSync(join(root, 'library.json'), JSON.stringify({ schema: 3, revision: 4, migrated_mappings: true,
    assets: [{ id: 'ast_fixture', name: 'Fixture', type: 'custom', tags: [], files, cover_file_id: files[0]?.id, ...extra }], file_inventory: [] }))
}

// Only a lease test double: this intentionally does not claim to implement the
// production helper's no-follow root chain. It opens generated fixture files.
function installFixtureStream(runtime) {
  runtime.fs.openReadStream = async (root, rel) => {
    const handle = await open(join(root, rel), 'r')
    const info = await handle.stat()
    const readable = handle.createReadStream({ highWaterMark: 4096, autoClose: false })
    let closed = false
    return { readable, size: info.size, identity: {}, close: async () => {
      if (closed) return
      closed = true
      readable.destroy()
      await handle.close()
    } }
  }
}

test('commit drains a real opened read stream and refuses new reads', async (t) => {
  const { runtime, root } = await fixture(t)
  writeFileSync(join(root, 'image.png'), Buffer.alloc(128 * 1024, 7))
  installFixtureStream(runtime)
  const stream = await runtime.preview(() => ({ relativePath: 'image.png', mime: 'image/png' }))
  assert.equal(runtime.readers, 1)
  await runtime.freeze('migration')
  let committed = false
  const committing = runtime.beginCommit().then(() => { committed = true })
  await immediate()
  assert.equal(committed, false)
  await assert.rejects(runtime.read(() => true), { code: 'storage-busy' })
  let bytes = 0
  for await (const chunk of stream.readable) bytes += chunk.length
  await stream.release()
  await committing
  assert.equal(bytes, 128 * 1024)
  assert.equal(runtime.readers, 0)
  assert.equal(committed, true)
})

test('response abort destroys the stream and releases the migration barrier', async (t) => {
  const { runtime, root } = await fixture(t)
  writeFileSync(join(root, 'image.png'), Buffer.alloc(256 * 1024))
  installFixtureStream(runtime)
  const stream = await runtime.preview(() => ({ relativePath: 'image.png', mime: 'image/png' }))
  const response = new PassThrough({ highWaterMark: 1 })
  response.writeHead = () => {}
  sendPreview(response, 200, stream)
  const committing = runtime.beginCommit()
  response.destroy()
  await committing
  assert.equal(stream.readable.destroyed, true)
  assert.equal(runtime.readers, 0)
  await stream.release()
  assert.equal(runtime.readers, 0)
})

test('missing helper stream capability refuses preview without leaking a read lease', async (t) => {
  const { runtime, root, dispatcher } = await fixture(t)
  runtime.fs.openReadStream = undefined
  writeFileSync(join(root, 'image.png'), 'fixture')
  seedAsset(root, [{ id: 'fil_fixture', relative_path: 'image.png' }])
  const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/library/preview?id=ast_fixture&file=fil_fixture' })
  assert.equal(result.status, 501)
  assert.equal(result.body.error, 'storage-platform-unsupported')
  assert.equal(runtime.readers, 0)
  await runtime.beginCommit()
})

test('open failure releases lease and preserves the error', async (t) => {
  const { runtime } = await fixture(t)
  runtime.fs.openReadStream = async () => { throw Object.assign(new Error('denied'), { code: 'path-denied' }) }
  await assert.rejects(runtime.preview(() => ({ relativePath: 'x.png' })), { code: 'path-denied' })
  assert.equal(runtime.readers, 0)
  await runtime.beginCommit()
})

test('legacy queued once, frozen requests do not write, thaw restores file IDs and metadata', async (t) => {
  const { runtime, home, root, dispatcher } = await fixture(t)
  const source = join(home, 'legacy.png')
  writeFileSync(source, 'legacy-image')
  seedAsset(root, [{ id: 'fil_original', real_path: source, original_name: '原图.png' }], { description: 'preserve', tags: ['old'] })
  await runtime.installBundle(runtime.config)
  await runtime.freeze('migration')
  const before = readFileSync(join(root, 'library.json'), 'utf8')
  await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/library/detail?id=ast_fixture' })
  assert.equal(readFileSync(join(root, 'library.json'), 'utf8'), before)
  runtime.thaw()
  const [first, second] = await Promise.all([runtime.ensureLegacy(), runtime.ensureLegacy()])
  assert.equal(first, second)
  const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/library/detail?id=ast_fixture' })
  assert.equal(result.status, 200)
  assert.equal(result.body.asset.files[0].id, 'fil_original')
  assert.equal(result.body.asset.cover_file_id, 'fil_original')
  assert.equal(result.body.asset.description, 'preserve')
  assert.deepEqual(result.body.asset.tags, ['old'])
  const ledger = JSON.parse(readFileSync(join(root, 'library.json'), 'utf8'))
  assert.equal(ledger.assets[0].files[0].real_path, undefined)
  assert.ok(ledger.assets[0].files[0].relative_path)
  assert.equal(readFileSync(result.body.asset.files[0].real_path, 'utf8'), 'legacy-image')
  assert.equal(readFileSync(source, 'utf8'), 'legacy-image')
})

test('mapping cache miss writes only under writer gate; frozen reads stay live', async (t) => {
  const { runtime, root, home, dispatcher } = await fixture(t)
  const folder = join(home, 'mapping')
  mkdirSync(folder)
  writeFileSync(join(folder, 'one.png'), 'one')
  const mapping = await runtime.write((bundle) => bundle.mappings.add(folder, 'Mapped'))
  const url = `/omnimux/assets/mappings/files?id=${mapping.id}`
  await runtime.freeze('migration')
  const frozen = await dispatcher.dispatch({ method: 'GET', url })
  assert.equal(frozen.status, 200)
  assert.equal(frozen.body.files.length, 1)
  assert.throws(() => readFileSync(join(root, 'scans', `${mapping.id}.json`)), { code: 'ENOENT' })
  const rescan = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/assets/mappings/rescan', body: { id: mapping.id } })
  assert.equal(rescan.status, 409)
  runtime.thaw()
  const normal = await dispatcher.dispatch({ method: 'GET', url })
  assert.equal(normal.status, 200)
  assert.equal(JSON.parse(readFileSync(join(root, 'scans', `${mapping.id}.json`))).length, 1)
})

test('upload hashes and copies generated media asynchronously while freeze waits for ledger', async (t) => {
  const { runtime, home, root } = await fixture(t)
  const source = join(home, 'large.mp4')
  const chunk = Buffer.alloc(1024 * 1024, 13)
  const fd = openSync(source, 'wx')
  const hash = createHash('sha256')
  for (let i = 0; i < 64; i += 1) { writeSync(fd, chunk); hash.update(chunk) }
  closeSync(fd)
  const expected = hash.digest('hex')
  const entered = deferred()
  const allow = deferred()
  const originalInstall = runtime.fs.install.bind(runtime.fs)
  runtime.fs.install = async (entry) => { entered.resolve(); await allow.promise; return originalInstall(entry) }
  let ticks = 0
  let maxRss = process.memoryUsage().rss
  const baseRss = maxRss
  const timer = setInterval(() => { ticks += 1; maxRss = Math.max(maxRss, process.memoryUsage().rss) }, 5)
  t.after(() => clearInterval(timer))
  const upload = runtime.write((bundle) => bundle.artifacts.report(source, { agent: 'fixture', run_id: 'run' }))
  await entered.promise
  let frozen = false
  const freezing = runtime.freeze('migration').then(() => { frozen = true })
  await immediate()
  assert.equal(frozen, false)
  await assert.rejects(runtime.write(() => true), { code: 'storage-busy' })
  allow.resolve()
  const record = await upload
  await freezing
  clearInterval(timer)
  assert.ok(ticks > 0, 'event loop must run during hash/copy')
  assert.ok(maxRss - baseRss < 48 * 1024 * 1024, `RSS growth ${maxRss - baseRss}`)
  assert.ok(record.content_ref.includes(expected))
  assert.equal(record.size, 64 * 1024 * 1024)
  assert.equal((await runtime.fs.hash(root, record.content_ref)).sha256, expected)
  assert.equal(JSON.parse(readFileSync(join(root, 'artifacts.json'))).artifacts[0].id, record.id)
  assert.equal(runtime.writers, 0)
})

test('runtime does not conceal corrupt Home configuration or missing active ledger', async (t) => {
  const { runtime, root } = await fixture(t)
  const configFile = join(runtime.paths.controlDir, 'root.json')
  const config = readFileSync(configFile)
  writeFileSync(configFile, '{bad')
  await assert.rejects(runtime.read(() => true), { code: 'ledger-corrupt' })
  writeFileSync(configFile, config)
  rmSync(join(root, 'library.json'))
  await assert.rejects(runtime.read(() => true))
  assert.throws(() => readFileSync(join(root, 'library.json')), { code: 'ENOENT' })
  assert.equal(runtime.readers, 0)
})

test('root replacement fails closed and does not initialize a replacement library', async (t) => {
  const { runtime, root } = await fixture(t)
  renameSync(root, `${root}-old`)
  mkdirSync(root)
  await assert.rejects(runtime.write(() => true), { code: 'root-identity-changed' })
  assert.throws(() => readFileSync(join(root, 'library.json')), { code: 'ENOENT' })
})

test('second runtime cannot take a live Home writer lock', async (t) => {
  const { home } = await fixture(t)
  const second = new AssetsRuntime(home)
  t.after(() => second.dispose())
  assert.notEqual((await second.initialize()).availability, 'online')
  await assert.rejects(second.write(() => true))
})

test('directory browse excludes unsafe leaves and does not truncate at 2000', async (t) => {
  const { runtime, root, home, dispatcher } = await fixture(t)
  const dir = join(root, 'folder')
  mkdirSync(dir)
  for (let i = 0; i < 2005; i += 1) writeFileSync(join(dir, `${i}.png`), 'fixture')
  writeFileSync(join(home, 'outside.png'), 'outside')
  symlinkSync(join(home, 'outside.png'), join(dir, 'escape.png'))
  seedAsset(root, [{ id: 'fil_folder', relative_path: 'folder' }])
  const entries = []
  let cursor = ''
  do {
    const result = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/library/files?id=ast_fixture&file=fil_folder&limit=200&cursor=${cursor}` })
    assert.equal(result.status, 200)
    assert.ok(result.body.entries.length <= 200)
    entries.push(...result.body.entries)
    cursor = result.body.nextCursor
  } while (cursor)
  assert.equal(entries.filter((entry) => entry.status === 'available').length, 2005)
  assert.equal(entries.filter((entry) => entry.status === 'excluded').length, 1)
  assert.equal(new Set(entries.map((entry) => entry.relative_path)).size, 2006)
  const detail = await runtime.read((bundle) => bundle.library.getView('ast_fixture'))
  assert.equal(detail.files.length, 0, 'unsafe directory must not be offered to project materialization')
})

test('artifact endpoints await upload completion and preserve detail output', async (t) => {
  const { runtime, home, dispatcher } = await fixture(t)
  writeFileSync(join(home, 'out.png'), 'image')
  const record = await runtime.write((bundle) => bundle.artifacts.report(join(home, 'out.png'), { agent: 'fixture' }))
  const list = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/artifacts' })
  assert.equal(list.body.artifacts.length, 1)
  const detail = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/artifacts/detail?id=${record.id}` })
  assert.equal(detail.body.artifact.id, record.id)
})

test('small text upload fails explicitly when safe privacy reader is missing', async (t) => {
  const { runtime, home, root } = await fixture(t)
  runtime.fs.openReadStream = undefined
  writeFileSync(join(home, 'out.json'), '{}')
  await assert.rejects(runtime.write((bundle) => bundle.artifacts.report(join(home, 'out.json'))), { code: 'storage-platform-unsupported' })
  assert.equal(JSON.parse(readFileSync(join(root, 'artifacts.json'))).artifacts.length, 0)
  assert.equal(runtime.writers, 0)
})

test('worker death rejects operations instead of restarting an unlocked writer', async (t) => {
  const { runtime } = await fixture(t)
  const child = runtime.fs.child
  const exited = once(child, 'exit')
  child.kill()
  await exited
  await assert.rejects(runtime.write(() => true), { code: 'recovery-required' })
  assert.equal(runtime.fs.child, null)
})

test('missing Python is explicit unsupported and never creates default content', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'assets-runtime-python-'))
  const runtime = new AssetsRuntime(home, new SafeStorageFS(join(home, 'missing-python')))
  t.after(() => { runtime.dispose(); rmSync(home, { recursive: true, force: true }) })
  assert.equal((await runtime.initialize()).availability, 'storage-platform-unsupported')
  await assert.rejects(runtime.read(() => true), { code: 'storage-platform-unsupported' })
  assert.throws(() => readFileSync(join(runtime.paths.defaultRoot, 'library.json')), { code: 'ENOENT' })
})
