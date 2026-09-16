import { createHash } from 'node:crypto'
import { isMediaEnabled } from '../gate/guard.js'
import { DEFAULT_MEDIA } from '../media/route.js'
import { DEFAULT_TEXT, enabledTextModels } from '../text/catalog.js'
import { textModelLabel } from './labels.js'
import {
  assertContractHealthy,
  getHealthyContractIndex,
  projectCatalog,
  resolveModelId,
} from './project.js'
import {
  loadDispositions,
  loadCatalogDefaults,
  validateDispositionsShape,
} from './contract/dispositions.js'
import { CANONICAL_SCHEMA_VERSION } from './contract/schema.js'
import { DEFAULT_OPERATION_AUTO } from '../settings/schema.js'

export const CATALOG_KINDS = Object.freeze(['text', 'image', 'video', 'audio'])

/** Primary operation per catalog kind, used to read catalog-defaults.byOperation. */
const KIND_PRIMARY_OP = Object.freeze({
  text: 'chat',
  image: 'text_to_image',
  video: 'text_to_video',
  audio: 'text_to_music',
})

export const ENV_DEFAULT_KEYS = Object.freeze({
  text: 'OMNIMUX_TEXT_DEFAULT_MODEL',
  image: 'OMNIMUX_IMAGE_MODEL',
  video: 'OMNIMUX_VIDEO_MODEL',
  audio: 'OMNIMUX_AUDIO_MODEL',
})

export const SETTINGS_DEFAULT_KEYS = Object.freeze({
  text: 'defaultTextModel',
  image: 'defaultImageModel',
  video: 'defaultVideoModel',
  audio: 'defaultAudioModel',
})

/** Kinds whose default generation mode is configurable through settings. */
export const SETTINGS_DEFAULT_OPERATION_KEYS = Object.freeze({
  image: 'defaultImageOperation',
  video: 'defaultVideoOperation',
})

/** Ordered models to try when the configured default model cannot publish the preferred mode. */
const PREFERRED_OPERATION_MODELS = Object.freeze({
  image: ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
  video: ['minimax-h3', 'seedance-2-0', 'seedance-2-5'],
})

/** The mode a kind starts in: it consumes upstream media, so a new node shows its slots. */
const PREFERRED_OPERATION = Object.freeze({
  image: 'multi_reference',
  video: 'video_multi_ref',
})

/** Listed operation ids of one model for one output type, in contract order. */
function listedOperationIds(models, modelId, kind) {
  const model = (models ?? []).find((row) => row && row.id === modelId)
  return (model?.operations ?? [])
    .filter((op) => op && op.listed === true && op.output?.type === kind)
    .map((op) => op.id)
}

/**
 * Resolve the generation mode a new node of `kind` starts in.
 *
 * An explicit setting wins while some listed model publishes it; otherwise the
 * configured default model keeps the preferred media-consuming mode, then the
 * preferred-model chain is walked, then the model's own first listed mode.
 *
 * @param {{ kind: string, configured: unknown, modelId: string, ids: Set<string>, models: Array<object> }} input
 * @returns {{ modelId: string, operationId: string, rule: string }}
 */
export function resolveDefaultOperation(input) {
  const kind = input.kind
  const preferred = PREFERRED_OPERATION[kind]
  const chain = PREFERRED_OPERATION_MODELS[kind] ?? []
  const configured = typeof input.configured === 'string' ? input.configured.trim() : ''
  if (configured && configured !== DEFAULT_OPERATION_AUTO) {
    if (listedOperationIds(input.models, input.modelId, kind).includes(configured)) {
      return { modelId: input.modelId, operationId: configured, rule: 'configured' }
    }
    for (const candidate of chain) {
      if (candidate === input.modelId || !input.ids.has(candidate)) continue
      if (listedOperationIds(input.models, candidate, kind).includes(configured)) {
        return { modelId: candidate, operationId: configured, rule: 'configured_chain' }
      }
    }
  }
  if (preferred && listedOperationIds(input.models, input.modelId, kind).includes(preferred)) {
    return { modelId: input.modelId, operationId: preferred, rule: 'auto' }
  }
  for (const candidate of chain) {
    if (candidate === input.modelId || !input.ids.has(candidate)) continue
    if (preferred && listedOperationIds(input.models, candidate, kind).includes(preferred)) {
      return { modelId: candidate, operationId: preferred, rule: 'auto_chain' }
    }
  }
  const first = listedOperationIds(input.models, input.modelId, kind)[0]
  return { modelId: input.modelId, operationId: first ?? '', rule: first ? 'first_operation' : 'none' }
}

