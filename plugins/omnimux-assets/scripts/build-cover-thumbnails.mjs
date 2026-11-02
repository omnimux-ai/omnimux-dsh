#!/usr/bin/env node
/**
 * Build the cover thumbnails the cloud asset shelf renders in its cards.
 *
 * ## Why this exists
 *
 * The catalog's `cover_url` points at the *original* upload. For most rows that
 * is fine — 场景 / 道具 / 素材 covers are 7–180 KB JPEGs — but the 111 rows that
 * ship a PNG portrait are **2.4–5.6 MB each** at 1152×2048. The catalog pages are
 * ordered by id, and those 111 ids all sort ahead of the rest, so the very first
 * 角色 page is 100% PNG and costs **79.1 MB** for 24 cards. That is the whole
 * reason the shelf paints in from the top like a curtain.
 *
 * The CDN cannot help: it serves no image-resizing service (`/cdn-cgi/image/...`
 * answers 404, and `?w=520` still returns the full 2.9 MB object). So the only
 * way to shrink what a card downloads is to produce a smaller object and ship its
 * key — which is exactly what this script does.
 *
 * ## Output contract
 *
 *   <out>/<object key>              one WebP per row, 640px wide
 *   <out>/thumb-manifest.json       { schema, width, quality, generatedAt, rows[] }
 *
 * `thumb-manifest.json` is the input the catalog builder consumes
 * (`--thumb-manifest=<path>`): it maps a catalog row id to the R2 object key the
 * thumbnail must be uploaded under. The builder turns that key into
 * `thumb_url` on the row, and the client prefers it over `cover_url`.
 *
 * Uploading the produced objects to the bucket is an operator step and is NOT
 * performed here — see docs/contracts/cloud-asset-cdn-keys.md for the key rules.
 *
 * ## Determinism
 *
 * Identical inputs produce byte-identical thumbnails and a manifest that differs
 * only in `generatedAt` (overridable via `--generated-at=<iso>`). Rows are sorted
 * by id, and an existing thumbnail whose bytes already match is left untouched, so
 * a re-run is a no-op and a partial run resumes.
 *
 * ## Usage (from the plugin directory)
 *
 *   node scripts/build-cover-thumbnails.mjs --out=/tmp/thumbs
 *   node scripts/build-cover-thumbnails.mjs --out=/tmp/thumbs --all
 *   node scripts/build-cover-thumbnails.mjs --out=/tmp/thumbs --limit=5 --dry-run
 *   node scripts/build-cover-thumbnails.mjs --out=/tmp/thumbs --ids=ids.txt
 *
 * `--ids=<file>` names rows explicitly (one id per line, `#` comments allowed) and
 * outranks the format filter, so a few oversized JPEG covers can be fixed without
 * re-encoding the rest of the catalog.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_CATALOG_DIR = join(PLUGIN_ROOT, 'cloud-catalog')

/** Card face width in CSS px is ≤320; at 2× DPR that is 640 physical px. */
export const THUMB_WIDTH = 640
/** Measured on the real 1152×2048 portrait: 69 KB at this setting. */
export const THUMB_QUALITY = 78
/** The manifest's own schema version, so a future field can be added safely. */
export const THUMB_MANIFEST_SCHEMA = 1
export const THUMB_MANIFEST_NAME = 'thumb-manifest.json'

/**
 * Cover formats worth re-encoding by default.
 *
 * Only PNG is on by default: it is the one format whose covers are megabytes.
 * JPEG covers are 7–430 KB and WebP already wins on nothing there, while a
 * blanket re-encode would churn 4 675 objects for a rounding-error saving.
 */
export const DEFAULT_REENCODE_EXTS = new Set(['.png'])

/**
 * Object key a row's thumbnail is published under.
 *
 * Derived from the row id, not from the cover's file name: the id is stable and
 * already URL-safe, while the original name carries spaces, parentheses and CJK
 * that every uploader would have to re-encode consistently. Keys live under a
 * dedicated `thumbs/` prefix so a bucket listing can be scoped and pruned.
 * @param {string} rowId
 * @returns {string}
 */
export function thumbObjectKey(rowId) {
  const id = String(rowId ?? '').trim()
  if (id === '') return ''
  // A key is a bucket path segment: refuse anything that could climb out of the
  // prefix rather than sanitizing it into something that silently collides.
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return ''
  return `thumbs/${id}.webp`
}

