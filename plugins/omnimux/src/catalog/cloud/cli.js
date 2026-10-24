/**
 * Testable core of `scripts/catalog-diff.mjs`.
 *
 * The script is a thin wrapper around `runCatalogDiff`, so the argument
 * handling, gateway loading and report rendering can be exercised without
 * spawning a child process.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { detectSnapshotSource, normalizeChannelBaseline, normalizePricingPayload } from './snapshot.js'
import { diffGatewayAgainstHub } from './diff.js'
import { diffReportDocument, formatDiffReport } from './report.js'

export const USAGE = [
  'usage: node plugins/omnimux/scripts/catalog-diff.mjs --gateway <dir|file> [--hub-catalog <file>] [--json] [--out <file>]',
  '',
  '  --gateway <dir>    gateway config baseline directory (channels.json/models.json/options.json)',
  '  --gateway <file>   single JSON document: /api/pricing payload or baseline bundle',
  '  --hub-catalog <f>  replay a captured buildModelCatalog() output instead of projecting this checkout',
  '  --json             emit the structured report document',
  '  --out <file>       write the report to a file instead of stdout',
].join('\n')

/** Flags that take a value; anything else starting with `--` is rejected. */
const VALUE_FLAGS = new Set(['gateway', 'hub-catalog', 'out'])

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') args.json = true
    else if (token === '--help' || token === '-h') args.help = true
    else if (token.startsWith('--')) {
      const name = token.slice(2)
      if (!VALUE_FLAGS.has(name)) throw new Error(`unknown flag: ${token}`)
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${token}`)
      args[name] = value
      index += 1
    } else {
      throw new Error(`unexpected argument: ${token}`)
    }
  }
  return args
}

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** @param {string} dir */
export function loadBaselineDirectory(dir) {
  return {
    channels: readJson(join(dir, 'channels.json')),
    models: readJson(join(dir, 'models.json')),
    options: readJson(join(dir, 'options.json')),
  }
}

/** @param {string} path */
export function loadGatewayView(path) {
  let document
  try {
    document = readJson(path)
  } catch {
    return { snapshot: null, issues: [{ code: 'gateway-input-unreadable', detail: path }], label: path }
  }
  const source = detectSnapshotSource(document)
  if (source === 'pricing') {
    const { snapshot, issues } = normalizePricingPayload(document)
    return { snapshot, issues, label: path }
  }
  if (source === 'channel-baseline') {
    const { snapshot, issues } = normalizeChannelBaseline(document)
    return { snapshot, issues, label: path }
  }
  return { snapshot: null, issues: [{ code: 'gateway-input-unrecognized', detail: path }], label: path }
}

/** @param {string} path */
export function loadGatewayViewIfDirectory(path) {
  let isDirectory = false
  try {
    isDirectory = statSync(path).isDirectory()
  } catch (error) {
    return {
      snapshot: null,
      issues: [{ code: 'gateway-input-unreadable', detail: String(error?.message ?? error) }],
      label: path,
    }
  }
  if (!isDirectory) return loadGatewayView(path)
  try {
    const { snapshot, issues } = normalizeChannelBaseline(loadBaselineDirectory(path))
    return { snapshot, issues, label: path }
  } catch (error) {
    return {
      snapshot: null,
      issues: [{ code: 'gateway-input-unreadable', detail: String(error?.message ?? error) }],
      label: path,
    }
  }
}

/**
 * @param {{
 *   argv: string[],
 *   hubRoot: string,
 *   write?: (text: string) => void,
 *   loadHubCatalog?: (args: Record<string, string|boolean>) => Promise<object>,
 * }} options
 * @returns {Promise<{ exitCode: number, output: string }>}
 */
export async function runCatalogDiff(options) {
  const argv = Array.isArray(options.argv) ? options.argv : []
  const write = typeof options.write === 'function' ? options.write : () => {}
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    const message = `catalog-diff: ${String(error?.message ?? error)}\n${USAGE}\n`
    write(message)
    return { exitCode: 2, output: message }
  }
  if (args.help) {
    const output = `${USAGE}\n`
    write(output)
    return { exitCode: 0, output }
  }

  const gatewayPath = typeof args.gateway === 'string' ? args.gateway : ''
  if (!gatewayPath) {
    const output = `${USAGE}\n`
    write(output)
    return { exitCode: 2, output }
  }

  const loaded = loadGatewayViewIfDirectory(gatewayPath)
  if (!loaded.snapshot) {
    const output = `catalog-diff: gateway snapshot unavailable (${loaded.issues.map((issue) => issue.code).join(', ')})\n`
    write(output)
    return { exitCode: 1, output }
  }

  let hubCatalog
  let hubLabel
  if (typeof args['hub-catalog'] === 'string') {
    try {
      hubCatalog = readJson(args['hub-catalog'])
    } catch (error) {
      const output = `catalog-diff: hub catalog unreadable (${String(error?.message ?? error)})\n`
      write(output)
      return { exitCode: 1, output }
    }
    hubLabel = args['hub-catalog']
  } else if (typeof options.loadHubCatalog === 'function') {
    hubCatalog = await options.loadHubCatalog(args)
    hubLabel = 'current checkout projection'
  } else {
    const { buildModelCatalog } = await import(join(options.hubRoot, 'src/catalog/list.js'))
    hubCatalog = buildModelCatalog({})
    hubLabel = 'current checkout projection'
  }

  const diff = diffGatewayAgainstHub({ gateway: loaded.snapshot, hub: hubCatalog })
  const context = { gateway: loaded.snapshot, gatewayLabel: loaded.label, hub: hubCatalog, hubLabel }
  const output = args.json
    ? `${JSON.stringify(diffReportDocument(diff, context), undefined, 2)}\n`
    : formatDiffReport(diff, context)

  if (typeof args.out === 'string') {
    try {
      writeFileSync(args.out, output)
    } catch (error) {
      const message = `catalog-diff: cannot write --out (${String(error?.message ?? error)})\n`
      write(message)
      return { exitCode: 1, output: message }
    }
  } else {
    write(output)
  }
  return { exitCode: 0, output }
}
