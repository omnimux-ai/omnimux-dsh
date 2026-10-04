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
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { createRequire } from 'node:module'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(pluginRoot, '..', '..')
const builder = join(pluginRoot, 'scripts', 'build-cloud-assets-catalog.mjs')

/**
 * The immutable pre-refresh catalog commit — pinned, not `HEAD`, so the voices-only
 * refresh tests keep a real "old baseline" after this ticket's regenerated
 * catalog lands (#3058, QA-BASE-01). Copying the working tree instead made the
 * base silently track the refresh under test and voided the no-meta premise.
 */
const VOICE_BASELINE_COMMIT = '24d0f4f6b4108076ea31c98511681e76f0bde327'

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

/**
 * The registered official preview CDN the hub mapping and exporter publish
 * under: the builder validates every snapshot preview URL against this exact
 * HTTPS origin + base path (#3058 OCR #6). Fixture URLs must sit under it so
 * the positive cases exercise the same contract the shipped snapshot does —
 * never a synthetic host like cdn.test, which is what the validator rejects.
 */
const OFFICIAL_CDN = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts'

/**
 * The voice-preview snapshot fixture the builder consumes instead of the OPC
 * voice registry (#3058): one verified row and one unverified row. The shape
 * is the hub exporter's schema — the voices it carries are the same records
 * the registry held, plus a `preview` block per voice.
 *
 * The `saturn_*` ids below are synthetic fixture voice_types: they do not
 * exist in the official voice index and are never presented as real voices —
 * they only stand in for the registry records the snapshot shape carries.
 */
const VOICE_SNAPSHOT = {
  schema_version: 1,
  catalog_fingerprint: 'fixture-catalog-fp',
  preview_fingerprint: 'fixture-preview-fp',
  voices: [
    {
      voice_type: 'saturn_zh_female_linxiao_tob',
      name: '林潇',
      language: '中文',
      category: '通用场景',
      section: '音色列表',
      resource_id: 'seed-tts-2.0',
      preview: {
        purpose: 'official-voice-preview',
        state: 'verified-file',
        primary_url: `${OFFICIAL_CDN}/linxiao.mp3`,
        candidates: [`${OFFICIAL_CDN}/linxiao.mp3`, `${OFFICIAL_CDN}/linxiao-alt.mp3`],
        checked_at: '2026-10-02T00:00:00.000Z',
        evidence_ref: 'audit#124',
      },
    },
    {
      voice_type: 'saturn_zh_male_yangguang_tob',
      name: '阳光阿辰',
      language: '中文',
      category: '通用场景',
      section: '音色列表',
      resource_id: 'seed-tts-2.0',
      preview: {
        purpose: 'official-voice-preview',
        state: 'unverified',
        primary_url: null,
        candidates: [`${OFFICIAL_CDN}/yangguang-maybe.mp3`],
        checked_at: '2026-10-02T00:00:00.000Z',
        evidence_ref: 'audit#3058',
      },
    },
  ],
}

let workDir = ''
let outDir = ''
let snapshotFile = ''
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
  return readJsonAt(outDir, rel)
}

/** @param {string} dir @param {string} rel @returns {any} */
function readJsonAt(dir, rel) {
  return JSON.parse(readFileSync(join(dir, rel), 'utf8'))
}

/**
 * Materialize the committed catalog at VOICE_BASELINE_COMMIT without touching
 * the working tree. A pinned commit — not `HEAD` — keeps the baseline an old
 * no-preview catalog even after this ticket's regenerated catalog lands.
 * @param {string} dir
 */
function extractBaselineCatalog(dir) {
  mkdirSync(dir, { recursive: true })
  const archive = execFileSync('git', [
    '-C', repoRoot,
    'archive', VOICE_BASELINE_COMMIT, '--', 'plugins/omnimux-assets/cloud-catalog',
  ], { maxBuffer: 64 * 1024 * 1024 })
  const unpack = spawnSync('tar', ['-xf', '-', '--strip-components=3', '-C', dir], {
    input: archive,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  })
  assert.equal(unpack.status, 0, `tar must unpack the baseline catalog: ${unpack.stderr}`)
}

/**
 * Every file of a catalog dir as a `{ rel: bytes }` map — both a byte-level
 * evidence source and the digest a refused build is checked against for
 * having deleted nothing.
 * @param {string} dir @returns {Map<string, Buffer>}
 */
function filesAt(dir) {
  const files = new Map()
  const visit = (rel) => {
    const abs = join(dir, rel)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(rel, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) files.set(child, readFileSync(join(dir, child)))
    }
  }
  visit('')
  return files
}

/**
 * Every `{ scope, page }` item list of a catalog dir, flattened — the rows the
 * completeness gate now reads as the shard lineage.
 * @param {string} dir @returns {{ scope: string, item: any }[]}
 */
function pageRowsAt(dir) {
  const rows = []
  const visit = (rel) => {
    const abs = join(dir, rel)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(rel, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile() && /^page-\d{4}\.json$/.test(entry.name)) {
        for (const item of readJsonAt(dir, child).items) rows.push({ scope: child, item })
      }
    }
  }
  visit('')
  return rows
}

/** Index rows of a catalog dir keyed by id. */
function indexAt(dir) {
  return new Map(readJsonAt(dir, 'index.json').map((row) => [row.id, row]))
}

/** Baseline voice page items keyed by voice_type, extracted once per case. */
function baseVoicesAt(dir) {
  const byType = new Map()
  for (const { item } of pageRowsAt(dir)) {
    if (item?.meta?.voice_type && !byType.has(item.meta.voice_type)) byType.set(item.meta.voice_type, item)
  }
  return byType
}

/**
 * Snapshot voice rows for baseline catalog items: the first 124 marked
 * verified-file like the audit batch, the rest unverified. Preview URLs
 * always sit under the registered official CDN base.
 * @param {any[]} items @returns {any[]}
 */
function snapshotVoicesFor(items) {
  return items.map((item, position) => {
    const verified = position < 124
    return {
      voice_type: item.meta.voice_type,
      name: item.meta.voice_name || item.name,
      display_name: item.name,
      language: item.meta.language,
      tags: (item.tags ?? []).filter((tag) => tag !== '火山引擎' && tag !== item.meta.language),
      category: item.meta.voice_category,
      section: item.meta.section,
      resource_id: item.meta.resource_id,
      preview: {
        purpose: 'official-voice-preview',
        state: verified ? 'verified-file' : 'unverified',
        primary_url: verified ? `${OFFICIAL_CDN}/${item.meta.voice_type}.mp3` : null,
        candidates: verified ? [`${OFFICIAL_CDN}/${item.meta.voice_type}.mp3`] : [],
        checked_at: '2026-10-03T00:00:00.000Z',
        evidence_ref: verified ? 'audit#124' : null,
      },
    }
  })
}

