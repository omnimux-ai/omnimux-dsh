#!/usr/bin/env node
/**
 * Build the static paginated JSON catalog for the Asset Center "Cloud" tab.
 *
 * The catalog is the lightweight data plane behind the cloud source tab: a
 * `manifest.json` plus `{category}[/{sub_category}]/page-NNNN.json`, so the
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
 *   knowledge  `prompts/`                prompt packs (recursive)
 *              `知识库/`                  long-form knowledge notes (recursive)
 *              `skills/&lt;drama pack&gt;/references/`  short-drama shot rules
 *   character  `gxgen-data/character-library/pippit-local-avatars-source/`
 *              `素材库/AI 网红/`
 *   scene      `gxgen-data/element-library/场景氛围/`
 *   prop       `gxgen-data/element-library/video/green-screen-meme/`
 *              `gxgen-data/element-library/hook/`
 *   style      `gxgen-data/style-library/` (six preset JSON files)
 *              `gxgen-data/element-library/视频风格/`
 *   audio      `素材库/音频/volcengine-voices.json`          配音 (509 voices)
 *              `素材库/音频/` recursive audio/image files     配音 · 音效 · 背景音
 *              `gxgen-data/music-library/` Fastlane manifest  背景音 (103 tracks)
 *
 * where `<gxgen>` = `<root>/素材库/gxgen-data`. `灵感社区` is a separate system
 * and is deliberately excluded: its directory symlinks under `<root>/prompts/`
 * are skipped by name.
 *
 * ## Output contract
 *
 *   <out>/manifest.json                              categories + per-scope counts
 *   <out>/index.json                                 flat id -> row lookup (server)
 *   <out>/<category>/page-NNNN.json                  24 rows, 4-digit padding
 *   <out>/<category>/<sub_category>/page-NNNN.json
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
 * overridable via `--generated-at=<iso>`. Rows are sorted by id, and ids are
 * content hashes of the source identity rather than counters.
 *
 * Usage (from the plugin directory):
 *   node scripts/build-cloud-assets-catalog.mjs
 *   node scripts/build-cloud-assets-catalog.mjs --out=/tmp/catalog --dry-run
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ASSETS_ROOT = '/Users/x/Desktop/Project/OPC/资产库'
const DEFAULT_OUT = join(PLUGIN_ROOT, 'cloud-catalog')
const PAGE_SIZE = 24
const CATALOG_VERSION = 1

/** Belongs to the separate Inspiration Community system — never catalogued here. */
const EXCLUDED_DIR_NAMES = new Set(['inspiration-library', 'inspiration-community', '灵感社区'])

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'])
const DOC_EXTS = new Set(['.md', '.txt'])

/**
 * The knowledge tree is a working vault, not a curated library: it also holds
 * service configs, database dumps, and captured exports that describe no
 * creative asset. Those are skipped by directory name and by extension so the
 * catalog stays about prompts, scripts, and production know-how.
 */
const KNOWLEDGE_SKIP_DIRS = new Set([
  'node_modules', 'infra', 'dist', 'build', 'vendor', 'coverage', '.git',
  '个人资料', '安全备份', '身份资料', '公司资料',
])
/** Reference material that is genuinely a creative asset in this vault. */
const KNOWLEDGE_ALSO_EXTS = new Set(['.json'])

const MAX_TAGS = 12
const MAX_DESCRIPTION = 240

/** Guard rails. The asset root is a working directory: it contains generated
 *  dumps, archives, and self-referential symlinks (`知识库/资产库 -> ..`), so a
 *  naive recursive read can recurse forever or buffer gigabytes. */
const MAX_KNOWLEDGE_ROWS = 4000
const MAX_KNOWLEDGE_FILE_BYTES = 512 * 1024
const MAX_KNOWLEDGE_WALK_DEPTH = 6

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

/** @param {string} md */
function titleFromMarkdown(md) {
  const match = /^#\s+(.+)$/m.exec(md)
  return match ? clamp(match[1], 80) : ''
}