/**
 * Catalog v1.1: the contract projection is the authority (models[] + four
 * lists derived from visible ops' output.type). Fail-closed: any contract
 * parse/admission/dispositions failure throws; there is no legacy table to
 * fall back to.
 *
 * @param {object} [opts]
 * @param {ReturnType<typeof import('../text/catalog.js').parseTextConfig>} [opts.text]
 * @param {ReturnType<typeof import('../media/route.js').parseMediaConfig>} [opts.media]
 * @param {object} [opts.gate]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {Record<string, unknown>} [opts.settingsDefaults]
 * @param {object} [opts.contractIndex] internal test seam: inject a preloaded index
 */
export function buildModelCatalog(opts = {}) {
  const text = opts.text ?? DEFAULT_TEXT
  const media = opts.media ?? DEFAULT_MEDIA
  const gate = opts.gate
  const env = opts.env ?? process.env
  const settingsDefaults = opts.settingsDefaults && typeof opts.settingsDefaults === 'object'
    ? opts.settingsDefaults
    : {}

  const index = opts.contractIndex
    ? assertContractHealthy(opts.contractIndex)
    : getHealthyContractIndex()
  const dispositionsDoc = loadDispositions()
  const dispositionShapeIssues = validateDispositionsShape(dispositionsDoc)
  if (dispositionShapeIssues.length > 0) {
    const first = dispositionShapeIssues[0]
    throw new Error(`model dispositions invalid: ${first.code} ${first.path ?? ''}: ${first.message}`)
  }
  const defaultsCfg = loadCatalogDefaults()
  const dto = projectCatalog(index, dispositionsDoc, defaultsCfg)

  // Text bucket: projected listed rows ∩ config/gate-enabled directory rows.
  const enabledTextIds = new Set(enabledTextModels(text, gate).map((row) => row.id))
  const textRows = dto.text
    .filter((row) => enabledTextIds.has(row.id))
    .map((row) => ({ ...row, label: textModelLabel(row.id) }))

  const lists = {
    text: textRows,
    image: isMediaEnabled(gate, 'image') ? dto.image : [],
    video: isMediaEnabled(gate, 'video') ? dto.video : [],
    audio: isMediaEnabled(gate, 'audio') ? dto.audio : [],
  }

  const configDefaults = {
    text: text.defaultModel || DEFAULT_TEXT.defaultModel,
    image: media.providers?.omnimux?.models?.image || DEFAULT_MEDIA.providers.omnimux.models.image,
    video: media.providers?.omnimux?.models?.video || DEFAULT_MEDIA.providers.omnimux.models.video,
    audio: media.providers?.omnimux?.models?.audio || DEFAULT_MEDIA.providers.omnimux.models.audio,
  }

  /** @type {{ text: string, image: string, video: string, audio: string }} */
  const defaults = {
    text: '',
    image: '',
    video: '',
    audio: '',
  }
  for (const kind of CATALOG_KINDS) {
    const ids = new Set(lists[kind].map((row) => row.id))
    // env > settings > config > byOperation primary-op default > first row
    const byOpDefault = dto.defaultsByOperation[KIND_PRIMARY_OP[kind]]
    const fallback = typeof byOpDefault === 'string' && ids.has(byOpDefault)
      ? byOpDefault
      : lists[kind][0]?.id ?? ''
    defaults[kind] = resolveDefault({
      kind,
      ids,
      env: { [ENV_DEFAULT_KEYS[kind]]: resolveModelId(index, trimId(env[ENV_DEFAULT_KEYS[kind]])) },
      settingsDefaults: {
        [SETTINGS_DEFAULT_KEYS[kind]]: resolveModelId(index, trimId(settingsDefaults[SETTINGS_DEFAULT_KEYS[kind]])),
      },
      configDefault: resolveModelId(index, configDefaults[kind]) ?? '',
      fallback,
    })
  }

  /** Per-kind generation mode a new node starts in (see resolveDefaultOperation). */
  const defaultOperations = {}
  for (const kind of Object.keys(SETTINGS_DEFAULT_OPERATION_KEYS)) {
    defaultOperations[kind] = resolveDefaultOperation({
      kind,
      configured: settingsDefaults[SETTINGS_DEFAULT_OPERATION_KEYS[kind]],
      modelId: defaults[kind],
      ids: new Set(lists[kind].map((row) => row.id)),
      models: dto.models,
    })
  }

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    source: 'omnimux',
    fingerprint: fingerprintOf(lists, defaults, {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      contractFingerprint: index.contentFingerprint,
      listedOperations: index.listedOperations ?? [],
      defaultsByOperation: dto.defaultsByOperation,
      dispositions: (dispositionsDoc.dispositions ?? []).map((row) => [
        row?.id,
        row?.disposition,
        row?.target ?? null,
      ]),
    }),
    contractFingerprint: index.contentFingerprint,
    models: dto.models,
    defaults,
    defaultsByOperation: dto.defaultsByOperation,
    defaultOperations,
    text: lists.text,
    image: lists.image,
    video: lists.video,
    audio: lists.audio,
  }
}

