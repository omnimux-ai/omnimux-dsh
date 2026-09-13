/**
 * 角色八维筛选器在已提交目录与服务端的契约。
 *
 * 断言打在真实产物上：`cloud-catalog/manifest.json` 的八维选项与计数、`index.json`
 * 里每行的八维取值，以及服务端按这些取值过滤时的分页结果。三者必须对得上，否则
 * 胶囊上的数字、卡片列表和分页会各说各话。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCloudCatalog } from '../cloud-catalog.js'
import { optionKeyOf, optionLabelOf } from './character-dimensions.js'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const catalogDir = join(here, '..', '..', 'cloud-catalog')
const manifest = JSON.parse(readFileSync(join(catalogDir, 'manifest.json'), 'utf8'))
const character = manifest.categories.find((row) => row.id === 'character')
const index = JSON.parse(readFileSync(join(catalogDir, 'index.json'), 'utf8'))
const characterRows = index.filter((row) => row.category === 'character')

const DIMENSION_IDS = ['gender', 'age', 'figure', 'name', 'industry', 'scene', 'pose', 'outfit']

/** The wire token for one option value, mirrored from the build script. */
const token = (value) => `1${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-/g, '_')}`

/** @param {string[]} tokens */
function filterBy(tokens) {
  return createCloudCatalog({ catalogDir }).filter({ dims: tokens, limit: manifest.pageSize, offset: 0 })
}

describe('The character catalog publishes its eight dimensions', () => {
  it('lists them in the canonical order', () => {
    assert.ok(Array.isArray(character.dimensions), 'character must carry a dimensions table')
    assert.deepEqual(character.dimensions.map((row) => row.id), DIMENSION_IDS)
  })

  it('gives every dimension a Chinese and an English label', () => {
    for (const dimension of character.dimensions) {
      assert.equal(typeof dimension.zh, 'string')
      assert.equal(typeof dimension.en, 'string')
      assert.notEqual(dimension.zh, '')
      assert.notEqual(dimension.en, '')
    }
  })

  it('partitions the same rows on every dimension whose options are exhaustive', () => {
    for (const dimension of character.dimensions) {
      assert.ok(dimension.options.length > 0, `${dimension.id} must offer at least one option`)
      // 姓名 is the one open list: it is capped at the most-used names, so its
      // options describe a subset of the rows rather than all of them.
      if (dimension.id === 'name') continue
      const sum = dimension.options.reduce((total, option) => total + option.total, 0)
      assert.equal(sum, character.total, `${dimension.id} options must sum to the category total`)
    }
  })

  it('ranks 姓名 by avatar count and keeps it inside the rows it describes', () => {
    const name = character.dimensions.find((row) => row.id === 'name')
    const sum = name.options.reduce((total, option) => total + option.total, 0)
    assert.ok(sum > 0)
    assert.ok(sum <= character.total)
    assert.equal(Math.max(...name.options.map((option) => option.total)), 10)
    for (const option of name.options) assert.ok(option.total > 1)
  })

  it('leaves 全部 out of the option list, since it is the absence of a choice', () => {
    for (const dimension of character.dimensions) {
      assert.ok(
        dimension.options.every((option) => option.value !== '' && option.value !== 'All'),
        `${dimension.id} must not list an all-option`,
      )
    }
  })

  it('keeps the eight dimensions off every other category', () => {
    for (const category of manifest.categories) {
      if (category.id === 'character') continue
      assert.equal(category.dimensions, undefined, `${category.id} must not publish dimensions`)
    }
  })

  it('records the eight values on each character row', () => {
    assert.equal(characterRows.length, character.total)
    for (const row of characterRows) {
      assert.ok(row.meta && row.meta.dims, `${row.id} must carry meta.dims`)
      assert.deepEqual(Object.keys(row.meta.dims), DIMENSION_IDS)
      for (const id of DIMENSION_IDS) {
        assert.notEqual(String(row.meta.dims[id]), '', `${row.id}.${id} must not be empty`)
      }
    }
  })

  it('declares the filtered scope for the client to fall back to', () => {
    const scope = character.sub_categories.find((row) => row.id === 'character_filtered')
    assert.ok(scope, 'the filtered scope must be declared')
    assert.equal(scope.total, character.total)
  })
})

