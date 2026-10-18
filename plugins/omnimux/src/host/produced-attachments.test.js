import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { createProducedAttachmentService } from './produced-attachments.js'

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'produced-attachments-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'source'); mkdirSync(source)
  const cwd = join(root, 'workspace'); mkdirSync(cwd)
  let query = { observeSession: async id => ({ header: { cwd: id === 'session' ? cwd : '' } }) }
  const options = { receiptRoot: join(root, 'receipts'), getSessionQuery: () => query }
  const service = createProducedAttachmentService(options)
  service.registerSource('test-domain', source)
  const input = files => ({ sessionId: 'session', sourcePlugin: 'test-domain', requestId: 'request', files })
  const file = (name, bytes = name) => { const path = join(source, name); writeFileSync(path, bytes); return { path } }
  return { root, source, cwd, options, service, input, file, setQuery: value => { query = value } }
}

test('materializes exact selected bytes as session-relative references without exposing private paths', async t => {
  const f = fixture(t)
  const files = [f.file('body.md', '# 原帖'), f.file('image.jpg', 'image'), f.file('clip.mp4', 'video')]
  files[1].title = '独立图片'
  const { results } = await f.service.materializeProduced(f.input(files))
  assert.deepEqual(results.map(row => row.kind), ['document', 'image', 'video'])
  assert.equal(results[1].title, '独立图片')
  for (const [index, row] of results.entries()) {
    assert.equal(row.ok, true)
    assert.match(row.relativePath, /^assets\/imported\//)
    assert.deepEqual(readFileSync(join(f.cwd, row.relativePath)), readFileSync(files[index].path))
    assert.equal('sourcePath' in row, false)
    assert.equal('cwd' in row, false)
  }
})

test('source registration is scoped, reference-counted and explicitly disposable', async t => {
  const f = fixture(t)
  const stop = f.service.registerSource('another-domain', f.source)
  const stopAgain = f.service.registerSource('another-domain', f.source)
  assert.throws(() => f.service.registerSource('another-domain', f.cwd), /attachment-source-conflict/)
  stop()
  const input = { ...f.input([f.file('body.md')]), sourcePlugin: 'another-domain' }
  assert.equal((await f.service.materializeProduced(input)).results[0].ok, true)
  stopAgain()
  await assert.rejects(f.service.materializeProduced(input), /needs-attachment-source/)
  assert.throws(() => f.service.registerSource('invalid/source', f.source), /invalid-attachment-source/)
  assert.throws(() => f.service.registerSource('missing-domain', join(f.root, 'missing')), /invalid-attachment-source/)
})

test('late session query injection is honored and a missing or default session never copies', async t => {
  const f = fixture(t)
  const input = f.input([f.file('body.md')])
  f.setQuery(null)
  await assert.rejects(f.service.materializeProduced(input), /needs-session-query/)
  f.setQuery({ observeSession: async () => ({ header: { cwd: f.cwd } }) })
  assert.equal((await f.service.materializeProduced(input)).results[0].ok, true)
  await assert.rejects(f.service.materializeProduced({ ...input, sessionId: 'default' }), /invalid-payload/)
  f.setQuery({ observeSession: async () => ({ header: {} }) })
  await assert.rejects(f.service.materializeProduced({ ...input, requestId: 'missing' }), /session-not-found/)
})

test('rejects traversal, unregistered roots, source leaf and intermediate symlink escapes per item', async t => {
  const f = fixture(t)
  const outside = join(f.root, 'outside'); mkdirSync(outside)
  const privateFile = join(outside, 'private.txt'); writeFileSync(privateFile, 'private')
  const leaf = join(f.source, 'link.txt'); symlinkSync(privateFile, leaf)
  symlinkSync(outside, join(f.source, 'linked'))
  const directory = join(f.source, 'directory'); mkdirSync(directory)
  const files = [
    { path: privateFile }, { path: leaf }, { path: join(f.source, 'linked', 'private.txt') },
    { path: `${f.source}/../outside/private.txt` }, { path: 'relative.txt' }, { path: directory },
  ]
  const { results } = await f.service.materializeProduced(f.input(files))
  assert.deepEqual(results.map(row => row.error), ['path-denied', 'not-a-file', 'path-denied', 'path-denied', 'invalid-path', 'not-a-file'])
  assert.equal(readdirSync(f.cwd).length, 0)
  assert.equal(JSON.stringify(results).includes(privateFile), false)
  assert.equal(readFileSync(privateFile, 'utf8'), 'private')
})

for (const level of ['assets', 'imported']) test(`rejects target ${level} symlink before writing outside session`, async t => {
  const f = fixture(t)
  const outside = join(f.root, 'outside'); mkdirSync(outside)
  if (level === 'imported') mkdirSync(join(f.cwd, 'assets'))
  symlinkSync(outside, level === 'assets' ? join(f.cwd, 'assets') : join(f.cwd, 'assets', 'imported'))
  const { results } = await f.service.materializeProduced(f.input([f.file('body.md')]))
  assert.equal(results[0].error, 'import-directory-invalid')
  assert.deepEqual(readdirSync(outside), [])
})

test('concurrent retry and service restart reuse durable successful copies; conflicting input fails', async t => {
  const f = fixture(t)
  const input = f.input([f.file('body.md'), f.file('clip.mp4')])
  const [a, b] = await Promise.all([f.service.materializeProduced(input), f.service.materializeProduced(input)])
  assert.deepEqual(a, b)
  assert.equal(readdirSync(join(f.cwd, 'assets', 'imported')).length, 2)
  const restarted = createProducedAttachmentService(f.options)
  restarted.registerSource('test-domain', f.source)
  assert.deepEqual(await restarted.materializeProduced(input), a)
  await assert.rejects(restarted.materializeProduced({ ...input, files: [{ ...input.files[0], title: 'changed' }] }), /request-conflict/)
})

test('partial failures retain explicit results and retry only unresolved items', async t => {
  const f = fixture(t)
  const good = f.file('body.md')
  const missing = { path: join(f.source, 'image.jpg') }
  const input = f.input([good, missing])
  const first = await f.service.materializeProduced(input)
  assert.deepEqual(first.results.map(row => row.ok), [true, false])
  assert.equal(first.results[1].error, 'not-a-file')
  writeFileSync(missing.path, 'image')
  const next = await f.service.materializeProduced(input)
  assert.deepEqual(next.results.map(row => row.ok), [true, true])
  assert.equal(next.results[0].relativePath, first.results[0].relativePath)
  assert.equal(readdirSync(join(f.cwd, 'assets', 'imported')).length, 2)
})

test('receipt retry preserves user changes and dangling symlinks while rebuilding a fresh copy', async t => {
  const f = fixture(t)
  const input = f.input([f.file('body.md', 'original')])
  const first = (await f.service.materializeProduced(input)).results[0]
  const previous = join(f.cwd, first.relativePath)
  writeFileSync(previous, 'modified')
  const second = (await f.service.materializeProduced(input)).results[0]
  assert.notEqual(second.relativePath, first.relativePath)
  assert.equal(readFileSync(previous, 'utf8'), 'modified')
  const secondPath = join(f.cwd, second.relativePath)
  rmSync(secondPath); symlinkSync(join(f.root, 'missing'), secondPath)
  const third = (await f.service.materializeProduced(input)).results[0]
  assert.notEqual(third.relativePath, second.relativePath)
  assert.equal(readFileSync(join(f.cwd, third.relativePath), 'utf8'), 'original')
})

test('changed source content cannot silently replace the reference behind the same request', async t => {
  const f = fixture(t)
  const source = f.file('body.md', 'original')
  const input = f.input([source])
  const first = (await f.service.materializeProduced(input)).results[0]
  writeFileSync(source.path, 'modified')
  const next = (await f.service.materializeProduced(input)).results[0]
  assert.equal(next.error, 'attachment-source-changed')
  assert.equal(readFileSync(join(f.cwd, first.relativePath), 'utf8'), 'original')
  assert.equal(readdirSync(join(f.cwd, 'assets', 'imported')).length, 1)
})

test('pre-cancelled materialization throws and does not create session files', async t => {
  const f = fixture(t)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(f.service.materializeProduced(f.input([f.file('body.md')]), { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(readdirSync(f.cwd), [])
})

test('cancelling a duplicate waiter does not cancel the first materialization', async t => {
  const f = fixture(t)
  let release
  f.setQuery({ observeSession: () => new Promise(resolve => { release = () => resolve({ header: { cwd: f.cwd } }) }) })
  const input = f.input([f.file('body.md')])
  const first = f.service.materializeProduced(input)
  const controller = new AbortController()
  const second = f.service.materializeProduced(input, { signal: controller.signal })
  controller.abort()
  await assert.rejects(second, { name: 'AbortError' })
  release()
  assert.equal((await first).results[0].ok, true)
})
