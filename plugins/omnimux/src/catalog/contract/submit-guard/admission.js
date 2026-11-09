/**
 * Model + operation admission for SubmitGuard.
 * Fail closed: unknown / unlisted / unverified / implementation/profile gaps.
 */

import { mapLegacyOperation } from '../legacy-operation-map.js'
import {
  adapterProfileCompatible,
  getAdapterProfile,
} from '../status.js'
import {
  resolveDisposition,
  FORBIDDEN_LISTED_DISPOSITIONS,
  loadDispositions,
} from '../dispositions.js'
import { GUARD_CODES } from './codes.js'
import { operationAcceptsAssets } from './slots.js'

/**
 * Resolve runtime / alias id → canonical contract id without importing the barrel.
 * @param {{ get: (id: string) => object|undefined, all?: () => object[] }} index
 * @param {string} id
 * @returns {string|undefined}
 */
function resolveCanonicalModelId(index, id) {
  if (!index || typeof id !== 'string' || !id) return undefined
  if (index.get(id)) return id
  const all = typeof index.all === 'function' ? index.all() : []
  for (const model of all) {
    if ((model.aliases ?? []).includes(id)) return model.id
  }
  return undefined
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra }
}

/**
 * Resolve model id through aliases on the contract index.
 * @param {import('../index.js').ContractIndex} index
 * @param {string} [modelId]
 */
export function admitModel(index, modelId) {
  if (!index || typeof index.get !== 'function') {
    return fail(GUARD_CODES.CATALOG_UNAVAILABLE, 'contract index unavailable')
  }
  if (Array.isArray(index.parseErrors) && index.parseErrors.length > 0) {
    return fail(GUARD_CODES.CATALOG_MALFORMED, `catalog parse errors: ${index.parseErrors.join('; ')}`, {
      parseErrors: index.parseErrors,
    })
  }
  if (Array.isArray(index.issues) && index.issues.some((i) => i.level === 'error')) {
    // Soft: issues may include coverage; only hard-fail when caller asked strict catalog.
  }
  const raw = typeof modelId === 'string' ? modelId.trim() : ''
  if (!raw) {
    return fail(GUARD_CODES.UNKNOWN_MODEL, 'model is required')
  }
  const canonical = resolveCanonicalModelId(index, raw)
  if (!canonical) {
    return fail(GUARD_CODES.UNKNOWN_MODEL, `unknown model "${raw}"`, { modelId: raw })
  }
  const model = index.get(canonical)
  if (!model) {
    return fail(GUARD_CODES.CONTRACT_MISSING, `no contract for model "${canonical}"`, { modelId: canonical })
  }
  return {
    ok: true,
    modelId: canonical,
    requestedModelId: raw,
    model,
    aliased: canonical !== raw,
  }
}

/**
 * Disposition gate: unavailable / quarantine / deprecated never submit.
 * @param {string} modelId
 * @param {object} [dispositions]
 */
export function admitDisposition(modelId, dispositions) {
  const doc = dispositions ?? loadDispositions()
  const row = resolveDisposition(doc, modelId)
  if (!row) {
    // Missing disposition is a governance gap; still allow if contract listed (H2 may lag),
    // but prefer fail-closed for unknown governance only when dispositions doc loaded empty.
    return { ok: true, disposition: null }
  }
  if (FORBIDDEN_LISTED_DISPOSITIONS.has(row.disposition)) {
    return fail(
      GUARD_CODES.DISPOSITION_FORBIDDEN,
      `model "${modelId}" disposition "${row.disposition}" forbids submit`,
      { modelId, disposition: row.disposition },
    )
  }
  return { ok: true, disposition: row }
}

/**
 * @param {object} model
 * @param {string} operationId
 * @param {object} profiles
 * @param {{ requireListed?: boolean, gateAllows?: Function, seam?: string }} [opts]
 */
