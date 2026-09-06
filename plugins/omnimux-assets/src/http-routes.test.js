import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createAssetsDispatcher } from './http-routes.js'
import { createArtifactStore } from './artifacts.js'
import { createLibraryStore } from './library.js'
import { createMappingStore } from './mappings.js'

let root
let realDir

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-routes-'))
  realDir = join(root, 'scan-target')
  mkdirSync(realDir)
  writeFileSync(join(realDir, 'hero.png'), 'png')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeDispatcher(opts = {}) {
  const storeDir = join(root, 'store')
  const mappings = createMappingStore({
    paths: {
      mappingsFile: join(storeDir, 'mappings.json'),
      scansDir: join(storeDir, 'scans'),
    },
  })
  const artifacts = createArtifactStore({
    paths: {
      artifactsFile: join(storeDir, 'artifacts.json'),
      artifactsDir: join(storeDir, 'artifacts'),
    },
  })
  const library = createLibraryStore({
    paths: { libraryFile: join(storeDir, 'library.json') },
  })
  const deps = { mappings, artifacts, library }
  if (opts.picker) deps.picker = opts.picker
  return { dispatcher: createAssetsDispatcher(deps), mappings, artifacts, library }
}

/** POST with default local headers. */
function post(path, body, extra = {}) {
  return { method: 'POST', url: path, body, ...extra }
}

describe('AssetsDispatcher state', () => {
  it('returns full state initially and unchanged when revisions match', async () => {
    const { dispatcher, library } = makeDispatcher()
    const first = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/state' })
    assert.equal(first.status, 200)
    assert.equal(first.body.unchanged, false)
    assert.equal(first.body.lrev, 0)
    assert.deepEqual(first.body.assets, [])
    assert.deepEqual(first.body.mappings, [])

    await library.add({ name: '林晓', type: 'character' })
    const second = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/state?mrev=0&arev=0' })
    assert.equal(second.status, 200)
    assert.equal(second.body.unchanged, false)
    assert.equal(second.body.assets.length, 1)

    const mrev = second.body.mrev
    const third = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/state?mrev=${mrev}&arev=0` })
    assert.equal(third.body.unchanged, true)
    assert.equal(third.body.lrev, mrev)
  })

  it('creates a creative asset over POST /library', async () => {
    const { dispatcher, library } = makeDispatcher()
    const nested = join(realDir, 'looks')
    mkdirSync(nested)
    writeFileSync(join(nested, 'front.png'), 'png')
    const created = await dispatcher.dispatch(post('/omnimux/assets/library', {
      name: '林晓',
      type: 'character',
      description: '冷白皮',
      files: [{ real_path: realDir }],
    }))
    assert.equal(created.status, 200)
    assert.equal(created.body.asset.type, 'character')
    assert.equal(created.body.asset.cite, '@角色/林晓')
    assert.equal(library.list().length, 1)

    const conflict = await dispatcher.dispatch(post('/omnimux/assets/library', { name: '林晓', type: 'scene' }))
    assert.equal(conflict.status, 409)
    assert.equal(conflict.body.error, 'name-conflict')

    const updated = await dispatcher.dispatch(post('/omnimux/assets/library/update', {
      id: created.body.asset.id,
      description: '冷白皮长直发',
    }))
    assert.equal(updated.status, 200)
    assert.equal(updated.body.asset.description, '冷白皮长直发')

    const listed = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/library?type=character&q=冷白' })
    assert.equal(listed.status, 200)
    assert.equal(listed.body.assets.length, 1)

    const fileId = created.body.asset.files[0].id
    const layer = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux/assets/library/files?id=${created.body.asset.id}&file=${fileId}`,
    })
    assert.equal(layer.status, 200)
    assert.equal(layer.body.entries.some((row) => row.name === 'hero.png' && !row.is_dir), true)
    assert.equal(layer.body.entries.some((row) => row.name === 'looks' && row.is_dir), true)
    assert.equal(layer.body.entries.some((row) => row.name === 'front.png'), false)
    const inner = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux/assets/library/files?id=${created.body.asset.id}&file=${fileId}&path=looks`,
    })
    assert.equal(inner.body.entries.map((row) => row.name).join(), 'front.png')
    const preview = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux/assets/library/preview?id=${created.body.asset.id}&file=${fileId}&path=looks/front.png`,
    })
    assert.equal(preview.status, 200)
    assert.equal(preview.stream.mime, 'image/png')
    assert.equal(preview.stream.absolutePath.endsWith('front.png'), true)
    const previewFolder = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux/assets/library/preview?id=${created.body.asset.id}&file=${fileId}`,
    })
    assert.equal(previewFolder.status, 400)
    const escaped = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux/assets/library/files?id=${created.body.asset.id}&file=${fileId}&path=..`,
    })
    assert.equal(escaped.status, 400)

    const deleted = await dispatcher.dispatch(post('/omnimux/assets/library/delete', { id: created.body.asset.id }))
    assert.equal(deleted.status, 200)
    assert.equal(library.list().length, 0)
  })

  it('copies on POST /library and returns 413 when disk is short', async () => {
    const { dispatcher, library } = makeDispatcher()
    const created = await dispatcher.dispatch(post('/omnimux/assets/library', {
      name: '副本',
      type: 'character',
      files: [{ real_path: join(realDir, 'hero.png') }],
    }))
    assert.equal(created.status, 200)
    assert.equal(created.body.asset.files[0].relative_path.startsWith(`data/files/${created.body.asset.id}/`), true)
    assert.equal(JSON.stringify(created.body.asset.files[0].relative_path).includes('/Users'), false)
    const listed = library.list()
    assert.equal(listed[0].files[0].real_path.startsWith(join(root, 'store')), true)
  })
})

