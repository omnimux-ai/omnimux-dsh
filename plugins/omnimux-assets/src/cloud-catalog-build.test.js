/**
 * The builder's contract with the cloud tab, checked end to end against a
 * synthetic asset root.
 *
 * Two things the app can only be as good as are decided here: which shelves the
 * catalog holds, and whether the cross-category 全部 scope can be paged by URL.
 * Both are properties of the generated files, so a fixture root is built and the
 * real builder is run over it. Reading the committed catalog instead would only
 * prove what was last generated on one machine, and would fail on a checkout
 * whose media paths point elsewhere.
 *
 * The fixture is the smallest root that exercises the removals: one digital human
 * from the Pippit catalogue, one loose portrait from the 素材库/AI 网红 archive,
 * one prompt pack, one short-drama reference pack, and enough 场景氛围 rows to
 * push the whole-catalog scope past a single page.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const builder = join(pluginRoot, 'scripts', 'build-cloud-assets-catalog.mjs')

/** Rows the fixture ships in 场景氛围, chosen to overflow one 24-row page. */
const AMBIENCE_ROWS = 30

let workDir = ''
let outDir = ''
/** @type {any} */
let manifest = null
/** @type {any[]} */
let index = []

/** @param {string} abs @param {string} body */
function writeFile(abs, body) {
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

/** @param {string} rel @param {unknown} body */
function writeJson(rel, body) {
  writeFile(join(workDir, 'assets', rel), `${JSON.stringify(body, null, 2)}\n`)
}

/** @param {string} rel @returns {any} */
function readJson(rel) {
  return JSON.parse(readFileSync(join(outDir, rel), 'utf8'))
}

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'cloud-catalog-build-'))
  const assetsRoot = join(workDir, 'assets')
  outDir = join(workDir, 'out')

  const avatar = '素材库/gxgen-data/character-library/pippit-local-avatars-source/Agnes_Home_Selfie'
  writeJson(`${avatar}/metadata.json`, {
    name: 'Agnes-Home-Selfie',
    tags: ['Home', 'Selfie'],
    index: 1,
    total: 329,
    source_url: 'https://pippit.ai/avatars/agnes',
  })
  writeFile(join(assetsRoot, avatar, 'video.mp4'), 'video')
  writeFile(join(assetsRoot, avatar, 'cover.jpg'), 'cover')

  // The archive that must stay off the shelf: unnamed portraits with no gender
  // or scene recorded anywhere.
  writeFile(join(assetsRoot, '素材库/AI 网红/御用模特/1.jpg'), 'portrait')

  // Text shelves that must stay off the shelf as well.
  writeFile(join(assetsRoot, 'prompts/编剧外包/hook.md'), `# 前 3 秒钩子\n\n${'开场先给结果。'.repeat(8)}\n`)
  writeFile(join(assetsRoot, 'skills/drama-shotlist/references/rule.md'), `# 拆镜规则\n\n${'一个镜头一个动作。'.repeat(8)}\n`)

  // A second category, so 全部 is genuinely cross-category rather than an alias
  // for whichever category happens to be first.
  writeJson(
    '素材库/gxgen-data/element-library/场景氛围/gxgen-index.json',
    Array.from({ length: AMBIENCE_ROWS }, (_, position) => ({
      id: `ambience-${String(position).padStart(3, '0')}`,
      title: `场景氛围 ${String(position).padStart(3, '0')}`,
      media_url: `https://cdn.test/ambience/${String(position)}.mp4`,
      tags: ['场景氛围'],
      metadata: { description: `氛围镜头 ${String(position)}`, poster_url: `https://cdn.test/ambience/${String(position)}.jpg` },
    })),
  )

  execFileSync(process.execPath, [
    builder,
    `--assets-root=${assetsRoot}`,
    `--out=${outDir}`,
    '--generated-at=2026-09-13T00:00:00.000Z',
  ], { stdio: 'pipe' })

  manifest = readJson('manifest.json')
  index = readJson('index.json')
})

after(() => {
  if (workDir !== '') rmSync(workDir, { recursive: true, force: true })
})

describe('cloud catalog builder · 知识包 and 素材库/AI 网红 are off the shelf', () => {
  it('catalogues no 知识包 category and writes no shards for it', () => {
    assert.deepEqual(
      manifest.categories.map((row) => row.id),
      ['character', 'scene', 'prop', 'material', 'style', 'audio'],
    )
    assert.equal(existsSync(join(outDir, 'knowledge')), false)
    assert.equal(index.some((row) => row.category === 'knowledge'), false)
  })

  it('keeps 角色 to the digital humans the library actually ships', () => {
    const character = manifest.categories.find((row) => row.id === 'character')
    assert.equal(character.total, 1)
    assert.equal(index.some((row) => (row.tags ?? []).includes('虚拟红人')), false)
    assert.equal(
      index.filter((row) => row.category === 'character').every((row) => row.id.startsWith('character-')),
      true,
    )
  })

  it('keeps the text shelves out of the catalog entirely', () => {
    for (const row of index) {
      assert.doesNotMatch(String(row.id), /^knowledge-/, row.id)
      assert.doesNotMatch(String(row.description ?? ''), /拆镜规则|前 3 秒钩子/, row.id)
    }
  })
})

describe('cloud catalog builder · 全部 pages the whole catalog', () => {
  it('writes all/page-NNNN.json next to the per-category shards', () => {
    const first = readJson('all/page-0000.json')
    assert.equal(first.scope, 'all')
    assert.equal(first.page, 0)
    assert.equal(first.pageSize, manifest.pageSize)
    assert.equal(first.total, manifest.totalAssets)
    assert.equal(first.totalPages, Math.ceil(manifest.totalAssets / manifest.pageSize))
    assert.equal(manifest.totalAssets, AMBIENCE_ROWS + 1)
  })

  it('numbers the shards so a pager can walk them to the end', () => {
    const pages = readdirSync(join(outDir, 'all')).sort()
    assert.deepEqual(pages, ['page-0000.json', 'page-0001.json'])

    const second = readJson('all/page-0001.json')
    assert.equal(second.page, 1)
    assert.equal(second.items.length, manifest.totalAssets - manifest.pageSize)
  })

  it('covers every catalogued row exactly once, across more than one category', () => {
    const rows = [...readJson('all/page-0000.json').items, ...readJson('all/page-0001.json').items]
    assert.deepEqual(rows.map((row) => row.id).sort(), index.map((row) => row.id).sort())
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
    assert.deepEqual([...new Set(rows.map((row) => row.category))].sort(), ['character', 'scene'])
  })
})