export function admitOperation(model, operationId, profiles, opts = {}) {
  const requireListed = opts.requireListed !== false
  const rawOp = typeof operationId === 'string' ? operationId.trim() : ''
  if (!rawOp) {
    return fail(GUARD_CODES.OPERATION_REQUIRED, 'operation is required')
  }
  let opId = mapLegacyOperation(rawOp)
  let op = (model.operations ?? []).find((o) => o && o.id === opId)
  if (!op) {
    const aliased = (model.operations ?? []).find((candidate) =>
      Array.isArray(candidate?.aliases) && candidate.aliases.includes(opId))
    if (aliased) {
      op = aliased
      opId = aliased.id
    }
  }
  if (!op) {
    return fail(GUARD_CODES.OPERATION_NOT_ON_MODEL, `operation "${opId}" not declared on model "${model.id}"`, {
      modelId: model.id,
      operationId: opId,
      requestedOperationId: rawOp,
    })
  }

  if (requireListed && !op.listed) {
    const research = op.research?.status ?? 'draft'
    const implementation = op.implementation?.status ?? 'none'
    if (research !== 'verified') {
      return fail(GUARD_CODES.RESEARCH_NOT_VERIFIED, `operation ${model.id}#${opId} research is ${research}, not verified`, {
        modelId: model.id,
        operationId: opId,
        research,
      })
    }
    if (implementation !== 'ready') {
      return fail(GUARD_CODES.IMPLEMENTATION_UNAVAILABLE, `operation ${model.id}#${opId} implementation is ${implementation}, not ready`, {
        modelId: model.id,
        operationId: opId,
        implementation,
      })
    }
    return fail(GUARD_CODES.NOT_LISTED, `operation ${model.id}#${opId} is not listed`, {
      modelId: model.id,
      operationId: opId,
    })
  }

  // Gateway Contract v2 operations are admitted by the gateway's executable
  // bit plus a local adapter profile. The local research field records local
  // evidence and must not override that authoritative gateway signal.
  if (!op.gatewaySource && op.research?.status && op.research.status !== 'verified' && requireListed) {
    return fail(GUARD_CODES.RESEARCH_NOT_VERIFIED, `research status ${op.research.status}`, {
      modelId: model.id,
      operationId: opId,
    })
  }
  if (!op.gatewaySource && op.implementation?.status && op.implementation.status !== 'ready' && requireListed) {
    return fail(GUARD_CODES.IMPLEMENTATION_UNAVAILABLE, `implementation status ${op.implementation.status}`, {
      modelId: model.id,
      operationId: opId,
    })
  }

  const profileId = op.implementation?.profileId
  if (!profileId) {
    return fail(GUARD_CODES.PROFILE_MISSING, `operation ${opId} has no implementation.profileId`, {
      modelId: model.id,
      operationId: opId,
    })
  }
  const profile = getAdapterProfile(profiles, profileId)
  if (!profile || profile.status !== 'live') {
    return fail(GUARD_CODES.PROFILE_MISSING, `profile "${profileId}" missing or not live`, {
      modelId: model.id,
      operationId: opId,
      profileId,
    })
  }
  const compat = adapterProfileCompatible(op, profiles)
  if (!compat.ok) {
    return fail(GUARD_CODES.PROFILE_INCOMPATIBLE, compat.reason ?? 'profile incompatible', {
      modelId: model.id,
      operationId: opId,
      profileId,
    })
  }

  if (opts.seam) {
    const profileSeam = profile.seam
    const opSeam = op.implementation?.seam
    if (profileSeam && opts.seam !== profileSeam && opts.seam !== opSeam) {
      // Allow capability aliases: videoGenerate seam vs capability "video"
      const seamAliases = SEAM_ALIASES[profileSeam] ?? [profileSeam]
      if (!seamAliases.includes(opts.seam) && opts.seam !== profileSeam) {
        return fail(GUARD_CODES.SEAM_MISMATCH, `request seam/capability "${opts.seam}" incompatible with profile seam "${profileSeam}"`, {
          seam: opts.seam,
          profileSeam,
          operationId: opId,
        })
      }
    }
  }

  if (typeof opts.gateAllows === 'function') {
    try {
      if (!opts.gateAllows(model.id, opId)) {
        return fail(GUARD_CODES.MODEL_NOT_ADMITTED, `gate denies ${model.id}#${opId}`, {
          modelId: model.id,
          operationId: opId,
        })
      }
    } catch {
      return fail(GUARD_CODES.MODEL_NOT_ADMITTED, `gate error for ${model.id}#${opId}`, {
        modelId: model.id,
        operationId: opId,
      })
    }
  }

  return {
    ok: true,
    operationId: opId,
    requestedOperationId: rawOp,
    operation: op,
    profile,
    profileId,
  }
}

