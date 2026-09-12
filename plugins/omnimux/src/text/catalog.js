import { isModelEnabled } from '../gate/guard.js'
import { OmnimuxError } from '../media/errors.js'
import { getHealthyContractIndex, projectChatRows } from '../catalog/project.js'
import {
  parseModelAndGroup,
  resolveChannelPlan,
  ROUTING_STRATEGIES,
} from '../catalog/serving/id-universe.js'
import { normalizeTextReferences } from './references.js'

/**
 * Chat directory — H2 facade. The hardcoded CHAT_MODELS rows were physically
 * deleted; the directory is a projection of specs/text-models.yaml via
 * src/catalog/project.js. Ids must stay a subset of `cordis.patch.yml`
 * `llm-pi-ai` / `omnimux.models`; an id missing there fails at the adapter as
 * UNKNOWN_MODEL. The dated evidence references that justified each row's
 * modalities live in the YAML research blocks (docs/evidence/…).
 *
 * Fail-closed: contract parse / admission failure throws at module load.
 */
const __contractIndex = getHealthyContractIndex()

export const CHAT_MODELS = Object.freeze(projectChatRows(__contractIndex))

/**
 * The whitelist a request resolves against. Charts map to the table above
 * with an `enabled` flag; `defaultModel` is what an omitted `model` uses on
 * both text-only and image requests.
 */
export const CHAT_MODEL_IDS = Object.freeze(CHAT_MODELS.map((row) => row.id))

const CHAT_BY_ID = new Map(CHAT_MODELS.map((row) => [row.id, row]))

export const TEXT_ROLES = Object.freeze(['flagship', 'classic'])

export const DEFAULT_TEXT = Object.freeze({
  defaultProvider: 'omnimux',
  defaultModel: 'gemini-3.8-flash',
  maxTokens: 4096,
  models: Object.freeze(CHAT_MODELS.map((row) => Object.freeze({
    id: row.id,
    brand: row.brand,
    role: row.role,
    enabled: true,
  }))),
})

/**
 * @param {unknown} value
 * @returns {typeof DEFAULT_TEXT}
 */
export function parseTextConfig(value) {
  if (value == null) return structuredClone(DEFAULT_TEXT)
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('omnimux: text config must be an object')
  }
  const input = /** @type {Record<string, unknown>} */ (value)
  const defaultProvider = typeof input.defaultProvider === 'string' && input.defaultProvider.trim()
    ? input.defaultProvider.trim()
    : DEFAULT_TEXT.defaultProvider
  const defaultModel = typeof input.defaultModel === 'string' && input.defaultModel.trim()
    ? input.defaultModel.trim()
    : DEFAULT_TEXT.defaultModel
  const maxTokens = parseMaxTokens(input.maxTokens)
  const models = input.models == null
    ? structuredClone(DEFAULT_TEXT.models)
    : parseModelRows(input.models)
  return { defaultProvider, defaultModel, maxTokens, models }
}

/**
 * Merges text.models enabled flags with gate.models.textComplete.
 * A model is enabled if and only if row.enabled !== false AND isModelEnabled(gate, id).
 *
 * @param {ReturnType<typeof parseTextConfig>} text
 * @param {object} [gate]
 */
export function enabledTextModels(text, gate) {
  return text.models.filter((row) => row.enabled !== false && isModelEnabled(gate, row.id))
}

/**
 * Resolve which model a one-shot request runs on. An omitted `model` uses
 * `text.defaultModel` on text-only, image, and video requests; `OMNIMUX_TEXT_
 * DEFAULT_MODEL` overlays it. The chosen row must be enabled; image/video
 * requests must land on a row whose contract includes that modality.
 * `image` and `video` are mutually exclusive on one request.
 * @param {{ model?: string, image?: string, video?: string, audio?: string, audioTrack?: object, references?: import('./references.js').TextReference[] }} request
 * @param {ReturnType<typeof parseTextConfig>} text
 * @param {Record<string, string | undefined>} [env]
 * @param {object} [gate]
 */
