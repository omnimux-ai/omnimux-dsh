import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLOUD_PAGE_SIZE,
  appendUniqueAssets,
  cloudScope,
  findCategory,
  mediaLabelOf,
  normalizeCloudAsset,
  pageCountOf,
  subCategoryTabs,
  totalOf,
} from './cloud-feed-helpers.js'

/** A manifest shaped exactly like the builder's output. */
const MANIFEST = {
  version: 1,
  pageSize: 24,
  totalAssets: 60,
  categories: [
    {
      id: 'character',
      zh: '角色',
      en: 'Characters',
      total: 40,
      pages: 2,
      sub_categories: [
        { id: 'digital-human', zh: '实景数字人', en: 'Digital Humans', total: 40, pages: 2 },
      ],
    },
    {
      id: 'audio',
      zh: '声音',
      en: 'Audio',
      total: 20,
      pages: 1,
      sub_categories: [
        { id: 'voiceover', zh: '配音', en: 'Voiceover', total: 12, pages: 1 },
        { id: 'sfx', zh: '音效', en: 'SFX', total: 8, pages: 1 },
        { id: 'bgm', zh: '背景音', en: 'BGM', total: 0, pages: 1 },
      ],
    },
    {
      id: 'scene',
      zh: '场景',
      en: 'Scenes',
      total: 0,
      pages: 1,
      sub_categories: [],
    },
  ],
}

describe('cloudPageSize', () => {
  it('matches the catalog builder page size', () => {
    assert.equal(CLOUD_PAGE_SIZE, MANIFEST.pageSize)
  })
})

describe('cloudScope', () => {
  it('uses the bare category when no sub-category is selected', () => {
    assert.equal(cloudScope('audio'), 'audio')
  })

  it('joins category and sub-category with a slash', () => {
    assert.equal(cloudScope('audio', 'bgm'), 'audio/bgm')
  })
})

describe('pageCountOf / totalOf', () => {
  it('reads the category level of the manifest', () => {
    assert.equal(pageCountOf(MANIFEST, 'character'), 2)
    assert.equal(totalOf(MANIFEST, 'character'), 40)
  })

  it('reads the sub-category level when one is given', () => {
    assert.equal(pageCountOf(MANIFEST, 'audio', 'sfx'), 1)
    assert.equal(totalOf(MANIFEST, 'audio', 'sfx'), 8)
  })

  it('reports one page for an empty category so the pager still renders', () => {
    assert.equal(pageCountOf(MANIFEST, 'scene'), 1)
    assert.equal(totalOf(MANIFEST, 'scene'), 0)
  })

  it('falls back to one page for an unknown category', () => {
    assert.equal(pageCountOf(MANIFEST, 'nope'), 1)
    assert.equal(totalOf(MANIFEST, 'nope'), 0)
  })

  it('survives a null manifest', () => {
    assert.equal(pageCountOf(null, 'audio'), 1)
    assert.equal(totalOf(null, 'audio'), 0)
    assert.equal(findCategory(null, 'audio'), null)
  })
})

describe('subCategoryTabs', () => {
  it('leads with an all-entry when the category has populated sub-categories', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'audio')
    assert.equal(hasSecondLevel, true)
    assert.deepEqual(items.map((row) => row.id), ['', 'voiceover', 'sfx'])
    assert.equal(items[0].total, 20)
  })

  it('hides empty sub-categories so a tab never opens onto nothing', () => {
    const { items } = subCategoryTabs(MANIFEST, 'audio')
    assert.equal(items.some((row) => row.id === 'bgm'), false)
  })

  it('reports no second level for a category without sub-categories', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'scene')
    assert.equal(hasSecondLevel, false)
    assert.deepEqual(items, [])
  })
})

describe('normalizeCloudAsset', () => {
  it('keeps a well-formed row intact', () => {
    const row = normalizeCloudAsset({
      id: 'audio-bgm-abc',
      category: 'audio',
      sub_category: 'bgm',
      name: 'Apple x Supercut',
      description: '短视频卡点配乐',
      media_type: 'audio',
      tags: ['背景音乐'],
    })
    assert.equal(row.id, 'audio-bgm-abc')
    assert.equal(row.subCategory, 'bgm')
    assert.equal(row.mediaType, 'audio')
    assert.deepEqual(row.tags, ['背景音乐'])
    // Absent meta means the builder did not mark the row descriptor-only.
    assert.equal(row.playable, true)
  })

  it('marks a descriptor-only row unplayable', () => {
    const row = normalizeCloudAsset({ id: 'x', media_type: 'audio', meta: { playable: false } })
    assert.equal(row.playable, false)
  })

  it('defaults every field of a malformed row instead of throwing', () => {
    const row = normalizeCloudAsset({ id: 'a', media_type: 'nonsense', tags: 'not-an-array' })
    assert.equal(row.category, '')
    assert.equal(row.mediaType, 'other')
    assert.deepEqual(row.tags, [])
    assert.equal(row.playable, true)
  })

  it('survives an entirely absent row', () => {
    const row = normalizeCloudAsset(undefined)
    assert.equal(row.id, '')
    assert.equal(row.mediaType, 'other')
  })
})

describe('appendUniqueAssets', () => {
  it('appends new rows in order', () => {
    const out = appendUniqueAssets([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }])
    assert.deepEqual(out.map((row) => row.id), ['a', 'b', 'c'])
  })

  it('drops a row already loaded, so paging races cannot duplicate a card', () => {
    const out = appendUniqueAssets([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])
    assert.deepEqual(out.map((row) => row.id), ['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const existing = [{ id: 'a' }]
    appendUniqueAssets(existing, [{ id: 'b' }])
    assert.equal(existing.length, 1)
  })

  it('ignores null entries', () => {
    const out = appendUniqueAssets([{ id: 'a' }], [null, undefined, { id: 'b' }])
    assert.deepEqual(out.map((row) => row.id), ['a', 'b'])
  })
})

describe('mediaLabelOf', () => {
  const t = (key) => ({
    'cloud.media.image': '图片',
    'cloud.media.video': '视频',
    'cloud.media.audio': '音频',
    'cloud.media.other': '素材',
  }[key] ?? key)

  it('maps a known media type to its label', () => {
    assert.equal(mediaLabelOf({ t, mediaType: 'video' }), '视频')
  })

  it('falls back to the generic label when the dictionary has no entry', () => {
    assert.equal(mediaLabelOf({ t, mediaType: 'document' }), '素材')
  })
})
