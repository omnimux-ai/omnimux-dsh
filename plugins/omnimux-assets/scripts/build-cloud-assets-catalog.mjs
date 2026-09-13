#!/usr/bin/env node
/**
 * Build the static paginated JSON catalog for the Asset Center "Cloud" tab.
 *
 * The catalog is the lightweight data plane behind the cloud source tab: a
 * `manifest.json` plus `{category}[/{sub_category}]/page-NNNN.json` shards —
 * including the cross-category `all/` shards the default 全部 view pages — so the
 * client fetches 24 rows at a time instead of loading the whole library. The
 * shape follows the Inspiration Community catalog builder
 * (`OmniMux/web/scripts/build-inspiration-catalog.mjs`).
 *
 * ## Inputs (read-only, all outside this repo)
 *
 *   --assets-root=<dir>   Default /Users/x/Desktop/Project/OPC/资产库
 *
 * Every source is optional: a missing source yields an empty section and never
 * fails the build, so the catalog can be regenerated on a machine that holds
 * only part of the library.
 *
 *   character  `gxgen-data/character-library/pippit-local-avatars-source/`
 *   scene      `gxgen-data/element-library/场景氛围/`              场景氛围
 *              `gxgen-data/inspiration-library/loomi/`            实景环境
 *   prop       `gxgen-data/inspiration-library/loomi/`            实物道具
 *   material   `gxgen-data/element-library/video/green-screen-meme/`   绿幕
 *              `gxgen-data/element-library/hook-videos/`              钩子
 *              `gxgen-data/element-library/hook/`                     钩子
 *              `gxgen-data/inspiration-library/image/`                表情包
 *              `gxgen-data/inspiration-library/loomi/`                萌宠 · 服饰 · 人像
 *   style      `gxgen-data/style-library/` (three curated preset files)
 *              `gxgen-data/element-library/视频风格/`
 *   audio      `素材库/音频/volcengine-voices.json`          配音 (509 voices)
 *              `素材库/音频/` recorded voice samples          配音 · 背景音
 *              `素材库/音频/音效/` real transition SFX         音效
 *              `gxgen-data/music-library/` Fastlane manifest  背景音 (103 tracks)
 *
 * where `<gxgen>` = `<root>/素材库/gxgen-data`. `灵感社区` is a separate system
 * and is deliberately excluded; the parts of it this catalog reads are the two
 * galleries named by exact path — the 表情包 image set and the offline Loomi
 * library, which is what fills 道具 and widens 场景 and 素材.
 *
 * ## The Loomi library
 *
 * `inspiration-library/loomi/` is one offline snapshot of 632 curated items
 * (333 stills, 299 clips) whose media files are already downloaded beside it.
 * A single source class every row under a source tab of its own, so the five
 * classes are mapped onto the shelves they actually describe rather than reusing
 * the source tab's five names — see `LOOMI_SHELVES`.
 *
 * ## Sub-category membership
 *
 * A row's `sub_category` is its primary shelf; `sub_categories` is the full
 * membership list. The two differ where a category genuinely has more than one
 * axis — 角色 splits by gender *and* by scene, so one row can sit under both
 * 女性角色 and 职场商务. Sub-category pages and counts follow the membership
 * list, so a filter never hides a row that belongs to it.
 *
 * ## Output contract
 *
 *   <out>/manifest.json                            categories + per-scope counts
 *   <out>/index.json                               flat id -> row lookup (server)
 *   <out>/<category>/page-NNNN.json                24 rows, 4-digit padding
 *   <out>/<category>/<sub_category>/page-NNNN.json
 *   <out>/all/page-NNNN.json                       every category, in nav order
 *
 * A page file is `{ scope, page, pageSize, total, totalPages, items }`, so a
 * page is self-describing and fetchable by URL alone. `manifest.json` carries
 * `version`, `generatedAt`, `pageSize`, `totalAssets`, and one entry per
 * category with its labels, `total`, `pages`, and sub-category table.
 *
 * ## Row shape
 *
 * `media_url` / `cover_url` carry a `file:<assets-root-relative path>` locator
 * for local media and the original absolute remote URL otherwise. The Host
 * serves `file:` locators through `/omnimux/assets/cloud/media` (validated
 * against `index.json`, so a locator is not a general file-read capability)
 * and the browser loads remote URLs directly.
 *
 * ## Determinism
 *
 * Identical inputs produce byte-identical output apart from `generatedAt`,
 * overridable via `--generated-at=<iso>`. Rows are sorted by id inside a
 * category, the `all` scope concatenates the categories in nav order, and ids
 * are content hashes of the source identity rather than counters.
 *
 * Usage (from the plugin directory):
 *   node scripts/build-cloud-assets-catalog.mjs
 *   node scripts/build-cloud-assets-catalog.mjs --out=/tmp/catalog --dry-run
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ASSETS_ROOT = '/Users/x/Desktop/Project/OPC/资产库'
const DEFAULT_OUT = join(PLUGIN_ROOT, 'cloud-catalog')
const PAGE_SIZE = 24
/** Scope id of the cross-category shards the client's 全部 tab pages through. */
const ALL_SCOPE = 'all'
const CATALOG_VERSION = 1

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'])
const DOC_EXTS = new Set(['.md', '.txt'])

/**
 * Given names in the Pippit avatar catalogue, split by how the avatar is
 * presented. The catalogue ships no gender field (`metadata.json` carries only
 * `tags: [name, scene]`), so gender is read from the given name, which is the
 * only stable signal the source has. A name absent from both sets simply gets
 * no gender shelf — the row still appears under 全部 rather than being guessed
 * into the wrong one.
 */
const FEMALE_NAMES = new Set([
  'Abigail', 'Agnes', 'Aiko', 'Aisha', 'Akiko', 'Aline', 'Amara', 'Amelia', 'Angelica',
  'Anh', 'Anna', 'Anya', 'Ariana', 'Aurora', 'Ava', 'Brielle', 'Carlie', 'Carolina',
  'Charlotte', 'Chloe', 'Dalia', 'Daniela', 'Dara', 'Dorothy', 'Eliza', 'Elizabeth',
  'Ella', 'Emiko', 'Emily', 'Emma', 'Eri', 'Estelle', 'Evelyn', 'Fatima', 'Freya',
  'Gabriela', 'Grace', 'Greta', 'Harper', 'Helena', 'Isabela', 'Jasmine', 'Julia',
  'Juliana', 'Kara', 'Keisha', 'Kelly', 'Lan', 'Lara', 'Laura', 'Lauren', 'Liana',
  'Lily', 'Liora', 'Lola', 'Lucy', 'Luna', 'Maria', 'Mariam', 'Mars', 'Martha', 'Mia',
  'Nadia', 'Noor', 'Nora', 'Pooja', 'Rin', 'Santa', 'Siri', 'Sophie', 'Stella', 'Suman',
  'Tati', 'Thandi', 'Trinh', 'Vanessa', 'Victoria', 'Xiao', 'Zara',
])
const MALE_NAMES = new Set([
  'Akira', 'Arthur', 'Brooks', 'Charles', 'Christopher', 'Darnell', 'Derrick',
  'Diego', 'Elias', 'Ethan', 'Fabian', 'Felipe', 'Fred', 'Gary', 'George', 'Gregory',
  'Gustavo', 'Harold', 'Hassan', 'Henry', 'Jack', 'Jamal', 'James', 'Jasper', 'John',
  'Joseph', 'Julian', 'Julio', 'Karim', 'Kavi', 'Ken', 'Kenji', 'Kenneth', 'Kevin',
  'Kofi', 'Krit', 'Leon', 'Leonard', 'Lewis', 'Luca', 'Malik', 'Marcus', 'Mark',
  'Martin', 'Mason', 'Mat', 'Miguel', 'Milo', 'Neo', 'Oliver', 'Omar', 'Rahul', 'Rami',
  'Raymond', 'Richard', 'Rizky', 'Robert', 'Simon', 'Stephen', 'Steven', 'Thomas',
  'Tolga', 'Victor', 'Vincent', 'Walter',
])

/**
 * Scene words that put an avatar on the 生活居家 or 职场商务 shelf. Matched
 * case-insensitively against the avatar's own folder name and tags, which is
 * where Pippit records the scene (`Aiko_Marketing_Office_Standing`).
 *
 * 职场商务 is tested first. Its words name a room or an activity, while the
 * 生活居家 list has to carry generic ones (a shot taken over a sofa can also be
 * a 自拍), so an office selfie is an office scene rather than a home one.
 */