/**
 * @param {{
 *   kind: 'text' | 'image' | 'video' | 'audio',
 *   ids: Set<string>,
 *   env: Record<string, string | undefined>,
 *   settingsDefaults: Record<string, unknown>,
 *   configDefault: string,
 *   fallback: string,
 * }} input
 */
export function resolveDefault(input) {
  const envId = trimId(input.env[ENV_DEFAULT_KEYS[input.kind]])
  if (envId && input.ids.has(envId)) return envId
  const settingsId = trimId(input.settingsDefaults[SETTINGS_DEFAULT_KEYS[input.kind]])
  if (settingsId && input.ids.has(settingsId)) return settingsId
  if (input.configDefault && input.ids.has(input.configDefault)) return input.configDefault
  return input.fallback
}

/** @param {unknown} value */
function trimId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * H2: contract-sensitive fingerprint. With `contract` context the input is
 * contractFingerprint + listedOperations + defaults + defaultsByOperation +
 * dispositions + schemaVersion (+ the projected list ids) — changing any
 * MIME/count/size/duration/op/output/admission/disposition moves it.
 * Legacy two-arg calls (lists + defaults only) stay deterministic (compat
 * overload for old callers).
 *
 * @param {{ text: Array<{ id: string }>, image: Array<{ id: string }>, video: Array<{ id: string }>, audio: Array<{ id: string }> }} lists
 * @param {{ text: string, image: string, video: string, audio: string }} defaults
 * @param {{
 *   schemaVersion: string,
 *   contractFingerprint: string,
 *   listedOperations: string[],
 *   defaultsByOperation: Record<string, string>,
 *   dispositions: unknown[],
 * }} [contract]
 */
export function fingerprintOf(lists, defaults, contract) {
  const listIds = {
    text: lists.text.map((row) => row.id),
    image: lists.image.map((row) => row.id),
    video: lists.video.map((row) => row.id),
    audio: lists.audio.map((row) => row.id),
  }
  const payload = JSON.stringify(
    contract && typeof contract === 'object'
      ? {
          schemaVersion: contract.schemaVersion,
          contractFingerprint: contract.contractFingerprint,
          listedOperations: [...(contract.listedOperations ?? [])].sort(),
          defaultsByOperation: contract.defaultsByOperation ?? {},
          dispositions: contract.dispositions ?? [],
          lists: listIds,
          defaults,
        }
      : { ...listIds, defaults },
  )
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}
