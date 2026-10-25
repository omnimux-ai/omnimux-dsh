#!/usr/bin/env node
/**
 * Generate the bundled gateway snapshot (P1a).
 *
 * Reads the gateway's *public* pricing endpoint — the same anonymous catalog the
 * hub will refresh from at runtime — normalizes it with the same pure function
 * the runtime uses, and writes the normalized snapshot into
 * `src/catalog/cloud/bundled/pricing.json`, which ships with the package so a
 * brand-new offline machine still has a complete catalog.
 *
 * This never calls a model API and never sends credentials.
 *
 * Usage:
 *   node plugins/omnimux/scripts/catalog-snapshot.mjs                 # refresh the bundled file
 *   node plugins/omnimux/scripts/catalog-snapshot.mjs --check         # validate the committed file only
 *   node plugins/omnimux/scripts/catalog-snapshot.mjs --check --baseline <ref>
 *                                                                     # also prove no on-sale model was dropped
 *   node plugins/omnimux/scripts/catalog-snapshot.mjs --url <url>     # override the endpoint
 *   node plugins/omnimux/scripts/catalog-snapshot.mjs --stdout        # print instead of writing
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isSnapshotEmpty, normalizePricingPayload, snapshotDigest } from '../src/catalog/cloud/snapshot.js'
import { BUNDLED_SNAPSHOT_FILENAME, defaultBundledDir, readBundledSnapshot } from '../src/catalog/cloud/bundled.js'
import { DISAPPEARANCE_LIMIT, DISAPPEARANCE_MIN_MODELS, disappearance } from '../src/catalog/cloud/refresh.js'
import { usableSnapshotModels } from '../src/catalog/cloud/view.js'

const DEFAULT_URL = 'https://api.omnimux.ai/api/pricing'
const TIMEOUT_MS = 20000
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { check: false, stdout: false, url: DEFAULT_URL, dir: defaultBundledDir(), baseline: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') options.check = true
    else if (arg === '--stdout') options.stdout = true
    else if (arg === '--url') options.url = String(argv[++index] ?? '')
    else if (arg === '--dir') options.dir = String(argv[++index] ?? '')
    else if (arg === '--baseline') options.baseline = String(argv[++index] ?? '')
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function usage() {
  return [
    'Usage: catalog-snapshot.mjs [--check] [--baseline <ref>] [--stdout] [--url <https url>] [--dir <path>]',
    '',
    '  --check      validate the committed bundled snapshot and exit (no network)',
    '  --baseline   with --check: also read the repository snapshot at <ref> from git and',
    '               refuse when an on-sale model it sold is missing from the checked file (#3763)',
    '  --stdout     print the normalized snapshot instead of writing it',
    '  --url        pricing endpoint (default ' + DEFAULT_URL + ')',
    '  --dir        directory holding ' + BUNDLED_SNAPSHOT_FILENAME,
  ].join('\n')
}

async function fetchPricing(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`http-${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read one revision of the repo's shipped bundled snapshot straight out of git.
 * Read-only: no network, no working-tree access, no writes.
 *
 * The baseline path is always the repository's own bundled file, even when
 * `--dir` points somewhere else: git only knows the repository path, and the
 * comparison of interest is "what does the committed file at <ref> sell".
 *
 * @param {string} ref
 * @returns {{ snapshot: object } | { issue: string }}
 */
function readBaselineSnapshot(ref) {
  const gitPath = relative(repoRoot, join(defaultBundledDir(), BUNDLED_SNAPSHOT_FILENAME)).split('\\').join('/')
  let text
  try {
    text = execFileSync('git', ['show', `${ref}:${gitPath}`], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (error) {
    return { issue: `${ref}:${gitPath} is not readable (${String(error?.message ?? error).split('\n')[0]})` }
  }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.models)) {
      return { issue: `${ref}:${gitPath} is not a snapshot object with a models array` }
    }
    return { snapshot: parsed }
  } catch (error) {
    return { issue: `${ref}:${gitPath} is not valid JSON (${String(error?.message ?? error)})` }
  }
}