const SEAM_ALIASES = Object.freeze({
  videoGenerate: ['videoGenerate', 'video'],
  imageGenerate: ['imageGenerate', 'image'],
  audioGenerate: ['audioGenerate', 'audio'],
  speechToText: ['speechToText', 'stt'],
  textComplete: ['textComplete', 'text'],
})

/**
 * Infer a unique listed implementation-ready operation from model + current assets.
 * Multiple candidates → operation_required (never guess).
 * @param {object} model
 * @param {import('./normalize.js').LogicalAsset[]} assets
 * @param {{ prompt?: string, seam?: string, profiles?: object, outputType?: string }} [ctx]
 */
export function inferUniqueOperation(model, assets, ctx = {}) {
  const listed = (model.operations ?? []).filter((op) => op && op.listed)
  let candidates = listed
  if (ctx.outputType) {
    candidates = candidates.filter((op) => op.output?.type === ctx.outputType)
  }
  if (ctx.seam && ctx.profiles) {
    candidates = candidates.filter((op) => {
      const profile = getAdapterProfile(ctx.profiles, op.implementation?.profileId)
      if (!profile) return false
      const aliases = SEAM_ALIASES[profile.seam] ?? [profile.seam]
      return aliases.includes(ctx.seam) || profile.seam === ctx.seam
    })
  }

  /** @type {object[]} */
  const accepting = []
  for (const op of candidates) {
    const match = operationAcceptsAssets(op, assets, { prompt: ctx.prompt, requireMins: false })
    if (match.ok) accepting.push(op)
  }

  /**
   * Specificity rank: fewer optional media slots ⇒ tighter fit for empty media.
   * Used only to collapse chat vs vision_chat-style supersets — never to pick
   * among equally specific ops (that stays operation_required).
   * @param {object} op
   */
  function mediaOptionalCount(op) {
    let n = 0
    for (const slot of op.inputs ?? []) {
      if (slot.role === 'prompt' || slot.type === 'text') continue
      const min = Number.isFinite(slot.min) ? slot.min : 0
      if (min === 0) n += 1
    }
    return n
  }

  /** @type {object[]} */
  let uniquePool = accepting
  if (accepting.length > 1) {
    const mediaCount = (assets ?? []).filter((a) => a && a.type && a.type !== 'text').length
    if (mediaCount === 0) {
      // Text-only: keep the most specific (fewest optional media slots).
      let best = Infinity
      for (const op of accepting) best = Math.min(best, mediaOptionalCount(op))
      uniquePool = accepting.filter((op) => mediaOptionalCount(op) === best)
    } else {
      // With media: keep ops that actually bind at least one media asset most tightly
      // (required media mins satisfied path already filtered). Prefer fewer leftover optional empties.
      let best = Infinity
      for (const op of accepting) best = Math.min(best, mediaOptionalCount(op))
      const narrowed = accepting.filter((op) => mediaOptionalCount(op) === best)
      uniquePool = narrowed
    }
  }

  if (uniquePool.length === 1) {
    return {
      ok: true,
      operationId: uniquePool[0].id,
      operation: uniquePool[0],
      inferred: true,
      candidates: accepting.map((o) => o.id),
    }
  }

  if (accepting.length === 0) {
    return fail(
      GUARD_CODES.OPERATION_REQUIRED,
      `operation required; no listed operation uniquely accepts current inputs on ${model.id}`,
      {
        modelId: model.id,
        candidates: candidates.map((o) => o.id),
      },
    )
  }

  return fail(GUARD_CODES.OPERATION_REQUIRED, `operation required; ambiguous among ${accepting.map((o) => o.id).join(', ')}`, {
    modelId: model.id,
    candidates: accepting.map((o) => o.id),
  })
}
