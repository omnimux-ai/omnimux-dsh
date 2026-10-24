/**
 * Normalize the two upstream shapes of the OmniMux gateway catalog into one
 * "gateway view" snapshot.
 *
 * Two sources are supported:
 *   1. `GET /api/pricing` — what the hub will consume at runtime (P1). It
 *      carries membership, groups, prices and the gateway's per-model contract.
 *   2. The gateway repository's offline config baseline
 *      (`channels.json` + `models.json` + `options.json`, pulled from
 *      production MySQL). It carries membership and groups only; endpoint
 *      types and per-model contracts are recorded as unknown, never as
 *      "unsupported".
 *
 * Everything here is a pure function of its input: no network, no filesystem,
 * no clock beyond an injected timestamp. The snapshot is the *gateway's* view,
 * not the hub's catalog.
 */

import { createHash } from 'node:crypto'

export const CLOUD_SNAPSHOT_SCHEMA_VERSION = 1

/** Fields the gateway config baseline cannot express. */
const BASELINE_LIMITATIONS = Object.freeze([
  'channel-baseline lacks supported_endpoint_types',
  'channel-baseline lacks per-model contract',
])

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value @returns {number|null} */
function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** @param {unknown} value @returns {string[]} */
function stringList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const id = text(item)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * A channel field that the gateway stores as either a list or a
 * comma-separated string. `channel.group` and `channel.models` both appear in
 * the comma-separated form in production baselines, and one channel may serve
 * several groups at once.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function commaList(value) {
  if (Array.isArray(value)) return stringList(value)
  const raw = text(value)
  if (!raw) return []
  const out = []
  for (const part of raw.split(',')) {
    const item = part.trim()
    if (item && !out.includes(item)) out.push(item)
  }
  return out
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/** Parse a value that may be a JSON string, an object map, or an option row list. */
function keyedObject(value) {
  if (typeof value === 'string') {
    try {
      return keyedObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  if (Array.isArray(value)) {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const row of value) {
      const record = objectOrEmpty(row)
      const key = text(record.key ?? record.Key)
      if (key) out[key] = record.value ?? record.Value
    }
    return out
  }
  return objectOrEmpty(value)
}

/** Gateway option rows may be `[{key,value}]`, `{key: value}`, or a JSON string of either. */
export function readOptionMap(options) {
  return keyedObject(options)
}

/**
 * Read one gateway option that holds a JSON object (`GroupRatio`,
 * `UserUsableGroups`). Returns `{}` for anything that is not an object map.
 *
 * @param {Record<string, unknown>} map
 * @param {string} key
 */
export function readOptionValue(map, key) {
  const raw = keyedObject(map)[key]
  const parsed = typeof raw === 'string' ? safeJson(raw) : raw
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? /** @type {Record<string, unknown>} */ (parsed)
    : {}
}

/**
 * Read one gateway option that holds a JSON array (`AutoGroups`).
 *
 * @param {Record<string, unknown>} map
 * @param {string} key
 */
export function readOptionList(map, key) {
  const raw = keyedObject(map)[key]
  const parsed = typeof raw === 'string' ? safeJson(raw) : raw
  return Array.isArray(parsed) ? parsed : []
}

/** @param {string} value @returns {unknown} */
function safeJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** @param {unknown} input */
function arrayOrKeyed(input, keys) {
  if (Array.isArray(input)) return input
  const record = objectOrEmpty(input)
  for (const key of keys) {
    if (Array.isArray(record[key])) return /** @type {unknown[]} */ (record[key])
  }
  return []
}

/**
 * Normalize a `/api/pricing` payload.
 *
 * @param {unknown} payload
 * @param {{ generatedAt?: string|null }} [opts]
 * @returns {{ snapshot: object, issues: Array<{ code: string, detail?: string }> }}
 */
export function normalizePricingPayload(payload, opts = {}) {
  /** @type {Array<{ code: string, detail?: string }>} */
  const issues = []
  const root = Array.isArray(payload) ? { data: payload } : objectOrEmpty(payload)
  const rows = Array.isArray(root.data) ? root.data : null
  if (!rows) {
    issues.push({ code: 'missing-pricing-data', detail: 'payload has no data array' })
    return { snapshot: emptySnapshot('pricing', opts, issues), issues }
  }

  /** @type {Map<string, object>} */
  const models = new Map()
  for (const raw of rows) {
    const row = objectOrEmpty(raw)
    const id = text(row.id ?? row.model_name)
    if (!id) {
      issues.push({ code: 'skipped-model-without-id' })
      continue
    }
    if (models.has(id)) issues.push({ code: 'duplicate-model-row', detail: id })
    models.set(id, {
      id,
      displayName: text(row.model_name ?? row.display_name) || id,
      // Sorted so the content digest depends on membership, not on upstream
      // array ordering (the gateway has no usable version field).
      enableGroups: stringList(row.enable_groups ?? row.enableGroups).sort(),
      supportedEndpointTypes: stringList(row.supported_endpoint_types ?? row.supportedEndpointTypes).sort(),
      billing: {
        mode: text(row.billing_mode ?? row.billingMode) || null,
        modelPrice: finiteNumber(row.model_price ?? row.modelPrice),
        modelRatio: finiteNumber(row.model_ratio ?? row.modelRatio),
        quotaType: finiteNumber(row.quota_type ?? row.quotaType),
        // `billing_expr` overrides `model_price` upstream (see
        // docs/evidence/2026-10-21-hub-gateway-drift-audit.md §3 note 2), so a
        // price comparison must not treat `modelPrice` as authoritative when it
        // is present.
        expr: text(row.billing_expr ?? row.billingExpr) || null,
      },
      contract: objectOrEmpty(row.contract),
      contractPresent: Object.keys(objectOrEmpty(row.contract)).length > 0,
    })
  }

  const limitations = []
  if (models.size > 0 && [...models.values()].every((model) => model.enableGroups.length === 0)) {
    // Membership without groups is not a usable catalog: callers must not read
    // it as "nothing is served" (see the P1 note in the task spec).
    limitations.push('pricing-response-without-enable-groups')
  }

  const snapshot = {
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    source: 'pricing',
    generatedAt: opts.generatedAt ?? null,
    groups: {
      ratio: keyedObject(root.group_ratio ?? root.groupRatio),
      usable: keyedObject(root.usable_group ?? root.usableGroup),
      auto: stringList(root.auto_groups ?? root.autoGroups),
    },
    coverage: {
      models: models.size,
      channels: null,
      limitations,
    },
    models: sortModels([...models.values()]),
  }
  return { snapshot, issues }
}

/**
 * Normalize the gateway repository's offline config baseline.
 *
 * Reachability follows the gateway's own rule: only `status === 1` channels
 * generate abilities, so a model is routable iff an enabled channel binds it.
 *
 * @param {{ channels?: unknown, models?: unknown, options?: unknown }} input
 * @param {{ generatedAt?: string|null }} [opts]
 * @returns {{ snapshot: object, issues: Array<{ code: string, detail?: string }> }}
 */
export function normalizeChannelBaseline(input = {}, opts = {}) {
  /** @type {Array<{ code: string, detail?: string }>} */
  const issues = []
  const channels = arrayOrKeyed(input.channels, ['channels'])
  const modelRows = arrayOrKeyed(input.models, ['models', 'data'])
  const options = readOptionMap(input.options)

  if (channels.length === 0) {
    issues.push({ code: 'missing-channel-baseline', detail: 'no channel rows' })
    return { snapshot: emptySnapshot('channel-baseline', opts, issues), issues }
  }

  /** @type {Map<string, Set<string>>} */
  const reachable = new Map()
  let enabledChannels = 0
  for (const raw of channels) {
    const channel = objectOrEmpty(raw)
    if (finiteNumber(channel.status) !== 1) continue
    enabledChannels += 1
    const groups = commaList(channel.group)
    for (const modelId of commaList(channel.models)) {
      if (!reachable.has(modelId)) reachable.set(modelId, new Set())
      for (const group of groups) reachable.get(modelId).add(group)
    }
  }

  /** @type {Map<string, object>} */
  const meta = new Map()
  for (const raw of modelRows) {
    const row = objectOrEmpty(raw)
    const id = text(row.model_name ?? row.id)
    if (id) meta.set(id, row)
  }

  /** @type {object[]} */
  const models = []
  for (const [id, groups] of reachable) {
    const row = meta.get(id) ?? {}
    models.push({
      id,
      displayName: text(row.model_name) || id,
      enableGroups: [...groups].sort(),
      supportedEndpointTypes: [],
      billing: { mode: null, modelPrice: null, modelRatio: null, quotaType: null, expr: null },
      contract: {},
      contractPresent: false,
    })
  }

  const snapshot = {
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    source: 'channel-baseline',
    generatedAt: opts.generatedAt ?? null,
    groups: {
      ratio: readOptionValue(options, 'GroupRatio'),
      usable: readOptionValue(options, 'UserUsableGroups'),
      auto: stringList(readOptionList(options, 'AutoGroups')),
    },
    coverage: {
      models: models.length,
      channels: { total: channels.length, enabled: enabledChannels },
      limitations: [...BASELINE_LIMITATIONS],
    },
    models: sortModels(models),
  }
  return { snapshot, issues }
}

/** @param {object[]} models */
function sortModels(models) {
  return [...models].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

/** @param {string} source @param {{ generatedAt?: string|null }} opts @param {object[]} issues */
function emptySnapshot(source, opts, issues) {
  return {
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    source,
    generatedAt: opts.generatedAt ?? null,
    groups: { ratio: {}, usable: {}, auto: [] },
    coverage: {
      models: 0,
      channels: null,
      limitations: issues.map((issue) => issue.code),
    },
    models: [],
  }
}

/** True when the snapshot carries no usable membership information. */
export function isSnapshotEmpty(snapshot) {
  const models = Array.isArray(snapshot?.models) ? snapshot.models : []
  if (models.length === 0) return true
  return models.every((model) => stringList(model.enableGroups).length === 0)
}

/** Stable JSON for digesting: object keys sorted, arrays already normalized. */
export function serializeSnapshot(snapshot) {
  return JSON.stringify(sortDeep(snapshot))
}

/** @param {unknown} value @returns {unknown} */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = sortDeep(/** @type {Record<string, unknown>} */ (value)[key])
    }
    return out
  }
  return value
}

/** Content digest of the normalized snapshot (the gateway has no usable ETag). */
export function snapshotDigest(snapshot) {
  return createHash('sha256').update(serializeSnapshot(snapshot)).digest('hex')
}

/**
 * Content digest of any JSON value with key-order-independent hashing, so a
 * report can name the exact hub projection it was computed against.
 *
 * @param {unknown} value
 */
export function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(sortDeep(value))).digest('hex')
}

/**
 * Detect which input shape a JSON document is, so the CLI can accept either.
 *
 * @param {unknown} document
 * @returns {'pricing'|'channel-baseline'|'unknown'}
 */
export function detectSnapshotSource(document) {
  if (Array.isArray(document)) {
    const first = objectOrEmpty(document[0])
    if ('enable_groups' in first || 'model_ratio' in first) return 'pricing'
    if ('status' in first && 'models' in first) return 'channel-baseline'
    return 'unknown'
  }
  const record = objectOrEmpty(document)
  if (Array.isArray(record.data)) return 'pricing'
  if (Array.isArray(record.channels)) return 'channel-baseline'
  return 'unknown'
}