const BUSINESS_WORDS = [
  'office', 'marketing', 'business', 'laptop', 'podcast', 'presentation', 'meeting',
  'conference', 'stage', 'lobby', 'corridor', 'classroom', 'storyteller', 'studio',
  'professional', 'interview', 'esports', 'corporate', 'work',
]
const LIFESTYLE_WORDS = [
  'home', 'lifestyle', 'lifesytle', 'living', 'livingroom', 'bedroom', 'bed', 'kitchen',
  'bathroom', 'washroom', 'shower', 'dressing', 'cloakroom', 'vanity', 'makeup', 'mirror',
  'sofa', 'cafe', 'park', 'balcony', 'beauty', 'resting', 'relaxed', 'casual',
  'healing', 'seaside', 'study', 'bookshelf', 'curtain', 'sunshine', 'gym', 'outdoor',
  'outside', 'market', 'street', 'indoor', 'window', 'room', 'costume', 'christmas',
  'sports', 'festival', 'food', 'court', 'ball', 'phone', 'pad',
]

/** A `file:` locator outside the assets root cannot be served, so an empty
 *  locale is used when the sample is absent. */
const SFX_DIR = ['素材库', '音频', '音效']

/**
 * The real transition SFX shelf, keyed by file stem. Each entry carries the
 * sound design role it plays so a card describes the effect, not the file name.
 */
const SFX_CATALOGUE = {
  whoosh: { name: '经典转场嗖声', description: '经典短视频转场嗖声，画面切换的默认听觉标点' },
  'whoosh-fast': { name: '快速转场', description: '快速转场嗖声，适合卡点快切与高节奏混剪' },
  'whoosh-cinematic': { name: '电影重音转场', description: '电影重音转场，低频冲击带出强节拍的场景切换' },
  click: { name: 'UI 轻脆点击', description: 'UI 轻脆点击音，用于按钮、选项与弹层交互反馈' },
  'notification-pop': { name: '气泡弹出提示', description: '气泡弹出提示音，用于消息、点赞与弹窗出现' },
}

/**
 * Style rows whose content is not a visual style at all: a live-stream screenshot
 * and a prescription form are subjects, not looks. The old source files mixed
 * them in with the presets; they must not reach the 风格 shelf.
 */
const STYLE_EXCLUDE = /直播|处方|截图一张|朋友圈|小红书|淘宝|评价|文案生成|帮我生成/

/** The gallery the 表情包 shelf is built from, addressed relative to the
 *  gxgen-data root so the 灵感社区 exclusion above stays intact. */
const MEME_SOURCE = 'inspiration-library/image'
const MEME_MEDIA_DIR = 'inspiration-library/image/media'

const MAX_TAGS = 12
const MAX_DESCRIPTION = 240

