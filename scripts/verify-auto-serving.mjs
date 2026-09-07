#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts'
import { getContractIndex, loadDispositions, resolveModelId } from '../plugins/omnimux/src/catalog/contract/index.js'

export const MANIFEST_URL = new URL('../plugins/omnimux/src/catalog/contract/auto-serving-manifest.json', import.meta.url)

/** Offline desired-state validation only; never contacts the gateway. */
export function verifyAutoServing(options = {}) {
  const issues = []
  const issue = (code, message, modelId) => issues.push({
    level: 'error', code: `auto_serving_${code}`, message, ...(modelId ? { modelId } : {}),
  })
  let manifest, index, dispositions
  try {
    manifest = options.manifest ?? JSON.parse(readFileSync(options.manifestPath ?? MANIFEST_URL, 'utf8'))
    index = options.index ?? getContractIndex(options.specsDir)
    dispositions = options.dispositions ?? loadDispositions()
  } catch (error) {
    issue('load_failed', error.message)
    return finish(issues, [])
  }
  if (manifest?.version !== '1' || manifest.defaultGroup !== 'auto' || !Array.isArray(manifest.models)) {
    issue('manifest_invalid', 'Expected version=1, defaultGroup=auto and a models array')
    return finish(issues, [])
  }
  const policy = options.policy ?? CANVAS_GENERATION_POLICY
  const registered = new Map()
  const governed = new Map(dispositions.dispositions.map((row) => [row.id, row.disposition]))
  for (const row of manifest.models) {
    if (!row || typeof row.productId !== 'string' || !row.productId.trim() || row.productId !== row.productId.trim()
      || !Object.hasOwn(policy, row.kind) || typeof row.requiredInAuto !== 'boolean'
      || !['P0', 'P1'].includes(row.priority)) {
      issue('manifest_invalid', 'Each model requires productId, kind, priority and requiredInAuto')
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
    const listed = contract?.operations?.some((op) => op.listed === true && op.output?.type === kind)
    if (row.requiredInAuto && (!listed || governed.get(productId) !== 'canonical')) {
      issue('not_listed', 'Required auto models must have a canonical disposition and a listed output operation', productId)
    }
    if (listed && policy[kind].allowedModelIds.includes(productId) && !row.requiredInAuto) {
      issue('required', 'Listed whitelist models must be requiredInAuto', productId)
    }
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
  return finish(issues, [...registered.values()])
}

function finish(issues, models) {
  return {
    ok: issues.length === 0,
    exitCode: issues.length ? 1 : 0,
    source: 'offline-manifest',
    onlineVerified: false,
    registeredCount: models.length,
    requiredCount: models.filter((row) => row.requiredInAuto).length,
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
    console.log(`auto-serving offline ok=${report.ok} registered=${report.registeredCount ?? 0} required=${report.requiredCount ?? 0}`)
    for (const issue of report.issues) console.error(`${issue.code}${issue.modelId ? ` model=${issue.modelId}` : ''}: ${issue.message}`)
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runAutoServingCli().exitCode
}