/** First prose paragraph of a markdown body, used as the row description. @param {string} md */
function descriptionFromMarkdown(md) {
  const paragraph = []
  for (const line of md.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      if (paragraph.length > 0) break
      continue
    }
    if (trimmed.startsWith('|') || trimmed.startsWith('-') || trimmed.startsWith('---')) continue
    paragraph.push(trimmed)
    if (paragraph.join(' ').length > MAX_DESCRIPTION) break
  }
  return clamp(paragraph.join(' '), MAX_DESCRIPTION)
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
 * Build one normalized catalog row.
 *
 * @param {{ assetsRoot: string }} ctx
 * @param {{
 *   key: string, category: string, subCategory?: string, name: string,
 *   description?: string, tags?: unknown[],
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

  return {
    id,
    category: spec.category,
    sub_category: sub,
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
// knowledge — prompt packs, knowledge notes, short-drama shot rules
// ---------------------------------------------------------------------------

/**
 * Recursive directory walk with hard bounds.
 *
 * A directory whose real path is an ancestor of the walk root is skipped: the
 * asset root contains self-referential links (`知识库/资产库 -> ..`) which would
 * otherwise re-enter the tree — and re-read every file — once per level. Depth,
 * visited directories, and a row budget are capped so a pathological tree
 * degrades into a reported truncation instead of an OOM.
 *
 * @param {string} dir
 * @param {{ visit: (file: string, name: string, depth: number) => void, maxDepth?: number, maxRows?: number }} opts
 * @returns {{ rows: number, truncated: boolean }}
 */
function walkFiles(dir, opts) {
  const maxDepth = opts.maxDepth ?? MAX_KNOWLEDGE_WALK_DEPTH
  const maxRows = opts.maxRows ?? MAX_KNOWLEDGE_ROWS
  const visited = new Set()
  let rows = 0

  let rootReal = dir
  try {
    rootReal = realpathSync(dir)
  } catch {
    return { rows: 0, truncated: false }
  }
  const rootAncestors = ancestorsAbove(rootReal)

  /** @returns {boolean} whether walking may continue */
  const step = (current, depth) => {
    if (depth > maxDepth) return true
    let real
    try {
      real = realpathSync(current)
    } catch {
      return true
    }
    // Re-entering an ancestor of the root (or the root itself) is a cycle.
    if (rootAncestors.has(real) || visited.has(real)) return true
    visited.add(real)

    for (const entry of listDirSafe(current)) {
      const name = entry.name
      if (name.startsWith('.') || EXCLUDED_DIR_NAMES.has(name) || KNOWLEDGE_SKIP_DIRS.has(name)) continue
      const abs = join(current, name)
      const directory = entry.isSymbolicLink() ? isDir(abs) : entry.isDirectory()
      if (directory) {
        if (!step(abs, depth + 1)) return false
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      opts.visit(abs, name, depth)
      rows += 1
      if (rows >= maxRows) return false
    }
    return true
  }

  const completed = step(dir, 0)
  return { rows, truncated: !completed }
}

/**
 * Every ancestor directory strictly above `abs`.
 *
 * Walking into one of these means the walk has climbed back above its own root,
 * which is exactly what the self-referential `知识库/资产库 -> ..` link does.
 * `abs` itself is deliberately excluded: it is the walk root, not a cycle.
 * @param {string} abs
 */
function ancestorsAbove(abs) {
  const out = new Set()
  let current = dirname(abs)
  for (;;) {
    out.add(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return out
}

function collectKnowledge(ctx, add) {
  const { assetsRoot } = ctx
  const seen = new Set()
  let skippedForSize = 0
  let emitting = true

  /** @param {string} abs @param {string} fileName @param {string} pack @param {string} group */
  const emit = (abs, fileName, pack, group) => {
    if (!emitting) return
    if (seen.size >= MAX_KNOWLEDGE_ROWS) {
      emitting = false
      return
    }
    if (!isFile(abs)) return
    const ext = extname(fileName).toLowerCase()
    // Markdown and plain text are the creative assets here; JSON only counts
    // when it is a prompt/agent definition rather than a config or a dump.
    if (!DOC_EXTS.has(ext) && !(KNOWLEDGE_ALSO_EXTS.has(ext) && /prompt|agent|skill/i.test(fileName))) return

    const size = fileBytes(abs)
    if (size > MAX_KNOWLEDGE_FILE_BYTES) {
      skippedForSize += 1
      return
    }

    let body = ''
    try {
      body = readFileSync(abs, 'utf8')
    } catch {
      return
    }
    if (text(body).length < 40) return

    const stem = fileName.slice(0, fileName.length - extname(fileName).length)
    const title = ext === '.md' ? titleFromMarkdown(body) : ''
    const key = `${group}/${relTo(assetsRoot, abs)}`
    const id = `knowledge-${group}-${shortId(key)}`
    if (seen.has(id)) return
    seen.add(id)

    const displayName = clamp(title || stem, 80)
    add(makeAsset(ctx, {
      key,
      category: 'knowledge',
      subCategory: group,
      name: displayName,
      description: descriptionFromMarkdown(body) || `${pack} · ${displayName}`,
      tags: [pack, group === 'storyboard' ? '短剧拆镜' : group === 'note' ? '知识笔记' : '脚本提示词'],
      meta: {
        source: 'local-file',
        source_path: relTo(assetsRoot, abs),
        ext,
        pack,
      },
    }))
    // The full body is released as soon as the row is built: the catalog keeps
    // only the derived description, so 2 600 reference documents stay a few
    // hundred kilobytes instead of repeating their own text into every page.
    body = ''
  }

  const promptsRoot = join(assetsRoot, 'prompts')
  for (const entry of listDirSafe(promptsRoot)) {
    if (!emitting) break
    const name = entry.name
    if (name.startsWith('.') || EXCLUDED_DIR_NAMES.has(name)) continue
    const abs = join(promptsRoot, name)
    if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(abs))) {
      walkFiles(abs, { visit: (file, fileName) => emit(file, fileName, name, 'prompt') })
    } else if (isFile(abs)) {
      emit(abs, name, 'prompts', 'prompt')
    }
  }

  const knowledgeRoot = join(assetsRoot, '知识库')
  walkFiles(knowledgeRoot, {
    visit: (file, fileName) => {
      const rel = relTo(assetsRoot, file)
      if (rel.includes('/memory/') || rel.includes('个人资料/')) return
      if (fileName === 'CLAUDE.md' || fileName === 'claude.md') return
      emit(file, fileName, '知识库', 'note')
    },
  })

  // Short-drama deconstruction rules ship as skill references rather than as a
  // standalone prompt folder, so they are read from the skills shelf.
  const skillsRoot = join(assetsRoot, 'skills')
  for (const entry of listDirSafe(skillsRoot)) {
    if (!emitting) break
    const name = entry.name
    if (!/drama/i.test(name) || EXCLUDED_DIR_NAMES.has(name)) continue
    const references = join(skillsRoot, name, 'references')
    if (!isDir(references)) continue
    for (const ref of listDirSafe(references)) {
      if (!ref.isFile() || extname(ref.name).toLowerCase() !== '.md') continue
      emit(join(references, ref.name), ref.name, name, 'storyboard')
    }
  }

  if (skippedForSize > 0) log(`  · knowledge: skipped ${skippedForSize} file(s) over ${MAX_KNOWLEDGE_FILE_BYTES} bytes`)
  if (seen.size >= MAX_KNOWLEDGE_ROWS) log(`  · knowledge: truncated at ${MAX_KNOWLEDGE_ROWS} rows (raise MAX_KNOWLEDGE_ROWS to include more)`)
}

// ---------------------------------------------------------------------------
// character — 329 real digital humans + virtual influencer archive
// ---------------------------------------------------------------------------

function collectCharacter(ctx, add) {
  const { assetsRoot } = ctx
  const source = join(assetsRoot, '素材库', 'gxgen-data', 'character-library', 'pippit-local-avatars-source')

  for (const entry of listDirSafe(source)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(source, entry.name)
    const meta = readJsonSafe(join(dir, 'metadata.json')) ?? {}
    const rawName = text(meta.name) || entry.name.replace(/_/g, '-')
    const metaTags = Array.isArray(meta.tags) ? meta.tags : []
    add(makeAsset(ctx, {
      key: `pippit/${entry.name}`,
      category: 'character',
      subCategory: 'digital-human',
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
      },
    }))
  }

  const influencer = join(assetsRoot, '素材库', 'AI 网红')
  /** @type {[string, string][]} */
  const groups = [
    ['御用模特', '御用模特'],
    ['高清', '高清'],
    ['图生图', '图生图'],
    ['未命名文件夹', '未分类'],
  ]
  for (const [dirName, label] of groups) {
    const dir = join(influencer, dirName)
    if (!isDir(dir)) continue
    for (const file of listDirSafe(dir)) {
      if (!file.isFile() || file.name.startsWith('.')) continue
      const abs = join(dir, file.name)
      const ext = extname(file.name).toLowerCase()
      if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue
      const isImage = IMAGE_EXTS.has(ext)
      add(makeAsset(ctx, {
        key: `influencer/${dirName}/${file.name}`,
        category: 'character',
        subCategory: 'virtual-influencer',
        name: file.name.slice(0, file.name.length - extname(file.name).length),
        description: `AI 网红档案 · ${label}`,
        tags: ['虚拟红人', label],
        localMedia: abs,
        localCover: isImage ? abs : '',
        meta: { source: 'AI 网红', source_path: relTo(assetsRoot, abs) },
      }))
    }
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
 * @param {{ category: string, subCategory: string, tag: string, fallbackDesc: string }} opts
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
    add(makeAsset(ctx, {
      key: `${dirName}/${text(row.id)}`,
      category: opts.category,
      subCategory: opts.subCategory,
      name: title,
      description: text(row.metadata?.description) || opts.fallbackDesc,
      tags: [opts.tag, ...(Array.isArray(row.tags) ? row.tags : [])],
      localMedia,
      remoteMedia: text(row.media_url),
      localCover,
      remoteCover: text(row.metadata?.poster_url),
      meta: {
        source: text(row.source_platform) || 'gxgen',
        source_url: text(row.metadata?.source_url),
        value: text(row.metadata?.value),
        category_label: text(row.metadata?.category),
      },
    }))
  }
}

function collectScene(ctx, add) {
  collectElementIndex(ctx, '场景氛围', add, {
    category: 'scene',
    subCategory: 'ambience',
    tag: '场景氛围',
    fallbackDesc: '高清动态场景氛围',
  })
}

function collectProp(ctx, add) {
  const gxgen = join(ctx.assetsRoot, '素材库', 'gxgen-data')
  const memeRoot = join(gxgen, 'element-library', 'video', 'green-screen-meme')
  const rows = readJsonSafe(join(memeRoot, 'fastlane-green-screen-meme-library.json'))
  if (Array.isArray(rows)) {
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
        category: 'prop',
        subCategory: 'green-screen',
        name: `绿幕贴片 ${id.slice(0, 6)}`,
        description: '绿幕动态道具贴片，可直接抠像叠加到成片中',
        tags: ['绿幕道具', '动态贴片'],
        localMedia: localVideo,
        remoteMedia: remote,
        localCover: thumb,
        remoteCover: text(row.thumbUrl),
        meta: { source: text(row.sourcePlatform) || 'fastlane', source_id: id },
      }))
    }
  }

  collectElementIndex(ctx, 'hook', add, {
    category: 'prop',
    subCategory: 'hook-video',
    tag: '商品特写',
    fallbackDesc: '商品特写互动视频钩子',
  })
}