describe('Every declared option agrees with the rows and with the filter route', () => {
  it('counts the same rows the index does', () => {
    for (const dimension of character.dimensions) {
      for (const option of dimension.options) {
        const rows = characterRows.filter((row) => row.meta.dims[dimension.id] === option.value)
        assert.equal(
          rows.length,
          option.total,
          `${dimension.id}=${option.value} chip count must match the index`,
        )
      }
    }
  })

  it('serves a page per single-option selection, containing exactly those rows', () => {
    for (const id of ['gender', 'age', 'industry', 'scene', 'pose', 'outfit']) {
      const dimension = character.dimensions.find((row) => row.id === id)
      for (const option of dimension.options) {
        const body = filterBy([token(option.value)])
        assert.equal(body.total, option.total, `${id}=${option.value} total must match the chip`)
        assert.equal(body.items.length, Math.min(manifest.pageSize, option.total))
        assert.equal(body.totalPages, Math.max(1, Math.ceil(option.total / manifest.pageSize)))
        for (const row of body.items) {
          assert.equal(row.meta.dims[id], option.value)
          assert.equal(row.category, 'character')
        }
      }
    }
  })

  it('narrows when several dimensions are selected at once', () => {
    const body = filterBy([token('Car'), token('Selfie')])
    const expected = characterRows.filter(
      (row) => row.meta.dims.scene === 'Car' && row.meta.dims.pose === 'Selfie',
    )
    assert.equal(body.total, expected.length)
    for (const row of body.items) {
      assert.equal(row.meta.dims.scene, 'Car')
      assert.equal(row.meta.dims.pose, 'Selfie')
    }
  })

  it('pages a filtered view by offset without repeating a row', () => {
    const female = character.dimensions.find((row) => row.id === 'gender').options.find((row) => row.value === 'Female')
    const first = filterBy([token('Female')])
    const second = createCloudCatalog({ catalogDir }).filter({
      dims: [token('Female')],
      limit: manifest.pageSize,
      offset: manifest.pageSize,
    })
    assert.equal(first.total, female.total)
    const ids = new Set(first.items.map((row) => row.id))
    for (const row of second.items) assert.ok(!ids.has(row.id), `${row.id} repeated across pages`)
    assert.equal(first.items.length, manifest.pageSize)
    assert.equal(second.items.length, Math.min(manifest.pageSize, female.total - manifest.pageSize))
  })

  it('answers an unknown token with nothing rather than with everything', () => {
    const body = filterBy(['1not_a_real_value'])
    assert.equal(body.total, 0)
    assert.equal(body.items.length, 0)
    assert.equal(body.totalPages, 1)
  })
})

/**
 * 关键词只是收窄，不是放宽：搜索必须叠加当前选中的维度，否则选了女性再搜男性名字
 * 仍会搜出男性。词条也必须一个货架一句话——场景的影棚与行业的播客栏目共用过一个
 * 句柄，于是场景胶囊读成了行业文案。
 */
describe('A search and the two Podcast shelves stay inside their own scope', () => {
  it('keeps 场景的 Podcast Studio apart from 行业的 Podcast & Media', () => {
    const scene = character.dimensions.find((row) => row.id === 'scene')
    const industry = character.dimensions.find((row) => row.id === 'industry')
    const studio = scene.options.find((row) => row.value === 'Podcast Studio')
    const shelf = industry.options.find((row) => row.value === 'Podcast & Media')
    assert.ok(studio, '场景 must offer Podcast Studio')
    assert.ok(shelf, '行业 must offer Podcast & Media')
    assert.equal(optionKeyOf('scene', studio.value), 'podcast_studio')
    assert.equal(optionKeyOf('industry', shelf.value), 'podcast')
    assert.equal(optionLabelOf({ t: (key) => zh[key] ?? key, dimension: scene, value: studio.value }), '播客影棚')
    assert.equal(optionLabelOf({ t: (key) => en[key] ?? key, dimension: scene, value: studio.value }), 'Podcast Studio')
    assert.equal(optionLabelOf({ t: (key) => zh[key] ?? key, dimension: industry, value: shelf.value }), '播客电台')
    assert.equal(optionLabelOf({ t: (key) => en[key] ?? key, dimension: industry, value: shelf.value }), 'Podcast & Media')
  })

  it('answers an opposite-gender name search with nothing', () => {
    const cloud = createCloudCatalog({ catalogDir })
    const female = characterRows.find((row) => row.meta.dims.gender === 'Female')
    const male = characterRows.find((row) => row.meta.dims.gender === 'Male')
    const name = male.meta.dims.name
    const loose = cloud.search({ q: name, category: 'character' })
    assert.ok(loose.total >= 1, `${name} must find its own row with no selection`)

    const narrowed = cloud.search({
      q: name,
      category: 'character',
      dims: [token(female.meta.dims.gender)],
    })
    assert.equal(narrowed.total, 0)
    assert.deepEqual(narrowed.items, [])
  })

  it('serves every searched row from inside the selection', () => {
    const cloud = createCloudCatalog({ catalogDir })
    const body = cloud.search({
      q: '',
      category: 'character',
      dims: [token('Car'), token('Selfie')],
      limit: manifest.pageSize,
      offset: 0,
    })
    const expected = characterRows.filter(
      (row) => row.meta.dims.scene === 'Car' && row.meta.dims.pose === 'Selfie',
    )
    assert.ok(expected.length > 0, 'the catalog must carry rows for this combination')
    assert.equal(body.total, expected.length)
    for (const row of body.items) {
      assert.equal(row.category, 'character')
      assert.equal(row.meta.dims.scene, 'Car')
      assert.equal(row.meta.dims.pose, 'Selfie')
    }
  })

  it('keeps a dimension search off every other category', () => {
    const cloud = createCloudCatalog({ catalogDir })
    const body = cloud.search({ q: '', category: 'all', dims: [token('Car')], limit: 200, offset: 0 })
    assert.ok(body.total > 0)
    assert.equal(body.items.every((row) => row.category === 'character'), true)
  })
})
