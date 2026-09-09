import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createArtifactStore } from './artifacts.js'

let root
let srcDir
let artifactsDir
let artifactsFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-artifacts-'))
  srcDir = join(root, 'out')
  mkdirSync(srcDir)
  artifactsDir = join(root, 'store', 'artifacts')
  artifactsFile = join(root, 'store', 'artifacts.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeStore() {
  return createArtifactStore({
    paths: { artifactsFile, artifactsDir },
  })
}

describe('ArtifactStore report', () => {
  it('copies content-addressed and records full source metadata', () => {
    const src = join(srcDir, 'hero.png')
    writeFileSync(src, 'pngbytes')
    const store = makeStore()
    const artifact = store.report(src, { agent: 'image_painter_v2', run_id: 'run_1', model: 'm1' })

    assert.match(artifact.id, /^art_[0-9a-f]{8}$/)
    assert.equal(artifact.title, 'hero.png')
    assert.equal(artifact.type, 'image')
    assert.equal(artifact.mime, 'image/png')
    assert.equal(artifact.size, 8)
    assert.equal(artifact.source.agent, 'image_painter_v2')
    assert.equal(artifact.source.model, 'm1')
    assert.equal(artifact.source.run_id, 'run_1')
    assert.equal(artifact.source.traced, true)
    assert.deepEqual(artifact.input_refs, [])
    assert.deepEqual(artifact.tags, [])
    assert.ok(!Number.isNaN(Date.parse(artifact.created_at)))

    const digest = createHash('sha256').update('pngbytes').digest('hex')
    assert.equal(artifact.content_ref, `artifacts/${digest.slice(0, 2)}/${digest}.png`)
    assert.equal(existsSync(join(artifactsDir, digest.slice(0, 2), `${digest}.png`)), true)
    assert.equal(store.revision(), 1)
  })

  it('backfills missing source fields and stays untraced', () => {
    const src = join(srcDir, 'note.txt')
    writeFileSync(src, 'hello')
    const store = makeStore()
    const artifact = store.report(src, {})
    assert.equal(artifact.source.agent, 'unknown')
    assert.equal(artifact.source.model, '')
    assert.equal(artifact.source.prompt_hash, '')
    assert.equal(artifact.source.run_id, '')
    assert.equal(artifact.source.session_id, '')
    assert.equal(artifact.source.traced, false)
    assert.equal(artifact.title, 'note.txt')
    assert.equal(artifact.type, 'document')
  })

  it('traced requires both agent and run_id', () => {
    const src = join(srcDir, 'half.png')
    writeFileSync(src, 'half')
    const store = makeStore()
    assert.equal(store.report(src, { agent: 'a' }).source.traced, false)
    assert.equal(store.report(src, { run_id: 'r' }).source.traced, false)
  })

  it('dedupes identical content into one stored blob', () => {
    const first = join(srcDir, 'one.png')
    const second = join(srcDir, 'two.png')
    writeFileSync(first, 'same')
    writeFileSync(second, 'same')
    const store = makeStore()
    const a = store.report(first, { agent: 'a' }, 'One')
    const b = store.report(second, { agent: 'a' }, 'Two')
    assert.equal(a.content_ref, b.content_ref)
    const prefixDir = join(artifactsDir, a.content_ref.split('/')[1])
    assert.deepEqual(readdirSync(prefixDir).length, 1)
    assert.equal(store.list().length, 2)
    assert.equal(store.revision(), 2)
  })

  it('respects an explicit title', () => {
    const src = join(srcDir, 'hero.png')
    writeFileSync(src, 'x')
    const store = makeStore()
    const artifact = store.report(src, { agent: 'a' }, '落日 hero')
    assert.equal(artifact.title, '落日 hero')
  })

  it('rejects missing files and non-files', () => {
    const store = makeStore()
    assert.throws(() => store.report(join(srcDir, 'missing.png'), { agent: 'a' }), (error) => error.code === 'path-not-found')
    assert.throws(() => store.report(srcDir, { agent: 'a' }), (error) => error.code === 'path-not-found')
  })

  it('refuses content that looks like a secret token and persists nothing', () => {
    const secret = join(srcDir, 'leak.json')
    writeFileSync(secret, '{"token": "sk-abcdefghijklmnop"}')
    writeFileSync(join(srcDir, 'ok.txt'), 'clean')
    const store = makeStore()
    assert.throws(
      () => store.report(secret, { agent: 'a' }),
      (error) => error.code === 'secret-detected',
    )
    assert.throws(
      () => store.report(join(srcDir, 'ok.txt'), { agent: 'a' }, 'key sk-abcdefghijklmnop'),
      (error) => error.code === 'secret-detected',
    )
    assert.equal(store.revision(), 0)
    assert.equal(store.list().length, 0)
    assert.equal(existsSync(artifactsDir), false)
  })
})

describe('ArtifactStore list/get/persist', () => {
  it('filters by type and resolves by id', () => {
    writeFileSync(join(srcDir, 'a.png'), 'a')
    writeFileSync(join(srcDir, 'b.json'), 'b')
    const store = makeStore()
    const imageArtifact = store.report(join(srcDir, 'a.png'), { agent: 'a' })
    const jsonArtifact = store.report(join(srcDir, 'b.json'), { agent: 'a' })
    assert.equal(store.list().length, 2)
    assert.deepEqual(store.list({ type: 'image' }).map((row) => row.id), [imageArtifact.id])
    assert.deepEqual(store.list({ type: 'json' }).map((row) => row.id), [jsonArtifact.id])
    assert.equal(store.get(jsonArtifact.id).title, 'b.json')
    assert.equal(store.get('art_missing'), null)
  })

  it('persists 0600 and reloads across store instances', () => {
    writeFileSync(join(srcDir, 'a.png'), 'a')
    const first = makeStore()
    first.report(join(srcDir, 'a.png'), { agent: 'a', run_id: 'r' })
    assert.equal(statSync(artifactsFile).mode & 0o777, 0o600)

    const second = createArtifactStore({
      paths: { artifactsFile, artifactsDir },
    })
    assert.equal(second.revision(), 1)
    assert.equal(second.list().length, 1)
    assert.equal(second.list()[0].source.traced, true)
  })

  it('falls back to an empty index on corrupted JSON', () => {
    mkdirSync(join(root, 'store'), { recursive: true })
    writeFileSync(artifactsFile, '{oops', { mode: 0o600 })
    const store = makeStore()
    assert.equal(store.revision(), 0)
    assert.equal(store.list().length, 0)
    writeFileSync(join(srcDir, 'a.png'), 'a')
    store.report(join(srcDir, 'a.png'), { agent: 'a' })
    assert.equal(store.list().length, 1)
  })
})