describe('AssetsDispatcher loopback guard', () => {
  it('rejects cross-origin POST writes with 403 not-local', async () => {
    const { dispatcher } = makeDispatcher()
    const evil = post('/omnimux/assets/mappings', { path: realDir, name: 'x' }, { origin: 'http://evil.example' })
    const result = await dispatcher.dispatch(evil)
    assert.equal(result.status, 403)
    assert.equal(result.body.error, 'not-local')

    const crossSite = post('/omnimux/assets/mappings', { path: realDir, name: 'x' }, { secFetchSite: 'cross-site' })
    const refused = await dispatcher.dispatch(crossSite)
    assert.equal(refused.status, 403)
    assert.equal(refused.body.error, 'not-local')
  })

  it('accepts localhost origins and same-origin fetches', async () => {
    const { dispatcher } = makeDispatcher()
    const local = post('/omnimux/assets/mappings', { path: realDir, name: 'x' }, { origin: 'http://127.0.0.1:3210' })
    const a = await dispatcher.dispatch(local)
    assert.equal(a.status, 200)
    const sameOrigin = post('/omnimux/assets/mappings', { path: realDir, name: 'y' }, { secFetchSite: 'same-origin' })
    const b = await dispatcher.dispatch(sameOrigin)
    assert.equal(b.status, 200)
  })
})

