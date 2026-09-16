import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_MODEL_CATALOG,
  MODEL_CATALOG_CACHE_KEY,
  MODEL_METADATA_PRESETS,
  catalogHasRows,
  projectListedCatalog,
  readCatalogCache,
  writeCatalogCache,
} from './model-picker-catalog.js'

describe('model picker catalog projection (Issue #2136)', () => {
  it('projects only hub listed video/image ids and never invents preset-only rows', () => {
    const hub = {
      fingerprint: 'fp-test',
      video: [
        { id: 'seedance-2-5', label: 'Seedance 2.5', subtitle: 'from hub' },
        { id: 'seedance-2-0', label: 'Seedance 2.0' },
        { id: 'minimax-h3', label: 'MiniMax H3', badge: 'H3' },
      ],
      image: [
        { id: 'gpt-image-2.5', label: 'GPT Image 2.5' },
      ],
    }
    const projected = projectListedCatalog(hub)
    assert.deepEqual(projected.video.map((m) => m.id), ['seedance-2-5', 'seedance-2-0', 'minimax-h3'])
    assert.deepEqual(projected.image.map((m) => m.id), ['gpt-image-2.5'])
    assert.equal(projected.fingerprint, 'fp-test')
    // Enrichment from preset
    assert.equal(projected.video[0].name, 'Dreamina Seedance 2.5')
    assert.equal(projected.video[0].subtitle, '30秒视频生成，精准片段编辑')
    // Hub badge survives when no preset badge
    assert.equal(projected.video[2].badge?.text, 'H3')
    // Preset-only unlisted ids must NOT appear
    assert.equal(projected.video.some((m) => m.id === 'seedance-2-0-fast'), false)
    assert.equal(projected.video.some((m) => m.id === 'seedance-2-0-mini'), false)
    assert.equal(projected.video.some((m) => m.id === 'seedance-2-0-mini-trial'), false)
    assert.ok(MODEL_METADATA_PRESETS['seedance-2-0-fast'], 'preset may still exist for future listed rows')
  })

  it('accepts nested { catalog } envelope from getModelCatalog api', () => {
    const projected = projectListedCatalog({
      ok: true,
      catalog: {
        video: [{ id: 'seedance-2-5', label: 'Seedance 2.5' }],
        image: [],
        fingerprint: 'nested',
      },
    })
    assert.deepEqual(projected.video.map((m) => m.id), ['seedance-2-5'])
    assert.equal(projected.fingerprint, 'nested')
  })

  it('empty hub yields empty catalog shell, not hardcoded seedance list', () => {
    const projected = projectListedCatalog(null)
    assert.deepEqual(projected.video, [])
    assert.deepEqual(projected.image, [])
    assert.equal(catalogHasRows(projected), false)
    assert.equal(catalogHasRows(EMPTY_MODEL_CATALOG), false)
  })

  it('dedupes repeated hub rows by id', () => {
    const projected = projectListedCatalog({
      video: [
        { id: 'seedance-2-5', label: 'A' },
        { id: 'seedance-2-5', label: 'B' },
      ],
      image: [],
    })
    assert.equal(projected.video.length, 1)
    assert.equal(projected.video[0].id, 'seedance-2-5')
  })

  it('cache round-trip keeps listed ids and expires by TTL', () => {
    const store = new Map()
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
    }
    const hub = {
      fingerprint: 'cache-fp',
      video: [{ id: 'seedance-2-5', label: 'Seedance 2.5' }],
      image: [{ id: 'gpt-image-2.5', label: 'GPT Image 2.5' }],
    }
    const projected = projectListedCatalog(hub)
    writeCatalogCache(projected, hub, storage)
    assert.ok(store.has(MODEL_CATALOG_CACHE_KEY))

    const hit = readCatalogCache(storage, Date.now())
    assert.ok(hit)
    assert.deepEqual(hit.video.map((m) => m.id), ['seedance-2-5'])
    assert.deepEqual(hit.image.map((m) => m.id), ['gpt-image-2.5'])
    assert.equal(hit.fingerprint, 'cache-fp')

    const expired = readCatalogCache(storage, Date.now() + 31 * 60 * 1000)
    assert.equal(expired, null)
  })

  it('cache miss when payload has no rows', () => {
    const store = new Map()
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
    }
    storage.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      fingerprint: 'empty',
      catalog: { video: [], image: [] },
    }))
    assert.equal(readCatalogCache(storage), null)
  })
})