/** @param {string} message */
function log(message) {
  process.stdout.write(`${message}\n`)
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** @param {string} value @param {number} [length] */
function shortId(value, length = 12) {
  return createHash('sha256').update(value).digest('hex').slice(0, length)
}

/** Trim, collapse whitespace, drop control characters. @param {unknown} value */
function text(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Truncate to a whole-character budget. @param {unknown} value @param {number} max */
function clamp(value, max) {
  const trimmed = text(value)
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** @param {string} value */
function extOf(value) {
  const dot = value.lastIndexOf('.')
  return dot <= 0 ? '' : value.slice(dot).toLowerCase()
}

/** @param {string} ext @returns {'image'|'video'|'audio'|'document'|'other'} */
function bucketOf(ext) {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (DOC_EXTS.has(ext)) return 'document'
  return 'other'
}

/** @param {string} relPath */
function toRel(relPath) {
  return relPath.split(sep).join('/')
}

/** @param {string} file */
function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    log(`! unreadable JSON ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** @param {string} dir */
function listDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** @param {string} abs */
function isDir(abs) {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/** @param {string} abs */
function isFile(abs) {
  try {
    return statSync(abs).isFile()
  } catch {
    return false
  }
}

/** @param {string} abs */
function fileBytes(abs) {
  try {
    return statSync(abs).size
  } catch {
    return 0
  }
}

/** @param {string} value */
function slugify(value) {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'item'
}

/** @param {unknown[]} values */
function uniqTags(values) {
  const seen = new Set()
  const out = []
  for (const raw of values) {
    const tag = clamp(raw, 24)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** @param {string} root @param {string} abs */
function relTo(root, abs) {
  const rel = abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, '') : abs
  return toRel(rel)
}

// ---------------------------------------------------------------------------
// row factory — the single place the public row shape is defined
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   category: string,
 *   sub_category: string,
 *   sub_categories: string[],
 *   name: string,
 *   description: string,
 *   cover_url: string,
 *   media_url: string,
 *   media_type: 'image'|'video'|'audio'|'document'|'other',
 *   tags: string[],
 *   meta: Record<string, unknown>,
 * }} CatalogAsset
 */

/**
 * Every shelf a row belongs to.
 *
 * `sub_category` alone is the primary shelf, which is all most rows need. A row
 * whose category has two axes (角色: gender and scene) lists all of them, and
 * every sub-category count and page file is built from this list.
 * @param {CatalogAsset} row
 * @returns {string[]}
 */
export function shelfListOf(row) {
  const shelves = Array.isArray(row.sub_categories) ? row.sub_categories : []
  if (shelves.length > 0) return shelves
  return row.sub_category ? [row.sub_category] : []
}

/**
 * Build one normalized catalog row.
 *
 * @param {{ assetsRoot: string }} ctx
 * @param {{
 *   key: string, category: string, subCategory?: string, name: string,
 *   description?: string, tags?: unknown[],
 *   dimensions?: string[],
 *   localMedia?: string, remoteMedia?: string,
 *   localCover?: string, remoteCover?: string,
 *   meta?: Record<string, unknown>,
 * }} spec
 * @returns {CatalogAsset}
 */
function makeAsset(ctx, spec) {
  const sub = spec.subCategory ?? ''
  const id = `${spec.category}${sub ? `-${sub}` : ''}-${shortId(spec.key)}`

  const localMedia = spec.localMedia && isFile(spec.localMedia) ? spec.localMedia : ''
  const localCover = spec.localCover && isFile(spec.localCover) ? spec.localCover : ''
  const remoteMedia = text(spec.remoteMedia)
  const remoteCover = text(spec.remoteCover)

  // Local media wins so playback costs no network. When a portable remote URL
  // also exists it rides along in `meta`, which is what lets the Host serve the
  // same row on a machine that has no local copy of the library.
  const meta = { ...(spec.meta ?? {}) }
  if (localMedia !== '' && remoteMedia !== '') meta.source_media_url = remoteMedia
  if (localCover !== '' && remoteCover !== '') meta.source_cover_url = remoteCover

  // The membership list always starts with the primary shelf and never repeats
  // one, so the first entry stays the row's own shelf.
  const shelves = []
  for (const shelf of [sub, ...(spec.dimensions ?? [])]) {
    const value = text(shelf)
    if (value === '' || shelves.includes(value)) continue
    shelves.push(value)
  }

  return {
    id,
    category: spec.category,
    sub_category: sub,
    sub_categories: shelves,
    name: clamp(spec.name, 80) || '未命名',
    description: clamp(spec.description, MAX_DESCRIPTION),
    cover_url: localCover ? `file:${relTo(ctx.assetsRoot, localCover)}` : remoteCover,
    media_url: localMedia ? `file:${relTo(ctx.assetsRoot, localMedia)}` : remoteMedia,
    media_type: bucketOf(extOf(localMedia || remoteMedia)),
    tags: uniqTags(spec.tags ?? []),
    meta: {
      ...meta,
      bytes: localMedia ? fileBytes(localMedia) : null,
    },
  }
}

// ---------------------------------------------------------------------------
// character — the 329 real digital humans
// ---------------------------------------------------------------------------

/**
 * The eight professional dimensions a digital human is catalogued on.
 *
 * They are orthogonal: every row carries exactly one value per dimension, the
 * dimensions partition the same 329 rows eight different ways, and every option
 * list therefore sums back to the category total. This table furnishes the
 * dimension titles and the option labels; the builder turns the resolvers below
 * into the manifest's per-option counts, so no chip count is ever hand-kept.
 *
 * 姓名 is the only dimension whose option list is not enumerated here: it has
 * one option per given name in the source (144 of them), ranked by how many
 * avatars that person has and cut off with `NAME_OPTION_LIMIT`.
 */
export const CHARACTER_DIMENSIONS = [
  { id: 'gender', zh: '性别', en: 'Gender', defaults: [] },
  { id: 'age', zh: '年龄', en: 'Age', defaults: [] },
  { id: 'figure', zh: '体型', en: 'Figure', defaults: [] },
  { id: 'name', zh: '姓名', en: 'Name', defaults: [] },
  { id: 'industry', zh: '行业', en: 'Industry', defaults: ['General Lifestyle'] },
  { id: 'scene', zh: '场景', en: 'Scene', defaults: ['Indoor/Studio'] },
  { id: 'pose', zh: '姿势', en: 'Pose', defaults: ['Frontal'] },
  { id: 'outfit', zh: '服装风格', en: 'Outfit style', defaults: ['Casual/Lifestyle'] },
]

/** How many 姓名 options the manifest carries, ranked by avatar count. */
const NAME_OPTION_LIMIT = 40

/**
 * Body-type words the source actually writes. A row whose text names no body
 * type is 匀称 (average) — the catalogue's own middle — so the three options
 * still describe every row rather than leaving a silent fourth bucket.
 */
const FIGURE_WORDS = [
  ['Curvy', ['curvy', 'plump', 'plus size']],
  ['Slim', ['slim', 'thin', 'lean', 'petite']],
]

/**
 * The young-adult wording, tested before the 中年 signals below. The catalogue
 * writes age only through these words, so everything else is read from the
 * persona a row presents (see `MIDDLE_AGED_SIGNALS`).
 */
const YOUTH_WORDS = ['teen', 'student', ' kid ', 'young', 'youth', 'child']

/**
 * Personas that read as 中年 in the source: the talk-host, teaching and
 * business-presenting roles, plus the maturity cues the catalogue does write (a
 * market walkabout, a balcony, a dressing room). Each signal is a persona the
 * catalogue names, not a guess about how someone looks, and a row that carries
 * none of them is 青年 — which is what makes the dimension total 329.
 */
const MIDDLE_AGED_SIGNALS = [
  'podcast', 'storyteller', 'classroom', 'education', 'office', 'marketing',
  'market', 'balcony', 'mirror', 'vanity',
]

/**
 * Scene words, most specific first. The first list that matches wins, so a
 * podcast studio is a 播客录音棚 even though it is also an indoor room, and the
 * tail of the list is only reached by a row whose text names no place at all.
 */
const SCENE_SIGNALS = [
  ['Podcast Studio', ['podcast']],
  ['Car', [' car ', ' cars ', 'car selfie']],
  ['Living Room', ['living room', 'livingroom', ' living ', ' sofa ']],
  ['Bedroom', ['bedroom', ' bed ']],
  ['Outdoor', ['outdoor', 'outside', ' park ', 'street', 'balcony', 'seaside', ' court ', 'sunshine', 'beach', 'shore']],
  ['Bathroom', ['bathroom', 'washroom', 'shower', ' bath ']],
  ['Office', ['office', 'classroom', 'lobby', 'corridor']],
  ['Kitchen', ['kitchen', 'cloakroom', 'study', 'bookshelf']],
  ['Cafe', ['cafe', 'coffee']],
]

/**
 * Pose words, most specific first: a selfie frame is a selfie even when the
 * person sits down for it, and a standing interview is 站立 rather than 正面.
 */
const POSE_SIGNALS = [
  ['Selfie', ['selfie', 'mirror', 'holding phone', 'plain background', 'white background', 'by the window']],
  ['Sitting', ['sitting', ' sofa ', 'resting', 'laptop', 'christmas', ' seated ']],
  ['Standing', ['standing', 'arms crossed', 'armscross']],
]

/**
 * Outfit words, most specific first. 节日造型 wins over the workplace reading of
 * a costume, and 商务正式 is read from the setting the source names rather than
 * from a garment word it never writes.
 */
const OUTFIT_SIGNALS = [
  ['Holiday/Costume', ['christmas', 'costume', 'holiday', 'festival', 'santa']],
  ['Business/Formal', ['office', 'marketing']],
  ['Fashion/Chic', ['fashion', 'dressing', 'mirror', 'makeup', 'beauty', 'vanity']],
]

/**
 * Industry words. 游戏电竞 is tested first so an esports room is not read as
 * entertainment hosting, and the tail is the catalogue's own catch-all.
 */
const INDUSTRY_SIGNALS = [
  ['Gaming & Tech', ['esports', 'gaming', ' game ']],
  ['Podcast & Media', ['podcast', 'storyteller']],
  ['Education', ['classroom', 'education']],
  ['Marketing & Ads', ['marketing', 'office', 'lobby', 'corridor']],
  ['Beauty & Fashion', ['beauty', 'fashion', 'makeup', 'mirror', 'dressing', 'vanity', 'cloakroom']],
]

/** The order a dimension's options are listed in, its default last. */
const DIMENSION_OPTIONS = {
  gender: ['Female', 'Male'],
  age: ['Youth', 'Middle-aged'],
  figure: ['Slim', 'Average', 'Curvy'],
  industry: [...INDUSTRY_SIGNALS.map(([label]) => label), 'General Lifestyle'],
  scene: [...SCENE_SIGNALS.map(([label]) => label), 'Indoor/Studio'],
  pose: [...POSE_SIGNALS.map(([label]) => label), 'Frontal'],
  outfit: [...OUTFIT_SIGNALS.map(([label]) => label), 'Casual/Lifestyle'],
}

/**
 * The text a dimension is resolved from: the folder name, the display name and
 * the source's own tag list, all folded to a space-delimited lowercase slug so a
 * word match cannot land inside a longer word (`in_car` is a car, `Carlie` is
 * not).
 * @param {{ folder: string, name: string, tags: string[] }} input
 */
function dimensionHaystack(input) {
  const joined = [input.folder, input.name, ...input.tags].join(' ')
  return ` ${joined.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

/** @param {string} haystack @param {string[]} words */
function mentions(haystack, words) {
  return words.some((word) => haystack.includes(word))
}

/**
 * @param {string} haystack
 * @param {[string, string[]][]} table
 * @param {string} fallback
 */
function firstSignal(haystack, table, fallback) {
  for (const [label, words] of table) {
    if (mentions(haystack, words)) return label
  }
  return fallback
}

/**
 * Resolve all eight dimensions for one avatar.
 *
 * The source ships no such fields — `metadata.json` carries only a name, a tag
 * list and the media URLs — so every value is read from the row's own text with
 * the tables above. Gender is the one value taken from the given name, which is
 * where Pippit records whether the presenter is a woman or a man.
 * @param {{ folder: string, name: string, tags: string[] }} input
 * @returns {{ given: string, values: Record<string, string> }}
 */
export function characterDimensionsOf(input) {
  const haystack = dimensionHaystack(input)
  const given = text(input.folder.split('_')[0])
  const gender = FEMALE_NAMES.has(given) ? 'Female' : MALE_NAMES.has(given) ? 'Male' : 'Female'

  let figure = 'Average'
  for (const [label, words] of FIGURE_WORDS) {
    if (mentions(haystack, words)) {
      figure = label
      break
    }
  }

  return {
    given,
    values: {
      gender,
      age: mentions(haystack, YOUTH_WORDS) ? 'Youth'
        : mentions(haystack, MIDDLE_AGED_SIGNALS) ? 'Middle-aged' : 'Youth',
      figure,
      name: given,
      industry: firstSignal(haystack, INDUSTRY_SIGNALS, 'General Lifestyle'),
      scene: firstSignal(haystack, SCENE_SIGNALS, 'Indoor/Studio'),
      pose: firstSignal(haystack, POSE_SIGNALS, 'Frontal'),
      outfit: firstSignal(haystack, OUTFIT_SIGNALS, 'Casual/Lifestyle'),
    },
  }
}

/**
 * The facet table for one category: for every dimension, every option the rows
 * actually use, with the number of rows on it.
 *
 * An option with no rows is left out rather than listed with a zero, and the
 * 姓名 list is cut to `NAME_OPTION_LIMIT` by row count so the dimension stays
 * usable at 144 named people. Counts are computed from the rows, never written
 * by hand, so they cannot drift from the pages the chips sit above.
 * @param {CatalogAsset[]} items
 */
export function dimensionFacetsOf(items) {
  /** @type {Map<string, string[]>} */
  const perId = new Map()
  for (const row of items) {
    const dims = row.meta?.dims
    if (!dims || typeof dims !== 'object') continue
    for (const dimension of CHARACTER_DIMENSIONS) {
      const value = text(/** @type {Record<string, unknown>} */ (dims)[dimension.id])
      if (value === '') continue
      const bucket = perId.get(dimension.id)
      if (bucket) bucket.push(value)
      else perId.set(dimension.id, [value])
    }
  }

  return CHARACTER_DIMENSIONS.map((dimension) => {
    const values = perId.get(dimension.id) ?? []
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    let options = [...counts.entries()].map(([value, total]) => ({ value, total }))
    if (dimension.id === 'name') {
      options = options
        .sort((a, b) => (b.total - a.total) || (a.value < b.value ? -1 : 1))
        .slice(0, NAME_OPTION_LIMIT)
        .sort((a, b) => (a.value < b.value ? -1 : 1))
    } else {
      // Options keep the declared order so the dropdown reads the same way on
      // every rebuild, with the dimension's default option last.
      const order = DIMENSION_OPTIONS[dimension.id] ?? []
      options.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))
    }
    return { id: dimension.id, zh: dimension.zh, en: dimension.en, total: values.length, options }
  })
}

/**
 * Scope id of the pre-filtered 角色 shards. A filtered view pages this scope
 * instead of paging the whole category and filtering client-side, so a chip
 * selection still costs one request per page.
 */
export const CHARACTER_FILTER_SCOPE = 'character_filtered'

/**
 * The wire token for one combination of dimension values, in dimension order.
 *
 * It travels as the `dims` query parameter of the filtered page route rather
 * than as a catalog directory: the eight dimensions describe 3000+ combinations,
 * and materializing a shard set per combination would put several megabytes of
 * nearly-identical rows in the repository to answer a query the Host can serve
 * from the index it already holds. Each token is `1` followed by its value
 * slugified, `-` downcased to `_`, and a dimension left on 全部 contributes
 * nothing.
 * @param {string[]} values one per dimension, in `CHARACTER_DIMENSIONS` order
 */
export function characterFilterKey(values) {
  return values
    .filter((value) => text(value) !== '')
    .map((value) => `1${slugify(value).replace(/-/g, '_')}`)
    .join('')
}

/**
 * Every combination of dimension values present in the rows, keyed by
 * `characterFilterKey`. Used to prove the filter's own vocabulary is the rows'
 * vocabulary; the filter itself is served by query, not by these keys.
 * @param {CatalogAsset[]} items
 * @returns {Map<string, number>}
 */
export function characterFilterScopes(items) {
  /** @type {Map<string, number>} */
  const scopes = new Map()
  for (const row of items) {
    const dims = row.meta?.dims
    if (!dims || typeof dims !== 'object') continue
    const values = CHARACTER_DIMENSIONS.map((dimension) => text(/** @type {Record<string, unknown>} */ (dims)[dimension.id]))
    if (values.some((value) => value === '')) continue
    const key = characterFilterKey(values)
    scopes.set(key, (scopes.get(key) ?? 0) + 1)
  }
  return scopes
}

/**
 * Gender shelf for one avatar, or `''` when the catalogue gives no signal.
 * @param {string} folderName
 */
function genderShelfOf(folderName) {
  const given = text(folderName.split('_')[0])
  if (FEMALE_NAMES.has(given)) return 'female'
  if (MALE_NAMES.has(given)) return 'male'
  return ''
}

/**
 * Scene shelf for one avatar, or `''` when its folder names no recognisable
 * scene. 职场商务 is tested first: see `BUSINESS_WORDS`.
 * @param {string} haystack
 */
function sceneShelfOf(haystack) {
  const hay = haystack.toLowerCase()
  if (BUSINESS_WORDS.some((word) => hay.includes(word))) return 'business'
  if (LIFESTYLE_WORDS.some((word) => hay.includes(word))) return 'lifestyle'
  return ''
}

export function collectCharacter(ctx, add) {
  const { assetsRoot } = ctx
  const source = join(assetsRoot, '素材库', 'gxgen-data', 'character-library', 'pippit-local-avatars-source')

  for (const entry of listDirSafe(source)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(source, entry.name)
    const meta = readJsonSafe(join(dir, 'metadata.json')) ?? {}
    const rawName = text(meta.name) || entry.name.replace(/_/g, '-')
    const metaTags = Array.isArray(meta.tags) ? meta.tags : []
    // The folder name and the tag list both describe the scene; neither alone is
    // complete (`Agnes_Home_Selfie` vs a `Marketing` tag).
    const haystack = [entry.name, rawName, ...metaTags].join(' ')
    const gender = genderShelfOf(entry.name)
    const scene = sceneShelfOf(haystack)
    const profile = characterDimensionsOf({ folder: entry.name, name: rawName, tags: metaTags })
    // Gender leads the membership list, so the primary shelf of a digital human
    // is who they are; the scene rides along as a second filter.
    const dimensions = [scene].filter((value) => value !== '')
    add(makeAsset(ctx, {
      key: `pippit/${entry.name}`,
      category: 'character',
      subCategory: gender,
      dimensions,
      name: rawName.replace(/-/g, ' '),
      description: `Pippit 实景数字人 · ${metaTags.join(' / ') || rawName.replace(/-/g, ' ')}`,
      tags: ['实景数字人', 'Pippit', ...metaTags],
      localMedia: join(dir, 'video.mp4'),
      localCover: join(dir, 'cover.jpg'),
      remoteCover: text(meta.cover_image?.url),
      meta: {
        source: 'pippit.ai',
        source_url: text(meta.source_url),
        index: Number(meta.index) || null,
        total: Number(meta.total) || null,
        gender: gender || null,
        scene: scene || null,
        // The eight professional dimensions, one value each. Kept on the row so
        // the client can filter a page it already holds without another request.
        dims: profile.values,
      },
    }))
  }
}

// ---------------------------------------------------------------------------
// scene / prop / style — shared element-library readers
// ---------------------------------------------------------------------------

/** @param {string} dir @param {string} base */
function findPoster(dir, base) {
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const candidate = join(dir, `${base}-poster${ext}`)
    if (isFile(candidate)) return candidate
  }
  return ''
}

/**
 * Read a `gxgen-index.json` element-library folder.
 * @param {{ assetsRoot: string }} ctx
 * @param {string} dirName folder name under `element-library/`
 * @param {(spec: Parameters<typeof makeAsset>[1]) => void} add
 * @param {{ category: string, subCategory: string, tag: string, fallbackDesc: string,
 *   promptFrom?: (title: string, description: string) => string }} opts
 */
function collectElementIndex(ctx, dirName, add, opts) {
  const dir = join(ctx.assetsRoot, '素材库', 'gxgen-data', 'element-library', dirName)
  const rows = readJsonSafe(join(dir, 'gxgen-index.json'))
  if (!Array.isArray(rows)) return
  const mediaDir = join(dir, 'media')

  for (const row of rows) {
    const localRel = text(row.local_media_path)
    const localMedia = localRel ? join(ctx.assetsRoot, '素材库', 'gxgen-data', localRel) : ''
    const posterRel = text(row.metadata?.local_poster_path)
    let localCover = posterRel && isFile(join(ctx.assetsRoot, '素材库', 'gxgen-data', posterRel))
      ? join(ctx.assetsRoot, '素材库', 'gxgen-data', posterRel)
      : ''
    if (localCover === '' && localMedia !== '') {
      const base = localMedia.slice(localMedia.lastIndexOf(sep) + 1).replace(/\.[^.]+$/, '')
      localCover = findPoster(mediaDir, base)
    }
    const title = text(row.title) || text(row.id)
    const description = text(row.metadata?.description) || opts.fallbackDesc
    /** @type {Record<string, unknown>} */
    const meta = {
      source: text(row.source_platform) || 'gxgen',
      source_url: text(row.metadata?.source_url),
      value: text(row.metadata?.value),
      category_label: text(row.metadata?.category),
    }
    // Only the shelves that promise a prompt ask for one (see 风格).
    if (opts.promptFrom) meta.prompt_text = clamp(opts.promptFrom(title, description), 600)
    add(makeAsset(ctx, {
      key: `${dirName}/${text(row.id)}`,
      category: opts.category,
      subCategory: opts.subCategory,
      name: title,
      description,
      tags: [opts.tag, ...(Array.isArray(row.tags) ? row.tags : [])],
      localMedia,
      remoteMedia: text(row.media_url),
      localCover,
      remoteCover: text(row.metadata?.poster_url),
      meta,
    }))
  }
}

/**
 * 场景 — the ambient element library plus the Loomi real-world environments.
 *
 * The two shelves are genuinely different things: 场景氛围 is a small set of
 * graded atmospheric clips, while the Loomi half is 125 stills and clips of
 * actual places (`LOOMI_SHELVES` routes them to 实景环境).
 */
function collectScene(ctx, add) {
  collectElementIndex(ctx, '场景氛围', add, {
    category: 'scene',
    subCategory: 'ambience',
    tag: '场景氛围',
    fallbackDesc: '高清动态场景氛围',
  })
  collectLoomi(ctx, add, 'scene')
}

/**
 * 绿幕 — the Fastlane green-screen overlay library.
 *
 * These are transparent-background clips to key over a shot, which is why they
 * live under 素材 rather than under 道具: nothing here is an object the cast
 * handles.
 */
function collectGreenScreen(ctx, add) {
  const gxgen = join(ctx.assetsRoot, '素材库', 'gxgen-data')
  const memeRoot = join(gxgen, 'element-library', 'video', 'green-screen-meme')
  const rows = readJsonSafe(join(memeRoot, 'fastlane-green-screen-meme-library.json'))
  if (!Array.isArray(rows)) return
  const mediaDir = join(memeRoot, 'media')
  const videoDir = join(memeRoot, 'videos')
  for (const row of rows) {
    const id = text(row.id)
    if (!id) continue
    const thumbRel = text(row.localThumbPath)
    const thumb = thumbRel ? join(gxgen, thumbRel) : join(mediaDir, `${id}.webp`)
    const remote = text(row.videoUrl)
    const remoteName = remote.slice(remote.lastIndexOf('/') + 1)
    const localVideo = [join(videoDir, `${remoteName}.mp4`), join(videoDir, `${id}.mp4`)]
      .find((candidate) => isFile(candidate)) ?? ''
    add(makeAsset(ctx, {
      key: `green-screen-meme/${id}`,
      category: 'material',
      subCategory: 'green-screen',
      name: `绿幕动态素材 ${id.slice(0, 6)}`,
      description: '绿幕动态贴片，可直接抠像叠加到成片中',
      tags: ['绿幕', '动态贴片', '抠像'],
      localMedia: localVideo,
      remoteMedia: remote,
      localCover: thumb,
      remoteCover: text(row.thumbUrl),
      meta: { source: text(row.sourcePlatform) || 'fastlane', source_id: id },
    }))
  }
}

/**
 * 钩子 — the opening beats: short-video first-three-second hooks and the
 * product close-up cutaways they cut to.
 *
 * Both shelves are `gxgen-index.json` element libraries. The hook-videos shelf
 * is far larger and many of its rows only carry a remote URL, which the row
 * shape already supports.
 */
function collectHook(ctx, add) {
  collectElementIndex(ctx, 'hook-videos', add, {
    category: 'material',
    subCategory: 'hook',
    tag: '前三秒钩子',
    fallbackDesc: '短视频前 3 秒开场钩子素材',
  })
  collectElementIndex(ctx, 'hook', add, {
    category: 'material',
    subCategory: 'hook',
    tag: '商品特写',
    fallbackDesc: '商品特写互动镜头钩子',
  })
}

/**
 * 表情包 — the image gallery the meme shelf is built from.
 *
 * The gallery lives under `inspiration-library`, which the community exclusion
 * normally keeps out of this catalog; it is read here by its exact path because
 * it is the only sticker/gag image set the library actually holds. Each row is
 * an image plus the prompt that produced it, so a card can hand the prompt to
 * the conversation along with the picture.
 */
function collectMeme(ctx, add) {
  const gxgen = join(ctx.assetsRoot, '素材库', 'gxgen-data')
  const parsed = readJsonSafe(join(gxgen, MEME_SOURCE, 'gpt-image-2-skill.json'))
  const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [])
  const pack = 'gpt-image-2'
  for (const row of rows) {
    const title = text(row.title)
    if (!title) continue
    // The gallery names its frames `NNNN-<prompt slug>.webp`; the index carries
    // the same order, so the file is addressed by the row's own ordinal.
    const index = rows.indexOf(row)
    const cover = findGalleryImage(join(gxgen, MEME_MEDIA_DIR, 'gpt-image-2-skill'), String(index).padStart(4, '0'))
    add(makeAsset(ctx, {
      key: `meme/${pack}/${index}/${title}`,
      category: 'material',
      subCategory: 'meme',
      name: title,
      description: clamp(text(row.prompt_text), MAX_DESCRIPTION) || '趣味梗图贴片素材',
      tags: [pack, text(row.category), '表情包', '梗图贴片'],
      // A gallery frame is its own cover, so the media slot is left to the
      // remote original and the local webp is what the grid paints.
      localCover: cover,
      remoteCover: text(row.cover_url),
      meta: {
        source: 'gpt-image-2-skill',
        category: text(row.category),
        prompt_text: clamp(text(row.prompt_text), 400),
        source_file: `${MEME_SOURCE}/gpt-image-2-skill.json`,
      },
    }))
  }
}

/**
 * Resolve one gallery frame by its `NNNN-` ordinal prefix.
 * @param {string} dir
 * @param {string} ordinal
 */
function findGalleryImage(dir, ordinal) {
  for (const file of listDirSafe(dir)) {
    if (!file.isFile()) continue
    if (!file.name.startsWith(`${ordinal}-`)) continue
    if (!IMAGE_EXTS.has(extname(file.name).toLowerCase())) continue
    return join(dir, file.name)
  }
  return ''
}

/**
 * The offline Loomi library, addressed relative to the gxgen-data root.
 *
 * `materials.json` is the only index; every `local_source_media` /
 * `local_thumbnail` in it is relative to this directory and was verified present
 * when it was downloaded, so a row that lost its file still falls back to the
 * remote original rather than to a broken tile.
 */
const LOOMI_SOURCE = 'inspiration-library/loomi'

/**
 * Which catalog shelf each Loomi source class belongs on.
 *
 * The mapping is deliberately many-to-one: the source tab splits 场景 and 道具
 * into classes of their own, while this catalog already owns 场景氛围 and treats
 * an object, a place, an animal and a person as four different kinds of 素材.
 * Reusing the source's own five names would have put 道具-classified pictures
 * under a shelf called 场景. `tag` carries the source class itself, so the
 * origin stays visible on the card even where the shelf had to be renamed.
 *
 * `sourceClass` is the `category` value `materials.json` writes, and
 * `subCategory` is the shelf the catalog files it under; the two are separate
 * fields precisely because they are not the same word.
 *
 * `describe` composes the row description from the item's own title, so a card
 * reads as a description of the thing rather than one sentence repeated 125
 * times: a prop card names the prop, a person card names the subject.
 * `label` names a row the source left without a usable title (see `loomiTitle`).
 */
const LOOMI_SHELVES = [
  {
    category: 'prop',
    sourceClass: 'prop',
    subCategory: 'object',
    tag: '道具',
    label: '实物道具',
    describe: (title) => `${title}，可作画面中实物道具的参考或贴片`,
  },
  {
    category: 'scene',
    sourceClass: 'scene',
    subCategory: 'environment',
    tag: '实景',
    label: '实景环境',
    describe: (title) => `${title}，可直接作为画面背景的实景环境素材`,
  },
  {
    category: 'material',
    sourceClass: 'pet',
    subCategory: 'pet',
    tag: '宠物',
    label: '萌宠动物',
    describe: (title) => `${title}，萌宠动物素材，适合出镜或做画面点缀`,
  },
  {
    category: 'material',
    sourceClass: 'clothing',
    subCategory: 'clothing',
    tag: '服装',
    label: '服饰穿搭',
    describe: (title) => `${title}，服饰穿搭素材，可作为造型与人设参考`,
  },
  {
    category: 'material',
    sourceClass: 'portrait',
    subCategory: 'portrait',
    tag: '人像',
    label: '人像写真',
    describe: (title) => `${title}，写实人像配图素材，可作为人物出镜参考`,
  },
]

/** The media-kind word a Loomi row carries as its third tag. */
const LOOMI_MEDIA_LABELS = { image: '图片', video: '视频', audio: '音频' }

/**
 * The display name for one Loomi row.
 *
 * A title is usable when the source actually wrote one. All 299 clips fail that
 * test: their `title` repeats `creator`, the Pexels uploader's handle, so a card
 * named from it would read `Hữu Thịnh 79` and say nothing about the picture.
 * Those rows are named `<shelf label> <source id>` instead, and the handle stays
 * in `meta.creator` where attribution belongs.
 * @param {{ title?: unknown, filename?: unknown, creator?: unknown, id?: unknown }} row
 * @param {typeof LOOMI_SHELVES[number]} shelf
 * @returns {string}
 */
function loomiTitle(row, shelf) {
  const title = text(row.title)
  const creator = text(row.creator)
  if (title !== '' && title !== creator) return title
  const stem = text(row.filename).replace(/\.[^.]+$/, '')
  return `${shelf.label} ${text(row.id) || stem}`.trim()
}

/**
 * Resolve one path recorded in `materials.json` against the Loomi directory.
 *
 * The index stores portable relative paths (`media/<hash>.jpg`); a path that
 * escapes the source directory or no longer exists yields an empty string, which
 * leaves the row on its remote original instead of writing a locator the Host
 * would refuse to serve.
 * @param {string} loomiDir @param {unknown} value @returns {string}
 */
function loomiLocal(loomiDir, value) {
  const rel = text(value).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('/') || rel.split('/').includes('..')) return ''
  const abs = join(loomiDir, rel)
  return isFile(abs) ? abs : ''
}

