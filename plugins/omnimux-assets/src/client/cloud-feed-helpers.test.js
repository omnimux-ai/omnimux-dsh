import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLOUD_ALL_CATEGORY,
  CLOUD_AUDIO_THEMES,
  CLOUD_PAGE_SIZE,
  allCategoryEntry,
  appendUniqueAssets,
  cloudAudioTheme,
  cloudCardKind,
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
      total: 428,
      pages: 18,
      sub_categories: [
        { id: 'female', zh: '女性角色', en: 'Female', total: 185, pages: 8 },
        { id: 'male', zh: '男性角色', en: 'Male', total: 144, pages: 6 },
        { id: 'lifestyle', zh: '生活居家', en: 'Lifestyle', total: 254, pages: 11 },
        { id: 'business', zh: '职场商务', en: 'Business', total: 43, pages: 2 },
      ],
    },
    {
      id: 'audio',
      zh: '声音',
      en: 'Audio',
      total: 640,
      pages: 27,
      sub_categories: [
        { id: 'voiceover', zh: '配音', en: 'Voiceover', total: 527, pages: 22 },
        { id: 'sfx', zh: '音效', en: 'SFX', total: 5, pages: 1 },
        { id: 'bgm', zh: '背景音', en: 'BGM', total: 108, pages: 5 },
      ],
    },
    {
      id: 'scene',
      zh: '场景',
      en: 'Scenes',
      total: 14,
      pages: 1,
      sub_categories: [{ id: 'nature', zh: '自然山水', en: 'Nature', total: 14, pages: 1 }],
    },
    {
      id: 'prop',
      zh: '道具',
      en: 'Props',
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

/**
 * 一级栏最左侧的「全部」不是清单里的一个大类，而是一个跨全量的作用域：它的行数来自
 * manifest 的总数，分片由构建脚本写成 all/page-NNNN.json。
 */
describe('allCategoryEntry', () => {
  const t = (key) => ({ 'cloud.category.all': '全部' }[key] ?? key)

  it('leads the nav with 全部 carrying the whole-catalog totals', () => {
    const entry = allCategoryEntry(MANIFEST, t)
    assert.equal(entry.id, 'all')
    assert.equal(entry.zh, '全部')
    assert.equal(entry.en, 'All')
    assert.equal(entry.total, MANIFEST.totalAssets)
    assert.equal(entry.pages, Math.ceil(MANIFEST.totalAssets / MANIFEST.pageSize))
    assert.deepEqual(entry.sub_categories, [])
  })

  it('keeps the scope id in one place, so the fetch URL and the chip agree', () => {
    assert.equal(CLOUD_ALL_CATEGORY, 'all')
    assert.equal(cloudScope(CLOUD_ALL_CATEGORY), 'all')
  })

  it('survives a manifest that has not landed yet', () => {
    const entry = allCategoryEntry(null, t)
    assert.equal(entry.total, 0)
    assert.equal(entry.pages, 1)
  })
})

describe('pageCountOf / totalOf', () => {
  it('reads the category level of the manifest', () => {
    assert.equal(pageCountOf(MANIFEST, 'character'), 18)
    assert.equal(totalOf(MANIFEST, 'character'), 428)
  })

  it('reads the sub-category level when one is given', () => {
    assert.equal(pageCountOf(MANIFEST, 'audio', 'sfx'), 1)
    assert.equal(totalOf(MANIFEST, 'audio', 'sfx'), 5)
  })

  it('reports one page for an empty category so the pager still renders', () => {
    assert.equal(pageCountOf(MANIFEST, 'prop'), 1)
    assert.equal(totalOf(MANIFEST, 'prop'), 0)
  })

  it('sizes 全部 from the whole-catalog totals instead of a category entry', () => {
    assert.equal(totalOf(MANIFEST, 'all'), MANIFEST.totalAssets)
    assert.equal(pageCountOf(MANIFEST, 'all'), Math.ceil(MANIFEST.totalAssets / MANIFEST.pageSize))
    // The page size is read from the manifest, so the count follows the builder.
    assert.equal(pageCountOf({ totalAssets: 25, pageSize: 10 }, 'all'), 3)
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
  it('leads every second level with an all-entry carrying the category total', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'audio')
    assert.equal(hasSecondLevel, true)
    assert.deepEqual(items.map((row) => row.id), ['', 'voiceover', 'sfx', 'bgm'])
    assert.equal(items[0].total, 640)
  })

  it('keeps the second level shut on 全部, which spans every category', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'all')
    assert.equal(hasSecondLevel, false)
    assert.deepEqual(items, [])
  })

  it('opens a second level for every category the data gives one to', () => {
    // The level is a property of the manifest, not of one tab: 角色, 声音 and 场景
    // all carry shelves, so all three get the bar.
    for (const category of ['character', 'audio', 'scene']) {
      const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, category)
      assert.equal(hasSecondLevel, true, `${category} should open a second level`)
      assert.equal(items[0].id, '')
      assert.equal(items[0].total, MANIFEST.categories.find((row) => row.id === category).total)
    }
  })

  it('keeps the second level shut on a category whose shelves are all empty', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'prop')
    assert.equal(hasSecondLevel, false)
    assert.deepEqual(items, [])
  })

  it('hides empty sub-categories so a tab never opens onto nothing', () => {
    const manifest = {
      categories: [{
        id: 'audio',
        total: 10,
        pages: 1,
        sub_categories: [
          { id: 'voiceover', total: 10, pages: 1 },
          { id: 'bgm', total: 0, pages: 1 },
        ],
      }],
    }
    const { items } = subCategoryTabs(manifest, 'audio')
    assert.deepEqual(items.map((row) => row.id), ['', 'voiceover'])
  })

  it('reports no second level for an empty category', () => {
    const { items, hasSecondLevel } = subCategoryTabs(MANIFEST, 'prop')
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

  it('reports whether the row has a cover and a playable original', () => {
    const text = normalizeCloudAsset({ id: 'doc-note-1', media_type: 'other' })
    assert.equal(text.hasCover, false)
    assert.equal(text.hasMedia, false)

    const preset = normalizeCloudAsset({
      id: 'style-image-preset-1',
      media_type: 'other',
      cover_url: 'file:素材库/gxgen-data/style-library/media/x.webp',
    })
    assert.equal(preset.hasCover, true)
    assert.equal(preset.hasMedia, false)

    const voice = normalizeCloudAsset({
      id: 'audio-bgm-1',
      media_type: 'audio',
      media_url: 'file:素材库/x.mp3',
    })
    assert.equal(voice.hasCover, false)
    assert.equal(voice.hasMedia, true)
  })

  it('defaults every field of a malformed row instead of throwing', () => {
    const row = normalizeCloudAsset({ id: 'a', media_type: 'nonsense', tags: 'not-an-array' })
    assert.equal(row.category, '')
    assert.equal(row.mediaType, 'other')
    assert.deepEqual(row.tags, [])
    assert.equal(row.playable, true)
    assert.equal(row.hasCover, false)
    assert.equal(row.hasMedia, false)
  })

  it('survives an entirely absent row', () => {
    const row = normalizeCloudAsset(undefined)
    assert.equal(row.id, '')
    assert.equal(row.mediaType, 'other')
  })
})

