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
 * one prompt pack, one short-drama reference pack, one row per image-gallery
 * class, one row per style shelf rule, and enough 场景氛围 rows to push the
 * whole-catalog scope past a single page.
 *
 * It also carries one Loomi row per source class, because that library is the one
 * source whose classes do not map onto a catalog category one-to-one — 道具-classed
 * items become 实物道具 while the source tab calls them 道具, 场景-classed items are
 * sorted by the place their picture shows, and the remaining three become three
 * shelves of 素材. A fixture with a single class could not tell the two tables
 * apart.
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

/**
 * One row per Loomi source class, each mapped to the shelf it must land on.
 * `mediaKind: 'video'` on one of them is what proves the tag follows the row
 * rather than the shelf. 场景 is the class whose shelf is read off the picture
 * rather than named for the source folder, so its expected shelf (`indoor`) is
 * the one the classifier answers for `mat-studio-room`.
 * @type {[string, string, string, string][]} source class, shelf, id, media kind
 */
const LOOMI_ROWS = [
  ['prop', 'object', 'mat-camera-prop', 'image'],
  ['scene', 'indoor', 'mat-studio-room', 'video'],
  ['pet', 'pet', 'mat-orange-cat', 'image'],
  ['clothing', 'clothing', 'mat-purple-dress', 'image'],
  ['portrait', 'portrait', 'mat-cowboy', 'image'],
]

/**
 * The gpt-image-2 gallery, one row per class group, each mapped to the shelf its
 * own `category` names. The five subject classes are the concept-art half.
 * @type {[string, string, number][]} source category, shelf, ordinal
 */
const GALLERY_ROWS = [
  ['graphic-design', 'graphic-design', 0],
  ['illustration', 'illustration', 1],
  ['anime', 'anime', 2],
  ['photography', 'concept-art', 3],
  ['cultural', 'concept-art', 4],
]

/**
 * The style shelf tables, one row each: a row whose own class already names the
 * shelf, a row the override table corrects, and a file that carries no class at
 * all (Pippit moods are 调性氛围 itself).
 * @type {[string, string, string][]} file, preset title, expected shelf
 */
const STYLE_ROWS = [
  ['new-style-presets.json', '35mm 胶片摄影', 'photography'],
  ['new-style-presets.json', '新中式水墨', 'traditional-art'],
  ['new-style-presets.json', '包豪斯', 'video-tone'],
  ['xiaoyunque-novel-style-library.json', '宫斗权谋冷峻风格', 'live-action'],
  ['xiaoyunque-novel-style-library.json', 'UE5写实渲染', 'render-3d'],
  ['pippit-visual-styles.json', 'Quiet Luxury Minimalism', 'video-tone'],
]

const LOOMI_DIR = '素材库/gxgen-data/inspiration-library/loomi'

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

/**
 * Every catalogued row, read from the `all/` shards.
 *
 * The page files carry the whole row; `index.json` deliberately keeps only the
 * three `meta` fields the Host needs, so source attribution is only observable
 * here.
 * @returns {any[]}
 */
function allRows() {
  const rows = []
  for (const page of readdirSync(join(outDir, 'all')).filter((name) => name.endsWith('.json')).sort()) {
    rows.push(...readJson(`all/${page}`).items)
  }
  return rows
}

/** @param {string} sourceClass @param {string} [sourceId] @returns {any} */
function loomiRowOf(sourceClass, sourceId) {
  return allRows().find((row) => row?.meta?.source === 'loomi'
    && row.meta.source_category === sourceClass
    && (sourceId === undefined || row.meta.source_id === sourceId))
}

