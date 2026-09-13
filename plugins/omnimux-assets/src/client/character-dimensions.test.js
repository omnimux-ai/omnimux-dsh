/**
 * 角色八维筛选器的纯逻辑：维度顺序、作用域键、标签解析、选项字典覆盖。
 *
 * 这些断言全部打在「目录契约」上——键必须能被服务端按目录名解析，标签必须双语
 * 齐全，维度顺序必须与构建脚本一致（键是按位置拼的，顺序错了会把每个胶囊指向别人
 * 的分片）。所以本文件既读客户端模块，也读构建脚本，做的是两侧一致性。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CHARACTER_CATEGORY,
  CHARACTER_DIMENSION_IDS,
  activeDimensionCount,
  characterDimensionsOf,
  characterFilterKey,
  characterFilterTokens,
  dimensionSlug,
  emptyCharacterFilters,
  optionKeyOf,
  optionLabelOf,
  pageTotalPages,
} from './character-dimensions.js'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const builder = readFileSync(join(here, '..', '..', 'scripts', 'build-cloud-assets-catalog.mjs'), 'utf8')
const feed = readFileSync(join(here, 'use-cloud-assets-feed.js'), 'utf8')
const view = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')

/** @param {string} source @returns {string[]} */
function orderedIds(source) {
  const start = source.indexOf('export const CHARACTER_DIMENSIONS = [')
  assert.notEqual(start, -1, 'the build script must publish CHARACTER_DIMENSIONS')
  const block = source.slice(start, source.indexOf('\n]', start))
  return [...block.matchAll(/id: '([a-z]+)'/g)].map((match) => match[1])
}