/** Flatten the differently-shaped style-preset JSONs into rows. */
function collectStyle(ctx, add) {
  const styleDir = join(ctx.assetsRoot, '素材库', 'gxgen-data', 'style-library')
  /** @type {[string, string][]} */
  const sources = [
    ['awesome-gpt-image-2.json', '生图预设'],
    ['gpt-image-2-style-presets.json', '生图预设'],
    ['gpt-image-2-style-presets-quality.json', '精品预设'],
    ['new-style-presets.json', '新款预设'],
    ['xiaoyunque-novel-style-library.json', '小说推文'],
    ['pippit-visual-styles.json', 'Pippit 视觉'],
  ]

  for (const [fileName, pack] of sources) {
    const parsed = readJsonSafe(join(styleDir, fileName))
    if (parsed === null) continue
    const rows = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.styles) ? parsed.styles : []))
    const localMediaDir = join(styleDir, 'media', fileName.replace(/\.json$/, ''))

    for (const row of rows) {
      const title = text(row.title) || text(row.title_zh)
      if (!title) continue
      const rawLocal = text(row.local_media_path)
      const localMedia = rawLocal ? join(ctx.assetsRoot, '素材库', 'gxgen-data', rawLocal) : ''
      const cover = isFile(localMedia) && bucketOf(extOf(localMedia)) === 'image'
        ? localMedia
        : join(localMediaDir, `${slugify(title)}.webp`)
      add(makeAsset(ctx, {
        key: `style/${fileName}/${text(row.source_id) || text(row.id) || title}`,
        category: 'style',
        subCategory: 'image-preset',
        name: title,
        description: text(row.description)
          || clamp(text(row.prompt_text), MAX_DESCRIPTION)
          || title,
        tags: [pack, text(row.category), text(row.category_zh)],
        localCover: cover,
        remoteCover: text(row.cover_url) || text(row.remotePosterUrl),
        meta: {
          source: 'style-library',
          source_file: fileName,
          pack,
          prompt_text: clamp(text(row.prompt_text), 400),
          author: text(row.author),
          source_url: text(row.source_url),
        },
      }))
    }
  }

  collectElementIndex(ctx, '视频风格', add, {
    category: 'style',
    subCategory: 'video-tone',
    tag: '视频调性',
    fallbackDesc: '视频调性预设',
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

  // Loose files at the audio root, plus named single-file samples. Every claimed
  // file name is recorded so the fallback pass below cannot re-file the same
  // audio as a sound effect.
  /** @type {[string, string, string, string][]} file -> [sub_category, tag, description] */
  const loose = [
    ['播客女.MP3', 'voiceover', '播客', '实录音频样本 · 播客女声'],
    ['播客男.MP3', 'voiceover', '播客', '实录音频样本 · 播客男声'],
    ['TK 口播女.mp3', 'voiceover', '口播', '实录音频样本 · 口播女声'],
    ['口播博主声音克隆.WAV', 'voiceover', '音频克隆', '声音克隆样本'],
  ]
  const claimed = new Set()
  for (const [fileName, subCategory, tag, description] of loose) {
    const abs = join(audioRoot, fileName)
    if (!isFile(abs)) continue
    claimed.add(fileName)
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

  /** Silence beds are authored fillers for transitions, not recorded effects. */
  const SILENT_BED = /无声|silent|no[-_ ]?audio/i

  for (const file of listDirSafe(audioRoot)) {
    if (!file.isFile() || file.name.startsWith('.')) continue
    if (claimed.has(file.name)) continue
    const ext = extname(file.name).toLowerCase()
    if (bucketOf(ext) !== 'audio') continue
    const abs = join(audioRoot, file.name)
    const isSilentBed = SILENT_BED.test(file.name)
    add(makeAsset(ctx, {
      key: `sfx/${file.name}`,
      category: 'audio',
      subCategory: 'sfx',
      name: file.name.slice(0, file.name.length - extname(file.name).length),
      description: isSilentBed
        ? '静音垫底素材，用于转场与停顿留白'
        : '音效素材（冲击 / 转场 / 环境音）',
      tags: isSilentBed ? ['静音垫底', '转场'] : ['音效'],
      localMedia: abs,
      meta: { source: '音频', source_path: relTo(ctx.assetsRoot, abs) },
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
    id: 'knowledge',
    zh: '知识包',
    en: 'Knowledge',
    subCategories: [
      { id: 'prompt', zh: '脚本提示词', en: 'Prompt Packs' },
      { id: 'note', zh: '知识笔记', en: 'Notes' },
      { id: 'storyboard', zh: '短剧拆镜', en: 'Storyboard' },
    ],
    collect: collectKnowledge,
  },
  {
    id: 'character',
    zh: '角色',
    en: 'Characters',
    subCategories: [
      { id: 'digital-human', zh: '实景数字人', en: 'Real Digital Humans' },
      { id: 'virtual-influencer', zh: '虚拟红人', en: 'Virtual Influencers' },
    ],
    collect: collectCharacter,
  },
  {
    id: 'scene',
    zh: '场景',
    en: 'Scenes',
    subCategories: [{ id: 'ambience', zh: '场景氛围', en: 'Ambience' }],
    collect: collectScene,
  },
  {
    id: 'prop',
    zh: '道具',
    en: 'Props',
    subCategories: [
      { id: 'green-screen', zh: '绿幕贴片', en: 'Green Screen' },
      { id: 'hook-video', zh: '商品特写', en: 'Product Hook' },
    ],
    collect: collectProp,
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
      const total = items.filter((row) => row.sub_category === sub.id).length
      return {
        id: sub.id,
        zh: sub.zh,
        en: sub.en,
        total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      }
    })

    categoryMeta.push({
      id: spec.id,
      zh: spec.zh,
      en: spec.en,
      total: items.length,
      pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
      sub_categories: subCategories,
    })
    log(`[cloud-catalog] ${spec.id.padEnd(10)} ${String(items.length).padStart(5)} rows · ${categoryMeta[categoryMeta.length - 1].pages} page(s)`)
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
    const entry = {
      id: row.id,
      category: row.category,
      sub_category: row.sub_category,
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
  for (const spec of CATEGORIES) {
    const items = byCategory.get(spec.id) ?? []
    for (const page of pageSpecs(items, spec.id)) {
      writeJson(outDir, page.relPath, page.body)
      pageFiles += 1
    }
    for (const sub of spec.subCategories) {
      const subItems = items.filter((row) => row.sub_category === sub.id)
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
