import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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
      id: 'scene-nature-aaa',
      category: 'scene',
      sub_category: 'nature',
      name: 'Bedroom',
      description: '卧室氛围',
      media_type: 'video',
      media_url: 'file:素材/卧室.mp4',
      cover_url: 'file:素材/卧室-poster.jpg',
      tags: ['自然山水'],
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
      id: 'scene-nature-ccc',
      category: 'scene',
      sub_category: 'nature',
      name: 'Kitchen',
      description: '厨房氛围',
      media_type: 'video',
      media_url: 'https://cdn.example.com/kitchen.mp4',
      cover_url: '',
      tags: ['自然山水'],
    },
  ]
  const categories = opts.categories ?? [
    {
      id: 'scene',
      zh: '场景',
      en: 'Scenes',
      total: 2,
      pages: 1,
      sub_categories: [{ id: 'nature', zh: '自然山水', en: 'Nature', total: 2, pages: 1 }],
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

/** Every staged file under `.staging`, absolute and sorted, slices included. */
function stagedPaths(dir = join(catalogDir, '.staging')) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const child = join(dir, entry.name)
      return entry.isDirectory() ? stagedPaths(child) : [child]
    })
    .sort()
}

/** Poll until `predicate()` holds: a staged download lands on a later tick. */
async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.ok(predicate(), 'timed out waiting for the expected state')
}

/** A successful remote answer whose content type follows the URL. */
function remoteOk(url) {
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(String(url))
  return {
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? (isImage ? 'image/jpeg' : 'video/mp4') : null) },
    arrayBuffer: async () => new TextEncoder().encode('remote-bytes').buffer,
  }
}