/**
 * 道具 · 场景 · 素材 — the offline Loomi library.
 *
 * 632 curated items from one snapshot, each with its media already downloaded.
 * One source feeds three catalog categories, so the collector is handed the
 * category it is being run for and keeps only that category's classes; the page
 * count of each caller then matches the rows it actually owns.
 *
 * The title is the item's own Chinese name, so a card reads `复古相机道具`
 * rather than a filename.
 * @param {{ assetsRoot: string }} ctx
 * @param {(spec: Parameters<typeof makeAsset>[1]) => void} add
 * @param {string} category the catalog category this run collects for
 */
function collectLoomi(ctx, add, category) {
  const loomiDir = join(ctx.assetsRoot, '素材库', 'gxgen-data', LOOMI_SOURCE)
  const parsed = readJsonSafe(join(loomiDir, 'materials.json'))
  const rows = Array.isArray(parsed?.items) ? parsed.items : []
  const shelves = LOOMI_SHELVES.filter((entry) => entry.category === category)
  for (const row of rows) {
    const shelf = shelves.find((entry) => entry.sourceClass === text(row.category))
    if (!shelf) continue
    const sourceId = text(row.id)
    if (!sourceId) continue
    const title = loomiTitle(row, shelf)
    const kind = text(row.mediaKind) || bucketOf(extOf(text(row.local_source_media)))
    add(makeAsset(ctx, {
      key: `loomi/${sourceId}`,
      category: shelf.category,
      subCategory: shelf.subCategory,
      name: title,
      description: shelf.describe(title),
      tags: [shelf.tag, LOOMI_MEDIA_LABELS[kind] ?? '素材', text(row.sourceProvider)].filter(Boolean),
      localMedia: loomiLocal(loomiDir, row.local_source_media),
      remoteMedia: text(row.assetUrl),
      localCover: loomiLocal(loomiDir, row.local_thumbnail),
      remoteCover: text(row.thumbnailUrl),
      meta: {
        source: 'loomi',
        source_id: sourceId,
        source_category: text(row.category),
        source_file: text(row.filename),
        provider: text(row.sourceProvider),
        creator: text(row.creator),
        license: text(row.license),
        attribution_required: row.attributionRequired === true,
        source_url: text(row.sourceUrl),
      },
    }))
  }
}