/** @param {{ dir: string }} options */
function check(options) {
  const read = readBundledSnapshot(options.dir)
  if (!read.snapshot) {
    console.error(`❌ bundled snapshot unusable (${options.dir}): ${read.issue}`)
    process.exitCode = 1
    return
  }
  const snapshot = read.snapshot
  if (isSnapshotEmpty(snapshot)) {
    console.error('❌ bundled snapshot carries no membership information')
    process.exitCode = 1
    return
  }
  console.log(
    `✅ bundled snapshot ok: ${snapshot.models.length} models, source=${snapshot.source}, ` +
      `generatedAt=${snapshot.generatedAt ?? 'unknown'}, digest=${snapshotDigest(snapshot).slice(0, 12)}`,
  )
  const limitations = Array.isArray(snapshot.coverage?.limitations) ? snapshot.coverage.limitations : []
  if (limitations.length > 0) console.log(`   limitations: ${limitations.join(', ')}`)

  if (!options.baseline) return
  // Commit-time is stricter than the runtime ratio guard: a regenerated snapshot
  // must not silently stop selling a model the baseline sold. An unreadable
  // baseline is reported, not treated as a failure.
  const baseline = readBaselineSnapshot(options.baseline)
  if (!baseline.snapshot) {
    console.error(`⚠️  baseline not readable, drop check skipped: ${baseline.issue}`)
    return
  }
  const gone = disappearance(baseline.snapshot, snapshot)
  const baselineOnSale = usableSnapshotModels(baseline.snapshot)
  const onSale = usableSnapshotModels(snapshot)
  const dropped = [...baselineOnSale.keys()].filter((id) => !onSale.has(id))
  if (dropped.length > 0) {
    console.error(
      `❌ ${dropped.length} on-sale model(s) disappeared from the bundled snapshot vs ${options.baseline}: ` +
        `${dropped.join(', ')} (raw ids: ${gone.missing}/${gone.known})`,
    )
    process.exitCode = 1
    return
  }
  console.log(
    `   baseline ${options.baseline}: ${gone.known} raw models, ${baselineOnSale.size} on sale, 0 dropped`,
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (options.baseline && !options.check) {
    console.error('catalog-snapshot: --baseline only applies with --check; refusing to fetch and write')
    return 2
  }
  if (options.check) {
    check(options)
    return
  }

  const generatedAt = new Date().toISOString()
  const payload = await fetchPricing(options.url)
  const normalized = normalizePricingPayload(payload, { generatedAt })
  const snapshot = normalized.snapshot
  if (isSnapshotEmpty(snapshot)) {
    console.error(`❌ refusing to write: normalized snapshot has no membership information (${normalized.issues.map((i) => i.code).join(', ') || 'empty'})`)
    process.exitCode = 1
    return
  }

  const previous = readBundledSnapshot(options.dir)
  if (previous.snapshot) {
    const gone = disappearance(previous.snapshot, snapshot)
    if (gone.known >= DISAPPEARANCE_MIN_MODELS && gone.ratio > DISAPPEARANCE_LIMIT) {
      console.error(`❌ refusing to write: ${gone.missing}/${gone.known} models disappeared from the gateway response`)
      process.exitCode = 1
      return
    }
  }

  const body = `${JSON.stringify(snapshot, undefined, 2)}\n`
  if (options.stdout) {
    process.stdout.write(body)
    return
  }
  mkdirSync(options.dir, { recursive: true })
  const target = join(options.dir, BUNDLED_SNAPSHOT_FILENAME)
  const temporary = `${target}.tmp-${process.pid}`
  writeFileSync(temporary, body)
  renameSync(temporary, target)
  console.log(
    `✅ wrote ${target}: ${snapshot.models.length} models, ` +
      `${Object.keys(snapshot.groups?.ratio ?? {}).length} group ratios, digest=${snapshotDigest(snapshot).slice(0, 12)}`,
  )
  const limitations = Array.isArray(snapshot.coverage?.limitations) ? snapshot.coverage.limitations : []
  if (limitations.length > 0) console.log(`   limitations: ${limitations.join(', ')}`)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`❌ ${String(error?.message ?? error)}`)
    process.exitCode = 1
  })
}

export { parseArgs, check, fetchPricing, readBaselineSnapshot }
