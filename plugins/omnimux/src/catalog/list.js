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
