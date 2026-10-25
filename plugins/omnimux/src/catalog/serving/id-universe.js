import manifest from '../contract/auto-serving-manifest.json' with { type: 'json' }
import dispositions from '../contract/dispositions.json' with { type: 'json' }
export {
  getModelChannelGroups,
  MODEL_CHANNEL_GROUPS,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
  ROUTING_STRATEGIES,
} from './channel-groups.js'

/** Documented aliases only; gateway IDs are case-sensitive. */
export const PRODUCT_ID_ALIASES = Object.freeze({
  ...Object.fromEntries(
    dispositions.dispositions
      .filter((row) => row.disposition === 'alias')
      .map((row) => [row.id, row.target]),
  ),
  'seedance-2-0-task': 'seedance-2-0',
  'seedance-2-5-task': 'seedance-2-5',
  'seedance-2-0-fast-task': 'seedance-2-0-fast',
  'minimax-h3-task': 'minimax-h3',
  'minimax-h3-lip-sync': 'minimax-h3',
  'grok-imagine-video-1-5-task': 'grok-imagine-video-1-5',
})
const registrations = new Map(manifest.models.map((row) => [row.productId, row.gatewayIds]))

/**
 * Gateway-membership waivers, declared in the manifest — never in code.
 *
 * The anonymous bundled snapshot publishes no transcription model, so gating
 * transcription on it would refuse the shipped default. The waiver is a
 * deliberate, reviewable declaration carrying its reason and review date; a
 * model without one keeps the default (membership enforced).
 */
const gatewayMembershipExemptions = new Map(
  manifest.models
    .filter((row) => typeof row.gatewayMembershipExempt === 'string' && row.gatewayMembershipExempt.trim())
    .map((row) => [row.productId, row.gatewayMembershipExempt.trim()]),
)

/** @param {unknown} modelId @returns {string} */
export function toProductId(modelId) {
  if (typeof modelId !== 'string') return ''
  const trimmed = modelId.trim()
  const atIndex = trimmed.indexOf('@')
  const baseId = atIndex > 0 ? trimmed.slice(0, atIndex).trim() : trimmed
  return Object.hasOwn(PRODUCT_ID_ALIASES, baseId) ? PRODUCT_ID_ALIASES[baseId] : baseId
}

/**
 * The declared gateway-membership waiver for one model, or null when it is not
 * exempt. Aliases resolve to their canonical product id first.
 * @param {unknown} modelId
 * @returns {string|null}
 */
export function gatewayMembershipExemptReason(modelId) {
  const canonical = toProductId(modelId)
  return canonical ? gatewayMembershipExemptions.get(canonical) ?? null : null
}

/** @returns {Array<{ modelId: string, reason: string }>} every declared waiver, sorted by model id */
export function gatewayMembershipExemptionsList() {
  return [...gatewayMembershipExemptions.entries()]
    .map(([modelId, reason]) => ({ modelId, reason }))
    .sort((left, right) => left.modelId.localeCompare(right.modelId))
}

/**
 * Return an independent ordered gateway registration list, not upstream wire IDs.
 * Unregistered models retain their canonical ID and documented aliases only.
 * @param {unknown} productId
 * @returns {string[]}
 */
export function gatewayCandidates(productId) {
  const canonical = toProductId(productId)
  if (!canonical) return []
  const candidates = registrations.get(canonical) ?? [
    canonical,
    ...Object.keys(PRODUCT_ID_ALIASES).filter((id) => PRODUCT_ID_ALIASES[id] === canonical),
  ]
  return [...new Set(candidates)].filter((id) => toProductId(id) === canonical)
}