/** Write a schema-1 snapshot JSON and return its path. */
function writeVoiceSnapshot(name, voices) {
  const path = join(workDir, name)
  writeFileSync(path, `${JSON.stringify({
    schema_version: 1,
    catalog_fingerprint: 'committed-cat-fp',
    preview_fingerprint: 'committed-preview-fp',
    voices,
  })}\n`)
  return path
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
  writeJson('素材库/gxgen-data/character-library/pippit-local-avatars-source/cloud-index.json', {
    folders: {
      Agnes_Home_Selfie: {
        video: 'avatars/pippit/Agnes_Home_Selfie/video.mp4',
        cover: 'avatars/pippit/Agnes_Home_Selfie/cover.jpg',
      },
    },
  })
  writeJson(`${avatar}/metadata.json`, {
    name: 'Agnes-Home-Selfie',
    tags: ['Home', 'Selfie'],
    index: 1,
    total: 329,
    source_url: 'https://pippit.ai/avatars/agnes',
  })
  writeFile(join(assetsRoot, avatar, 'video.mp4'), 'video')
  writeFile(join(assetsRoot, avatar, 'cover.jpg'), 'cover')

  // A second digital human whose files exist locally but has no cloud-index
  // entry: the catalog must not ship a row nobody else can ever play (#3028).
  const noRemote = '素材库/gxgen-data/character-library/pippit-local-avatars-source/No_Remote'
  writeJson(`${noRemote}/metadata.json`, {
    name: 'No Remote',
    tags: ['Office'],
    index: 2,
    total: 329,
  })
  writeFile(join(assetsRoot, noRemote, 'video.mp4'), 'video')
  writeFile(join(assetsRoot, noRemote, 'cover.jpg'), 'cover')

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

  // The voice catalog no longer comes from an OPC registry file: the builder
  // consumes the same JSON snapshot the hub exports (#3058).
  snapshotFile = join(workDir, 'voice-snapshot.json')
  writeFileSync(snapshotFile, `${JSON.stringify(VOICE_SNAPSHOT)}\n`)

  // A full build refuses to wipe an output it cannot verify the snapshot
  // against, so a fresh out dir needs its voice lineage seeded first — the
  // same way a real checkout's cloud-catalog/voice-preview-snapshot.json is
  // the lineage of the default output. Seeding the input's own voice set is
  // the first generation of the fixture catalog, not a bypass.
  writeFile(join(outDir, 'voice-preview-snapshot.json'), `${JSON.stringify(VOICE_SNAPSHOT)}\n`)

  execFileSync(process.execPath, [
    builder,
    `--assets-root=${assetsRoot}`,
    `--out=${outDir}`,
    '--generated-at=2026-09-13T00:00:00.000Z',
    `--voice-snapshot=${snapshotFile}`,
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

  it('points every locator at a public URL and keeps the remote original as the fallback', () => {
    const row = loomiRowOf('pet')
    // #3028：随包目录不再产生 file: 定位符——有本地副本的行走官方域名，
    // 本地文件是否存在都不影响任何机器上的可播放性。
    assert.equal(row.media_url, 'https://cdn.test/loomi/mat-orange-cat.bin')
    assert.equal(row.cover_url, 'https://cdn.test/loomi/mat-orange-cat-thumb.bin')
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
    assert.equal(row.cover_url, 'https://cdn.test/gallery/2.jpg')
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
    assert.equal(manifest.totalAssets, AMBIENCE_ROWS + 1 + LOOMI_ROWS.length + 1 + GALLERY_ROWS.length + STYLE_ROWS.length + VOICE_SNAPSHOT.voices.length)
  })

  it('numbers the shards so a pager can walk them to the end', () => {
    const pages = readdirSync(join(outDir, 'all')).sort()
    assert.equal(pages.length, Math.ceil(manifest.totalAssets / manifest.pageSize))
    assert.deepEqual(pages, pages.map((_name, position) => `page-${String(position).padStart(4, '0')}.json`))

    const last = readJson(`all/${pages[pages.length - 1]}`)
    assert.equal(last.page, pages.length - 1)
    assert.equal(last.items.length, manifest.totalAssets - (pages.length - 1) * manifest.pageSize)
    assert.equal(last.totalPages, pages.length)
  })

  it('carries no file: locators anywhere in the shipped tree (#3028)', () => {
    for (const row of index) {
      assert.doesNotMatch(String(row.media_url ?? ''), /^file:/, row.id)
      assert.doesNotMatch(String(row.cover_url ?? ''), /^file:/, row.id)
    }
    assert.equal(manifest.sourceRoot, '')
    for (const page of readdirSync(join(outDir, 'all')).filter((name) => name.endsWith('.json'))) {
      for (const row of readJson(`all/${page}`).items) {
        assert.doesNotMatch(String(row.media_url ?? ''), /^file:/, row.id)
        assert.doesNotMatch(String(row.cover_url ?? ''), /^file:/, row.id)
      }
    }
  })

  it('drops a row whose media exists only on the build machine (#3028)', () => {
    // 没有本地映射（cloud-index 缺失）且无远端地址的素材不得出现在目录里：
    // 那种行在别的安装上永远放不出来。
    assert.equal(index.some((row) => row.id === 'character-pippit-no-remote'), false)
  })

  it('covers every catalogued row exactly once, across more than one category', () => {
    const pages = readdirSync(join(outDir, 'all')).filter((name) => name.endsWith('.json')).sort()
    const rows = pages.flatMap((page) => readJson(`all/${page}`).items)
    assert.deepEqual(rows.map((row) => row.id).sort(), index.map((row) => row.id).sort())
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
    assert.deepEqual(
      [...new Set(rows.map((row) => row.category))].sort(),
      ['audio', 'character', 'material', 'prop', 'scene', 'style'],
    )
  })
})

describe('cloud catalog builder · the voice slice comes from the shared snapshot (#3058)', () => {
  /**
   * The one voiceover row whose `meta.voice_type` is `voiceType`, read back
   * from the all/ shards.
   * @param {string} voiceType @returns {any}
   */
  function voiceRowOf(voiceType) {
    return allRows().find((row) => row?.meta?.voice_type === voiceType)
  }

  it('files every snapshot voice on the voiceover shelf with its identity kept', () => {
    const audio = manifest.categories.find((row) => row.id === 'audio')
    const voiceover = audio.sub_categories.find((sub) => sub.id === 'voiceover')
    assert.equal(voiceover.total, VOICE_SNAPSHOT.voices.length)
    for (const voice of VOICE_SNAPSHOT.voices) {
      const row = voiceRowOf(voice.voice_type)
      assert.ok(row, `${voice.voice_type} should be catalogued`)
      assert.equal(row.sub_category, 'voiceover')
      assert.equal(row.category, 'audio')
      assert.equal(row.name, voice.name)
      assert.equal(row.meta.source, 'volcengine')
      assert.equal(row.meta.voice_type, voice.voice_type)
      assert.equal(row.meta.resource_id, voice.resource_id)
    }
  })

  it('ships a playable media_url only for verified-file voices', () => {
    const verified = voiceRowOf('saturn_zh_female_linxiao_tob')
    assert.equal(verified.media_url, `${OFFICIAL_CDN}/linxiao.mp3`)
    assert.equal(verified.media_type, 'audio')
    assert.equal(verified.meta.playable, true)

    const unverified = voiceRowOf('saturn_zh_male_yangguang_tob')
    assert.equal(unverified.media_url, '')
    assert.equal(unverified.meta.playable, false)
  })

  it('carries the preview projection into both the shards and the index', () => {
    const verified = voiceRowOf('saturn_zh_female_linxiao_tob')
    assert.deepEqual(verified.meta.preview, {
      purpose: 'official-voice-preview',
      state: 'verified-file',
      primary_url: `${OFFICIAL_CDN}/linxiao.mp3`,
      candidates: [`${OFFICIAL_CDN}/linxiao.mp3`, `${OFFICIAL_CDN}/linxiao-alt.mp3`],
      checked_at: '2026-10-02T00:00:00.000Z',
      evidence_ref: 'audit#124',
    })

    const indexRow = index.find((row) => row.id === verified.id)
    assert.ok(indexRow, 'verified voice must appear in index.json')
    assert.equal(indexRow.meta.voice_type, 'saturn_zh_female_linxiao_tob')
    assert.equal(indexRow.meta.resource_id, 'seed-tts-2.0')
    assert.equal(indexRow.meta.source, 'volcengine')
    assert.equal(indexRow.meta.playable, true)
    assert.equal(indexRow.meta.preview.primary_url, `${OFFICIAL_CDN}/linxiao.mp3`)
    assert.equal(indexRow.media_url, `${OFFICIAL_CDN}/linxiao.mp3`)
    assert.equal(indexRow.media_type, 'audio')
  })

  it('carries the unverified preview block too, without inventing a URL', () => {
    const unverified = voiceRowOf('saturn_zh_male_yangguang_tob')
    assert.equal(unverified.meta.preview.state, 'unverified')
    assert.equal(unverified.meta.preview.primary_url, null)
    const indexRow = index.find((row) => row.id === unverified.id)
    assert.equal(indexRow.meta.preview.state, 'unverified')
    assert.equal(indexRow.media_url, '')
  })

  it('records the snapshot fingerprints on the manifest', () => {
    assert.equal(manifest.voice_preview_fingerprint, 'fixture-preview-fp')
  })

  it('carries the snapshot candidate order verbatim for the frontend fallback', () => {
    // 前端把 candidates 当整组回退列表直接播放：builder 原样复制（含 primary
    // 在首位的排序），不在此处二次去重或重排，防止与画布候选规则分叉。
    const verified = voiceRowOf('saturn_zh_female_linxiao_tob')
    assert.deepEqual(verified.meta.preview.candidates, [
      `${OFFICIAL_CDN}/linxiao.mp3`,
      `${OFFICIAL_CDN}/linxiao-alt.mp3`,
    ])
  })
})

describe('cloud catalog builder · voices-only refresh rewrites only the voice slice (#3058)', () => {
  /** Immutable old-baseline catalog extracted once from a pinned commit. */
  let headCatalog = ''

  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runRefresh(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  before(() => {
    headCatalog = join(workDir, 'committed-baseline')
    extractBaselineCatalog(headCatalog)
  })

  it('keeps the 5879 non-voice rows deepEqual while only the voice slice changes', () => {
    const baseDir = join(workDir, 'committed-base')
    const outDirRefresh = join(workDir, 'committed-refreshed')
    cpSync(headCatalog, baseDir, { recursive: true })

    const baseManifest = readJsonAt(baseDir, 'manifest.json')
    const baseIndex = indexAt(baseDir)
    const basePageRows = pageRowsAt(baseDir)
    const baseVoiceIds = new Map()
    for (const { item } of basePageRows) {
      if (item?.meta?.voice_type && !baseVoiceIds.has(item.id)) baseVoiceIds.set(item.id, item)
    }
    assert.equal(baseVoiceIds.size, 509, 'the committed catalog carries exactly the 509 official voices')
    assert.equal(baseManifest.totalAssets, 6388)
    assert.equal(baseManifest.categories.find((c) => c.id === 'audio').total, 617)

    // The baseline is the real pre-refresh catalog: index rows carry no voice
    // meta at all, page rows carry no preview block, and the manifest has no
    // voice fingerprint. This premise is what the refresh adds, not assumes.
    for (const row of baseIndex.values()) {
      assert.equal(row.meta?.voice_type, undefined, `baseline index row ${row.id} must carry no voice meta`)
    }
    assert.equal('voice_preview_fingerprint' in baseManifest, false)
    for (const { item } of basePageRows) {
      if (item?.meta?.voice_type) {
        assert.equal(item.meta.preview, undefined, `baseline voice ${item.id} must have no preview block`)
      }
    }

    // Rebuild the hub snapshot the exporter will ship: the voices are the same
    // records the catalog already holds (fixture reconstruction, not the real
    // mapping source). The first 124 get verified-file previews like the audit
    // batch did; the rest stay unverified. Preview URLs sit under the
    // registered official CDN — the only host the builder accepts.
    const voices = snapshotVoicesFor([...baseVoiceIds.values()])
    const snapshotPath = join(workDir, 'committed-voice-snapshot.json')
    writeFileSync(snapshotPath, `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: 'committed-cat-fp',
      preview_fingerprint: 'committed-preview-fp',
      voices,
    })}\n`)

    execFileSync(process.execPath, [
      builder,
      '--voices-only',
      `--base=${baseDir}`,
      `--out=${outDirRefresh}`,
      `--voice-snapshot=${snapshotPath}`,
      '--generated-at=2026-10-03T00:00:00.000Z',
    ], { stdio: 'pipe' })

    // Totals: 6388 rows, 617 audio — nothing drifts.
    const refreshedManifest = readJsonAt(outDirRefresh, 'manifest.json')
    assert.equal(refreshedManifest.totalAssets, 6388)
    assert.equal(refreshedManifest.categories.find((c) => c.id === 'audio').total, 617)
    assert.equal(refreshedManifest.categories.find((c) => c.id === 'audio').sub_categories.find((s) => s.id === 'voiceover').total, 509)
    assert.equal(refreshedManifest.voice_preview_fingerprint, 'committed-preview-fp')

    // Every non-voice row, in every shard scope, stays deepEqual.
    const refreshedPageRows = pageRowsAt(outDirRefresh)
    assert.equal(refreshedPageRows.length, basePageRows.length)
    let voiceSeen = 0
    for (const { scope, item } of refreshedPageRows) {
      const baseline = basePageRows.find((row) => row.scope === scope && row.item.id === item.id)
      assert.ok(baseline, `${item.id}@${scope} must come from the committed catalog`)
      if (item?.meta?.voice_type) {
        voiceSeen += 1
        continue
      }
      assert.deepEqual(item, baseline.item, `${item.id}@${scope} must be untouched`)
    }
    // 509 voices × scopes they appear on (all + audio + audio/voiceover).
    assert.equal(voiceSeen, 509 * 3)

    // The 509 ids, names, descriptions and tags survive the refresh.
    const refreshedVoices = refreshedPageRows
      .filter(({ item }) => item?.meta?.voice_type && item.sub_category === 'voiceover')
    const seenIds = new Set()
    for (const { item } of refreshedVoices) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      const baseline = baseVoiceIds.get(item.id)
      assert.ok(baseline, `refreshed voice ${item.id} must keep its committed id`)
      assert.equal(item.name, baseline.name)
      assert.equal(item.description, baseline.description)
      assert.deepEqual(item.tags, baseline.tags)
      assert.equal(item.meta.voice_type, baseline.meta.voice_type)
      assert.equal(item.meta.voice_name, baseline.meta.voice_name)
      assert.equal(item.meta.resource_id, baseline.meta.resource_id)
      assert.equal(item.meta.preview.purpose, 'official-voice-preview')
    }
    assert.equal(seenIds.size, 509)

    // Verified slice: audio media_url + playable; unverified: empty, never guessed.
    const refreshedIndex = indexAt(outDirRefresh)
    let verifiedCount = 0
    let unverifiedCount = 0
    for (const row of refreshedIndex.values()) {
      if (!row.meta?.voice_type) continue
      const state = row.meta.preview.state
      if (state === 'verified-file') {
        verifiedCount += 1
        assert.equal(row.media_url, `${OFFICIAL_CDN}/${row.meta.voice_type}.mp3`)
        assert.equal(row.media_type, 'audio')
        assert.equal(row.meta.playable, true)
        assert.equal(row.meta.preview.primary_url, row.media_url)
      } else {
        unverifiedCount += 1
        assert.equal(state, 'unverified')
        assert.equal(row.media_url, '')
        assert.equal(row.meta.playable, false)
        assert.equal(row.meta.preview.primary_url, null)
      }
      assert.equal(row.meta.source, 'volcengine')
      assert.equal(row.meta.resource_id, row.meta.preview ? row.meta.resource_id : undefined)
    }
    assert.equal(verifiedCount, 124)
    assert.equal(unverifiedCount, 385)

    // Non-voice index rows stay deepEqual too — the voice slice alone changed.
    for (const [id, row] of refreshedIndex) {
      const baseline = baseIndex.get(id)
      if (row.meta?.voice_type) {
        assert.ok(baseline, `${id} must reuse its committed id`)
        continue
      }
      assert.deepEqual(row, baseline, `index row ${id} must be untouched`)
    }
    assert.equal(refreshedIndex.size, baseIndex.size)

    // Voices keep the same ids after refresh — the mapping keyed the row, not a counter.
    const refreshedVoiceIds = new Set(
      refreshedPageRows.filter(({ item }) => item?.meta?.voice_type).map(({ item }) => item.id),
    )
    for (const id of baseVoiceIds.keys()) {
      assert.equal(refreshedVoiceIds.has(id), true, `${id} must survive the refresh`)
    }

    // The refreshed index now carries the voice meta the baseline lacked.
    const refreshedVoiceMeta = [...refreshedIndex.values()].filter((row) => row.meta?.voice_type)
    assert.equal(refreshedVoiceMeta.length, 509)

    // Byte-level evidence: every file the refresh emits is either a byte copy
    // of the baseline file or a rewritten voice slice / manifest / index.
    const baseFiles = filesAt(baseDir)
    const refreshedFiles = filesAt(outDirRefresh)
    assert.deepEqual([...refreshedFiles.keys()].sort(), [...baseFiles.keys()].sort(),
      'a refresh must not add or drop catalog files')
    let rewritten = 0
    let unchanged = 0
    for (const [rel, bytes] of baseFiles) {
      const next = refreshedFiles.get(rel)
      if (next.equals(bytes)) {
        unchanged += 1
        continue
      }
      rewritten += 1
      const voiceScope = rel === 'manifest.json' || rel === 'index.json'
        || rel.startsWith('audio/voiceover/')
        || (/^all\/page-\d{4}\.json$/.test(rel)
          && readJsonAt(outDirRefresh, rel).items.some((item) => item?.meta?.voice_type))
        || (/^audio\/page-\d{4}\.json$/.test(rel)
          && readJsonAt(outDirRefresh, rel).items.some((item) => item?.meta?.voice_type))
      assert.equal(voiceScope, true, `${rel} must be byte-identical or a voice scope`)
    }
    assert.ok(unchanged > 700, `${unchanged} files must stay byte-identical`)
    assert.ok(rewritten > 0, 'the voice slice, manifest and index must be rewritten')

    // The base copy is untouched by an --out refresh.
    assert.equal(indexAt(baseDir).size, 6388)
    for (const row of indexAt(baseDir).values()) {
      assert.equal(row.meta?.voice_type, undefined, 'baseline index rows still carry no voice meta after the refresh')
    }
    assert.equal('voice_preview_fingerprint' in readJsonAt(baseDir, 'manifest.json'), false)
  })

  it('rewrites the voice slice in place when --out is the base itself', () => {
    const dir = join(workDir, 'committed-inplace')
    cpSync(headCatalog, dir, { recursive: true })
    const snapshotPath = join(workDir, 'committed-voice-snapshot.json')
    execFileSync(process.execPath, [
      builder,
      '--voices-only',
      `--voice-snapshot=${snapshotPath}`,
      `--base=${dir}`,
    ], { stdio: 'pipe' })
    const manifest = readJsonAt(dir, 'manifest.json')
    assert.equal(manifest.totalAssets, 6388)
    assert.equal(manifest.voice_preview_fingerprint, 'committed-preview-fp')
    const indexRows = indexAt(dir)
    assert.equal(indexRows.size, 6388)
    const voice = [...indexRows.values()].find((row) => row.meta?.preview?.state === 'verified-file')
    assert.ok(voice, 'an in-place refresh must land the verified slice')
    assert.equal(voice.media_url, `${OFFICIAL_CDN}/${voice.meta.voice_type}.mp3`)
  })

  it('refuses a voices-only refresh when the snapshot is missing baseline voices, before any output (#3058 OCR #7)', () => {
    const baseDir = join(workDir, 'committed-partial')
    const partialOut = join(workDir, 'committed-partial-out')
    cpSync(headCatalog, baseDir, { recursive: true })
    const baseIndexBytes = readFileSync(join(baseDir, 'index.json'))

    // 385 baseline voices absent → the refresh must fail closed rather than
    // silently delisting them.
    const baseline = baseVoicesAt(baseDir)
    const partial = writeVoiceSnapshot('committed-partial-snapshot.json',
      snapshotVoicesFor([...baseline.values()].slice(0, 124)))
    const result = runRefresh([
      '--voices-only',
      `--base=${baseDir}`,
      `--out=${partialOut}`,
      `--voice-snapshot=${partial}`,
    ])
    assert.notEqual(result.status, 0, 'a partial snapshot must not shrink the voice catalog')
    assert.match(result.stderr, /missing.*baseline|baseline.*missing|absent/i)
    assert.match(result.stderr, /385/, 'the error must name how many baseline voices are missing')
    assert.equal(existsSync(partialOut), false, 'nothing may be written when a refresh is refused')
    assert.ok(readFileSync(join(baseDir, 'index.json')).equals(baseIndexBytes), 'the base catalog stays byte-identical')
  })

  it('refuses a voices-only refresh that carries a voice_type the baseline never registered', () => {
    const baseDir = join(workDir, 'committed-unknown')
    const unknownOut = join(workDir, 'committed-unknown-out')
    cpSync(headCatalog, baseDir, { recursive: true })

    const baseline = baseVoicesAt(baseDir)
    const voices = snapshotVoicesFor([...baseline.values()])
    voices.push({
      voice_type: 'synthetic_unregistered_fixture_voice',
      name: 'Synthetic Unknown',
      display_name: 'Synthetic Unknown 2.0',
      language: '中文',
      preview: {
        purpose: 'official-voice-preview',
        state: 'unverified',
        primary_url: null,
        candidates: [],
        checked_at: '2026-10-03T00:00:00.000Z',
        evidence_ref: null,
      },
    })
    const snapshot = writeVoiceSnapshot('committed-unknown-snapshot.json', voices)
    const result = runRefresh([
      '--voices-only',
      `--base=${baseDir}`,
      `--out=${unknownOut}`,
      `--voice-snapshot=${snapshot}`,
    ])
    assert.notEqual(result.status, 0, 'an unregistered voice_type must not mint a catalog row')
    assert.match(result.stderr, /synthetic_unregistered_fixture_voice/)
    assert.match(result.stderr, /not.*baseline|unknown|unregistered/i)
    assert.equal(existsSync(unknownOut), false)
  })
})

describe('cloud catalog builder · snapshot input is validated, never guessed (#3058)', () => {
  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuilder(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  it('refuses a voices-only refresh without an explicit --voice-snapshot', () => {
    const result = runBuilder(['--voices-only', `--base=${outDir}`, `--out=${join(workDir, 'refreshed-nosnap')}`])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /voice-snapshot/i)
  })

  it('refuses a voices-only refresh over a snapshot that is not schema_version 1', () => {
    const bad = join(workDir, 'bad-snapshot.json')
    writeFileSync(bad, `${JSON.stringify({ schema_version: 2, voices: [] })}\n`)
    const result = runBuilder([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${join(workDir, 'refreshed-bad')}`,
      `--voice-snapshot=${bad}`,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /voice.?snapshot|schema/i)
  })

  it('refuses a voices-only refresh over a snapshot whose verified row lacks an https primary', () => {
    const bad = join(workDir, 'bad-snapshot-2.json')
    writeFileSync(bad, `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: 'x',
      preview_fingerprint: 'y',
      voices: [{
        voice_type: 'saturn_bad',
        name: 'Bad',
        preview: {
          purpose: 'official-voice-preview',
          state: 'verified-file',
          primary_url: 'not-a-url',
          candidates: [],
          checked_at: null,
          evidence_ref: null,
        },
      }],
    })}\n`)
    const result = runBuilder([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${join(workDir, 'refreshed-bad2')}`,
      `--voice-snapshot=${bad}`,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /primary_url|https/i)
    assert.equal(existsSync(join(workDir, 'refreshed-bad2')), false, 'a refused snapshot must not produce an out dir')
  })

  /**
   * One negative snapshot: the fixture shape with every baseline voice kept
   * (so the failure can only come from the mutated field), `mutate` applied
   * to the first voice's preview block. Returns the written file path.
   * @param {string} name @param {(preview: any) => void} mutate @returns {string}
   */
  function badSnapshot(name, mutate) {
    const voices = VOICE_SNAPSHOT.voices.map((voice, position) => {
      const preview = { ...voice.preview, candidates: [...(voice.preview?.candidates ?? [])] }
      if (position === 0) mutate(preview)
      return { ...voice, preview }
    })
    const path = join(workDir, name)
    writeFileSync(path, `${JSON.stringify({ ...VOICE_SNAPSHOT, voices })}\n`)
    return path
  }

  it('refuses a snapshot whose verified primary_url is not a string on the registered official CDN', () => {
    const badUrls = [
      'https://cdn.test/voices/linxiao.mp3', // arbitrary HTTPS host is not the official CDN
      'http://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/x.mp3',
      `${OFFICIAL_CDN}/a.mp3?token=leak`,
      `${OFFICIAL_CDN}/a.mp3#frag`,
      `${OFFICIAL_CDN}/subdir/../../outside.mp3`,
      `${OFFICIAL_CDN}/safe%2F..%2Fescape.mp3`, // encoded separator hides traversal from a decoder-downstream CDN
      `${OFFICIAL_CDN}/a%5Cb.mp3`,
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/outside.mp3', // registered origin, wrong base path
      'https://user:pass@lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/a.mp3',
      OFFICIAL_CDN, // the bare base path itself is not a file
    ]
    for (const [index, url] of badUrls.entries()) {
      const result = runBuilder([
        '--voices-only',
        `--base=${outDir}`,
        `--out=${join(workDir, 'refreshed-url')}`,
        `--voice-snapshot=${badSnapshot(`bad-snapshot-url-${index}.json`, (preview) => {
          preview.primary_url = url
        })}`,
      ])
      assert.notEqual(result.status, 0, `primary_url ${url} must be rejected`)
      assert.match(result.stderr, /official CDN|primary_url/i)
      assert.equal(existsSync(join(workDir, 'refreshed-url')), false, 'a refused snapshot must not produce an out dir')
    }
    // Non-string primary_url values are rejected, not coerced or dropped.
    for (const [index, primary] of [42, true, {}, []].entries()) {
      const result = runBuilder([
        '--voices-only',
        `--base=${outDir}`,
        `--out=${join(workDir, 'refreshed-pt')}`,
        `--voice-snapshot=${badSnapshot(`bad-snapshot-pt-${index}.json`, (preview) => {
          preview.primary_url = primary
        })}`,
      ])
      assert.notEqual(result.status, 0, `primary_url ${JSON.stringify(primary)} must be rejected`)
      assert.match(result.stderr, /primary_url/i)
    }
    // An unverified row must not ship a primary at all — a link is never guessed.
    const result = runBuilder([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${join(workDir, 'refreshed-unv')}`,
      `--voice-snapshot=${badSnapshot('bad-snapshot-unv.json', (preview) => {
        preview.state = 'unverified'
        preview.primary_url = `${OFFICIAL_CDN}/linxiao.mp3`
      })}`,
    ])
    assert.notEqual(result.status, 0, 'unverified primary_url must be rejected')
    assert.match(result.stderr, /unverified.*primary_url|primary_url.*unverified/i)
  })

  it('refuses non-string or non-official candidate URLs instead of silently dropping them', () => {
    for (const [index, candidates] of [
      'https://cdn.test/voices/x.mp3', // not an array
      [42],
      [null],
      [`${OFFICIAL_CDN}/x.mp3`, 'https://cdn.test/sneak.mp3'],
      [`${OFFICIAL_CDN}/x.mp3`, `${OFFICIAL_CDN}/safe%2F..%2Fescape.mp3`], // decoded .. still escapes the base key
      [`${OFFICIAL_CDN}/x.mp3`, 'ftp://lf3-static.bytednsdoc.com/x.mp3'],
    ].entries()) {
      const result = runBuilder([
        '--voices-only',
        `--base=${outDir}`,
        `--out=${join(workDir, 'refreshed-cand')}`,
        `--voice-snapshot=${badSnapshot(`bad-snapshot-cand-${index}.json`, (preview) => {
          preview.candidates = candidates
        })}`,
      ])
      assert.notEqual(result.status, 0, `candidates ${JSON.stringify(candidates)} must be rejected`)
      assert.match(result.stderr, /candidate|official CDN/i)
    }
    // candidates is required — an absent fallback list is not the same as [].
    const result = runBuilder([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${join(workDir, 'refreshed-nocand')}`,
      `--voice-snapshot=${badSnapshot('bad-snapshot-nocand.json', (preview) => {
        delete preview.candidates
      })}`,
    ])
    assert.notEqual(result.status, 0, 'a missing candidates array must be rejected')
    assert.match(result.stderr, /candidate/i)
  })

  it('refuses a snapshot whose voice rows or preview block are malformed', () => {
    const malformedRows = [
      [{ voice_type: '', name: 'NoType', preview: { purpose: 'official-voice-preview', state: 'unverified', primary_url: null, candidates: [] } }],
      [null],
      ['just-a-string'],
      [{ voice_type: 'saturn_zh_female_linxiao_tob', name: '林潇', preview: 'official-voice-preview' }],
    ]
    for (const [index, rows] of malformedRows.entries()) {
      const bad = join(workDir, `bad-snapshot-row-${index}.json`)
      // Keep every baseline voice present so the row-shape error is what fails.
      writeFileSync(bad, `${JSON.stringify({ ...VOICE_SNAPSHOT, voices: [...VOICE_SNAPSHOT.voices.slice(1), ...rows] })}\n`)
      const result = runBuilder([
        '--voices-only',
        `--base=${outDir}`,
        `--out=${join(workDir, 'refreshed-row')}`,
        `--voice-snapshot=${bad}`,
      ])
      assert.notEqual(result.status, 0, `rows ${JSON.stringify(rows)} must be rejected`)
      assert.match(result.stderr, /voice snapshot voices\[|voice_type|preview block|must be an object/i)
    }
    const badPreviews = [
      { purpose: 'wrong-purpose', state: 'verified-file', primary_url: `${OFFICIAL_CDN}/x.mp3`, candidates: [] },
      { purpose: 'official-voice-preview', state: 'maybe-verified', primary_url: `${OFFICIAL_CDN}/x.mp3`, candidates: [] },
    ]
    for (const [index, preview] of badPreviews.entries()) {
      const result = runBuilder([
        '--voices-only',
        `--base=${outDir}`,
        `--out=${join(workDir, 'refreshed-prev')}`,
        `--voice-snapshot=${badSnapshot(`bad-snapshot-prev-${index}.json`, (p) => {
          Object.keys(p).forEach((key) => delete p[key])
          Object.assign(p, preview)
        })}`,
      ])
      assert.notEqual(result.status, 0, `preview ${JSON.stringify(preview)} must be rejected`)
      assert.match(result.stderr, /purpose|state/i)
    }
  })
})

