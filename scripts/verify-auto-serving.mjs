#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts'
import { getContractIndex, loadDispositions, resolveModelId } from '../plugins/omnimux/src/catalog/contract/index.js'
import { BUNDLED_SNAPSHOT_FILENAME, defaultBundledDir, readBundledSnapshot } from '../plugins/omnimux/src/catalog/cloud/bundled.js'
import { disappearance } from '../plugins/omnimux/src/catalog/cloud/refresh.js'
import { usableSnapshotModels } from '../plugins/omnimux/src/catalog/cloud/view.js'
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const MANIFEST_URL = new URL('../plugins/omnimux/src/catalog/contract/auto-serving-manifest.json', import.meta.url)

/** Repository-relative path of the shipped snapshot, as `git show` spells it. */
export const BUNDLED_SNAPSHOT_GIT_PATH = relative(root, join(defaultBundledDir(), BUNDLED_SNAPSHOT_FILENAME)).split('\\').join('/')

/**
 * Offline desired-state validation only; never contacts the gateway.
 *
 * P1b moved "is this model on sale" to the gateway snapshot. The bundled
 * snapshot is readable offline, so the gate keeps a real assertion: the
 * snapshot must be present, every model the catalog actually lists must be
 * on sale in it, and — since #3763 — no model the *baseline* snapshot sold may
 * have silently disappeared from the shipped one. Registered-but-not-yet-sold
 * models are reported as information, not errors — the manifest is a
 * registration list (it also holds models still being promoted), and the
 * runtime hides anything the gateway does not sell. `requiredInAuto` is gone:
 * it no longer decides anything.
 */
export function verifyAutoServing(options = {}) {
  const issues = []
  const warnings = []
  const issue = (code, message, modelId) => issues.push({
    level: 'error', code: `auto_serving_${code}`, message, ...(modelId ? { modelId } : {}),
  })
  const warning = (code, message) => warnings.push({
    level: 'warning', code: `auto_serving_${code}`, message,
  })
  let manifest, index, dispositions
  try {
    manifest = options.manifest ?? JSON.parse(readFileSync(options.manifestPath ?? MANIFEST_URL, 'utf8'))
    index = options.index ?? getContractIndex(options.specsDir)
    dispositions = options.dispositions ?? loadDispositions()
  } catch (error) {
    issue('load_failed', error.message)
    return finish(issues, [], null, warnings)
  }
  if (manifest?.version !== '1' || manifest.defaultGroup !== 'auto' || !Array.isArray(manifest.models)) {
    issue('manifest_invalid', 'Expected version=1, defaultGroup=auto and a models array')
    return finish(issues, [], null, warnings)
  }
  const policy = options.policy ?? CANVAS_GENERATION_POLICY
  const registered = new Map()
  const governed = new Map(dispositions.dispositions.map((row) => [row.id, row.disposition]))
  for (const row of manifest.models) {
    if (!row || typeof row.productId !== 'string' || !row.productId.trim() || row.productId !== row.productId.trim()
      || !Object.hasOwn(policy, row.kind)
      || !['P0', 'P1'].includes(row.priority)) {
      issue('manifest_invalid', 'Each model requires productId, kind and priority')
      continue
    }
    const { productId, kind, gatewayIds } = row
    if (registered.has(productId)) issue('duplicate', 'Duplicate productId registration', productId)
    registered.set(productId, row)
    const contract = index.get(productId)
    if (!contract || resolveModelId(index, productId) !== productId || governed.get(productId) !== 'canonical') {
      issue('not_canonical', 'productId must name a canonical contract, not an alias', productId)
    }
    if (!policy[kind].allowedModelIds.includes(productId) && row.canvasExcluded !== true) {
      issue('not_allowed', 'Model is not in its canvas whitelist or explicitly canvasExcluded', productId)
    }
    // P1b: whether a model is actually on sale is decided by the gateway
    // snapshot at runtime, so this offline gate no longer asserts a local
    // "required in auto" flag; it validates the registration itself.
    if (!Array.isArray(gatewayIds) || !gatewayIds.length || !gatewayIds.includes(productId)
      || new Set(gatewayIds).size !== gatewayIds.length
      || gatewayIds.some((id) => typeof id !== 'string' || id !== id.trim() || resolveModelId(index, id) !== productId)) {
      issue('gateway_invalid', 'gatewayIds must contain the canonical ID and unique aliases of the same model', productId)
    }
    if (row.upstreamWireId !== undefined && (typeof row.upstreamWireId !== 'string' || !row.upstreamWireId.trim()
      || (contract?.routing?.wireModel && contract.routing.wireModel !== row.upstreamWireId))) {
      issue('wire_mismatch', 'upstreamWireId must agree with documented routing when supplied', productId)
    }
  }
  for (const [kind, entry] of Object.entries(policy)) {
    for (const productId of entry.allowedModelIds) {
      if (registered.get(productId)?.kind !== kind) issue('missing', `Missing ${kind} whitelist registration`, productId)
    }
  }
  return finish(issues, [...registered.values()], offlineGatewayCheck({ ...options, manifest }, issue, warning), warnings)
}