/**
 * Whether a catalog row should get a thumbnail.
 *
 * A row with no cover has nothing to shrink. A row whose cover is a legacy
 * `file:` locator has no remote object at all, so there is nothing to pair a
 * thumbnail with.
 *
 * `ids` names rows explicitly, so it outranks the format filter: a caller who
 * lists a JPEG row wants that JPEG row handled, even though JPEG is not in the
 * default extension set. Naming rows is how a handful of oversized covers get
 * fixed without re-encoding the other four thousand.
 * @param {any} row
 * @param {{ exts?: Set<string>, all?: boolean, ids?: Set<string> }} [options]
 */
export function needsThumbnail(row, options = {}) {
  const exts = options.exts ?? DEFAULT_REENCODE_EXTS
  const cover = String(row?.cover_url ?? '')
  if (cover === '' || cover.startsWith('file:')) return false
  const ids = options.ids
  if (ids instanceof Set && ids.size > 0) return ids.has(String(row?.id ?? ''))
  if (options.all === true) return true
  return exts.has(extname(cover).toLowerCase())
}

/**
 * The rows this run will encode, in id order.
 *
 * Pure: it reads the catalog rows it is given and nothing else, so the selection
 * rule can be asserted without a filesystem or a network.
 * @param {any[]} rows
 * @param {{ exts?: Set<string>, all?: boolean, ids?: Set<string>, limit?: number }} [options]
 * @returns {{ id: string, coverUrl: string, key: string }[]}
 */
export function planThumbs(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const plan = []
  const seen = new Set()
  for (const row of list) {
    if (!needsThumbnail(row, options)) continue
    const id = String(row?.id ?? '')
    const key = thumbObjectKey(id)
    if (key === '' || seen.has(id)) continue
    seen.add(id)
    plan.push({ id, coverUrl: String(row.cover_url), key })
  }
  plan.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const limit = Number(options.limit)
  if (Number.isFinite(limit) && limit > 0) return plan.slice(0, limit)
  return plan
}

/**
 * The manifest a catalog build consumes.
 *
 * `rows` carries only what the builder needs — the id it keys on and the key it
 * prefixes with the CDN base — plus the measured size so a reviewer can see the
 * payload budget without re-downloading anything.
 * @param {{ rows: { id: string, key: string, bytes: number, width: number }[],
 *   generatedAt: string, all?: boolean }} spec
 */
export function buildManifest(spec) {
  const rows = Array.isArray(spec.rows) ? spec.rows.slice() : []
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    schema: THUMB_MANIFEST_SCHEMA,
    width: THUMB_WIDTH,
    quality: THUMB_QUALITY,
    format: 'webp',
    scope: spec.all === true ? 'all' : 'png',
    generatedAt: spec.generatedAt,
    total: rows.length,
    totalBytes: rows.reduce((sum, row) => sum + (Number(row.bytes) || 0), 0),
    rows,
  }
}

/**
 * Resolve `sharp` from wherever this checkout actually has it.
 *
 * The assets plugin deliberately does not declare `sharp`: it is a build-time
 * concern, and the repo already installs it for the hub. Resolution is attempted
 * from a few known roots and then reported as one clear error — a build that
 * cannot encode must fail loudly, never emit an empty manifest that reads like
 * "no row needed a thumbnail".
 * @param {string} [pluginRoot]
 */
export function loadSharp(pluginRoot = PLUGIN_ROOT) {
  const requireFrom = createRequire(join(pluginRoot, 'package.json'))
  const candidates = [
    pluginRoot,
    join(pluginRoot, '..', 'omnimux'),
    join(pluginRoot, '..', '..'),
  ]
  for (const root of candidates) {
    try {
      return requireFrom(requireFrom.resolve('sharp', { paths: [root] }))
    } catch {
      // try the next root
    }
  }
  throw new Error(
    'sharp is required to build cover thumbnails but could not be resolved.\n'
    + `Tried: ${candidates.join(', ')}\n`
    + 'Install workspace dependencies first (pnpm install), then re-run.',
  )
}

/**
 * Encode one cover into a WebP buffer at the card's own pixel width.
 * @param {any} sharp
 * @param {Buffer} input
 */
export async function encodeThumb(sharp, input) {
  return sharp(input)
    // `withoutEnlargement` keeps a narrow source at its own width: upscaling a
    // 400px cover to 640 would add bytes and no detail.
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()
}

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

/** @param {string} file */
function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Read a row-id list: one id per line, blank lines and `#` comments ignored.
 *
 * The file is how a caller names a handful of rows without `--all`, which would
 * re-encode every cover in the catalog. A missing file throws rather than
 * silently selecting nothing: an empty selection would look like a successful
 * no-op run and hide the typo.
 * @param {string} file
 * @returns {Set<string>}
 */
export function readIdList(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`--ids file is unreadable: ${file}`)
  }
  const ids = new Set()
  for (const line of text.split('\n')) {
    const value = line.trim()
    if (value === '' || value.startsWith('#')) continue
    ids.add(value)
  }
  return ids
}