/**
 * Which body a card renders is decided from the row, never from a failed image
 * request: a text row must never be painted as a grey 4:3 plate first.
 */
describe('cloudCardKind', () => {
  const kindOf = (row) => cloudCardKind(normalizeCloudAsset(row))

  it('gives a coverless document row the text card: no cover and no media', () => {
    assert.equal(kindOf({ id: 'doc-note-1', media_type: 'other' }), 'text')
  })

  it('gives a text row with a description the text card too', () => {
    assert.equal(
      kindOf({ id: 'doc-note-2', media_type: 'other', description: '分镜提示词' }),
      'text',
    )
  })

  it('gives a 风格 preset its picture card from the cover alone', () => {
    assert.equal(
      kindOf({ id: 'style-image-preset-1', media_type: 'other', cover_url: 'file:素材库/x.webp' }),
      'media',
    )
  })

  it('gives a playable voice the waveform card', () => {
    assert.equal(
      kindOf({ id: 'audio-sfx-1', media_type: 'audio', media_url: 'file:素材库/x.mp3' }),
      'audio',
    )
  })

  it('falls back to text for the descriptor-only 音色 rows that have nothing to play', () => {
    assert.equal(kindOf({ id: 'audio-voiceover-1', media_type: 'other', meta: { playable: false } }), 'text')
    assert.equal(
      kindOf({ id: 'audio-voiceover-2', media_type: 'audio', media_url: 'file:素材库/x.mp3', meta: { playable: false } }),
      'text',
    )
  })

  it('keeps a video without a poster a picture card, so its own frame stands in', () => {
    assert.equal(
      kindOf({ id: 'scene-nature-1', media_type: 'video', media_url: 'file:素材库/x.mp4' }),
      'media',
    )
  })

  it('treats a document row as text', () => {
    assert.equal(kindOf({ id: 'doc-1', media_type: 'document' }), 'text')
  })

  it('survives a missing row', () => {
    assert.equal(cloudCardKind(undefined), 'text')
    assert.equal(cloudCardKind(null), 'text')
  })
})

/**
 * The voice plate's restrained dark wash. Five fixed names, chosen by row id so
 * a card never changes colour as the grid reflows.
 */
describe('cloudAudioTheme', () => {
  it('offers exactly the five restrained dark washes', () => {
    assert.deepEqual(CLOUD_AUDIO_THEMES, ['indigo', 'jade', 'azure', 'violet', 'charcoal'])
  })

  it('picks the same wash for the same row every time', () => {
    const id = 'audio-sfx-8f21ac'
    const first = cloudAudioTheme(id)
    assert.equal(cloudAudioTheme(id), first)
    assert.ok(CLOUD_AUDIO_THEMES.includes(first))
  })

  it('spreads a realistic set of row ids across more than one wash', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `audio-sfx-${String(index)}`)
    const used = new Set(ids.map((id) => cloudAudioTheme(id)))
    assert.ok(used.size >= 4, `expected a spread across the palette, got ${[...used].join(',')}`)
  })

  it('falls back to a valid wash for an absent id', () => {
    assert.ok(CLOUD_AUDIO_THEMES.includes(cloudAudioTheme(undefined)))
    assert.ok(CLOUD_AUDIO_THEMES.includes(cloudAudioTheme('')))
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