/**
 * Read the baseline shipped snapshot without touching the working tree.
 *
 * Commit-time is stricter than runtime: the runtime refresh guard tolerates a
 * disappearance ratio below `DISAPPEARANCE_LIMIT`, while a committed snapshot
 * must never lose a single on-sale model without someone deciding to. The
 * baseline is the `QA_BASE` revision CI injects (the PR base), falling back to
 * `HEAD` locally. An unreadable baseline is a warning, never a fake failure —
 * a shallow clone or a new file must not turn into a red gate.
 *
 * @param {{ baseline?: object|null, baselineRef?: string }} [options]
 * @returns {{ snapshot?: object, ref: string, code: string }}
 */
export function readBaselineBundledSnapshot(options = {}) {
  if (Object.hasOwn(options, 'baseline')) {
    return options.baseline
      ? { snapshot: options.baseline, ref: 'injected', code: 'injected' }
      : { snapshot: undefined, ref: 'injected', code: 'baseline-missing' }
  }
  const configured = typeof options.baselineRef === 'string' ? options.baselineRef.trim() : ''
  const ref = configured || (process.env.QA_BASE ?? '').trim() || 'HEAD'
  let text
  try {
    text = execFileSync('git', ['show', `${ref}:${BUNDLED_SNAPSHOT_GIT_PATH}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (error) {
    return { snapshot: undefined, ref, code: `baseline-unavailable: ${String(error?.message ?? error).split('\n')[0]}` }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { snapshot: undefined, ref, code: `baseline-malformed: ${String(error?.message ?? error)}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.models)) {
    return { snapshot: undefined, ref, code: 'baseline-malformed: not a snapshot object with a models array' }
  }
  return { snapshot: parsed, ref, code: 'read' }
}

/**
 * Offline gateway check: the bundled snapshot must be usable, and no model the
 * baseline sold may have disappeared. A disappearance the manifest records as
 * reviewed (`snapshotDropAcknowledged`) stays visible as a warning instead of
 * failing: the decision has to live in git, not in a silent threshold.
 *
 * Two different disappearance notions, deliberately:
 *   - `disappearance()` (the runtime refresh guard's own helper) counts raw
 *     `models[].id` entries and drives the reported summary;
 *   - the hard assertion is on the *on-sale* set (`usableSnapshotModels`), which
 *     is what the catalog can actually serve. A model that stays in the file but
 *     loses every enabled line has silently stopped being sellable, so it counts
 *     as dropped too.
 *
 * @param {{ bundled?: object, baseline?: object|null, bundledDir?: string, buildCatalog?: Function, baselineRef?: string }} options
 * @param {(code: string, message: string, modelId?: string) => void} issue
 * @param {(code: string, message: string) => void} warning
 */
function offlineGatewayCheck(options, issue, warning) {
  const read = options.bundled ?? readBundledSnapshot(options.bundledDir ?? defaultBundledDir())
  if (!read.snapshot) {
    issue('snapshot_unreadable', `Bundled gateway snapshot is not usable: ${read.code ?? 'unknown'}`)
    return { snapshotModels: 0, onSale: 0 }
  }
  const onSale = new Set(usableSnapshotModels(read.snapshot).keys())
  if (onSale.size === 0) issue('snapshot_empty', 'Bundled gateway snapshot lists no sellable model')

  const baseline = readBaselineBundledSnapshot(options)
  /** @type {string[]} */
  let dropped = []
  let baselineInfo = { ref: baseline.ref, code: baseline.code, models: 0, onSale: 0, disappearance: null }
  if (!baseline.snapshot) {
    warning('baseline_unavailable', `Baseline snapshot not readable (${baseline.ref}: ${baseline.code}); drop detection skipped.`)
  } else {
    const baselineOnSale = usableSnapshotModels(baseline.snapshot)
    const gone = disappearance(baseline.snapshot, read.snapshot)
    if (baselineOnSale.size === 0 && (baseline.snapshot.models ?? []).length > 0) {
      warning('baseline_shape_unexpected',
        `Baseline ${baseline.ref} has ${baseline.snapshot.models.length} model rows but none on sale; `
          + 'a schema change may have silently disabled drop detection.')
    }
    baselineInfo = {
      ref: baseline.ref,
      code: baseline.code,
      models: Array.isArray(baseline.snapshot.models) ? baseline.snapshot.models.length : 0,
      onSale: baselineOnSale.size,
      disappearance: gone,
    }
    const acknowledged = acknowledgedDrops(options)
    for (const id of baselineOnSale.keys()) {
      if (onSale.has(id)) continue
      dropped.push(id)
      if (acknowledged.has(id)) {
        warning('snapshot_model_dropped_acknowledged',
          `Reviewed drop: ${id} — ${acknowledged.get(id)}`)
        continue
      }
      issue(
        'snapshot_model_dropped',
        'The shipped gateway snapshot no longer sells a model the baseline sold; '
          + 'commit-time is stricter than the runtime ratio guard, so record the decision in '
          + 'auto-serving-manifest.json snapshotDropAcknowledged (id + reason + reviewedAt).',
        id,
      )
    }
  }

  let catalog
  try {
    catalog = (options.buildCatalog ?? buildModelCatalog)({ snapshot: read.snapshot })
  } catch (error) {
    issue('catalog_unavailable', `Catalog could not be built from the bundled snapshot: ${error.message}`)
    return { snapshotModels: read.snapshot.models.length, onSale: onSale.size, baseline: baselineInfo, dropped }
  }
  // The catalog is built from this same snapshot, so "listed but not on sale"
  // cannot happen by construction; asserting it was a tautology. The live
  // checks are the snapshot itself and the baseline comparison above.
  return { snapshotModels: read.snapshot.models.length, onSale: onSale.size, baseline: baselineInfo, dropped }
}

/**
 * Reviewed drop decisions, keyed by model id.
 *
 * The declaration is the explicit channel: a legitimate delisting (or a
 * `model_name` rename) must be recorded in the manifest with a reason and a
 * review date, where reviewers see it, instead of being waived by a threshold.
 *
 * @param {{ manifest?: { snapshotDropAcknowledged?: unknown } }} options
 * @returns {Map<string, string>}
 */
function acknowledgedDrops(options) {
  const rows = options?.manifest?.snapshotDropAcknowledged
  const out = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = typeof row?.id === 'string' ? row.id.trim() : ''
    if (!id) continue
    const reason = typeof row?.reason === 'string' ? row.reason.trim() : ''
    const reviewedAt = typeof row?.reviewedAt === 'string' ? row.reviewedAt.trim() : ''
    out.set(id, [reason || 'no reason given', reviewedAt ? `reviewed ${reviewedAt}` : 'no review date'].join(' · '))
  }
  return out
}

function finish(issues, models, gateway = null, warnings = []) {
  return {
    ok: issues.length === 0,
    exitCode: issues.length ? 1 : 0,
    source: 'offline-manifest',
    onlineVerified: false,
    registeredCount: models.length,
    ...(gateway ? { gateway } : {}),
    warnings,
    issues,
  }
}

export function runAutoServingCli(argv = process.argv.slice(2)) {
  const unknown = argv.find((arg) => arg !== '--json')
  const report = unknown
    ? { ok: false, exitCode: 2, issues: [{ level: 'error', code: 'cli_usage_error', message: `Unknown argument: ${unknown}` }] }
    : verifyAutoServing()
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`auto-serving offline ok=${report.ok} registered=${report.registeredCount ?? 0}`)
    for (const warning of report.warnings ?? []) console.error(`${warning.code}: ${warning.message}`)
    for (const issue of report.issues) console.error(`${issue.code}${issue.modelId ? ` model=${issue.modelId}` : ''}: ${issue.message}`)
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runAutoServingCli().exitCode
}