/** @param {string} file @param {Buffer} data */
function writeFileAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, data)
  // rename keeps a concurrent reader from seeing a half-written object.
  const { renameSync } = createRequire(import.meta.url)('node:fs')
  renameSync(tmp, file)
}

/** @param {string} file */
function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/**
 * Fetch one cover's bytes. The catalog is cloud-only, so this is always HTTPS.
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 */
async function fetchCover(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * @param {{
 *   catalogDir?: string,
 *   outDir: string,
 *   all?: boolean,
 *   limit?: number,
 *   dryRun?: boolean,
 *   generatedAt?: string,
 *   fetchImpl?: typeof fetch,
 *   sharp?: any,
 *   log?: (line: string) => void,
 * }} options
 */
export async function buildThumbnails(options) {
  const catalogDir = options.catalogDir ?? DEFAULT_CATALOG_DIR
  const outDir = resolve(options.outDir)
  const log = options.log ?? ((line) => { process.stdout.write(`${line}\n`) })
  const index = readJsonFile(join(catalogDir, 'index.json'))
  if (!Array.isArray(index)) {
    throw new Error(`catalog index is missing or unreadable: ${join(catalogDir, 'index.json')}`)
  }

  const plan = planThumbs(index, { all: options.all === true, ids: options.ids, limit: options.limit })
  const scope = options.ids instanceof Set && options.ids.size > 0
    ? `${options.ids.size} named row(s)`
    : options.all === true ? 'all covers' : 'png covers'
  log(`[thumbs] ${plan.length} row(s) selected (${scope})`)

  if (options.dryRun === true) {
    for (const row of plan) log(`[thumbs] would encode ${row.id} <- ${row.coverUrl}`)
    return { plan, rows: [], manifest: null, written: 0, skipped: 0 }
  }

  const sharp = options.sharp ?? loadSharp()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  /** @type {{ id: string, key: string, bytes: number, width: number }[]} */
  const rows = []
  let written = 0
  let skipped = 0

  for (const item of plan) {
    const target = join(outDir, item.key)
    let input
    try {
      input = await fetchCover(item.coverUrl, fetchImpl)
    } catch (error) {
      // One unreachable cover must not abort the run: the row simply ships
      // without a thumbnail and the client falls back to its original.
      log(`[thumbs] SKIP ${item.id}: cover fetch failed (${error instanceof Error ? error.message : String(error)})`)
      continue
    }
    let encoded
    try {
      encoded = await encodeThumb(sharp, input)
    } catch (error) {
      log(`[thumbs] SKIP ${item.id}: encode failed (${error instanceof Error ? error.message : String(error)})`)
      continue
    }

    if (existsSync(target) && statSync(target).size === encoded.length) {
      // Same byte length is not proof, but a re-run over an unchanged catalog
      // produces identical output; compare content before trusting it.
      const existing = sha256Of(target)
      const incoming = createHash('sha256').update(encoded).digest('hex')
      if (existing === incoming) {
        skipped += 1
        rows.push({ id: item.id, key: item.key, bytes: encoded.length, width: THUMB_WIDTH })
        continue
      }
    }

    writeFileAtomic(target, encoded)
    written += 1
    rows.push({ id: item.id, key: item.key, bytes: encoded.length, width: THUMB_WIDTH })
  }

  const manifest = buildManifest({
    rows,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    all: options.all === true,
  })
  writeFileAtomic(join(outDir, THUMB_MANIFEST_NAME), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))

  log(`[thumbs] wrote ${written}, skipped ${skipped}, total ${(manifest.totalBytes / 1024 / 1024).toFixed(2)} MB`)
  log(`[thumbs] manifest: ${join(outDir, THUMB_MANIFEST_NAME)}`)
  return { plan, rows, manifest, written, skipped }
}

/** @param {string[]} argv */
async function main(argv) {
  const args = parseArgs(argv)
  if (typeof args.out !== 'string' || args.out === '') {
    throw new Error('--out=<dir> is required: the thumbnails are published from there')
  }
  await buildThumbnails({
    catalogDir: typeof args.catalog === 'string' ? resolve(args.catalog) : DEFAULT_CATALOG_DIR,
    outDir: args.out,
    all: args.all === true,
    ids: typeof args.ids === 'string' ? readIdList(resolve(args.ids)) : undefined,
    limit: typeof args.limit === 'string' ? Number(args.limit) : undefined,
    dryRun: args['dry-run'] === true,
    generatedAt: typeof args['generated-at'] === 'string' ? args['generated-at'] : undefined,
  })
}

// Only run when invoked as a script; importing the module for tests must not
// touch the network or the filesystem.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