describe('cloud catalog builder · voices-only refuses overlapping base/out before any write (#3058 OCR #2)', () => {
  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuilder(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  /** Copy of the fixture catalog at `name`, returns its path. */
  function baseCopy(name) {
    const dir = join(workDir, name)
    cpSync(outDir, dir, { recursive: true })
    return dir
  }

  /** Byte-equal check of two `{ rel: bytes }` maps. */
  function assertSameFiles(before, after) {
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort())
    for (const [rel, bytes] of before) {
      assert.ok(after.get(rel).equals(bytes), `${rel} must stay byte-identical`)
    }
  }

  it('refuses when the base catalog sits inside --out — the pre-copy wipe would delete the source', () => {
    const container = join(workDir, 'e1-ancestor')
    const baseDir = join(container, 'catalog')
    cpSync(outDir, baseDir, { recursive: true })
    const before = filesAt(container)

    const result = runBuilder([
      '--voices-only',
      `--base=${baseDir}`,
      `--out=${container}`,
      `--voice-snapshot=${snapshotFile}`,
    ])
    assert.notEqual(result.status, 0, 'base inside out must be refused')
    assert.match(result.stderr, /inside|overlap|ancestor|descendant/i)
    assertSameFiles(before, filesAt(container))
  })

  it('refuses when --out sits inside the base catalog — the output would land inside the source', () => {
    const baseDir = baseCopy('e1-descendant')
    const nested = join(baseDir, 'nested-out')
    const before = filesAt(baseDir)

    const result = runBuilder([
      '--voices-only',
      `--base=${baseDir}`,
      `--out=${nested}`,
      `--voice-snapshot=${snapshotFile}`,
    ])
    assert.notEqual(result.status, 0, 'out inside base must be refused')
    assert.match(result.stderr, /inside|overlap|ancestor|descendant/i)
    assertSameFiles(before, filesAt(baseDir))
  })

  it('supports the in-place refresh when --base and --out resolve to the same directory through a symlink alias', () => {
    const baseDir = baseCopy('e1-aliased')
    const alias = join(workDir, 'e1-alias')
    symlinkSync(baseDir, alias, 'dir')
    const before = filesAt(baseDir)

    const result = runBuilder([
      '--voices-only',
      `--base=${alias}`,
      `--out=${baseDir}`,
      `--voice-snapshot=${snapshotFile}`,
      '--generated-at=2026-10-03T01:00:00.000Z',
    ])
    assert.equal(result.status, 0, 'an alias of the same directory is the in-place refresh, not an overlap')
    // The refresh landed on the real catalog: generatedAt moved, nothing lost.
    const refreshed = filesAt(baseDir)
    assert.deepEqual([...refreshed.keys()].sort(), [...before.keys()].sort())
    assert.equal(readJsonAt(baseDir, 'manifest.json').generatedAt, '2026-10-03T01:00:00.000Z')
  })
})