function collectMaterial(ctx, add) {
  collectGreenScreen(ctx, add)
  collectHook(ctx, add)
  collectMeme(ctx, add)
  collectLoomi(ctx, add, 'material')
}

/**
 * 道具 — the Loomi props: cameras, guitars, computers and the rest of the real
 * objects the shelf was waiting for. Nothing is invented here; the category
 * names only the class `LOOMI_SHELVES` routes to it.
 * @param {{ assetsRoot: string }} ctx
 * @param {(spec: Parameters<typeof makeAsset>[1]) => void} add
 */
function collectProp(ctx, add) {
  collectLoomi(ctx, add, 'prop')
}

/**
 * The style presets worth shipping: three curated files plus the video-tone
 * element library.
 *
 * The two raw Twitter prompt dumps the shelf used to include (`awesome-gpt-image-2`,
 * `gpt-image-2-style-presets`) are gone. They are user requests — "生成一张刘亦菲
 * 直播的截图", "三甲医院真实门诊处方笺" — not looks, and they outnumbered the
 * real presets 6:1 in the old 风格 tab.
 */
const STYLE_SOURCES = [
  ['new-style-presets.json', '生图预设'],
  ['xiaoyunque-novel-style-library.json', '小说推文'],
  ['pippit-visual-styles.json', 'Pippit 视觉'],
]