export function resolveTextRoute(request, text, env = process.env, gate) {
  const enabled = enabledTextModels(text, gate)
  const references = normalizeTextReferences(request)
  const hasImage = references.some((asset) => asset.type === 'image')
  const hasVideo = references.some((asset) => asset.type === 'video')
  if (hasImage && hasVideo) {
    throw new OmnimuxError('omnimux-invalid-request', 'pass image or video, not both')
  }
  const requested = typeof request.model === 'string' ? request.model.trim() : ''
  const { modelId: baseModelId, group: inlineGroup } = parseModelAndGroup(requested)
  const targetBaseModel = baseModelId || resolveDefaultModel(enabled, text.defaultModel, env)
  const row = enabled.find((item) => item.id === targetBaseModel)
  if (!row) {
    throw new OmnimuxError('unknown-model', `model '${targetBaseModel}' is not on the enabled text whitelist`)
  }
  const chat = CHAT_BY_ID.get(row.id)
  const input = chat?.input ?? ['text']
  for (const type of new Set(references.map((asset) => asset.type))) {
    if (!input.includes(type)) {
      throw new OmnimuxError('omnimux-invalid-request', `model '${row.id}' does not accept ${type} input`)
    }
  }
  const group = inlineGroup || (typeof request.group === 'string' && request.group.trim() ? request.group.trim() : undefined)
  const explicitStrategy = typeof request.strategy === 'string' && ROUTING_STRATEGIES.includes(request.strategy)
  const allowedGroups = Array.isArray(request.allowedGroups) && request.allowedGroups.length > 0
    ? request.allowedGroups
    : undefined
  // Only the direct chat-completions path can carry a group; the streaming path
  // (`llm.stream`) resolves a declared session model, so its plan stays the base
  // gateway candidates. `unresolvedGroups` reports intent a model cannot honor.
  const plan = resolveChannelPlan(row.id, {
    strategy: explicitStrategy ? request.strategy : 'auto',
    group,
    allowedGroups,
  })
  const hasRoutingIntent = Boolean(group || allowedGroups || explicitStrategy)
  if (hasRoutingIntent && plan.candidates.length === 0) {
    const detail = plan.unresolvedGroups.length > 0 ? plan.unresolvedGroups.join(', ') : 'no enabled channel group'
    throw new OmnimuxError('unknown-group', `所选渠道分组不可用于 ${row.id}（${detail}）`)
  }

  return {
    providerId: text.defaultProvider,
    modelId: row.id,
    group,
    strategy: hasRoutingIntent ? (explicitStrategy ? request.strategy : 'auto') : undefined,
    candidates: plan.candidates,
    unresolvedGroups: plan.unresolvedGroups,
    input,
    maxTokens: text.maxTokens,
  }
}

/**
 * @param {unknown} value
 */
function parseMaxTokens(value) {
  if (value == null) return DEFAULT_TEXT.maxTokens
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('omnimux: text.maxTokens must be a positive number')
  }
  return value
}

/**
 * @param {unknown} value
 */
function parseModelRows(value) {
  if (!Array.isArray(value)) {
    throw new Error('omnimux: text.models must be an array')
  }
  const seen = new Set()
  return value.map((row, index) => {
    if (typeof row !== 'object' || row == null || Array.isArray(row)) {
      throw new Error(`omnimux: text.models[${index}] must be an object`)
    }
    const spec = /** @type {Record<string, unknown>} */ (row)
    const id = typeof spec.id === 'string' ? spec.id.trim() : ''
    if (!id) throw new Error(`omnimux: text.models[${index}].id is required`)
    const chat = CHAT_BY_ID.get(id)
    if (!chat) {
      throw new Error(`omnimux: text.models[${index}].id '${id}' is not in the chat directory`)
    }
    if (seen.has(id)) {
      throw new Error(`omnimux: text.models repeats id '${id}'`)
    }
    seen.add(id)
    const brand = typeof spec.brand === 'string' && spec.brand.trim()
      ? spec.brand.trim()
      : chat.brand
    const role = typeof spec.role === 'string' && spec.role.trim()
      ? spec.role.trim()
      : chat.role
    if (!TEXT_ROLES.includes(role)) {
      throw new Error(`omnimux: text.models[${index}].role must be one of ${TEXT_ROLES.join(', ')}`)
    }
    return {
      id,
      brand,
      role,
      enabled: spec.enabled !== false,
    }
  })
}

/**
 * @param {Array<{ id: string }>} enabled
 * @param {string} configDefault
 * @param {Record<string, string | undefined>} env
 */
function resolveDefaultModel(enabled, configDefault, env) {
  const overlay = typeof env.OMNIMUX_TEXT_DEFAULT_MODEL === 'string' ? env.OMNIMUX_TEXT_DEFAULT_MODEL.trim() : ''
  const id = overlay || configDefault
  if (!enabled.some((item) => item.id === id)) {
    throw new OmnimuxError(
      'unknown-model',
      `default text model '${id}' is not on the enabled text whitelist`,
    )
  }
  return id
}