describe('AssetsDispatcher mappings routes', () => {
  it('validates JSON bodies with invalid-json', async () => {
    const { dispatcher } = makeDispatcher()
    const bad = await dispatcher.dispatch(post('/omnimux/assets/mappings', null))
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error, 'invalid-json')
  })

  it('adds, renames, lists files, rescans, and deletes mappings', async () => {
    const { dispatcher } = makeDispatcher()

    const added = await dispatcher.dispatch(post('/omnimux/assets/mappings', { path: realDir, name: '素材' }))
    assert.equal(added.status, 200)
    const id = added.body.mapping.id
    assert.equal(added.body.mapping.status, 'ok')

    const files = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/mappings/files?id=${id}` })
    assert.equal(files.status, 200)
    assert.equal(files.body.files.length, 1)
    assert.equal(files.body.files[0].name, 'hero.png')

    const renamed = await dispatcher.dispatch(post('/omnimux/assets/mappings/rename', { id, name: '新名字' }))
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.mapping.display_name, '新名字')

    const rescan = await dispatcher.dispatch(post('/omnimux/assets/mappings/rescan', { id }))
    assert.equal(rescan.status, 200)
    assert.equal(rescan.body.files.length, 1)

    const deleted = await dispatcher.dispatch(post('/omnimux/assets/mappings/delete', { id }))
    assert.equal(deleted.status, 200)
    assert.equal(typeof deleted.body.mrev, 'number')

    const missing = await dispatcher.dispatch(post('/omnimux/assets/mappings/delete', { id }))
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error, 'mapping-not-found')
  })

  it('surfaces path validation failures as 400 error codes', async () => {
    const { dispatcher } = makeDispatcher()
    const notFound = await dispatcher.dispatch(post('/omnimux/assets/mappings', { path: join(root, 'nope'), name: 'x' }))
    assert.equal(notFound.status, 400)
    assert.equal(notFound.body.error, 'path-not-found')

    const noName = await dispatcher.dispatch(post('/omnimux/assets/mappings', { path: realDir, name: '' }))
    assert.equal(noName.status, 400)
    assert.equal(noName.body.error, 'name-required')
  })

  it('drills into sub directories with relative paths, and refuses escapes', async () => {
    mkdirSync(join(realDir, 'nested'))
    writeFileSync(join(realDir, 'nested', 'deep.png'), 'png')
    const { dispatcher } = makeDispatcher()
    const added = await dispatcher.dispatch(post('/omnimux/assets/mappings', { path: realDir, name: '根' }))
    const id = added.body.mapping.id

    const sub = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/mappings/files?id=${id}&path=nested` })
    assert.equal(sub.status, 200)
    assert.equal(sub.body.files.length, 1)
    assert.equal(sub.body.files[0].name, 'deep.png')
    assert.equal(sub.body.files[0].relative_path, 'nested/deep.png')

    const escapeAttempt = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/mappings/files?id=${id}&path=..%2F..` })
    assert.equal(escapeAttempt.status, 400)
    assert.equal(escapeAttempt.body.error, 'path-denied')

    const missing = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/mappings/files?id=${id}&path=no-such-sub` })
    assert.equal(missing.status, 400)
    assert.equal(missing.body.error, 'path-not-found')
  })

  it('accepts a file path and lists it as a single-entry file mapping', async () => {
    const { dispatcher } = makeDispatcher()
    const added = await dispatcher.dispatch(post('/omnimux/assets/mappings', { path: join(realDir, 'hero.png'), name: '单图' }))
    assert.equal(added.status, 200)
    assert.equal(added.body.mapping.kind, 'file')

    const files = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/mappings/files?id=${added.body.mapping.id}` })
    assert.equal(files.status, 200)
    assert.equal(files.body.files.length, 1)
    assert.equal(files.body.files[0].name, 'hero.png')
    assert.equal(files.body.files[0].is_dir, false)
  })

  it('picks a native path through the injected picker', async () => {
    const { dispatcher } = makeDispatcher({
      picker: async (kind) => ({
        path: kind === 'file' ? '/tmp/a.png' : '/tmp/dir',
        paths: kind === 'file' ? ['/tmp/a.png', '/tmp/b.jpg'] : ['/tmp/dir'],
      }),
    })
    const pickedFile = await dispatcher.dispatch(post('/omnimux/assets/pick', { kind: 'file' }))
    assert.equal(pickedFile.status, 200)
    assert.equal(pickedFile.body.path, '/tmp/a.png')
    assert.deepEqual(pickedFile.body.paths, ['/tmp/a.png', '/tmp/b.jpg'])

    const pickedDir = await dispatcher.dispatch(post('/omnimux/assets/pick', {}))
    assert.equal(pickedDir.body.path, '/tmp/dir')
    assert.deepEqual(pickedDir.body.paths, ['/tmp/dir'])
  })

  it('reports picker cancellation as a null path', async () => {
    const { dispatcher } = makeDispatcher({ picker: async () => ({ path: null, paths: [] }) })
    const cancelled = await dispatcher.dispatch(post('/omnimux/assets/pick', { kind: 'directory' }))
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.path, null)
    assert.deepEqual(cancelled.body.paths, [])
  })
})

describe('AssetsDispatcher artifacts routes', () => {
  it('lists, filters by type, and resolves details', async () => {
    const { dispatcher, artifacts } = makeDispatcher()
    writeFileSync(join(realDir, 'out.json'), '{}')
    const artifact = artifacts.report(join(realDir, 'out.json'), { agent: 'a', run_id: 'r' })

    const empty = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/artifacts' })
    assert.equal(empty.status, 200)
    assert.equal(empty.body.artifacts.length, 1)

    const sameRev = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/artifacts?arev=${empty.body.arev}` })
    assert.equal(sameRev.body.unchanged, true)

    const filtered = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/artifacts?type=image' })
    assert.equal(filtered.status, 200)
    assert.equal(filtered.body.artifacts.length, 0)

    const detail = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/assets/artifacts/detail?id=${artifact.id}` })
    assert.equal(detail.status, 200)
    assert.equal(detail.body.artifact.id, artifact.id)

    const missing = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/artifacts/detail?id=art_missing' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error, 'artifact-not-found')
  })
})

describe('AssetsDispatcher unknown routes', () => {
  it('answers 404 with a structured error body', async () => {
    const { dispatcher } = makeDispatcher()
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/nope' })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'not-found')
  })
})
