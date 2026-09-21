#!/usr/bin/env node

/**
 * Rewrite cloud inspiration `category` values onto the official 18-industry
 * vocabulary (Issue #2507). Default is dry-run: list + counts, no PATCH.
 *
 * Usage:
 *   node scripts/rewrite-inspiration-categories.mjs
 *   node scripts/rewrite-inspiration-categories.mjs --apply --base http://127.0.0.1:45120
 */

import { pathToFileURL } from 'node:url'
import {
  isOfficialCategoryId,
  normalizeCategory,
} from '../plugins/omnimux-inspiration/src/gxgen-category-map.js'

const DEFAULT_BASE = 'http://127.0.0.1:45120'
const DEFAULT_PAGE_SIZE = 100
const TIMEOUT_MS = 15_000

class SystemError extends Error {}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeBase(raw, flag) {
  let url
  try {
    url = new URL(String(raw || ''))
  } catch {
    throw new Error(`${flag} must be an absolute HTTP URL`)
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${flag} must be loopback HTTP without credentials, query, or fragment`)
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${flag} must target 127.0.0.1 or localhost`)
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

function hostPath(base, path) {
  return new URL(path, `${base}/`).toString()
}

function dataOf(body, label) {
  if (!body || typeof body !== 'object' || body.success === false) {
    throw new Error(`${label} returned an invalid response`)
  }
  return body.data
}

/**
 * @param {unknown} raw
 * @param {unknown} tags
 * @returns {string}
 */
export function plannedCategory(raw, tags) {
  return normalizeCategory(raw, { tags })
}

/**
 * @param {{ id?: unknown, category?: unknown, tags?: unknown }} item
 * @returns {{ id: string, raw: string, next: string, skip: boolean }}
 */
export function classifyItem(item) {
  const id = String(item?.id ?? '').trim()
  if (!id) throw new Error('list item is missing id')
  const raw = item?.category == null ? '' : String(item.category)
  const next = plannedCategory(raw, item?.tags)
  return { id, raw, next, skip: isOfficialCategoryId(raw) && raw.trim() === next }
}

/**
 * @param {Array<{ raw: string, next: string, skip: boolean }>} rows
 * @returns {Record<string, number>}
 */
export function countMappings(rows) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const row of rows) {
    const key = `${row.raw || '(empty)'} → ${row.next}`
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

async function jsonRequest(url, init, deps, label) {
  const response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

/**
 * @param {string} base
 * @param {{ fetch: typeof fetch }} deps
 * @param {{ pageSize?: number }} [opts]
 */
export async function listAllInspirations(base, deps, opts = {}) {
  const pageSize = Math.max(1, Number(opts.pageSize) || DEFAULT_PAGE_SIZE)
  /** @type {Array<Record<string, unknown>>} */
  const items = []
  let page = 1
  let total = Infinity
  while (items.length < total) {
    const url = hostPath(base, `/omnimux/inspiration?page=${page}&page_size=${pageSize}`)
    const body = await jsonRequest(url, { method: 'GET' }, deps, `GET inspiration page ${page}`)
    const data = dataOf(body, `GET inspiration page ${page}`)
    const batch = Array.isArray(data?.items) ? data.items : []
    const reported = Number(data?.total)
    if (Number.isFinite(reported) && reported >= 0) total = reported
    items.push(...batch)
    if (batch.length < pageSize) break
    page += 1
    if (page > 200) throw new SystemError('refusing to walk more than 200 catalogue pages')
  }
  return items
}

/**
 * @param {string} base
 * @param {string} id
 * @param {string} category
 * @param {{ fetch: typeof fetch }} deps
 */
export async function patchCategory(base, id, category, deps) {
  const body = await jsonRequest(
    hostPath(base, `/omnimux/inspiration/${encodeURIComponent(id)}`),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category }),
    },
    deps,
    `PATCH inspiration ${id}`,
  )
  return dataOf(body, `PATCH inspiration ${id}`)
}

const defaultDeps = { fetch: globalThis.fetch }

/**
 * @param {{ base?: string, apply?: boolean, pageSize?: number }} options
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function rewriteInspirationCategories(options = {}, deps = defaultDeps) {
  const base = normalizeBase(options.base || DEFAULT_BASE, '--base')
  const apply = Boolean(options.apply)
  const fetchImpl = deps.fetch || globalThis.fetch
  const items = await listAllInspirations(base, { fetch: fetchImpl }, { pageSize: options.pageSize })
  const classified = items.map((item) => classifyItem(item))
  const mappings = countMappings(classified)
  const toPatch = classified.filter((row) => !row.skip)
  const skipped = classified.length - toPatch.length
  /** @type {Array<{ id: string, raw: string, next: string }>} */
  const patched = []
  if (apply) {
    for (const row of toPatch) {
      await patchCategory(base, row.id, row.next, { fetch: fetchImpl })
      patched.push({ id: row.id, raw: row.raw, next: row.next })
    }
  }
  return {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    base,
    total: classified.length,
    skipped,
    pending: toPatch.length,
    patched: patched.length,
    mappings,
    changes: toPatch.map((row) => ({ id: row.id, raw: row.raw, next: row.next })),
  }
}

function parseArgs(argv) {
  let apply = false
  let base = DEFAULT_BASE
  let pageSize
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--apply') {
      apply = true
      continue
    }
    if (flag === '--base') {
      if (argv[index + 1] == null) throw new Error('--base requires a URL')
      base = argv[++index]
      continue
    }
    if (flag === '--page-size') {
      if (argv[index + 1] == null) throw new Error('--page-size requires a positive integer')
      pageSize = Number(argv[++index])
      continue
    }
    throw new Error(`unknown argument: ${flag}`)
  }
  return { apply, base, pageSize }
}

export async function runCli(argv, deps = defaultDeps) {
  const parsed = parseArgs(argv)
  return rewriteInspirationCategories(parsed, deps)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((result) => {
    console.log(JSON.stringify({
      ok: result.ok,
      mode: result.mode,
      total: result.total,
      skipped: result.skipped,
      pending: result.pending,
      patched: result.patched,
      mappings: result.mappings,
    }, null, 2))
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: safeMessage(error) }))
    process.exitCode = 1
  })
}