/**
 * Flatten the differently-shaped style-preset JSONs into rows.
 *
 * Every row must end up with a usable prompt: a style card that is only a cover
 * image hands the conversation nothing to work with. `新海诚动漫` carries its
 * prompt verbatim; a Pippit visual style records only an English description, so
 * the description is composed into the prompt it stands for rather than
 * inventing an unrelated one.
 */
function collectStyle(ctx, add) {
  const styleDir = join(ctx.assetsRoot, '素材库', 'gxgen-data', 'style-library')
  let dropped = 0

  for (const [fileName, pack] of STYLE_SOURCES) {
    const parsed = readJsonSafe(join(styleDir, fileName))
    if (parsed === null) continue
    const rows = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.styles) ? parsed.styles : []))
    const localMediaDir = join(styleDir, 'media', fileName.replace(/\.json$/, ''))

    for (const row of rows) {
      const title = text(row.title) || text(row.title_zh)
      if (!title) continue
      const authored = text(row.prompt_text)
      const description = text(row.description)
      const category = [text(row.category_zh), text(row.category)].filter(Boolean).join(' / ')
      const prompt = authored || (description ? `${title}（${category || pack}）：${description}` : '')
      if (prompt === '' || STYLE_EXCLUDE.test(title) || STYLE_EXCLUDE.test(prompt)) {
        dropped += 1
        continue
      }

      const rawLocal = text(row.local_media_path) || text(row.localPosterPath)
      const localAsset = rawLocal ? join(ctx.assetsRoot, '素材库', 'gxgen-data', rawLocal) : ''
      const kind = bucketOf(extOf(localAsset))
      const cover = localAsset !== '' && (kind === 'image' || kind === 'video')
        ? localAsset
        : join(localMediaDir, `${slugify(title)}.webp`)

      add(makeAsset(ctx, {
        key: `style/${fileName}/${text(row.source_id) || text(row.id) || title}`,
        category: 'style',
        subCategory: fileName === 'pippit-visual-styles.json' ? 'video-tone' : 'image-preset',
        name: title,
        description: clamp(description || prompt, MAX_DESCRIPTION) || title,
        tags: [pack, text(row.category), text(row.category_zh)],
        localCover: cover,
        remoteCover: text(row.cover_url) || text(row.remotePosterUrl),
        meta: {
          source: 'style-library',
          source_file: fileName,
          pack,
          // The contract of this shelf: every style row ships a prompt.
          prompt_text: clamp(prompt, 600),
          prompt_source: authored ? 'authored' : 'description',
          author: text(row.author),
          source_url: text(row.source_url),
        },
      }))
    }
  }

  if (dropped > 0) log(`  · style: dropped ${dropped} row(s) that carry no visual style`)

  collectElementIndex(ctx, '视频风格', add, {
    category: 'style',
    subCategory: 'video-tone',
    tag: '视频调性',
    fallbackDesc: '视频调性预设',
    // This shelf records a look in one English line rather than as a prompt, so
    // the line is composed into the prompt it stands for.
    promptFrom: (title, description) => `视频调性「${title}」：${description}`,
  })
}

