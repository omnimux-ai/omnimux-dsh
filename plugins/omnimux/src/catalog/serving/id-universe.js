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
  'nano-banana-2': 'nano_banana_2',
  'nano-banana-pro': 'nano_banana_pro',
  'mj-v8-1': 'midjourney-8.1',
  'midjourney-8-1': 'midjourney-8.1',
  'mj-v7': 'midjourney-7',
  'seedance-2-0-task': 'seedance-2-0',
  'seedance-2-5-task': 'seedance-2-5',
  'seedance-2-0-fast-task': 'seedance-2-0-fast',
  'minimax-h3-task': 'minimax-h3',
  'grok-imagine-video-1-5-task': 'grok-imagine-video-1-5',
})
const registrations = new Map(manifest.models.map((row) => [row.productId, row.gatewayIds]))

/** @param {unknown} modelId @returns {string} */
export function toProductId(modelId) {
  if (typeof modelId !== 'string') return ''
  const trimmed = modelId.trim()
  const atIndex = trimmed.indexOf('@')
  const baseId = atIndex > 0 ? trimmed.slice(0, atIndex).trim() : trimmed
  return Object.hasOwn(PRODUCT_ID_ALIASES, baseId) ? PRODUCT_ID_ALIASES[baseId] : baseId
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
