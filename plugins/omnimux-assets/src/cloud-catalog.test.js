import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createCloudCatalog } from './cloud-catalog.js'
import { createAssetsDispatcher, resolveCatalogPagePath } from './http-routes.js'
import { createArtifactStore } from './artifacts.js'
import { createLibraryStore } from './library.js'
import { createMappingStore } from './mappings.js'

let root
let sourceRoot
let catalogDir

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-cloud-'))
  sourceRoot = join(root, 'library')
  catalogDir = join(root, 'catalog')
  mkdirSync(sourceRoot, { recursive: true })
  mkdirSync(catalogDir, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Write a real media file under the catalog's source root. */
function writeMedia(relPath, body = 'media-bytes') {
  const abs = join(sourceRoot, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

/**
 * Materialize a miniature catalog on disk: a manifest, an index, and page files
 * laid out exactly like the builder's output.
 * @param {{ sourceRoot?: string, rows?: object[], categories?: object[] }} [opts]
 */
function writeCatalog(opts = {}) {
  const rows = opts.rows ?? [
    {
      id: 'scene-ambience-aaa',
      category: 'scene',
      sub_category: 'ambience',
      name: 'Bedroom',
      description: '卧室氛围',
      media_type: 'video',
      media_url: 'file:素材/卧室.mp4',
      cover_url: 'file:素材/卧室-poster.jpg',
      tags: ['场景氛围'],
    },
    {
      id: 'audio-voiceover-bbb',
      category: 'audio',
      sub_category: 'voiceover',
      name: '林潇 2.0',
      description: '火山引擎官方音色',
      media_type: 'audio',
      media_url: '',
      cover_url: '',
      tags: ['火山引擎'],
    },
    {
      id: 'scene-ambience-ccc',
      category: 'scene',
      sub_category: 'ambience',
      name: 'Kitchen',
      description: '厨房氛围',
      media_type: 'video',
      media_url: 'https://cdn.example.com/kitchen.mp4',
      cover_url: '',
      tags: ['场景氛围'],
    },
  ]
  const categories = opts.categories ?? [
    {
      id: 'scene',
      zh: '场景',
      en: 'Scenes',
      total: 2,
      pages: 1,
      sub_categories: [{ id: 'ambience', zh: '场景氛围', en: 'Ambience', total: 2, pages: 1 }],
    },
    {
      id: 'audio',
      zh: '声音',
      en: 'Audio',
      total: 1,
      pages: 1,
      sub_categories: [{ id: 'voiceover', zh: '配音', en: 'Voiceover', total: 1, pages: 1 }],
    },
  ]
  writeFileSync(join(catalogDir, 'manifest.json'), JSON.stringify({
    version: 1,
    generatedAt: '2026-09-13T00:00:00.000Z',
    pageSize: 24,
    totalAssets: rows.length,
    sourceRoot: opts.sourceRoot ?? sourceRoot,
    categories,
  }))
  writeFileSync(join(catalogDir, 'index.json'), JSON.stringify(rows))

  const scenes = rows.filter((row) => row.category === 'scene')
  mkdirSync(join(catalogDir, 'scene'), { recursive: true })
  writeFileSync(join(catalogDir, 'scene', 'page-0000.json'), JSON.stringify({
    scope: 'scene',
    page: 0,
    pageSize: 24,
    total: scenes.length,
    totalPages: 1,
    items: scenes,
  }))
  return rows
}

function makeCatalog(opts = {}) {
  return createCloudCatalog({ catalogDir, ...opts })
}

function makeStores() {
  const storeDir = join(root, 'store')
  return {
    mappings: createMappingStore({
      paths: { mappingsFile: join(storeDir, 'mappings.json'), scansDir: join(storeDir, 'scans') },
    }),
    artifacts: createArtifactStore({
      paths: { artifactsFile: join(storeDir, 'artifacts.json'), artifactsDir: join(storeDir, 'artifacts') },
    }),
    library: createLibraryStore({ paths: { libraryFile: join(storeDir, 'library.json') } }),
  }
}

describe('createCloudCatalog: manifest and index', () => {
  it('reports not ready when no catalog has been built', () => {
    const cloud = makeCatalog()
    assert.equal(cloud.ready(), false)
    assert.throws(() => cloud.getManifest(), /catalog is not built/)
  })

  it('serves the manifest and per-row lookup once built', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.ready(), true)
    assert.equal(cloud.getManifest().totalAssets, 3)
    assert.equal(cloud.getRow('scene-ambience-aaa').name, 'Bedroom')
    assert.equal(cloud.getRow('missing'), null)
  })

  it('re-reads the catalog after reload()', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.getManifest().totalAssets, 3)
    writeCatalog({ rows: [] })
    cloud.reload()
    assert.equal(cloud.getManifest().totalAssets, 0)
  })
})