// ---------------------------------------------------------------------------
// audio — voices / sfx / bgm
// ---------------------------------------------------------------------------

/** Official Volcengine voice catalogue. Descriptor-only: no sample audio ships. */
function collectVoices(ctx, add) {
  const rows = readJsonSafe(join(ctx.assetsRoot, '素材库', '音频', 'volcengine-voices.json'))
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    const voiceType = text(row.voice_type)
    if (!voiceType) continue
    const language = text(row.language)
    add(makeAsset(ctx, {
      key: `volcengine/${voiceType}`,
      category: 'audio',
      subCategory: 'voiceover',
      name: text(row.display_name) || text(row.name) || voiceType,
      description: [text(row.category), language, text(row.section)].filter(Boolean).join(' · ')
        || '火山引擎官方音色',
      tags: ['火山引擎', language, ...(Array.isArray(row.tags) ? row.tags : [])],
      meta: {
        source: 'volcengine',
        voice_type: voiceType,
        voice_name: text(row.name),
        language,
        voice_category: text(row.category),
        resource_id: text(row.resource_id),
        section: text(row.section),
        playable: false,
      },
    }))
  }
}

/** Recorded samples under `素材库/音频/**`. */
function collectVoiceSamples(ctx, add) {
  const audioRoot = join(ctx.assetsRoot, '素材库', '音频')
  /** @type {[string, string, string][]} folder -> [sub_category, tag] */
  const groups = [
    ['女声', 'voiceover', '女声'],
    ['男声', 'voiceover', '男声'],
    ['性感', 'voiceover', '性感'],
    ['音频克隆', 'voiceover', '音频克隆'],
    ['纯音乐', 'bgm', '纯音乐'],
    ['舞蹈', 'bgm', '舞蹈'],
  ]

  for (const [dirName, subCategory, tag] of groups) {
    const dir = join(audioRoot, dirName)
    if (!isDir(dir)) continue
    for (const file of listDirSafe(dir)) {
      if (!file.isFile() || file.name.startsWith('.')) continue
      const abs = join(dir, file.name)
      const kind = bucketOf(extOf(file.name))
      if (kind !== 'audio' && kind !== 'video') continue
      add(makeAsset(ctx, {
        key: `sample/${dirName}/${file.name}`,
        category: 'audio',
        subCategory: subCategory,
        name: file.name.slice(0, file.name.length - extname(file.name).length),
        description: `实录音频样本 · ${tag}`,
        tags: [tag, '实录音频'],
        localMedia: abs,
        localCover: join(dir, '封面.jpg'),
        meta: { source: '音频', source_path: relTo(ctx.assetsRoot, abs) },
      }))
    }
  }

  // Named single-file samples at the audio root. Nothing else at that level is
  // catalogued: the root also holds dated scratch recordings and the authored
  // `5秒无声` / `6 秒无声` silence beds, which used to be filed as 音效 purely
  // because they sat there — that is how two silent files became the whole 音效
  // shelf. The shelf now comes from `collectSfx` below.
  /** @type {[string, string, string, string][]} file -> [sub_category, tag, description] */
  const loose = [
    ['播客女.MP3', 'voiceover', '播客', '实录音频样本 · 播客女声'],
    ['播客男.MP3', 'voiceover', '播客', '实录音频样本 · 播客男声'],
    ['TK 口播女.mp3', 'voiceover', '口播', '实录音频样本 · 口播女声'],
    ['口播博主声音克隆.WAV', 'voiceover', '音频克隆', '声音克隆样本'],
  ]
  for (const [fileName, subCategory, tag, description] of loose) {
    const abs = join(audioRoot, fileName)
    if (!isFile(abs)) continue
    add(makeAsset(ctx, {
      key: `sample/${fileName}`,
      category: 'audio',
      subCategory,
      name: fileName.slice(0, fileName.length - extname(fileName).length),
      description,
      tags: [tag, '实录音频'],
      localMedia: abs,
      meta: { source: '音频', source_path: relTo(ctx.assetsRoot, abs) },
    }))
  }
}

/**
 * 音效 — real transition and interface sounds.
 *
 * Sourced from the shared motion-skill SFX packs (Pixabay Content License) and
 * copied into `素材库/音频/音效/`, which is the only location a `file:` locator
 * can address. The shelf is scanned rather than hard-coded, so a sound added to
 * that folder appears without touching this script; the catalogue table above
 * only supplies the human name and the role each known effect plays.
 */
function collectSfx(ctx, add) {
  const dir = join(ctx.assetsRoot, ...SFX_DIR)
  if (!isDir(dir)) return
  for (const file of listDirSafe(dir)) {
    if (!file.isFile() || file.name.startsWith('.')) continue
    const ext = extname(file.name).toLowerCase()
    if (!AUDIO_EXTS.has(ext)) continue
    const stem = file.name.slice(0, file.name.length - ext.length)
    const known = SFX_CATALOGUE[stem]
    const abs = join(dir, file.name)
    add(makeAsset(ctx, {
      key: `sfx/${file.name}`,
      category: 'audio',
      subCategory: 'sfx',
      name: known?.name ?? stem,
      description: known?.description ?? '短视频转场 / 界面音效素材',
      tags: ['音效', '转场', ...(known ? [] : ['未收录说明'])],
      localMedia: abs,
      meta: {
        source: 'skill-sfx-pack',
        source_path: relTo(ctx.assetsRoot, abs),
        license: 'Pixabay Content License',
        playable: true,
      },
    }))
  }
}

/** Short-video rhythm tracks from the Fastlane music library. */
function collectBgm(ctx, add) {
  const musicDir = join(ctx.assetsRoot, '素材库', 'gxgen-data', 'music-library')
  const manifest = readJsonSafe(join(musicDir, 'fastlane-wall-of-text-audio-files-manifest.json'))
  if (!Array.isArray(manifest?.files)) return
  const filesDir = join(musicDir, 'fastlane-wall-of-text-audio-files')

  for (const row of manifest.files) {
    const fileName = text(row.file_name)
    if (!fileName) continue
    const duration = text(row.duration)
    add(makeAsset(ctx, {
      key: `bgm/${fileName}`,
      category: 'audio',
      subCategory: 'bgm',
      name: text(row.name) || fileName.replace(/\.\w+$/, ''),
      description: `短视频卡点配乐${duration ? ` · ${duration}` : ''}`,
      tags: ['背景音乐', '卡点节奏', duration],
      localMedia: join(filesDir, fileName),
      remoteMedia: text(row.source_url),
      meta: { source: 'fastlane-music-library', duration, page: Number(row.page) || null },
    }))
  }
}

// ---------------------------------------------------------------------------
// category table
// ---------------------------------------------------------------------------