/** @returns {any[]} */
function loomiRows() {
  return allRows().filter((row) => row?.meta?.source === 'loomi')
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

  // The offline Loomi library: one item per source class, every media file
  // present, plus one row whose file is gone so the remote fallback is exercised.
  writeJson(`${LOOMI_DIR}/materials.json`, {
    source: 'https://loomi.live/zh/loomi-tv',
    total_count: LOOMI_ROWS.length + 1,
    items: [
      ...LOOMI_ROWS.map(([sourceClass, _shelf, id, mediaKind]) => ({
        id,
        // The source repeats the uploader handle as the title on every clip; the
        // scene row is the one that carries that shape into the fixture.
        title: mediaKind === 'video' ? 'Hữu Thịnh 79' : `${sourceClass} 标题`,
        creator: mediaKind === 'video' ? 'Hữu Thịnh 79' : 'Some Photographer',
        category: sourceClass,
        mediaKind,
        assetUrl: `https://cdn.test/loomi/${id}.bin`,
        thumbnailUrl: `https://cdn.test/loomi/${id}-thumb.bin`,
        fileType: mediaKind === 'video' ? 'video/mp4' : 'image/jpeg',
        filename: `${id}.${mediaKind === 'video' ? 'mp4' : 'jpeg'}`,
        sourceProvider: 'Pexels',
        license: 'Pexels License',
        local_source_media: `media/${id}.bin`,
        local_thumbnail: `media/${id}-thumb.bin`,
      })),
      {
        id: 'mat-offline-only',
        title: '只剩远端的素材',
        category: 'prop',
        mediaKind: 'image',
        assetUrl: 'https://cdn.test/loomi/mat-offline-only.bin',
        thumbnailUrl: '',
        filename: 'mat-offline-only.jpeg',
        sourceProvider: 'Unsplash',
        license: 'Unsplash License',
      },
    ],
  })
  for (const [_sourceClass, _shelf, id] of LOOMI_ROWS) {
    writeFile(join(assetsRoot, LOOMI_DIR, `media/${id}.bin`), 'media')
    writeFile(join(assetsRoot, LOOMI_DIR, `media/${id}-thumb.bin`), 'thumb')
  }

  // The professional image gallery: one frame per class group, each with its
  // `NNNN-` ordinal file present.
  writeJson('素材库/gxgen-data/inspiration-library/image/gpt-image-2-skill.json', GALLERY_ROWS.map(([category, _shelf, ordinal]) => ({
    title: `${category} 样张 ${ordinal}`,
    category,
    prompt_text: `a ${category} frame`,
    cover_url: `https://cdn.test/gallery/${ordinal}.jpg`,
  })))
  for (const [_category, _shelf, ordinal] of GALLERY_ROWS) {
    writeFile(join(assetsRoot, '素材库/gxgen-data/inspiration-library/image/media/gpt-image-2-skill', `${String(ordinal).padStart(4, '0')}-frame.webp`), 'webp')
  }

  // The style shelf: two curated preset files whose own classes are one step
  // coarser than the shelves, and one mood file that carries no class at all.
  writeJson('素材库/gxgen-data/style-library/new-style-presets.json', STYLE_ROWS
    .filter(([file]) => file === 'new-style-presets.json')
    .map(([_file, title]) => ({
      title,
      category: title === '35mm 胶片摄影' ? 'photography' : (title === '新中式水墨' ? 'illustration' : 'graphic-design'),
      prompt_text: `${title} look`,
    })))
  writeJson('素材库/gxgen-data/style-library/xiaoyunque-novel-style-library.json', STYLE_ROWS
    .filter(([file]) => file === 'xiaoyunque-novel-style-library.json')
    .map(([_file, title]) => ({
      title,
      category: title === '宫斗权谋冷峻风格' ? '真人' : '3D',
      prompt_text: `${title} look`,
    })))
  writeJson('素材库/gxgen-data/style-library/pippit-visual-styles.json', {
    styles: STYLE_ROWS
      .filter(([file]) => file === 'pippit-visual-styles.json')
      .map(([_file, title]) => ({
        id: 'quiet-luxury',
        title,
        description: 'Understated luxury with clean minimal elegance',
      })),
  })

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

describe('cloud catalog builder · Loomi classes land on the shelves they describe', () => {
  it('opens 实物道具, sorts 场景 by place and files the rest under 素材', () => {
    const prop = manifest.categories.find((row) => row.id === 'prop')
    assert.deepEqual(prop.sub_categories.map((sub) => sub.id), ['object'])
    assert.equal(prop.sub_categories[0].total, 2, 'both fixture props — the offline one included')

    const scene = manifest.categories.find((row) => row.id === 'scene')
    assert.deepEqual(
      scene.sub_categories.map((sub) => sub.id),
      ['nature', 'indoor', 'city', 'travel', 'creative', 'workplace'],
    )
    assert.deepEqual(
      scene.sub_categories.filter((sub) => sub.id === 'indoor').map((sub) => sub.total),
      [1],
    )

    const material = manifest.categories.find((row) => row.id === 'material')
    assert.deepEqual(
      material.sub_categories.map((sub) => sub.id).filter((id) => ['pet', 'clothing', 'portrait'].includes(id)),
      ['clothing', 'pet', 'portrait'],
    )
  })

  it('routes each source class to its own shelf rather than reusing the source name', () => {
    for (const [sourceClass, shelf] of LOOMI_ROWS) {
      const row = loomiRowOf(sourceClass)
      assert.ok(row, `${sourceClass} should be catalogued`)
      assert.equal(row.sub_categories.includes(shelf), true, `${sourceClass} → ${shelf}`)
    }
    // The one case the source tab's own wording would have got wrong.
    const prop = loomiRowOf('prop', 'mat-camera-prop')
    assert.equal(prop.sub_category, 'object')
    assert.equal(prop.category, 'prop')
    assert.notEqual(prop.sub_category, 'prop')
    // 场景 carries no shelf of its own: the picture decides, and this fixture's
    // scene row is a living room.
    assert.equal(loomiRowOf('scene').sub_category, 'indoor')
    assert.notEqual(loomiRowOf('scene').sub_category, 'scene')
  })

  it('keeps every Loomi row out of 角色', () => {
    for (const row of loomiRows()) {
      assert.notEqual(row.category, 'character', row.id)
      assert.doesNotMatch(String(row.id), /^character-/, row.id)
    }
  })

  it('serves the downloaded copy and keeps the remote original as the fallback', () => {
    const row = loomiRowOf('pet')
    assert.match(String(row.media_url), /^file:素材库\/gxgen-data\/inspiration-library\/loomi\/media\//)
    assert.match(String(row.cover_url), /^file:素材库\/gxgen-data\/inspiration-library\/loomi\/media\//)
    assert.match(String(row.meta.source_media_url), /^https:\/\/cdn\.test\//)
    assert.equal(row.meta.license, 'Pexels License')
    assert.equal(row.meta.provider, 'Pexels')
  })

  it('falls back to the remote URL when the downloaded file is gone', () => {
    const row = allRows().find((entry) => entry?.meta?.source_id === 'mat-offline-only')
    assert.ok(row, 'a Loomi row without local media should still be catalogued')
    assert.equal(row.media_url, 'https://cdn.test/loomi/mat-offline-only.bin')
    assert.equal(row.meta.source_media_url, undefined)
  })

  it('tags a row with the media kind it actually is', () => {
    assert.equal(loomiRowOf('scene').tags.includes('视频'), true)
    assert.equal(loomiRowOf('scene').tags.includes('图片'), false)
    assert.equal(loomiRowOf('prop').tags.includes('图片'), true)
  })

  it('never puts an uploader handle where the card shows a name', () => {
    const scene = loomiRowOf('scene')
    assert.equal(scene.name, '生活室内 mat-studio-room')
    assert.notEqual(scene.name, 'Hữu Thịnh 79')
    assert.equal(scene.meta.creator, 'Hữu Thịnh 79')

    // A row the source did title keeps its own name.
    assert.equal(loomiRowOf('prop', 'mat-camera-prop').name, 'prop 标题')
  })
})

describe('cloud catalog builder · the image gallery names the discipline it was made for', () => {
  it('files each gallery class on the shelf its own category names', () => {
    for (const [category, shelf] of GALLERY_ROWS) {
      const row = allRows().find((entry) => entry?.meta?.source === 'gpt-image-2-skill'
        && entry.meta.category === category)
      assert.ok(row, `${category} should be catalogued`)
      assert.equal(row.sub_category, shelf, `${category} → ${shelf}`)
      assert.equal(row.category, 'material')
    }
  })

  it('keeps the five subject classes together as concept art', () => {
    const material = manifest.categories.find((row) => row.id === 'material')
    const concept = material.sub_categories.find((sub) => sub.id === 'concept-art')
    assert.equal(concept.total, 2, 'photography and cultural fixture rows')
    assert.equal(material.sub_categories.some((sub) => sub.id === 'meme'), false)
  })

  it('hands the gallery prompt to the card instead of a sticker caption', () => {
    const row = allRows().find((entry) => entry?.meta?.source === 'gpt-image-2-skill'
      && entry.meta.category === 'anime')
    assert.match(String(row.meta.prompt_text), /anime frame/)
    assert.match(String(row.cover_url), /^file:素材库\/gxgen-data\/inspiration-library\/image\/media\//)
  })
})

describe('cloud catalog builder · style rows land on the school they belong to', () => {
  it('publishes the six shelves and puts every row on one of them', () => {
    const style = manifest.categories.find((row) => row.id === 'style')
    assert.deepEqual(
      style.sub_categories.map((sub) => sub.id),
      ['live-action', 'anime-2d', 'render-3d', 'photography', 'traditional-art', 'video-tone'],
    )
    assert.equal(style.sub_categories.reduce((sum, sub) => sum + sub.total, 0), STYLE_ROWS.length)
    assert.equal(style.sub_categories.some((sub) => sub.id === 'image-preset'), false)
  })

  it('reads the shelf off the row class, the override table, or the file itself', () => {
    for (const [_file, title, shelf] of STYLE_ROWS) {
      const row = allRows().find((entry) => entry?.meta?.source === 'style-library' && entry.name === title)
      assert.ok(row, `${title} should be catalogued`)
      assert.equal(row.sub_category, shelf, `${title} → ${shelf}`)
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
    assert.equal(manifest.totalAssets, AMBIENCE_ROWS + 1 + LOOMI_ROWS.length + 1 + GALLERY_ROWS.length + STYLE_ROWS.length)
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
    assert.deepEqual(
      [...new Set(rows.map((row) => row.category))].sort(),
      ['character', 'material', 'prop', 'scene', 'style'],
    )
  })
})