describe('createCloudCatalog: media resolution', () => {
  it('resolves a file: locator to an on-disk stream inside the source root', () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const cloud = makeCatalog()
    const resolved = cloud.resolveRowMedia('scene-ambience-aaa', 'media')
    assert.equal(resolved.kind, 'local')
    assert.equal(resolved.mime, 'video/mp4')
    assert.equal(resolved.size, 'video-bytes'.length)
  })

  it('reports remote locators as redirects instead of proxying them', () => {
    writeCatalog()
    const cloud = makeCatalog()
    const resolved = cloud.resolveRowMedia('scene-ambience-ccc', 'media')
    assert.deepEqual(resolved, { kind: 'remote', url: 'https://cdn.example.com/kitchen.mp4' })
  })

  it('returns null for a descriptor-only row with no media at all', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('audio-voiceover-bbb', 'media'), null)
  })

  it('returns null for an unknown id so an id is not a file handle', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('../../etc/passwd', 'media'), null)
  })

  it('refuses a locator whose .. escapes the recorded source root', () => {
    writeFileSync(join(root, 'outside.txt'), 'secret')
    writeCatalog({
      rows: [{
        id: 'scene-ambience-evil',
        category: 'scene',
        sub_category: 'ambience',
        name: 'evil',
        description: '',
        media_type: 'video',
        media_url: 'file:../outside.txt',
        cover_url: '',
        tags: [],
      }],
    })
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-ambience-evil', 'media'), null)
  })

  it('refuses a catalog built for a different machine instead of guessing', () => {
    writeMedia('素材/卧室.mp4')
    writeCatalog({ sourceRoot: '/somewhere/else/资产库' })
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-ambience-aaa', 'media'), null)
  })

  it('reports a missing file as unavailable rather than throwing', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-ambience-aaa', 'media'), null)
  })

  it('reports no cover rather than handing a video to an <img>', () => {
    writeMedia('素材/卧室.mp4')
    writeCatalog()
    const cloud = makeCatalog()
    // The row's cover locator points at a poster that does not exist, so the
    // only real media left is the video. A cover request must stay image-or-
    // nothing instead of streaming 2 MB into an image slot.
    assert.equal(cloud.resolveRowMedia('scene-ambience-aaa', 'cover'), null)
  })

  it('resolves a cover when the row really has a poster', () => {
    writeMedia('素材/卧室.mp4')
    writeMedia('素材/卧室-poster.jpg')
    writeCatalog()
    const cloud = makeCatalog()
    const resolved = cloud.resolveRowMedia('scene-ambience-aaa', 'cover')
    assert.equal(resolved.kind, 'local')
    assert.equal(resolved.mime, 'image/jpeg')
  })

  it('falls back to the recorded remote URL when the local copy is gone', () => {
    // No local files at all: the catalog was built here but the library moved.
    writeCatalog()
    const rows = JSON.parse(JSON.stringify([
      {
        id: 'scene-ambience-remote',
        category: 'scene',
        sub_category: 'ambience',
        name: 'Remote only',
        description: '',
        media_type: 'video',
        media_url: 'file:素材/缺失.mp4',
        cover_url: '',
        tags: [],
        meta: { source_media_url: 'https://cdn.example.com/fallback.mp4' },
      },
    ]))
    writeCatalog({ rows })
    const cloud = makeCatalog()
    assert.deepEqual(
      cloud.resolveRowMedia('scene-ambience-remote', 'media'),
      { kind: 'remote', url: 'https://cdn.example.com/fallback.mp4' },
    )
  })
})

describe('createCloudCatalog: search', () => {
  it('matches name, description, and tags', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: 'bedroom' }).total, 1)
    assert.equal(cloud.search({ q: '厨房' }).total, 1)
    assert.equal(cloud.search({ q: '场景氛围' }).total, 2)
  })

  it('scopes to a category and a sub-category', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: '', category: 'audio' }).total, 1)
    assert.equal(cloud.search({ q: '', category: 'audio', subCategory: 'voiceover' }).total, 1)
    assert.equal(cloud.search({ q: '', category: 'audio', subCategory: 'bgm' }).total, 0)
  })

  it('pages the result set', () => {
    writeCatalog()
    const cloud = makeCatalog()
    const first = cloud.search({ q: '', category: 'scene', limit: 1, offset: 0 })
    assert.equal(first.total, 2)
    assert.equal(first.items.length, 1)
    const second = cloud.search({ q: '', category: 'scene', limit: 1, offset: 1 })
    assert.equal(second.items.length, 1)
    assert.notEqual(first.items[0].id, second.items[0].id)
  })

  it('refuses to search before the catalog exists', () => {
    assert.throws(() => makeCatalog().search({ q: 'x' }), /catalog is not built/)
  })
})