describe('cloud catalog builder · a full build keeps the voice snapshot it consumed (#3058 OCR #5)', () => {
  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuild(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  const assetsRootOf = () => join(workDir, 'assets')
  const E2_SNAPSHOT_BODY = `${JSON.stringify({
    schema_version: 1,
    catalog_fingerprint: 'e2-catalog-fp',
    preview_fingerprint: 'e2-preview-fp',
    voices: VOICE_SNAPSHOT.voices,
  })}\n`

  it('preserves a snapshot inside --out byte-for-byte across two consecutive builds', () => {
    const out = join(workDir, 'e2-out')
    const snapshot = join(out, 'voice-preview-snapshot.json')
    mkdirSync(out, { recursive: true })
    writeFileSync(snapshot, E2_SNAPSHOT_BODY)

    const args = [
      `--assets-root=${assetsRootOf()}`,
      `--out=${out}`,
      '--generated-at=2026-10-03T02:00:00.000Z',
      `--voice-snapshot=${snapshot}`,
    ]
    const first = runBuild(args)
    assert.equal(first.status, 0, `first build must succeed: ${first.stderr}`)
    assert.ok(readFileSync(snapshot).equals(Buffer.from(E2_SNAPSHOT_BODY)),
      'the consumed snapshot must be rewritten byte-identical after the output wipe')

    const second = runBuild(args)
    assert.equal(second.status, 0, `the repeat build must find its snapshot again: ${second.stderr}`)
    assert.ok(readFileSync(snapshot).equals(Buffer.from(E2_SNAPSHOT_BODY)),
      'the snapshot must still be byte-identical after the second build')
    assert.equal(readJsonAt(out, 'manifest.json').voice_preview_fingerprint, 'e2-preview-fp')
  })

  it('restores an explicit snapshot nested deeper inside --out at its own relative position', () => {
    const out = join(workDir, 'e2-nested-out')
    const snapshot = join(out, 'nested', 'snap.json')
    mkdirSync(join(out, 'nested'), { recursive: true })
    writeFileSync(snapshot, E2_SNAPSHOT_BODY)

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${out}`,
      `--voice-snapshot=${snapshot}`,
    ])
    assert.equal(result.status, 0, `build must succeed: ${result.stderr}`)
    assert.ok(readFileSync(snapshot).equals(Buffer.from(E2_SNAPSHOT_BODY)),
      'an input nested under --out must be restored at its own relative path, not lost')
  })

  it('writes an external snapshot into --out under the default filename', () => {
    const out = join(workDir, 'e2-external-out')
    const snapshot = join(workDir, 'e2-external-snapshot.json')
    writeFileSync(snapshot, E2_SNAPSHOT_BODY)
    // Seed the out dir's voice lineage — a first-generation build's own
    // baseline — so the completeness gate has something to verify against.
    writeFile(join(out, 'voice-preview-snapshot.json'), E2_SNAPSHOT_BODY)

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${out}`,
      `--voice-snapshot=${snapshot}`,
    ])
    assert.equal(result.status, 0, `build must succeed: ${result.stderr}`)
    const written = join(out, 'voice-preview-snapshot.json')
    assert.ok(readFileSync(written).equals(Buffer.from(E2_SNAPSHOT_BODY)),
      'the consumed snapshot must be emitted at the chosen default filename so the next build can read it')
    // The external input itself is untouched.
    assert.ok(readFileSync(snapshot).equals(Buffer.from(E2_SNAPSHOT_BODY)))
  })

  it('refuses a missing or unqualified snapshot without wiping an existing output', () => {
    const out = join(workDir, 'e2-preserved-out')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'sentinel.txt'), 'keep-me')

    const missing = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${out}`,
      `--voice-snapshot=${join(workDir, 'e2-absent-snapshot.json')}`,
    ])
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /voice snapshot not found/i)
    assert.equal(readFileSync(join(out, 'sentinel.txt'), 'utf8'), 'keep-me')
    assert.equal(existsSync(join(out, 'manifest.json')), false)

    const bad = join(workDir, 'e2-bad-snapshot.json')
    writeFileSync(bad, `${JSON.stringify({ schema_version: 2, voices: [] })}\n`)
    const refused = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${out}`,
      `--voice-snapshot=${bad}`,
    ])
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /schema_version/i)
    assert.equal(readFileSync(join(out, 'sentinel.txt'), 'utf8'), 'keep-me')
  })
})