/** Collect `console.error` lines for the duration of `body`. */
async function captureConsoleError(body) {
  const logged = []
  const original = console.error
  console.error = (...args) => { logged.push(args.join(' ')) }
  try {
    await body()
  } finally {
    console.error = original
  }
  return logged
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
    assert.equal(cloud.getRow('scene-nature-aaa').name, 'Bedroom')
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
    const resolved = cloud.resolveRowMedia('scene-nature-aaa', 'media')
    assert.equal(resolved.kind, 'local')
    assert.equal(resolved.mime, 'video/mp4')
    assert.equal(resolved.size, 'video-bytes'.length)
  })

  it('reports remote locators as redirects instead of proxying them', () => {
    writeCatalog()
    const cloud = makeCatalog()
    const resolved = cloud.resolveRowMedia('scene-nature-ccc', 'media')
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
        id: 'scene-nature-evil',
        category: 'scene',
        sub_category: 'nature',
        name: 'evil',
        description: '',
        media_type: 'video',
        media_url: 'file:../outside.txt',
        cover_url: '',
        tags: [],
      }],
    })
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-nature-evil', 'media'), null)
  })

  it('refuses a catalog built for a different machine instead of guessing', () => {
    writeMedia('素材/卧室.mp4')
    writeCatalog({ sourceRoot: '/somewhere/else/资产库' })
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-nature-aaa', 'media'), null)
  })

  it('reports a missing file as unavailable rather than throwing', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.resolveRowMedia('scene-nature-aaa', 'media'), null)
  })

  it('reports no cover rather than handing a video to an <img>', () => {
    writeMedia('素材/卧室.mp4')
    writeCatalog()
    const cloud = makeCatalog()
    // The row's cover locator points at a poster that does not exist, so the
    // only real media left is the video. A cover request must stay image-or-
    // nothing instead of streaming 2 MB into an image slot.
    assert.equal(cloud.resolveRowMedia('scene-nature-aaa', 'cover'), null)
  })

  it('resolves a cover when the row really has a poster', () => {
    writeMedia('素材/卧室.mp4')
    writeMedia('素材/卧室-poster.jpg')
    writeCatalog()
    const cloud = makeCatalog()
    const resolved = cloud.resolveRowMedia('scene-nature-aaa', 'cover')
    assert.equal(resolved.kind, 'local')
    assert.equal(resolved.mime, 'image/jpeg')
  })

  it('falls back to the recorded remote URL when the local copy is gone', () => {
    // No local files at all: the catalog was built here but the library moved.
    writeCatalog()
    const rows = JSON.parse(JSON.stringify([
      {
        id: 'scene-nature-remote',
        category: 'scene',
        sub_category: 'nature',
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
      cloud.resolveRowMedia('scene-nature-remote', 'media'),
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
    assert.equal(cloud.search({ q: '自然山水' }).total, 2)
  })

  it('scopes to a category and a sub-category', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: '', category: 'audio' }).total, 1)
    assert.equal(cloud.search({ q: '', category: 'audio', subCategory: 'voiceover' }).total, 1)
    assert.equal(cloud.search({ q: '', category: 'audio', subCategory: 'bgm' }).total, 0)
  })

  it('reads the 全部 scope as the whole catalog rather than an empty category', () => {
    writeCatalog()
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: '', category: 'all' }).total, 3)
    assert.equal(cloud.search({ q: '卧室', category: 'all' }).total, 1)
    assert.equal(cloud.search({ q: '', category: 'all', subCategory: 'nature' }).total, 2)
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

  it('narrows by the selected dimensions as well as by the needle', () => {
    // The search box narrows what the chips narrowed: 女性 plus a male name must
    // answer with nothing rather than with the male row that name belongs to.
    writeCatalog({
      rows: [
        { id: 'character-female', category: 'character', sub_category: 'female', name: 'Ava in car', description: '', media_type: 'video', tags: [], meta: { dims: { gender: 'Female', scene: 'Car' } } },
        { id: 'character-male', category: 'character', sub_category: 'male', name: 'Ethan in car', description: '', media_type: 'video', tags: [], meta: { dims: { gender: 'Male', scene: 'Car' } } },
      ],
    })
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: 'Ethan' }).total, 1)
    assert.equal(cloud.search({ q: 'Ethan', dims: ['1female'] }).total, 0)
    assert.deepEqual(cloud.search({ q: 'Ethan', dims: ['1female'] }).items, [])
    assert.equal(cloud.search({ q: 'Ava', dims: ['1female'] }).total, 1)
    assert.equal(cloud.search({ q: 'car', dims: ['1female'] }).total, 1)
    assert.equal(cloud.search({ q: 'car', dims: ['1female', '1male'] }).total, 0)
  })

  it('reads a comma-joined selection the way it reads repeated ones', () => {
    writeCatalog({
      rows: [
        { id: 'character-female', category: 'character', sub_category: 'female', name: 'Ava in car', description: '', media_type: 'video', tags: [], meta: { dims: { gender: 'Female', scene: 'Car' } } },
        { id: 'character-male', category: 'character', sub_category: 'male', name: 'Ethan at home', description: '', media_type: 'video', tags: [], meta: { dims: { gender: 'Male', scene: 'Living Room' } } },
      ],
    })
    const cloud = makeCatalog()
    assert.equal(cloud.search({ q: 'a', dims: '1female,1car' }).total, 1)
    assert.equal(cloud.search({ q: 'a', dims: [] }).total, 2)
    assert.equal(cloud.search({ q: 'a' }).total, 2)
  })
})

describe('createCloudCatalog: save to local', () => {
  it('copies a local asset into the library', async () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const asset = await cloud.saveToLocal('scene-nature-aaa')
    assert.equal(asset.name, 'Bedroom')
    assert.equal(asset.type, 'scene')
    assert.equal(asset.source, 'cloud:scene-nature-aaa')
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
    const asset = await cloud.saveToLocal('scene-nature-ccc')
    assert.deepEqual(requested, ['https://cdn.example.com/kitchen.mp4'])
    assert.equal(asset.files.length, 1)
    assert.equal(library.list().length, 1)
  })

  it('downloads both cover image and media files, falling back to meta.source_* URLs', async () => {
    writeCatalog({
      rows: [
        {
          id: 'character-fantasy-genrex-test',
          category: 'character',
          sub_category: 'fantasy-genrex',
          name: 'Angel Influencer',
          description: 'AI 角色测试',
          media_type: 'audio',
          media_url: 'file:library/non-existent-local/audio.wav',
          cover_url: 'file:library/non-existent-local/cover.png',
          tags: ['AI数字人'],
          meta: {
            source_cover_url: 'https://cdn.example.com/Angel%20Influencer.png',
            source_media_url: 'https://cdn.example.com/Angel%20Influencer.wav',
          },
        },
      ],
    })
    const { library } = makeStores()
    const requested = []
    const fetchImpl = async (url) => {
      requested.push(url)
      const isPng = url.endsWith('.png')
      return {
        ok: true,
        headers: { get: (name) => (name === 'content-type' ? (isPng ? 'image/png' : 'audio/wav') : null) },
        arrayBuffer: async () => new TextEncoder().encode(isPng ? 'png-content' : 'wav-content').buffer,
      }
    }
    const cloud = makeCatalog({ library, fetchImpl })
    const asset = await cloud.saveToLocal('character-fantasy-genrex-test')
    assert.equal(requested.length, 2)
    assert.ok(requested.includes('https://cdn.example.com/Angel%20Influencer.png'))
    assert.ok(requested.includes('https://cdn.example.com/Angel%20Influencer.wav'))
    assert.equal(asset.name, 'Angel Influencer')
    assert.equal(asset.files.length, 2)
    assert.ok(asset.files[0].original_name.includes('cover.png'))
    assert.ok(asset.files[1].original_name.includes('.wav'))
  })

  it('rejects an unknown id', async () => {
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    await assert.rejects(() => cloud.saveToLocal('nope'), /cloud asset not found/)
  })

  it('reuses the row already saved from the same cloud id', async () => {
    writeMedia('素材/卧室.mp4', 'video-bytes')
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const first = await cloud.saveToLocal('scene-nature-aaa')
    const second = await cloud.saveToLocal('scene-nature-aaa')
    assert.equal(second.id, first.id)
    assert.equal(library.list().length, 1)
  })
})

