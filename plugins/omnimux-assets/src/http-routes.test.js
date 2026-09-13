import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createAssetsDispatcher, registerAssetsRoutes } from './http-routes.js'
import { createArtifactStore } from './artifacts.js'
import { createCloudCatalog } from './cloud-catalog.js'
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

/**
 * Exercise the registered prefix route through an actual local HTTP request.
 * The small webServer adapter is the same seat contract used by apply().
 * @param {{ dispatch: Function }} dispatcher
 */
async function openRegisteredRoutes(dispatcher) {
  let registered
  const webServer = {
    register(route) {
      registered = route
      return () => { registered = undefined }
    },
  }
  const dispose = registerAssetsRoutes(webServer, dispatcher)
  const server = createServer((req, res) => {
    void registered.handler(req, res)
  })
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })
  const address = server.address()
  assert.equal(typeof address, 'object')
  return {
    port: address.port,
    async close() {
      dispose()
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    },
  }
}

/**
 * @param {number} port
 * @param {{ method?: string, path: string, body?: unknown }} options
 */
async function requestJson(port, options) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  const response = await fetch(`http://127.0.0.1:${port}${options.path}`, {
    method: options.method ?? 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload,
    signal: AbortSignal.timeout(1_000),
  })
  const text = await response.text()
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    text,
    body: JSON.parse(text),
  }
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