const CATEGORIES = [
  {
    id: 'character',
    zh: '角色',
    en: 'Characters',
    subCategories: [
      { id: 'female', zh: '女性角色', en: 'Female' },
      { id: 'male', zh: '男性角色', en: 'Male' },
      { id: 'lifestyle', zh: '生活居家', en: 'Lifestyle' },
      { id: 'business', zh: '职场商务', en: 'Business' },
    ],
    collect: collectCharacter,
  },
  {
    id: 'scene',
    zh: '场景',
    en: 'Scenes',
    subCategories: [
      { id: 'ambience', zh: '场景氛围', en: 'Ambience' },
      { id: 'environment', zh: '实景环境', en: 'Environments' },
    ],
    collect: collectScene,
  },
  {
    /**
     * 道具 holds the Loomi props: cameras, guitars, computers and the rest of
     * the real objects the tab used to have no source for. Green screens and
     * product hooks stay under 素材 — they are overlays and beats, not things
     * the cast handles.
     */
    id: 'prop',
    zh: '道具',
    en: 'Props',
    subCategories: [{ id: 'object', zh: '实物道具', en: 'Props & Objects' }],
    collect: collectProp,
  },
  {
    id: 'material',
    zh: '素材',
    en: 'Material',
    subCategories: [
      { id: 'green-screen', zh: '绿幕', en: 'Green Screen' },
      { id: 'hook', zh: '钩子', en: 'Hooks' },
      { id: 'meme', zh: '表情包', en: 'Memes' },
      { id: 'pet', zh: '萌宠动物', en: 'Pets & Animals' },
      { id: 'clothing', zh: '服饰穿搭', en: 'Fashion & Outfits' },
      { id: 'portrait', zh: '人像写真', en: 'Portraits' },
    ],
    collect: collectMaterial,
  },
  {
    id: 'style',
    zh: '风格',
    en: 'Styles',
    subCategories: [
      { id: 'image-preset', zh: '生图预设', en: 'Image Presets' },
      { id: 'video-tone', zh: '视频调性', en: 'Video Tones' },
    ],
    collect: collectStyle,
  },
  {
    id: 'audio',
    zh: '声音',
    en: 'Audio',
    subCategories: [
      { id: 'voiceover', zh: '配音', en: 'Voiceover' },
      { id: 'sfx', zh: '音效', en: 'SFX' },
      { id: 'bgm', zh: '背景音', en: 'BGM' },
    ],
    collect: (ctx, add) => {
      collectVoices(ctx, add)
      collectVoiceSamples(ctx, add)
      collectSfx(ctx, add)
      collectBgm(ctx, add)
    },
  },
]

// ---------------------------------------------------------------------------
// driver
// ---------------------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {}
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (!match) continue
    out[match[1]] = match[2] === undefined ? true : match[2]
  }
  return out
}

/** @param {CatalogAsset[]} items */
function sortItems(items) {
  return items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** @param {string} dir @param {string} relPath @param {unknown} body */
function writeJson(dir, relPath, body) {
  const file = join(dir, relPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(body)}\n`)
}

/** @param {CatalogAsset[]} items @param {string} scope */
function pageSpecs(items, scope) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const out = []
  for (let page = 0; page < totalPages; page += 1) {
    out.push({
      relPath: `${scope}/page-${String(page).padStart(4, '0')}.json`,
      body: {
        scope,
        page,
        pageSize: PAGE_SIZE,
        total: items.length,
        totalPages,
        items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
      },
    })
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const assetsRoot = resolve(typeof args['assets-root'] === 'string' ? args['assets-root'] : DEFAULT_ASSETS_ROOT)
  const outDir = resolve(typeof args.out === 'string' ? args.out : DEFAULT_OUT)
  const dryRun = args['dry-run'] === true
  const generatedAt = typeof args['generated-at'] === 'string' ? args['generated-at'] : new Date().toISOString()

  if (!existsSync(assetsRoot)) {
    throw new Error(`assets root does not exist: ${assetsRoot}\nPass --assets-root=<dir>`)
  }

  log(`[cloud-catalog] assets root : ${assetsRoot}`)
  log(`[cloud-catalog] output      : ${outDir}${dryRun ? ' (dry run)' : ''}`)

  const ctx = { assetsRoot }
  /** @type {CatalogAsset[]} */
  const all = []
  /** @type {Map<string, CatalogAsset[]>} */
  const byCategory = new Map()
  const categoryMeta = []

  for (const spec of CATEGORIES) {
    /** @type {Map<string, CatalogAsset>} */
    const seen = new Map()
    const add = (asset) => {
      if (asset && !seen.has(asset.id)) seen.set(asset.id, asset)
    }
    try {
      spec.collect(ctx, add)
    } catch (error) {
      log(`! ${spec.id} collector failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    const items = sortItems([...seen.values()])
    byCategory.set(spec.id, items)
    all.push(...items)

    const subCategories = spec.subCategories.map((sub) => {
      const total = items.filter((row) => shelfListOf(row).includes(sub.id)).length
      return {
        id: sub.id,
        zh: sub.zh,
        en: sub.en,
        total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      }
    })

    // A category whose rows carry the eight professional dimensions also
    // publishes their option counts, so the filter chips are served their
    // numbers instead of computing them from pages they have not fetched. The
    // filtered rows themselves come from the Host's `dims` query over
    // `index.json` — see `characterFilterKey`.
    const facets = dimensionFacetsOf(items)
    if (spec.id === 'character') {
      subCategories.push({
        id: CHARACTER_FILTER_SCOPE,
        zh: '筛选结果',
        en: 'Filtered',
        total: items.length,
        pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
      })
    }

    const entry = {
      id: spec.id,
      zh: spec.zh,
      en: spec.en,
      total: items.length,
      pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
      sub_categories: subCategories,
    }
    if (facets.some((dimension) => dimension.options.length > 0)) entry.dimensions = facets
    categoryMeta.push(entry)
    log(`[cloud-catalog] ${spec.id.padEnd(10)} ${String(items.length).padStart(5)} rows · ${entry.pages} page(s)`)
    if (entry.dimensions) {
      const shape = entry.dimensions
        .map((dimension) => `${dimension.id}:${dimension.options.length}`)
        .join(' ')
      log(`[cloud-catalog] ${spec.id.padEnd(10)} dimensions ${shape}`)
    }
  }

  const manifest = {
    version: CATALOG_VERSION,
    generatedAt,
    pageSize: PAGE_SIZE,
    totalAssets: all.length,
    // The root every `file:` locator is relative to. Recorded so the Host can
    // tell "built here, media present" from "built elsewhere, media missing"
    // instead of reading an unrelated path on this machine.
    sourceRoot: assetsRoot,
    categories: categoryMeta,
  }

  // Server lookup table, keyed by id: the Host resolves media and save-to-local
  // from this without reading a page file. `description` is included because
  // catalog search matches on it; `meta` carries only the portable remote
  // media fallback, which is what keeps the file small enough to commit.
  /** @type {Record<string, unknown>[]} */
  const index = all.map((row) => {
    /** @type {Record<string, unknown>} */
    const meta = {}
    if (row.meta.source_media_url) meta.source_media_url = row.meta.source_media_url
    if (row.meta.source_cover_url) meta.source_cover_url = row.meta.source_cover_url
    // The professional dimensions ride along on the server index too, so the
    // 收藏到本地 path can describe a row with the same vocabulary the chips use.
    if (row.meta.dims) meta.dims = row.meta.dims
    const entry = {
      id: row.id,
      category: row.category,
      sub_category: row.sub_category,
      sub_categories: shelfListOf(row),
      name: row.name,
      description: row.description,
      media_type: row.media_type,
      media_url: row.media_url,
      cover_url: row.cover_url,
      tags: row.tags,
    }
    if (Object.keys(meta).length > 0) entry.meta = meta
    return entry
  })

  if (dryRun) {
    log(`[cloud-catalog] dry run: ${all.length} rows across ${categoryMeta.length} categories`)
    return
  }

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  writeJson(outDir, 'manifest.json', manifest)
  writeJson(outDir, 'index.json', index)

  let pageFiles = 0
  // 全部 is a real scope with its own shards: the client's default view pages the
  // whole catalog by URL instead of loading a category at a time and merging.
  for (const page of pageSpecs(all, ALL_SCOPE)) {
    writeJson(outDir, page.relPath, page.body)
    pageFiles += 1
  }
  // One shard set per dimension combination is deliberately not written: the
  // eight dimensions describe thousands of combinations, and the filtered rows
  // are served by the Host's `dims` query over `index.json` instead. Keeping the
  // catalog to `category/[sub_category]/` shards is what holds it at ~6 MB.
  for (const spec of CATEGORIES) {
    const items = byCategory.get(spec.id) ?? []
    for (const page of pageSpecs(items, spec.id)) {
      writeJson(outDir, page.relPath, page.body)
      pageFiles += 1
    }
    for (const sub of spec.subCategories) {
      const subItems = items.filter((row) => shelfListOf(row).includes(sub.id))
      if (subItems.length === 0) continue
      for (const page of pageSpecs(subItems, `${spec.id}/${sub.id}`)) {
        writeJson(outDir, page.relPath, page.body)
        pageFiles += 1
      }
    }
  }

  log(`[cloud-catalog] wrote ${all.length} rows · ${pageFiles} page file(s) + manifest.json + index.json`)
  log(`[cloud-catalog] done in ${outDir}`)
}

main().catch((error) => {
  process.stderr.write(`[cloud-catalog] FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