describe('createCloudCatalog: a save whose remote media never landed fails visibly', () => {
  it('fails a save whose declared remote media never landed', async () => {
    writeCatalog()
    const { library } = makeStores()
    const fetchImpl = async () => {
      throw new Error('network down')
    }
    const cloud = makeCatalog({ library, fetchImpl })
    await assert.rejects(
      () => cloud.saveToLocal('scene-nature-ccc'),
      (error) => error.code === 'remote-fetch-failed',
    )
    assert.equal(library.list().length, 0, '失败不得留下一条空资产')
  })

  it('reports a non-2xx remote answer as a download failure', async () => {
    writeCatalog()
    const { library } = makeStores()
    const fetchImpl = async () => ({ ok: false, status: 404, headers: { get: () => null } })
    const cloud = makeCatalog({ library, fetchImpl })
    await assert.rejects(
      () => cloud.saveToLocal('scene-nature-ccc'),
      (error) => error.code === 'remote-fetch-failed' && error.message.includes('404'),
    )
    assert.equal(library.list().length, 0, '失败不得留下一条空资产')
  })

  it('reports a missing fetch implementation as a download failure', async () => {
    writeCatalog()
    const { library } = makeStores()
    const originalFetch = globalThis.fetch
    // 一台没有可用 fetch 实现的机器上，远端取用不可能成功——必须可见地失败。
    delete globalThis.fetch
    try {
      const cloud = makeCatalog({ library })
      await assert.rejects(
        () => cloud.saveToLocal('scene-nature-ccc'),
        (error) => error.code === 'remote-fetch-failed',
      )
      assert.equal(library.list().length, 0, '失败不得留下一条空资产')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('still saves when only the cover download fails', async () => {
    writeCatalog({
      rows: [{
        id: 'scene-nature-ddd',
        category: 'scene',
        sub_category: 'nature',
        name: 'Balcony',
        description: '阳台氛围',
        media_type: 'video',
        media_url: 'https://cdn.example.com/balcony.mp4',
        cover_url: 'https://cdn.example.com/balcony-poster.jpg',
        tags: [],
      }],
    })
    const { library } = makeStores()
    const fetchImpl = async (url) => {
      if (String(url).includes('poster')) return { ok: false, status: 404, headers: { get: () => null } }
      return {
        ok: true,
        headers: { get: (name) => (name === 'content-type' ? 'video/mp4' : null) },
        arrayBuffer: async () => new TextEncoder().encode('remote-bytes').buffer,
      }
    }
    const cloud = makeCatalog({ library, fetchImpl })
    const asset = await cloud.saveToLocal('scene-nature-ddd')
    assert.equal(asset.files.length, 1, '主媒体落地即资产可用')
    assert.ok(asset.files[0].original_name.includes('Balcony.mp4'))
    assert.equal(library.list().length, 1)
  })

  it('still saves a descriptor-only row with no fetch implementation', async () => {
    writeCatalog()
    const { library } = makeStores()
    const originalFetch = globalThis.fetch
    delete globalThis.fetch
    try {
      const cloud = makeCatalog({ library })
      const asset = await cloud.saveToLocal('audio-voiceover-bbb')
      assert.deepEqual(asset.files, [])
      assert.equal(library.list().length, 1, '描述型行本就无媒体，不得被失败闸误伤')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('reports an oversize remote asset before staging anything', async () => {
    writeCatalog()
    const { library } = makeStores()
    const fetchImpl = async () => ({
      ok: true,
      headers: { get: (name) => (name === 'content-length' ? String(513 * 1024 * 1024) : null) },
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    const cloud = makeCatalog({ library, fetchImpl })
    await assert.rejects(
      () => cloud.saveToLocal('scene-nature-ccc'),
      (error) => error.code === 'file-too-large',
    )
    assert.equal(library.list().length, 0)
    const staging = join(catalogDir, '.staging')
    assert.deepEqual(existsSync(staging) ? readdirSync(staging) : [], [], '超限必须在落盘之前被拒绝')
  })

  it('fails an oversize remote asset immediately, even with a cover already collected', async () => {
    writeMedia('素材/studio-poster.jpg', 'poster-bytes')
    writeCatalog({
      rows: [{
        id: 'scene-nature-huge',
        category: 'scene',
        sub_category: 'nature',
        name: 'Studio',
        description: '影棚氛围',
        media_type: 'video',
        media_url: 'https://cdn.example.com/huge.mp4',
        cover_url: 'file:素材/studio-poster.jpg',
        tags: [],
      }],
    })
    const { library } = makeStores()
    const fetchImpl = async () => ({
      ok: true,
      headers: { get: (name) => (name === 'content-length' ? String(513 * 1024 * 1024) : null) },
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    const cloud = makeCatalog({ library, fetchImpl })
    await assert.rejects(
      () => cloud.saveToLocal('scene-nature-huge'),
      (error) => error.code === 'file-too-large',
      'file-too-large 必须立即上抛，不得被降级成 remote-fetch-failed 再延迟到闸门',
    )
    assert.equal(library.list().length, 0, '快速失败不得留下半截资产')
  })
})

describe('createCloudCatalog: a save whose main media failed never reports success', () => {
  const remoteRow = {
    id: 'scene-remote-bbb',
    category: 'scene',
    sub_category: 'nature',
    name: 'Balcony',
    description: '阳台氛围',
    media_type: 'video',
    media_url: 'https://cdn.example.com/balcony.mp4',
    cover_url: 'https://cdn.example.com/balcony-poster.jpg',
    tags: [],
  }

  it('rejects a save whose cover landed but the main media failed', async () => {
    writeCatalog({ rows: [remoteRow] })
    const { library } = makeStores()
    const fetchImpl = async (url) => {
      if (String(url).includes('balcony.mp4')) return { ok: false, status: 404, headers: { get: () => null } }
      return remoteOk(url)
    }
    const cloud = makeCatalog({ library, fetchImpl })
    await assert.rejects(
      () => cloud.saveToLocal('scene-remote-bbb'),
      (error) => error.code === 'remote-fetch-failed' && error.message.includes('404'),
    )
    assert.equal(library.list().length, 0, '只有封面、没有内容文件的半截资产不得入库')
    assert.deepEqual(stagedPaths(), [], '失败后暂存区不得留下残片')
  })

  it('rejects a save whose declared main media cannot be resolved at all', async () => {
    writeCatalog({
      rows: [{
        ...remoteRow,
        id: 'scene-local-nomedia',
        name: 'Missing Media',
        // 主媒体指向本机不存在的本地文件，且没有远端回退 —— 槽位声明了却没有内容。
        media_url: 'file:素材/缺失.mp4',
        cover_url: 'https://cdn.example.com/missing-media-poster.jpg',
      }],
    })
    const { library } = makeStores()
    const cloud = makeCatalog({ library, fetchImpl: remoteOk })
    await assert.rejects(
      () => cloud.saveToLocal('scene-local-nomedia'),
      (error) => error.code === 'cloud-media-unavailable',
    )
    assert.equal(library.list().length, 0, '封面落地也不得替主媒体顶账')
  })

  it('rejects a save whose declared locators resolve to nothing', async () => {
    writeCatalog({
      rows: [{
        ...remoteRow,
        id: 'scene-local-gone',
        name: 'Gone Locally',
        media_url: 'file:素材/缺失.mp4',
        cover_url: 'file:素材/缺失-poster.jpg',
      }],
    })
    const { library } = makeStores()
    const cloud = makeCatalog({ library, fetchImpl: remoteOk })
    await assert.rejects(
      () => cloud.saveToLocal('scene-local-gone'),
      (error) => error.code === 'cloud-media-unavailable',
    )
    assert.equal(library.list().length, 0, '声明了定位符却零文件落地，不得落一条空资产')
  })

  it('still saves when the cover locator resolves to nothing but the media landed', async () => {
    // §5.4 的反方向照旧：封面取不到、主媒体落地 —— 资产可用。
    writeCatalog({
      rows: [{
        ...remoteRow,
        id: 'scene-local-nocover',
        name: 'No Poster',
        cover_url: 'file:素材/缺失-poster.jpg',
      }],
    })
    const { library } = makeStores()
    const cloud = makeCatalog({ library, fetchImpl: remoteOk })
    const asset = await cloud.saveToLocal('scene-local-nocover')
    assert.equal(asset.files.length, 1, '主媒体落地即资产可用')
    assert.ok(asset.files[0].original_name.includes('No Poster.mp4'))
    assert.equal(library.list().length, 1)
  })
})

describe('createCloudCatalog: overlapping saves keep their own staging', () => {
  const remoteRow = {
    category: 'scene',
    sub_category: 'nature',
    description: '阳台氛围',
    media_type: 'video',
    cover_url: 'https://cdn.example.com/balcony-poster.jpg',
    tags: [],
  }

  it('keeps the staged files of a save that is still running', async () => {
    writeCatalog({
      rows: [
        {
          ...remoteRow,
          id: 'scene-remote-aaa',
          name: 'Kitchen',
          media_url: 'https://cdn.example.com/kitchen.mp4',
          cover_url: '',
        },
        { ...remoteRow, id: 'scene-remote-bbb', name: 'Balcony', media_url: 'https://cdn.example.com/balcony.mp4' },
      ],
    })
    const { library } = makeStores()
    let releaseMedia = () => {}
    const held = new Promise((resolve) => { releaseMedia = resolve })
    const fetchImpl = async (url) => {
      // B 的主媒体被闸门卡住，好让 A 在 B 还在途时跑完自己的 finally。
      if (String(url).includes('balcony.mp4')) await held
      return remoteOk(url)
    }
    const cloud = makeCatalog({ library, fetchImpl })

    const savingB = cloud.saveToLocal('scene-remote-bbb')
    try {
      await waitFor(() => stagedPaths().length === 1)
      const stagedBefore = stagedPaths()
      assert.equal(stagedBefore.length, 1, 'B 的封面应已暂存')

      const assetA = await cloud.saveToLocal('scene-remote-aaa')
      assert.equal(assetA.files.length, 1)
      assert.deepEqual(stagedPaths(), stagedBefore, '先完成者的清理不得动到在途者的暂存文件')
    } finally {
      // 断言失败也必须放行闸门，否则一条红灯会拖着 120s 的取用超时不让进程退出。
      releaseMedia()
    }

    const assetB = await savingB
    assert.equal(assetB.files.length, 2, 'B 声明的封面与主媒体都必须入库')
    assert.equal(library.list().length, 2)
    assert.deepEqual(stagedPaths(), [], '两次保存都结束后暂存区不得留下残片')
  })

  it('leaves the other save alone when a bare sweep runs mid-flight', async () => {
    writeCatalog({
      rows: [{ ...remoteRow, id: 'scene-remote-bbb', name: 'Balcony', media_url: 'https://cdn.example.com/balcony.mp4' }],
    })
    const { library } = makeStores()
    let releaseMedia = () => {}
    const held = new Promise((resolve) => { releaseMedia = resolve })
    const fetchImpl = async (url) => {
      if (String(url).includes('balcony.mp4')) await held
      return remoteOk(url)
    }
    const cloud = makeCatalog({ library, fetchImpl })

    const savingB = cloud.saveToLocal('scene-remote-bbb')
    try {
      await waitFor(() => stagedPaths().length === 1)
      // 路由与 Host 工具在 finally 里保留的正是这个不带 scope 的调用形状。
      cloud.clearStaging()
      assert.equal(stagedPaths().length, 1, '整目录抹除已被废除：在途者的暂存文件必须留下')
    } finally {
      releaseMedia()
    }

    const assetB = await savingB
    assert.equal(assetB.files.length, 2)
    assert.equal(library.list().length, 1)
  })

  it('sweeps a staging slice a crashed save left behind', async () => {
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const stale = join(catalogDir, '.staging', 'crashed-save-0001')
    mkdirSync(stale, { recursive: true })
    writeFileSync(join(stale, 'leftover.mp4'), 'leftover-bytes')
    // 崩溃残留只能靠年龄识别：把它按到一个保存不可能还活着的时刻。
    const longAgo = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(stale, longAgo, longAgo)

    cloud.clearStaging()
    assert.deepEqual(stagedPaths(), [], '崩溃残留的暂存片必须在下一轮被清掉')
  })

  it('never sweeps a slice that is still being written to', async () => {
    writeCatalog()
    const { library } = makeStores()
    const cloud = makeCatalog({ library })
    const fresh = join(catalogDir, '.staging', 'running-save-0002')
    mkdirSync(fresh, { recursive: true })
    writeFileSync(join(fresh, 'in-flight.mp4'), 'in-flight-bytes')

    cloud.clearStaging()
    assert.deepEqual(stagedPaths(), [join(fresh, 'in-flight.mp4')], '新鲜的在途暂存片不得被扫走')
  })
})

describe('createCloudCatalog: a declared slot that never lands is visible', () => {
  const remoteRow = {
    id: 'scene-remote-bbb',
    category: 'scene',
    sub_category: 'nature',
    name: 'Balcony',
    description: '阳台氛围',
    media_type: 'video',
    media_url: 'https://cdn.example.com/balcony.mp4',
    cover_url: 'https://cdn.example.com/balcony-poster.jpg',
    tags: [],
  }

  it('fails visibly when a declared file disappears before the copy', async () => {
    writeCatalog({ rows: [remoteRow] })
    const { library } = makeStores()
    const fetchImpl = async (url) => {
      if (String(url).includes('balcony.mp4')) {
        // 模拟暂存文件在他处被删掉：已声明的槽位不能静默少一个。
        for (const file of stagedPaths()) rmSync(file, { force: true })
      }
      return remoteOk(url)
    }
    const cloud = makeCatalog({ library, fetchImpl })

    const logged = await captureConsoleError(async () => {
      await assert.rejects(
        () => cloud.saveToLocal('scene-remote-bbb'),
        (error) => error.code === 'internal' && /gone before the copy/.test(error.message),
      )
    })
    assert.equal(library.list().length, 0, '可见失败不得留下半截资产')
    assert.ok(
      logged.some((line) => line.includes('declared file is gone before the copy')),
      '诊断必须落进日志，不能只靠返回值',
    )
  })

  it('rolls back a half asset when the copy stage drops a declared file', async () => {
    writeCatalog({ rows: [remoteRow] })
    const { library } = makeStores()
    // 复制阶段丢掉一个已声明的槽位：library.add 对消失的路径静默 continue。
    const lossyLibrary = {
      list: () => library.list(),
      get: (name) => library.get(name),
      add: (input) => library.add({ ...input, files: input.files.slice(0, 1) }),
      remove: (id) => library.remove(id),
    }
    const cloud = makeCatalog({ library: lossyLibrary, fetchImpl: remoteOk })

    const logged = await captureConsoleError(async () => {
      await assert.rejects(
        () => cloud.saveToLocal('scene-remote-bbb'),
        (error) => error.code === 'internal' && /copy stage dropped a declared file/.test(error.message),
      )
    })
    assert.equal(library.list().length, 0, '半截资产必须被撤掉，不得冒充成功')
    assert.ok(
      logged.some((line) => line.includes('copy stage dropped a declared file')),
      '诊断必须落进日志，不能只靠返回值',
    )
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
      url: '/omnimux/assets/cloud/media?id=scene-nature-aaa&which=media',
    })
    assert.equal(result.status, 200)
    assert.equal(result.stream.mime, 'video/mp4')
  })

  it('redirects remote media to its CDN URL', async () => {
    writeCatalog()
    const dispatcher = makeDispatcher(makeCatalog())
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/assets/cloud/media?id=scene-nature-ccc&which=media',
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
      body: { id: 'scene-nature-aaa' },
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
      body: { id: 'scene-nature-aaa' },
      origin: 'https://evil.example.com',
    })
    assert.equal(result.status, 403)
  })
})