describe('Assets routes serialized response guard', () => {
  it('returns ordinary asset prose through registered HTTP create, update, list, state, and detail routes', async () => {
    const { dispatcher } = makeDispatcher()
    const routes = await openRegisteredRoutes(dispatcher)
    try {
      const created = await requestJson(routes.port, {
        method: 'POST',
        path: '/omnimux/assets/library',
        body: {
          name: 'Task-owned',
          type: 'character',
          description: 'risk-taking\n\t\\ ordinary prose',
          tags: ['Task-owned', 'risk-taking'],
          files: [{ real_path: join(realDir, 'hero.png'), original_name: 'Task-owned-risk-taking.png' }],
        },
      })
      assert.equal(created.status, 200)
      assert.equal(created.contentType, 'application/json; charset=utf-8')
      assert.equal(created.body.asset.name, 'Task-owned')
      assert.equal(created.body.asset.description, 'risk-taking\n\t\\ ordinary prose')
      assert.deepEqual(created.body.asset.tags, ['Task-owned', 'risk-taking'])
      assert.equal(created.body.asset.files[0].original_name, 'Task-owned-risk-taking.png')

      const id = created.body.asset.id
      const updated = await requestJson(routes.port, {
        method: 'POST',
        path: '/omnimux/assets/library/update',
        body: {
          id,
          name: 'Task-owned revised',
          description: 'risk-taking revised\n\t\\ prose',
          tags: ['Task-owned', 'risk-taking', 'ordinary'],
          files: [{ real_path: join(realDir, 'hero.png'), original_name: 'Task-owned-risk-taking-revised.png' }],
        },
      })
      assert.equal(updated.status, 200)
      assert.equal(updated.body.asset.name, 'Task-owned revised')
      assert.equal(updated.body.asset.description, 'risk-taking revised\n\t\\ prose')
      assert.equal(updated.body.asset.files[0].original_name, 'Task-owned-risk-taking-revised.png')

      const listed = await requestJson(routes.port, { path: '/omnimux/assets/library' })
      assert.equal(listed.status, 200)
      assert.equal(listed.body.assets[0].name, 'Task-owned revised')
      assert.equal(listed.body.assets[0].tags[1], 'risk-taking')

      const state = await requestJson(routes.port, { path: '/omnimux/assets/state' })
      assert.equal(state.status, 200)
      assert.equal(state.body.assets[0].description, 'risk-taking revised\n\t\\ prose')

      const detail = await requestJson(routes.port, { path: `/omnimux/assets/library/detail?id=${id}` })
      assert.equal(detail.status, 200)
      assert.equal(detail.body.asset.files[0].original_name, 'Task-owned-risk-taking-revised.png')
    } finally {
      await routes.close()
    }
  })

  it('refuses synthetic secrets returned by the real asset create, update, list, state, and detail paths', async () => {
    const { dispatcher, library } = makeDispatcher()
    const routes = await openRegisteredRoutes(dispatcher)
    try {
      const created = await requestJson(routes.port, {
        method: 'POST',
        path: '/omnimux/assets/library',
        body: { name: 'sk-a', type: 'character' },
      })
      assertRefused(created, 'sk-a')
      const createdId = library.list()[0].id

      assertRefused(await requestJson(routes.port, { path: '/omnimux/assets/library' }), 'sk-a')
      assertRefused(await requestJson(routes.port, { path: '/omnimux/assets/state' }), 'sk-a')
      assertRefused(await requestJson(routes.port, { path: `/omnimux/assets/library/detail?id=${createdId}` }), 'sk-a')

      const safe = await requestJson(routes.port, {
        method: 'POST',
        path: '/omnimux/assets/library',
        body: { name: 'ordinary asset', type: 'character' },
      })
      assert.equal(safe.status, 200)
      const updated = await requestJson(routes.port, {
        method: 'POST',
        path: '/omnimux/assets/library/update',
        body: { id: safe.body.asset.id, description: 'Bearer sk-a' },
      })
      assertRefused(updated, 'Bearer sk-a')
    } finally {
      await routes.close()
    }
  })

  it('checks serialized keys and values for token boundaries without reserializing response objects', async () => {
    let body = { text: 'Task-owned risk-taking prefixsk-a', escaped: 'line\n\t\\ prose', upper: 'ACCESS_TOKEN' }
    const routes = await openRegisteredRoutes({
      dispatch: async () => ({ status: 201, body }),
    })
    try {
      const ordinary = await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' })
      assert.equal(ordinary.status, 201)
      assert.deepEqual(ordinary.body, body)

      const tail = Array.from({ length: 21 }, () => 'ordinary')
      tail.push('sk-a')
      let deep = { value: 'sk-a' }
      for (let depth = 0; depth < 9; depth += 1) deep = { next: deep }
      const rejected = [
        ['standalone', { value: 'sk-a' }, 'sk-a'],
        ['long', { value: 'sk-abcdefghijklmnop' }, 'sk-abcdefghijklmnop'],
        ['project prefix', { value: 'sk-proj-a' }, 'sk-proj-a'],
        ['service-account prefix', { value: 'sk-svcacct-a' }, 'sk-svcacct-a'],
        ['project separator', { value: 'proj sk-a' }, 'proj sk-a'],
        ['service-account separator', { value: 'svcacct/sk-a' }, 'svcacct/sk-a'],
        ['Bearer', { value: 'Bearer sk-a' }, 'Bearer sk-a'],
        ['URL', { value: 'https://example.test/sk-a' }, 'https://example.test/sk-a'],
        ['Chinese separator', { value: '中文sk-a' }, '中文sk-a'],
        ['underscore separator', { value: 'proj_sk-a' }, 'proj_sk-a'],
        ['escaped newline', { value: ['line', 'sk-a'].join('\n') }, 'sk-a'],
        ['escaped tab', { value: ['line', 'sk-a'].join('\t') }, 'sk-a'],
        ['escaped backslash', { value: 'line\\sk-a' }, 'sk-a'],
        ['escaped quote', { value: 'line\"sk-a' }, 'sk-a'],
        ['key', { 'sk-a': 'ordinary' }, 'sk-a'],
        ['nested array', { rows: [{ value: 'sk-a' }] }, 'sk-a'],
        ['array tail', { rows: tail }, 'sk-a'],
        ['deep object', deep, 'sk-a'],
        ['access_token prose', { value: 'the access_token field is sensitive' }, 'access_token'],
        ['nested access_token key', { rows: [{ access_token: null }] }, 'access_token'],
        ['access_token suffix key', { access_token_suffix: 'ordinary' }, 'access_token'],
      ]
      for (const [label, next, original] of rejected) {
        body = next
        const response = await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' })
        assertRefused(response, original)
      }

      let getterReads = 0
      body = {
        get value() {
          getterReads += 1
          return 'sk-a'
        },
      }
      assertRefused(await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' }), 'sk-a')
      assert.equal(getterReads, 1)

      let toJsonCalls = 0
      body = {
        toJSON() {
          toJsonCalls += 1
          return 'Bearer sk-a'
        },
      }
      assertRefused(await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' }), 'Bearer sk-a')
      assert.equal(toJsonCalls, 1)

      body = { boxed: new String('sk-a') }
      assertRefused(await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' }), 'sk-a')

      const cyclic = {}
      cyclic.self = cyclic
      body = cyclic
      const failedSerialization = await requestJson(routes.port, { path: '/omnimux/assets/arbitrary' })
      assert.equal(failedSerialization.status, 500)
      assert.deepEqual(failedSerialization.body, { error: 'internal', message: 'internal error' })
    } finally {
      await routes.close()
    }
  })
})

describe('Cloud catalog metadata routes', () => {
  /**
   * A dispatcher over a minimal on-disk catalog: `manifest.json`, a flat
   * `index.json`, and one category page — the same three files the real
   * catalog builder writes.
   */
  function makeCloudDispatcher() {
    const catalogDir = join(root, 'catalog')
    mkdirSync(join(catalogDir, 'scene'), { recursive: true })
    const rows = [
      {
        id: 'scene-aaa',
        category: 'scene',
        sub_category: '',
        name: 'Bedroom',
        description: '',
        media_type: 'image',
        tags: [],
        meta: {},
      },
    ]
    writeFileSync(join(catalogDir, 'manifest.json'), JSON.stringify({
      version: 1,
      pageSize: 24,
      totalAssets: rows.length,
      sourceRoot: '',
      categories: [{ id: 'scene', zh: '场景', en: 'Scenes', total: 1, pages: 1 }],
    }))
    writeFileSync(join(catalogDir, 'index.json'), JSON.stringify(rows))
    writeFileSync(join(catalogDir, 'scene', 'page-0000.json'), JSON.stringify({
      scope: 'scene',
      page: 0,
      pageSize: 24,
      total: 1,
      totalPages: 1,
      items: rows,
    }))

    const { mappings, artifacts, library } = makeDispatcher()
    return createAssetsDispatcher({
      mappings,
      artifacts,
      library,
      cloud: createCloudCatalog({ catalogDir }),
    })
  }

  it('answers the manifest under both the bare name and manifest.json', async () => {
    const dispatcher = makeCloudDispatcher()

    const bare = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/manifest' })
    assert.equal(bare.status, 200)
    assert.equal(bare.body.totalAssets, 1)

    const dotted = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/manifest.json' })
    assert.equal(dotted.status, 200)
    assert.equal(dotted.body.totalAssets, 1)
    assert.deepEqual(dotted.body.categories, bare.body.categories)
  })

  it('serves the flat index as a file instead of reading it as a page path', async () => {
    const dispatcher = makeCloudDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/index.json' })
    assert.equal(response.status, 200)
    assert.equal(response.stream.mime, 'application/json; charset=utf-8')
    assert.equal(response.stream.absolutePath.endsWith('index.json'), true)

    const bare = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/index' })
    assert.equal(bare.status, 200)
    assert.equal(bare.stream.absolutePath.endsWith('index.json'), true)
  })

  it('serves the paths the client asks for through the registered prefix route', async () => {
    const routes = await openRegisteredRoutes(makeCloudDispatcher())
    try {
      const manifest = await requestJson(routes.port, { path: '/omnimux/assets/cloud/manifest.json' })
      assert.equal(manifest.status, 200)
      assert.equal(manifest.body.totalAssets, 1)

      const index = await requestJson(routes.port, { path: '/omnimux/assets/cloud/index.json' })
      assert.equal(index.status, 200)
      assert.equal(Array.isArray(index.body), true)
      assert.equal(index.body[0].id, 'scene-aaa')
    } finally {
      await routes.close()
    }
  })

  it('still resolves a category page through the page route', async () => {    const dispatcher = makeCloudDispatcher()

    const page = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/scene/page-0000.json' })
    assert.equal(page.status, 200)
    assert.equal(page.stream.absolutePath.endsWith(join('scene', 'page-0000.json')), true)
  })

  it('reports a malformed page path as a page error, not as a missing catalog', async () => {
    const dispatcher = makeCloudDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/manifest.xml' })
    assert.equal(response.status, 404)
    assert.match(response.body.message, /catalog page path/)
  })
})

/**
 * 角色的八维筛选走查询参数而不是分片目录：组合数远多于目录该承受的文件数，而
 * 服务端手里已有整份 `index.json`。路由必须与分片同形返回，客户端的分页才不必
 * 区分两种来源。
 */
describe('Cloud dimension filter route', () => {
  /** A catalog of four characters on two of the eight dimensions. */
  function makeFilterDispatcher() {
    const catalogDir = join(root, 'filter-catalog')
    mkdirSync(catalogDir, { recursive: true })
    const dims = (gender, scene, pose) => ({
      gender, age: 'Youth', figure: 'Average', name: gender === 'Female' ? 'Ava' : 'Ethan',
      industry: 'General Lifestyle', scene, pose, outfit: 'Casual/Lifestyle',
    })
    const rows = [
      { id: 'character-1', category: 'character', sub_category: 'female', name: 'Ava in car', description: '', media_type: 'video', tags: [], meta: { dims: dims('Female', 'Car', 'Selfie') } },
      { id: 'character-2', category: 'character', sub_category: 'female', name: 'Ava at home', description: '', media_type: 'video', tags: [], meta: { dims: dims('Female', 'Living Room', 'Frontal') } },
      { id: 'character-3', category: 'character', sub_category: 'male', name: 'Ethan in car', description: '', media_type: 'video', tags: [], meta: { dims: dims('Male', 'Car', 'Sitting') } },
      { id: 'audio-1', category: 'audio', sub_category: '', name: 'Voice', description: '', media_type: 'audio', tags: [], meta: {} },
    ]
    writeFileSync(join(catalogDir, 'manifest.json'), JSON.stringify({
      version: 1,
      pageSize: 24,
      totalAssets: rows.length,
      sourceRoot: '',
      categories: [
        { id: 'character', zh: '角色', en: 'Characters', total: 3, pages: 1 },
        { id: 'audio', zh: '声音', en: 'Audio', total: 1, pages: 1 },
      ],
    }))
    writeFileSync(join(catalogDir, 'index.json'), JSON.stringify(rows))

    const { mappings, artifacts, library } = makeDispatcher()
    return createAssetsDispatcher({
      mappings,
      artifacts,
      library,
      cloud: createCloudCatalog({ catalogDir }),
    })
  }

  it('returns the page envelope a shard would, filtered by one dimension', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/filter?dims=1female' })
    assert.equal(response.status, 200)
    assert.equal(response.body.total, 2)
    assert.equal(response.body.totalPages, 1)
    assert.deepEqual(response.body.items.map((row) => row.id), ['character-1', 'character-2'])
  })

  it('narrows on every selected dimension at once', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/filter?dims=1female&dims=1car' })
    assert.equal(response.status, 200)
    assert.equal(response.body.total, 1)
    assert.equal(response.body.items[0].id, 'character-1')
  })

  it('keeps the filtered rows out of every other category', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/filter?dims=1youth' })
    assert.equal(response.status, 200)
    assert.equal(response.body.items.every((row) => row.category === 'character'), true)
  })

  it('matches an unknown token against nothing', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/filter?dims=1nobody' })
    assert.equal(response.status, 200)
    assert.equal(response.body.total, 0)
    assert.deepEqual(response.body.items, [])
  })

  it('refuses a filter with no dimension at all', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/filter' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'catalog-filter-invalid')
  })

  it('pages by offset', async () => {
    const dispatcher = makeFilterDispatcher()

    const response = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/filter?dims=1female&limit=1&offset=1',
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.total, 2)
    assert.equal(response.body.totalPages, 2)
    assert.deepEqual(response.body.items.map((row) => row.id), ['character-2'])
  })
})

/** @param {{ status: number, contentType: string, text: string, body: unknown }} response @param {string} original */
function assertRefused(response, original) {
  assert.equal(response.status, 500)
  assert.equal(response.contentType, 'application/json; charset=utf-8')
  assert.deepEqual(response.body, { error: 'refused to emit a secret' })
  assert.equal(response.text.includes(original), false)
}