describe('The eight dimensions are the builder\u2019s eight, in the builder\u2019s order', () => {
  it('names the same dimensions as the catalog build script', () => {
    const built = orderedIds(builder)
    assert.equal(built.length, 8)
    assert.deepEqual([...CHARACTER_DIMENSION_IDS], built)
  })

  it('keeps 姓名 4th, between 体型 and 行业', () => {
    assert.deepEqual(
      [...CHARACTER_DIMENSION_IDS],
      ['gender', 'age', 'figure', 'name', 'industry', 'scene', 'pose', 'outfit'],
    )
  })

  it('agrees with the builder on the category the dimension table belongs to', () => {
    assert.match(builder, /if \(spec\.id === 'character'\) \{/)
    assert.equal(CHARACTER_CATEGORY, 'character')
  })
})

describe('A chip selection becomes the query the Host filters the index with', () => {
  it('sends no token at all while every dimension sits on 全部', () => {
    assert.equal(characterFilterKey(emptyCharacterFilters()), '')
    assert.deepEqual(characterFilterTokens(emptyCharacterFilters()), [])
  })

  it('writes 1 plus the slug for a selected dimension, in dimension order', () => {
    const filters = { ...emptyCharacterFilters(), scene: 'Car', pose: 'Selfie' }
    assert.deepEqual(characterFilterTokens(filters), ['1car', '1selfie'])
    assert.equal(characterFilterKey(filters), '1car,1selfie')
  })

  it('joins several dimensions in the order the bar renders them', () => {
    const filters = { gender: 'Middle-aged', scene: 'Podcast Studio', outfit: 'Casual/Lifestyle' }
    assert.deepEqual(characterFilterTokens(filters), ['1middle_aged', '1podcast_studio', '1casual_lifestyle'])
  })

  it('matches the builder\u2019s own key for the same values', () => {
    assert.match(builder, /export function characterFilterKey\(values\)/)
    assert.match(builder, /\.filter\(\(value\) => text\(value\) !== ''\)/)
    assert.match(builder, /\.map\(\(value\) => `1\$\{slugify\(value\)\.replace\(\/-\/g, '_'\)\}`\)/)
  })

  it('slugs a value into a lowercase kebab', () => {
    assert.equal(dimensionSlug('Middle-aged'), 'middle-aged')
    assert.equal(dimensionSlug('Beauty & Fashion'), 'beauty-fashion')
    assert.equal(dimensionSlug('  '), '')
    assert.equal(dimensionSlug(undefined), '')
  })

  it('survives a filter object missing the dimensions entirely', () => {
    assert.equal(characterFilterKey(undefined), '')
    assert.equal(characterFilterKey({}), '')
  })
})

describe('Chip labels come from the dictionary, the catalog label is the fallback', () => {
  const dimensions = characterDimensionsOf({
    categories: [{
      id: 'character',
      dimensions: [
        {
          id: 'scene',
          zh: '场景',
          en: 'Scene',
          total: 3,
          options: [{ value: 'Car', total: 2 }, { value: 'New Room', total: 1 }],
        },
      ],
    }],
  }, 'character')

  it('reads the dimension table back in canonical order', () => {
    assert.equal(dimensions.length, 1)
    assert.equal(dimensions[0].id, 'scene')
  })

  it('translates a known option through the dictionary', () => {
    const t = (key) => zh[key] ?? key
    assert.equal(optionLabelOf({ t, dimension: dimensions[0], value: 'Car' }), '车内出镜')
    assert.equal(optionKeyOf('scene', 'Car'), 'car')
  })

  it('falls back to the catalog label for an option no dictionary knows', () => {
    const t = (key) => zh[key] ?? key
    assert.equal(optionLabelOf({ t, dimension: dimensions[0], value: 'New Room' }), 'New Room')
    assert.equal(optionKeyOf('scene', 'New Room'), 'new-room')
  })

  it('names a 姓名 option by its own value, since names are not translated', () => {
    const nameDimension = { id: 'name', zh: '姓名', en: 'Name', total: 1, options: [{ value: 'Ava', total: 1 }] }
    const t = (key) => zh[key] ?? key
    assert.equal(optionLabelOf({ t, dimension: nameDimension, value: 'Ava' }), 'Ava')
  })

  it('reports no dimensions for a catalog that has no dimension table', () => {
    assert.deepEqual(characterDimensionsOf({ categories: [{ id: 'character' }] }, 'character'), [])
    assert.deepEqual(characterDimensionsOf(null, 'character'), [])
  })

  it('ignores the dimensions of any category but 角色', () => {
    const manifest = { categories: [{ id: 'audio', dimensions: [{ id: 'scene', options: [{ value: 'Car', total: 1 }] }] }] }
    assert.deepEqual(characterDimensionsOf(manifest, 'audio'), [])
  })

  it('drops a dimension the catalog published with no options at all', () => {
    const manifest = { categories: [{ id: 'character', dimensions: [{ id: 'scene', options: [] }, { id: 'pose', options: [{ value: 'Selfie', total: 1 }] }] }] }
    assert.deepEqual(characterDimensionsOf(manifest, 'character').map((row) => row.id), ['pose'])
  })
})

describe('Both dictionaries carry every dimension and every option', () => {
  const DIMENSION_TITLES = ['gender', 'age', 'figure', 'name', 'industry', 'scene', 'pose', 'outfit']
  const OPTION_KEYS = [
    'female', 'male', 'youth', 'middle', 'slim', 'average', 'curvy',
    'marketing', 'beauty', 'podcast', 'gaming', 'education', 'lifestyle',
    'car', 'living', 'bedroom', 'outdoor', 'bathroom', 'office', 'kitchen', 'cafe', 'indoor',
    'frontal', 'sitting', 'selfie', 'standing',
    'casual', 'fashion', 'business', 'holiday',
  ]

  it('titles all eight dimensions in Chinese and English', () => {
    const expectedZh = ['性别', '年龄', '体型', '姓名', '行业', '场景', '姿势', '服装风格']
    const expectedEn = ['Gender', 'Age', 'Figure', 'Name', 'Industry', 'Scene', 'Pose', 'Outfit style']
    DIMENSION_TITLES.forEach((id, index) => {
      assert.equal(zh[`dim.${id}`], expectedZh[index])
      assert.equal(en[`dim.${id}`], expectedEn[index])
    })
  })

  it('names every option in both languages', () => {
    for (const key of OPTION_KEYS) {
      assert.equal(typeof zh[`dim.opt.${key}`], 'string', `zh missing dim.opt.${key}`)
      assert.equal(typeof en[`dim.opt.${key}`], 'string', `en missing dim.opt.${key}`)
      assert.notEqual(zh[`dim.opt.${key}`], '')
      assert.notEqual(en[`dim.opt.${key}`], '')
    }
  })

  it('carries the requested wording for the two that name a place', () => {
    assert.equal(zh['dim.opt.car'], '车内出镜')
    assert.equal(en['dim.opt.car'], 'In Car')
    assert.equal(zh['dim.opt.middle'], '中年')
    assert.equal(en['dim.opt.middle'], 'Middle-aged')
  })

  it('adds the one reset control and the filter-shaped empty state', () => {
    assert.equal(zh['dim.reset'], '重置筛选')
    assert.equal(en['dim.reset'], 'Reset Filters')
    assert.equal(typeof zh['dim.empty.title'], 'string')
    assert.equal(typeof en['dim.empty.title'], 'string')
  })

  it('drops no existing cloud key while adding the new ones', () => {
    for (const key of ['cloud.subnav.all', 'cloud.category.character', 'cloud.subnav.label']) {
      assert.equal(typeof zh[key], 'string')
      assert.equal(typeof en[key], 'string')
    }
  })
})

describe('The filter bar is wired to the feed, not to a local counter', () => {
  it('counts the active dimensions through the shared helper', () => {
    assert.equal(activeDimensionCount(emptyCharacterFilters()), 0)
    assert.equal(activeDimensionCount({ ...emptyCharacterFilters(), scene: 'Car' }), 1)
    assert.equal(activeDimensionCount({ ...emptyCharacterFilters(), scene: 'Car', pose: 'Selfie' }), 2)
  })

  it('hands the same helper functions to the chip row', () => {
    assert.match(feed, /characterDimensionsOf\(manifest, category\)/)
    assert.match(feed, /activeDimensionCount\(filters\)/)
    assert.match(feed, /characterFilterTokens\(filters\)/)
    assert.match(view, /dimensionLabelOf\(\{ t, dimension, value \}\)/)
    assert.match(view, /optionLabelOf\(\{ t, dimension, value: option\.value \}\)/)
  })

  it('asks the Host to filter the index instead of filtering the loaded rows', () => {
    assert.match(feed, /\? await cloudFilter\(\{ tokens: filterTokens, limit: CLOUD_PAGE_SIZE, offset: page \* CLOUD_PAGE_SIZE \}\)/)
    assert.doesNotMatch(feed, /characterRowMatches/)
  })

  it('learns a filtered scope\u2019s page count from the page envelope', () => {
    assert.equal(pageTotalPages({ totalPages: 3 }), 3)
    assert.equal(pageTotalPages({}), 0)
    assert.equal(pageTotalPages(null), 0)
    assert.match(feed, /setScopedPages\(filtering \? pageTotalPages\(result\.body\) : null\)/)
  })

  it('resets the dimension selection on a category switch', () => {
    assert.match(feed, /setFilters\(emptyCharacterFilters\(\)\)/)
    assert.match(feed, /const selectDimension = useCallback/)
    assert.match(feed, /const resetDimensions = useCallback/)
  })
})