describe('createCloudCatalog: save to local', () => {
  it('copies a local asset into the library', async () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const asset = await cloud.saveToLocal('scene-ambience-aaa')
    assert.equal(asset.name, 'Bedroom')
    assert.equal(asset.type, 'scene')
    assert.equal(asset.source, 'cloud:scene-ambience-aaa')
    assert.equal(library.list().length, 1)
  })

  it('saves a descriptor-only row as a library record with no files', async () => {
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const asset = await cloud.saveToLocal('audio-voiceover-bbb')
    assert.equal(asset.name, '林潇 2.0')
    assert.deepEqual(asset.files, [])
    assert.match(asset.description, /audio-voiceover-bbb/)
  })

  it('downloads a remote asset through the injected fetch', async () => {
    writeCatalog()
    const { library } = makeStores()
    const requested = []
    const fetchImpl = async (url) => {
      requested.push(url)
      return {
        ok: true,
        headers: { get: (name) => (name === 'content-type' ? 'video/mp4' : null) },
        arrayBuffer: async () => new TextEncoder().encode('remote-bytes').buffer,
      }
    }
    const cloud = makeCatalog({ library, fetchImpl })
    const asset = await cloud.saveToLocal('scene-ambience-ccc')
    assert.deepEqual(requested, ['https://cdn.example.com/kitchen.mp4'])
    assert.equal(asset.files.length, 1)
    assert.equal(library.list().length, 1)
  })

  it('rejects an unknown id', async () => {
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    await assert.rejects(() => cloud.saveToLocal('nope'), /cloud asset not found/)
  })
})

describe('resolveCatalogPagePath', () => {
  it('maps a category page to its padded file name', () => {
    const file = resolveCatalogPagePath(catalogDir, ['scene', 'page-0000.json'])
    assert.equal(file, join(catalogDir, 'scene', 'page-0000.json'))
  })

  it('maps a sub-category page two levels deep', () => {
    const file = resolveCatalogPagePath(catalogDir, ['audio', 'bgm', 'page-0012.json'])
    assert.equal(file, join(catalogDir, 'audio', 'bgm', 'page-0012.json'))
  })

  it('pads a short page number', () => {
    const file = resolveCatalogPagePath(catalogDir, ['scene', 'page-7'])
    assert.equal(file, join(catalogDir, 'scene', 'page-0007.json'))
  })

  it('refuses a traversal segment', () => {
    assert.throws(() => resolveCatalogPagePath(catalogDir, ['..', 'page-0000.json']), /invalid catalog scope/)
    assert.throws(() => resolveCatalogPagePath(catalogDir, ['scene', '..', 'page-0000.json']), /invalid catalog scope/)
  })

  it('refuses a path that is not a catalog page', () => {
    assert.throws(() => resolveCatalogPagePath(catalogDir, ['scene', 'index.json']), /invalid catalog page name/)
    assert.throws(() => resolveCatalogPagePath(catalogDir, ['scene']), /catalog page path/)
    assert.throws(
      () => resolveCatalogPagePath(catalogDir, ['a', 'b', 'c', 'page-0000.json']),
      /catalog page path/,
    )
  })
})

describe('cloud routes', () => {
  function makeDispatcher(cloud) {
    const stores = makeStores()
    return createAssetsDispatcher({ ...stores, cloud })
  }

  it('serves the manifest', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/manifest' })
    assert.equal(result.status, 200)
    assert.equal(result.body.totalAssets, 3)
  })

  it('streams a page file from disk', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/scene/page-0000.json',
    })
    assert.equal(result.status, 200)
    assert.match(result.stream.absolutePath, /scene[/\\]page-0000\.json$/)
    assert.match(result.stream.mime, /application\/json/)
  })

  it('404s an absent page file', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/scene/page-9999.json',
    })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'catalog-not-found')
  })

  it('refuses a traversal in the page path', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/../../package.json',
    })
    assert.equal(result.status, 404)
  })

  it('answers 503 for cloud routes when no catalog is mounted', async () => {
    const dispatcher = makeDispatcher(undefined)
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/assets/cloud/manifest' })
    assert.equal(result.status, 404)
  })

  it('streams local media', async () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/media?id=scene-ambience-aaa&which=media',
    })
    assert.equal(result.status, 200)
    assert.equal(result.stream.mime, 'video/mp4')
  })

  it('redirects remote media to its CDN URL', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/media?id=scene-ambience-ccc&which=media',
    })
    assert.equal(result.status, 302)
    assert.equal(result.redirect, 'https://cdn.example.com/kitchen.mp4')
  })

  it('404s media for a descriptor-only row', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/media?id=audio-voiceover-bbb',
    })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'cloud-media-unavailable')
  })

  it('serves search with a category scope', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/search?q=&category=scene',
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.total, 2)
  })

  it('saves a cloud asset into the local library', async () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const stores = makeStores()
    const cloud = makeCatalog({ library: stores.library })
    const dispatcher = createAssetsDispatcher({ ...stores, cloud })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/assets/cloud/save',
      body: { id: 'scene-ambience-aaa' },
      secFetchSite: 'same-origin',
      origin: 'http://127.0.0.1:45120',
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.asset.name, 'Bedroom')
    assert.equal(stores.library.list().length, 1)
  })

  it('refuses a cross-origin save', async () => {
    writeCatalog()
    const stores = makeStores()
    const dispatcher = createAssetsDispatcher({ ...stores, cloud: makeCatalog({ library: stores.library }) })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/assets/cloud/save',
      body: { id: 'scene-ambience-aaa' },
      origin: 'https://evil.example.com',
    })
    assert.equal(result.status, 403)
  })
})