describe('omnimux hub package · the tarball ships a runnable voice-preview exporter (#3058, BE-Q9-01)', () => {
  const hubRoot = join(repoRoot, 'plugins', 'omnimux')
  const EXPORTER_REL = 'scripts/export-voice-previews.mjs'

  /**
   * `npm pack --ignore-scripts` the hub into `dir` and return the tarball path.
   * Scripts are skipped on purpose: the check is which files ship, not whether
   * `prepare` can rebuild the client bundle.
   * @param {string} dir @returns {string}
   */
  function packHub(dir) {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', `--pack-destination=${dir}`], {
      cwd: hubRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    assert.equal(result.status, 0, `npm pack must succeed: ${result.stderr}`)
    const [packed] = JSON.parse(result.stdout)
    return join(dir, packed.filename)
  }

  /** Untar a package tarball into `dir` and return the extracted package root. */
  function unpackHub(tarball, dir) {
    mkdirSync(dir, { recursive: true })
    execFileSync('tar', ['-xzf', tarball, '-C', dir])
    const pkgDir = join(dir, 'package')
    assert.ok(existsSync(join(pkgDir, 'package.json')), 'the tarball must unpack to package/')
    return pkgDir
  }

  /**
   * Write a real Node module-resolution boundary for the unpacked package and
   * return the child-process overrides that engage it. The boundary is the
   * official ESM loader `resolve` hook: after Node resolves a specifier, the
   * hook re-checks the resulting file URL and throws when it lands outside
   * `PACK_RESOLUTION_ROOT`. No module is faked or substituted — a bare
   * specifier either resolves to a file genuinely inside the package or the
   * run fails.
   *
   * This is the sandbox the bare-tarball assumption actually needs. Node
   * walks node_modules upward from the importing file, so when TMPDIR (and
   * with it the unpacked package) sits inside the task tree — e.g. a QA probe
   * that points TMPDIR at its own run dir under the worktree — a bare run
   * silently picks up the checkout's real `yaml` from an ancestor directory
   * and exits 0 without any package dependency installed (QA-R2-PACK-01).
   * Isolation has to be enforced at module resolution, not assumed from the
   * directory the sandbox happens to live in.
   * @param {string} pkgDir package root that file resolutions must stay inside
   * @returns {{args: string[], env: Record<string, string>}}
   */
  function packageResolutionBoundary(pkgDir) {
    const guardPath = join(workDir, 'pack-resolution-boundary.mjs')
    writeFileSync(guardPath, [
      `import { fileURLToPath } from 'node:url'`,
      `export async function resolve(specifier, context, next) {`,
      `  const resolved = await next(specifier, context)`,
      `  if (resolved.url.startsWith('file:')) {`,
      `    const path = fileURLToPath(resolved.url)`,
      `    if (!path.startsWith(process.env.PACK_RESOLUTION_ROOT + '/'))`,
      `      throw new Error('PACK_RESOLUTION_OUTSIDE_PACKAGE ' + specifier + ' -> ' + path)`,
      `  }`,
      `  return resolved`,
      `}`,
      ``,
    ].join('\n'))
    return {
      args: ['--experimental-loader', guardPath],
      env: { PACK_RESOLUTION_ROOT: realpathSync(pkgDir), NODE_PATH: '' },
    }
  }

  it('the packed file list ships the exporter, the registry and the preview mapping', () => {
    const packDir = join(workDir, 'hub-pack')
    mkdirSync(packDir, { recursive: true })
    const tarball = packHub(packDir)
    const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n')
    for (const rel of [
      `package/${EXPORTER_REL}`,
      'package/src/catalog/voices/volcengine-voice-index.json',
      'package/src/catalog/voices/official-preview-mapping.json',
      'package/src/catalog/voices/preview.js',
      'package/scripts/build-client.mjs',
    ]) {
      assert.ok(listing.includes(rel), `hub tarball must ship ${rel}`)
    }
    // The exporter is a package seam, not a repo path: no test asserts against
    // the sibling checkout beyond this packed listing.
  })

  it('the packed exporter runs from any cwd and emits the same snapshot as the repo copy', () => {
    const packDir = join(workDir, 'hub-pack')
    const tarball = packHub(packDir)
    const pkgDir = unpackHub(tarball, join(packDir, 'unpacked'))

    // tmpdir() is a symlink (/var → /private/var); the exporter's main guard
    // compares argv[1] to the realpath'd import.meta.url, so invoke the real
    // path — the same thing a consumer's `npx`/PATH resolution produces.
    const packedExporter = realpathSync(join(pkgDir, EXPORTER_REL))
    const packedBytes = readFileSync(packedExporter)
    assert.ok(packedBytes.equals(readFileSync(join(hubRoot, EXPORTER_REL))),
      'the packed exporter must be byte-identical to the repo script')

    // Run the packed script itself — path inside the tarball, cwd deliberately
    // unrelated. Bare `yaml` resolves from the package's own node_modules only:
    // first prove the closure genuinely fails without it (a bare tarball is not
    // self-contained, dependencies are installed by the consumer), then mount
    // the already-installed package at the standard resolution slot — never a
    // repo sibling read. The proof only holds when ancestor node_modules
    // cannot leak in, so both package runs go through a resolution boundary
    // that refuses every file URL outside the unpacked package — the same
    // guard the QA probe established, owned by this test's sandbox instead of
    // borrowed from a report directory.
    const elsewhere = join(workDir, 'hub-pack-cwd')
    mkdirSync(elsewhere, { recursive: true })
    const boundary = packageResolutionBoundary(pkgDir)
    const spawnEnv = { ...process.env, ...boundary.env }
    const bare = spawnSync(process.execPath, [...boundary.args, packedExporter], {
      cwd: elsewhere,
      env: spawnEnv,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(bare.error, undefined)
    assert.equal(bare.status, 1)
    assert.match(bare.stderr, /PACK_RESOLUTION_OUTSIDE_PACKAGE.*yaml|Cannot find package 'yaml'/)

    const manifest = readJsonAt(pkgDir, 'package.json')
    assert.match(manifest.dependencies.yaml, /^\^2/, 'yaml must be a declared runtime dependency')
    const resolvedYaml = dirname(createRequire(join(hubRoot, 'package.json')).resolve('yaml/package.json'))
    const yamlManifest = readJsonAt(resolvedYaml, 'package.json')
    assert.equal(yamlManifest.name, 'yaml')
    assert.match(yamlManifest.version, /^2\./, 'the mounted yaml must satisfy the declared ^2 range')
    const yamlSlot = join(pkgDir, 'node_modules', 'yaml')
    cpSync(resolvedYaml, yamlSlot, { recursive: true, verbatimSymlinks: false })

    const run = spawnSync(process.execPath, [...boundary.args, packedExporter], {
      cwd: elsewhere,
      env: spawnEnv,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(run.error, undefined)
    assert.equal(run.status, 0, `packed exporter must run with its declared deps: ${run.stderr}`)

    const repoRun = spawnSync(process.execPath, [join(hubRoot, EXPORTER_REL)], {
      cwd: elsewhere,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(repoRun.error, undefined)
    assert.equal(repoRun.status, 0, `repo exporter must run: ${repoRun.stderr}`)
    assert.equal(run.stdout, repoRun.stdout, 'packed and repo snapshots must be byte-identical')

    const snapshot = JSON.parse(run.stdout)
    assert.equal(snapshot.schema_version, 1)
    assert.equal(snapshot.purpose, 'official-voice-preview')
    assert.equal(snapshot.voices.length, 509)
    assert.match(snapshot.catalog_fingerprint, /^[0-9a-f]{16}$/)
    assert.match(snapshot.preview_fingerprint, /^[0-9a-f]{64}$/)

    // `--check` against the snapshot the catalog ships must verify byte-equal,
    // still under the same package resolution boundary.
    const packedCheck = spawnSync(process.execPath, [
      ...boundary.args, packedExporter, '--check', join(pluginRoot, 'cloud-catalog', 'voice-preview-snapshot.json'),
    ], { cwd: elsewhere, env: spawnEnv, encoding: 'utf8' })
    assert.equal(packedCheck.status, 0, `packed exporter --check must verify the shipped snapshot: ${packedCheck.stderr}`)
  })
})

describe('cloud catalog builder · a full build verifies snapshot completeness before any wipe (#3058 last OCR)', () => {
  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuild(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  const assetsRootOf = () => join(workDir, 'assets')

  /** Copy the fixture catalog (with its voice lineage) into `name`. */
  function catalogCopy(name) {
    const dir = join(workDir, name)
    cpSync(outDir, dir, { recursive: true })
    return dir
  }

  /** A schema-1 snapshot over `voices`, written to `name`. */
  function buildSnapshot(name, voices) {
    const path = join(workDir, name)
    writeFileSync(path, `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: 'last-fix-fp',
      preview_fingerprint: 'last-fix-preview-fp',
      voices,
    })}\n`)
    return path
  }

  it('refuses an empty voice snapshot before it can wipe an existing catalog', () => {
    const base = catalogCopy('lastfix-empty-base')
    const manifestBytes = readFileSync(join(base, 'manifest.json'))
    const empty = buildSnapshot('lastfix-empty-snapshot.json', [])

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${base}`,
      `--voice-snapshot=${empty}`,
    ])
    assert.notEqual(result.status, 0, 'an empty snapshot must not shrink the catalog to zero voices')
    assert.match(result.stderr, /missing \d+ baseline voice|baseline.*missing/i)
    // The refusal lands before any rm/write: the old catalog survives whole.
    assert.equal(readJsonAt(base, 'manifest.json').voice_preview_fingerprint, 'fixture-preview-fp')
    assert.ok(readFileSync(join(base, 'manifest.json')).equals(manifestBytes),
      'the existing output must stay byte-identical when the build is refused')
    assert.equal(readJsonAt(base, 'index.json').filter((row) => row.meta?.voice_type).length,
      VOICE_SNAPSHOT.voices.length)
  })

  it('refuses a schema-valid snapshot that dropped one baseline voice', () => {
    const base = catalogCopy('lastfix-partial-base')
    const partial = buildSnapshot('lastfix-partial-snapshot.json', [VOICE_SNAPSHOT.voices[0]])

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${base}`,
      `--voice-snapshot=${partial}`,
    ])
    assert.notEqual(result.status, 0, 'one dropped baseline voice must be refused, not silently delisted')
    assert.match(result.stderr, /missing 1 baseline voice/)
    assert.match(result.stderr, /saturn_zh_male_yangguang_tob/,
      'the error must name which baseline voice the snapshot lost')
    assert.equal(readJsonAt(base, 'manifest.json').voice_preview_fingerprint, 'fixture-preview-fp')
  })

  it('refuses a fresh out dir that has no verifiable voice lineage', () => {
    const fresh = join(workDir, 'lastfix-fresh-out')
    const snapshot = buildSnapshot('lastfix-fresh-snapshot.json', VOICE_SNAPSHOT.voices)

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${fresh}`,
      `--voice-snapshot=${snapshot}`,
    ])
    assert.notEqual(result.status, 0, 'a first build with nothing to verify against must fail closed')
    assert.match(result.stderr, /no verifiable|baseline is empty|cannot be verified|unverifiable/i)
    assert.equal(existsSync(fresh), false, 'a refused build must not create the out dir')
  })

  it('accepts a superset snapshot — a new voice_type is a legal addition, not an error', () => {
    const base = catalogCopy('lastfix-grown-base')
    const totalBefore = readJsonAt(base, 'manifest.json').totalAssets
    const grown = buildSnapshot('lastfix-grown-snapshot.json', [
      ...VOICE_SNAPSHOT.voices,
      {
        voice_type: 'saturn_new_growth_voice',
        name: '新音色',
        language: '中文',
        category: '通用场景',
        section: '音色列表',
        resource_id: 'seed-tts-2.0',
        preview: {
          purpose: 'official-voice-preview',
          state: 'unverified',
          primary_url: null,
          candidates: [],
          checked_at: '2026-10-03T00:00:00.000Z',
          evidence_ref: null,
        },
      },
    ])

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${base}`,
      `--voice-snapshot=${grown}`,
      '--generated-at=2026-10-03T03:00:00.000Z',
    ])
    assert.equal(result.status, 0, `a superset snapshot is a legal registry addition: ${result.stderr}`)
    const nextManifest = readJsonAt(base, 'manifest.json')
    assert.equal(nextManifest.totalAssets, totalBefore + 1)
    const nextIndex = readJsonAt(base, 'index.json')
    const added = nextIndex.find((row) => row.meta?.voice_type === 'saturn_new_growth_voice')
    assert.ok(added, 'the new voice_type must land in the rebuilt catalog')
    assert.equal(nextIndex.filter((row) => row.meta?.voice_type).length,
      VOICE_SNAPSHOT.voices.length + 1)
  })

  it('refuses a schema-valid truncated snapshot nested inside --out — page shards, not the input, are the baseline', () => {
    // #3058 OCR 2026-10-04 medium: a legacy catalog's index carries no voice
    // meta at all, so before the fix the only voice lineage this run could see
    // was the input itself — a shrunk snapshot placed under --out certified
    // itself complete, wiped the richer catalog and republished 124 voices.
    // The baseline must come from the page rows already on disk.
    const base = join(workDir, 'lastfix-legacy-out')
    extractBaselineCatalog(base)
    const before = filesAt(base)

    // Premise: this is the old catalog — index rows carry no meta.voice_type
    // and no shipped snapshot exists, yet all/audio/voiceover page rows hold
    // the full 509 voice identities.
    assert.equal(indexAt(base).size, 6388)
    for (const row of indexAt(base).values()) {
      assert.equal(row.meta?.voice_type, undefined, `legacy index row ${row.id} must carry no voice meta`)
    }
    assert.equal(existsSync(join(base, 'voice-preview-snapshot.json')), false)
    const baselineVoices = baseVoicesAt(base)
    assert.equal(baselineVoices.size, 509, 'the legacy page shards must still hold the 509 voice identities')

    // A schema-valid shrunk snapshot, consumed from a file nested inside --out:
    // the exact path the review named.
    const shrunk = join(base, 'voice-preview-snapshot.json')
    writeFileSync(shrunk, `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: 'shrunk-cat-fp',
      preview_fingerprint: 'shrunk-preview-fp',
      voices: snapshotVoicesFor([...baselineVoices.values()].slice(0, 124)),
    })}\n`)

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${base}`,
      `--voice-snapshot=${shrunk}`,
    ])
    assert.notEqual(result.status, 0, 'a truncated input inside --out must not certify itself complete')
    assert.match(result.stderr, /missing 385 baseline voice/,
      'the refusal must count the voices the page shards registered')
    // Fail-closed before any rm/write: every byte of the old catalog survives,
    // including the shrunk snapshot file itself at its nested path.
    const after = filesAt(base)
    assert.deepEqual([...after.keys()].sort(), [...before.keys(), 'voice-preview-snapshot.json'].sort())
    for (const [rel, bytes] of before) {
      assert.ok(after.get(rel).equals(bytes), `${rel} must stay byte-identical when the build is refused`)
    }
  })

  it('builds over a seed-only out dir — a shipped snapshot alone is legitimate first-generation lineage', () => {
    // The new shard lineage must not weaken the already-correct contract: an
    // out dir whose only voice evidence is the packaged snapshot (the seed a
    // first-generation build plants) still builds, and the consumed file is
    // rewritten back at its own path rather than deleted (#3058 OCR #5).
    const base = catalogCopy('lastfix-seedonly-base')
    rmSync(join(base, 'index.json'))
    rmSync(join(base, 'all'), { recursive: true, force: true })
    rmSync(join(base, 'audio'), { recursive: true, force: true })
    const snapshotPath = join(base, 'voice-preview-snapshot.json')
    const seedBytes = readFileSync(snapshotPath)
    assert.equal(existsSync(join(base, 'index.json')), false, 'the seed-only premise must drop every shard/index lineage')

    const result = runBuild([
      `--assets-root=${assetsRootOf()}`,
      `--out=${base}`,
      `--voice-snapshot=${snapshotPath}`,
      '--generated-at=2026-10-04T00:00:00.000Z',
    ])
    assert.equal(result.status, 0, `a seed-only lineage is the supported first-generation update: ${result.stderr}`)
    // Updated correctly — not wiped weakly: the consumed snapshot is restored
    // byte-identical and the fresh manifest/index carry the seed's lineage.
    assert.ok(readFileSync(snapshotPath).equals(seedBytes),
      'the consumed snapshot must be rewritten byte-identical after the rebuild')
    const nextManifest = readJsonAt(base, 'manifest.json')
    assert.equal(nextManifest.voice_preview_fingerprint, 'fixture-preview-fp')
    const nextIndex = indexAt(base)
    assert.equal(nextIndex.size, readJsonAt(outDir, 'index.json').length,
      'the rebuild must republish the same row count as the fixture catalog')
    for (const voice of VOICE_SNAPSHOT.voices) {
      assert.ok([...nextIndex.values()].some((row) => row.meta?.voice_type === voice.voice_type),
        `the fresh index must carry the seed snapshot voice ${voice.voice_type}`)
    }
  })
})

describe('cloud catalog builder · a symlinked external snapshot restores at its canonical path (#3058 last OCR)', () => {
  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuild(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  it('keeps an external symlink input readable across two builds of the same command', () => {
    const out = join(workDir, 'link-out')
    const target = join(out, 'nested', 'snap.json')
    mkdirSync(join(out, 'nested'), { recursive: true })
    const body = `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: 'link-fp',
      preview_fingerprint: 'link-preview-fp',
      voices: VOICE_SNAPSHOT.voices,
    })}\n`
    writeFileSync(target, body)
    // The consumed path is a symlink outside --out whose target lives inside
    // it: the build reads it before the wipe, so its canonical position and
    // bytes must both be captured beforehand — after the wipe the link dangles
    // and canonicalPath can no longer see nested/snap.json.
    const link = join(workDir, 'link-input.json')
    symlinkSync(target, link)

    const args = [
      `--assets-root=${join(workDir, 'assets')}`,
      `--out=${out}`,
      `--voice-snapshot=${link}`,
      '--generated-at=2026-10-03T04:00:00.000Z',
    ]
    const first = runBuild(args)
    assert.equal(first.status, 0, `first build must succeed: ${first.stderr}`)
    assert.ok(readFileSync(target).equals(Buffer.from(body)),
      'the symlinked input must be restored at nested/snap.json, not the default filename')
    assert.ok(readFileSync(link).equals(Buffer.from(body)),
      'the external symlink must still resolve and read')

    const second = runBuild(args)
    assert.equal(second.status, 0, `the identical second build must succeed: ${second.stderr}`)
    assert.ok(readFileSync(target).equals(Buffer.from(body)),
      'nested/snap.json must still be byte-identical after the repeat build')
    assert.ok(readFileSync(link).equals(Buffer.from(body)),
      'the symlink input must remain readable for further builds')
    assert.equal(readJsonAt(out, 'manifest.json').voice_preview_fingerprint, 'link-preview-fp')
  })
})

describe('cloud catalog builder · snapshot restore collisions fail closed before any wipe (#3058 final OCR)', () => {
  /** Byte-equal check of two `{ rel: bytes }` maps. */
  function assertSameFiles(before, after, note) {
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), note)
    for (const [rel, bytes] of before) {
      assert.ok(after.get(rel).equals(bytes), `${rel} must stay byte-identical`)
    }
  }

  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runBuild(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  const assetsRoot = () => join(workDir, 'assets')
  const SEED_BODY = `${JSON.stringify({
    schema_version: 1,
    catalog_fingerprint: 'seed-fp',
    preview_fingerprint: 'seed-preview-fp',
    voices: VOICE_SNAPSHOT.voices,
  })}\n`

  /** Seed an out dir whose lineage the completeness gate can verify against. */
  function seededOut(name) {
    const out = join(workDir, name)
    writeFile(join(out, 'voice-preview-snapshot.json'), SEED_BODY)
    return out
  }

  for (const [name, rel] of [
    ['manifest', 'manifest.json'],
    ['index', 'index.json'],
    ['all-page', 'all/page-0001.json'],
    ['audio-page', 'audio/voiceover/page-0001.json'],
    ['under-page', 'all/page-0001.json/snap.json'],
  ]) {
    it(`refuses a consumed snapshot whose restore path collides with generated output (${rel})`, () => {
      const out = seededOut(`conflict-${name}-out`)
      const input = join(out, rel)
      writeFile(input, SEED_BODY)
      const before = filesAt(out)

      const result = runBuild([
        `--assets-root=${assetsRoot()}`,
        `--out=${out}`,
        `--voice-snapshot=${input}`,
      ])
      assert.notEqual(result.status, 0, `restore into ${rel} must be refused`)
      assert.match(result.stderr, /snapshot-input-conflict/i)
      assertSameFiles(before, filesAt(out), 'the refused build must leave the original out dir untouched')
    })
  }

  // #3058 final OCR medium: the build also mkdirs every generated scope
  // directory (and each of its ancestors) before writing shards, so a
  // snapshot FILE parked exactly at a scope path passes the page-file regex
  // yet still collides — the mkdir fails or the restore EISDIRs once the
  // scope dir exists. Every scope and every ancestor of one is a reserved
  // path and the refusal must land before any rm/write.
  for (const [name, rel] of [
    ['all-scope', 'all'],
    ['audio-scope', 'audio'],
    ['nested-scope', 'audio/voiceover'],
  ]) {
    it(`refuses a consumed snapshot file occupying a generated scope directory (${rel})`, () => {
      const out = seededOut(`scope-conflict-${name}-out`)
      const input = join(out, rel)
      writeFile(input, SEED_BODY)
      const before = filesAt(out)

      const result = runBuild([
        `--assets-root=${assetsRoot()}`,
        `--out=${out}`,
        `--voice-snapshot=${input}`,
      ])
      assert.notEqual(result.status, 0, `a snapshot file at the generated ${rel}/ directory must be refused`)
      assert.match(result.stderr, /snapshot-input-conflict/i)
      assertSameFiles(before, filesAt(out), 'the refused build must leave the original out dir untouched')
    })
  }

  it('still restores a snapshot nested inside a generated scope directory byte-for-byte', () => {
    const out = seededOut('scope-nested-ok-out')
    const input = join(out, 'audio', 'voiceover', 'snap.json')
    writeFile(input, SEED_BODY)

    const args = [
      `--assets-root=${assetsRoot()}`,
      `--out=${out}`,
      `--voice-snapshot=${input}`,
    ]
    const first = runBuild(args)
    assert.equal(first.status, 0, `a snapshot inside a scope dir is a legal nested input: ${first.stderr}`)
    assert.ok(readFileSync(input).equals(Buffer.from(SEED_BODY)),
      'the nested snapshot must be restored byte-identical after the rebuild')
    const second = runBuild(args)
    assert.equal(second.status, 0, `the repeat build must find its snapshot again: ${second.stderr}`)
  })

  it('refuses an input symlink inside --out whose alias the wipe deletes, keeping the source bytes', () => {
    const out = seededOut('inner-link-out')
    const target = join(out, 'nested', 'snap.json')
    writeFile(target, SEED_BODY)
    const link = join(out, 'input.json')
    symlinkSync(target, link)
    const before = filesAt(out)

    const result = runBuild([
      `--assets-root=${assetsRoot()}`,
      `--out=${out}`,
      `--voice-snapshot=${link}`,
    ])
    assert.notEqual(result.status, 0, 'an alias the wipe deletes must be refused, not silently dropped')
    assert.match(result.stderr, /not-supported/i)
    assertSameFiles(before, filesAt(out), 'the refused build must leave the original out dir untouched')
    assert.ok(readFileSync(link).equals(Buffer.from(SEED_BODY)),
      'the consumed source must still read through its alias, byte-identical')
  })

  it('refuses an input symlink inside --out even when it points back outside', () => {
    const out = seededOut('inner-link-out-out')
    const external = join(workDir, 'inner-link-external.json')
    writeFileSync(external, SEED_BODY)
    const link = join(out, 'input.json')
    symlinkSync(external, link)
    const before = filesAt(out)

    const result = runBuild([
      `--assets-root=${assetsRoot()}`,
      `--out=${out}`,
      `--voice-snapshot=${link}`,
    ])
    assert.notEqual(result.status, 0, 'the wiped alias must be refused whatever it resolves to')
    assert.match(result.stderr, /not-supported/i)
    assertSameFiles(before, filesAt(out), 'the refused build must leave the original out dir untouched')
    assert.ok(readFileSync(external).equals(Buffer.from(SEED_BODY)),
      'the external source bytes must be untouched')
  })

  it('keeps supporting an independent snapshot name inside --out across repeated builds', () => {
    const out = seededOut('independent-name-out')
    const input = join(out, 'my-own-snap.json')
    writeFile(input, SEED_BODY)

    const args = [
      `--assets-root=${assetsRoot()}`,
      `--out=${out}`,
      `--voice-snapshot=${input}`,
    ]
    const first = runBuild(args)
    assert.equal(first.status, 0, `first build must succeed: ${first.stderr}`)
    assert.ok(readFileSync(input).equals(Buffer.from(SEED_BODY)),
      'an independently-named snapshot inside --out must be restored at its own relative path')
    const second = runBuild(args)
    assert.equal(second.status, 0, `the repeat build must find its snapshot again: ${second.stderr}`)
    assert.ok(readFileSync(input).equals(Buffer.from(SEED_BODY)))
  })
})

describe('cloud catalog builder · voices-only refuses unrecoverable snapshot inputs before any write (#3058 final OCR)', () => {
  /** Byte-equal check of two `{ rel: bytes }` maps. */
  function assertSameFiles(before, after, note) {
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), note)
    for (const [rel, bytes] of before) {
      assert.ok(after.get(rel).equals(bytes), `${rel} must stay byte-identical`)
    }
  }

  /** @param {string[]} args @returns {{ status: number, stderr: string }} */
  function runRefresh(args) {
    try {
      execFileSync(process.execPath, [builder, ...args], { stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      return { status: error.status ?? 1, stderr: String(error.stderr ?? error.message) }
    }
  }

  const SEED_BODY = `${JSON.stringify({
    schema_version: 1,
    catalog_fingerprint: 'refresh-seed-fp',
    preview_fingerprint: 'refresh-seed-preview-fp',
    voices: VOICE_SNAPSHOT.voices,
  })}\n`

  it('refuses an input symlink inside --out whose nested target the copy-wipe deletes, leaving the catalog untouched', () => {
    const out = join(workDir, 'refresh-consumed-out')
    const target = join(out, 'nested', 'snap.json')
    writeFile(target, SEED_BODY)
    const link = join(out, 'input.json')
    symlinkSync(target, link)
    const before = filesAt(out)

    const result = runRefresh([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${out}`,
      `--voice-snapshot=${link}`,
    ])
    assert.notEqual(result.status, 0, 'an alias the wipe deletes must be refused, not silently dropped')
    assert.match(result.stderr, /not-supported/i)
    assertSameFiles(before, filesAt(out), 'the refused refresh must not wipe the pre-existing out dir')
    assert.ok(readFileSync(link).equals(Buffer.from(SEED_BODY)),
      'the consumed source must still read through its alias, byte-identical')
  })

  it('refuses an input symlink inside --out during a voices-only refresh', () => {
    const out = join(workDir, 'refresh-link-out')
    const external = join(workDir, 'refresh-external-snap.json')
    writeFileSync(external, SEED_BODY)
    const link = join(out, 'input.json')
    mkdirSync(out, { recursive: true })
    symlinkSync(external, link)
    const before = filesAt(out)

    const result = runRefresh([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${out}`,
      `--voice-snapshot=${link}`,
    ])
    assert.notEqual(result.status, 0, 'the wiped alias must be refused before the copy-wipe')
    assert.match(result.stderr, /not-supported/i)
    assertSameFiles(before, filesAt(out), 'the refused refresh must not wipe the pre-existing out dir')
  })

  it('refuses a copied refresh whose snapshot input occupies a generated scope directory', () => {
    // #3058 final OCR medium: the copied refresh wipes --out, cp's the base's
    // all/ directory in, then restores the consumed snapshot at its own
    // relative path — a snapshot file named `all` survives the gate's page
    // regex and EISDIRs against the copied directory instead.
    const out = join(workDir, 'refresh-scope-conflict-out')
    mkdirSync(out, { recursive: true })
    const input = join(out, 'all')
    writeFileSync(input, SEED_BODY)
    const before = filesAt(out)

    const result = runRefresh([
      '--voices-only',
      `--base=${outDir}`,
      `--out=${out}`,
      `--voice-snapshot=${input}`,
    ])
    assert.notEqual(result.status, 0, 'a snapshot file at a generated scope dir must be refused before the copy-wipe')
    assert.match(result.stderr, /snapshot-input-conflict/i)
    assertSameFiles(before, filesAt(out), 'the refused refresh must not wipe or copy over the pre-existing out dir')
  })

  it('refuses an in-place refresh whose snapshot input is a generated catalog file', () => {
    const base = join(workDir, 'refresh-in-place')
    cpSync(outDir, base, { recursive: true })
    // The consumed input sits where the refresh rewrites shard rows: it passes
    // schema validation only because the file doubles as a snapshot — the
    // page rm must refuse to delete the input path instead of orphaning it.
    const input = join(base, 'all', 'page-0001.json')
    writeFileSync(input, SEED_BODY)
    const before = filesAt(base)

    const result = runRefresh([
      '--voices-only',
      `--base=${base}`,
      `--voice-snapshot=${input}`,
    ])
    assert.notEqual(result.status, 0, 'a generated page path as snapshot input must be refused')
    assert.match(result.stderr, /snapshot-input-conflict|not-supported/i)
    assertSameFiles(before, filesAt(base), 'the refused in-place refresh must keep every file byte-identical')
  })
})
