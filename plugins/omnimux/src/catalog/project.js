/**
 * Catalog v1.1 projection (H2): ContractIndex → Catalog DTO.
 *
 * Authority: flat `models[]` (operations/inputs/output/research/execution/
 * aliases/parameters + disposition governance). The legacy four lists
 * (text/image/video/audio) are derived ONLY from visible (listed) operations'
 * `output.type` — never from managementGroup / file ownership / input modality.
 * `speech_to_text` outputs text → its model would land in the text bucket.
 *
 * Facade rows (media SPECS directory / CHAT_MODELS chat directory) project the
 * FULL contract directory (all contracted models of a group, listed or not);
 * the catalog DTO buckets are listed-only. Both are pure projections — no
 * hardcoded row data remains.
 */

import { loadAll, DEFAULT_SPECS_DIR } from './contract/load.js';
import { checkAdmission } from './contract/admission.js';
import { CANONICAL_SCHEMA_VERSION } from './contract/schema.js';
import { resolveDisposition } from './contract/dispositions.js';
import { resolveModelId } from './contract/index.js';
import { getModelChannelGroups } from './serving/channel-groups.js';
import { resolveGroupEstimatedPoints } from './pricing-calculator.js';
import { sortCatalogRows } from './sort.js';

export { resolveModelId };

export const CATALOG_BUCKET_KINDS = Object.freeze(['text', 'image', 'video', 'audio']);

/**
 * Fail-closed health gate. Parse errors or any admission-strict issue throw;
 * there is no legacy table to fall back to (it was physically deleted).
 * @param {import('./contract/index.js').ContractIndex} index
 * @returns {import('./contract/index.js').ContractIndex}
 */
export function assertContractHealthy(index) {
  const parseErrors = Array.isArray(index?.parseErrors) ? index.parseErrors : [];
  if (parseErrors.length > 0) {
    const err = new Error(`model contract parse failure in ${index.specsDir ?? '(unknown specsDir)'}: ${parseErrors[0]}`);
    /** @type {any} */ (err).code = 'yaml_parse_error';
    throw err;
  }
  const admission = checkAdmission(index);
  if (!admission.ok) {
    const first = admission.issues.find((i) => i.level === 'error') ?? {};
    const err = new Error(
      `model contract admission failed in ${index.specsDir ?? '(unknown specsDir)'}: ` +
        `${first.code ?? 'unknown'}${first.file ? ` file=${first.file}` : ''}${first.modelId ? ` model=${first.modelId}` : ''}: ${first.message ?? ''}`,
    );
    /** @type {any} */ (err).code = first.code ?? 'admission_failed';
    throw err;
  }
  return index;
}

/**
 * Load the on-disk contract index (content-hash cached) and assert health.
 * Throws on any contract failure (fail-closed; hub boot surfaces it).
 * @param {string} [specsDir]
 * @returns {import('./contract/index.js').ContractIndex}
 */
export function getHealthyContractIndex(specsDir = DEFAULT_SPECS_DIR) {
  return assertContractHealthy(loadAll(specsDir));
}

/**
 * Operations visible in the catalog: op-level listed only (H1 five-predicate).
 * @param {object} model
 * @returns {object[]}
 */
export function visibleOps(model) {
  return (model?.operations ?? []).filter((op) => op.listed === true);
}

/**
 * Merge op input slots into the legacy inputCapability row shape.
 * roles 并集、min 取最小、max 取最大、allowedMimes 并集（有损但兼容旧行形状；
 * 精确槽位消费走权威 models[].operations[]）。
 * @param {object[]} ops
 * @returns {object|undefined}
 */
export function mergeInputCapability(ops) {
  /** @type {string[]} */
  const modalities = [];
  /** @type {object|undefined} */
  let referenceImages;
  /** @type {object|undefined} */
  let referenceAudios;
  /** @type {object|undefined} */
  let referenceVideos;

  const addModality = (m) => {
    if (m && !modalities.includes(m)) modalities.push(m);
  };

  for (const op of ops ?? []) {
    for (const slot of op?.inputs ?? []) {
      const type = slot?.type;
      if (slot?.role === 'prompt' || type === 'text') addModality('text');
      else if (type === 'image') addModality('image');
      else if (type === 'audio') addModality('audio');
      else if (type === 'video') addModality('video');
      else if (type === 'document') addModality('document');

      const mergeRef = (acc) => {
        const slotMax = slot.max === null
          ? null
          : Number.isFinite(slot.max) ? slot.max : 0;
        if (!acc) {
          return {
            min: Number.isFinite(slot.min) ? slot.min : 0,
            max: slotMax,
            allowedMimeTypes: Array.isArray(slot.allowedMimes) ? [...slot.allowedMimes] : [],
            supportedRoles: slot.role ? [slot.role] : [],
          };
        }
        acc.min = Math.min(acc.min, Number.isFinite(slot.min) ? slot.min : 0);
        acc.max = acc.max === null || slotMax === null
          ? null
          : Math.max(acc.max, slotMax);
        for (const mime of slot.allowedMimes ?? []) {
          if (!acc.allowedMimeTypes.includes(mime)) acc.allowedMimeTypes.push(mime);
        }
        if (slot.role && !acc.supportedRoles.includes(slot.role)) acc.supportedRoles.push(slot.role);
        return acc;
      };

      if (type === 'image') referenceImages = mergeRef(referenceImages);
      else if (type === 'audio') referenceAudios = mergeRef(referenceAudios);
      else if (type === 'video') referenceVideos = mergeRef(referenceVideos);
    }
  }

  if (modalities.length === 0 && !referenceImages && !referenceAudios && !referenceVideos) {
    return undefined;
  }
  /** @type {Record<string, unknown>} */
  const out = { modalities };
  if (referenceImages) out.referenceImages = referenceImages;
  if (referenceAudios) out.referenceAudios = referenceAudios;
  if (referenceVideos) out.referenceVideos = referenceVideos;
  return out;
}

/**
 * Project one legacy-shaped catalog row from a model + the ops that justify it.
 * @param {object} model
 * @param {object[]} ops
 * @returns {object}
 */
export function projectRow(model, ops) {
  /** @type {Record<string, unknown>} */
  const row = { id: model.id, label: model.label };
  if (typeof model.badge === 'string') row.badge = model.badge;
  if (typeof model.subtitle === 'string') row.subtitle = model.subtitle;
  if (typeof model.family === 'string') row.family = model.family;
  const inputCapability = mergeInputCapability(ops);
  if (inputCapability) row.inputCapability = inputCapability;
  if (model.parameters && typeof model.parameters === 'object') {
    row.parameters = structuredClone(model.parameters);
  }
  // The composer's model picker reads these rows, so pricing has to travel
  // with them — not only on the flat `models[]` DTO.
  row.channelGroups = projectChannelGroups(model.id);
  return row;
}

/**
 * Catalog v1.1 bucket rows for one kind: models having at least one LISTED op
 * whose output.type === kind. One row per canonical model per kind (aliases
 * are normalized away upstream — a model.id appears at most once).
 * @param {import('./contract/index.js').ContractIndex} index
 * @param {'text'|'image'|'video'|'audio'} kind
 * @returns {object[]}
 */
export function projectKindRows(index, kind) {
  const rows = [];
  for (const model of index.all()) {
    const ops = visibleOps(model).filter((op) => op.output?.type === kind);
    if (ops.length === 0) continue;
    rows.push(projectRow(model, ops));
  }
  return sortCatalogRows(rows);
}

/**
 * Full-directory rows for a media managementGroup (facade tables). Includes
 * contracted-but-unlisted models; inputCapability merges ALL ops.
 * @param {import('./contract/index.js').ContractIndex} index
 * @param {'image'|'video'|'audio'} managementGroup
 * @returns {object[]}
 */
export function projectDirectoryRows(index, managementGroup) {
  const rows = index
    .all()
    .filter((m) => m.managementGroup === managementGroup)
    .map((m) => projectRow(m, m.operations ?? []));
  return sortCatalogRows(rows);
}

/**
 * Chat-directory rows (facade CHAT_MODELS): every contracted text model.
 * brand ← family, role ← YAML role (default flagship), input ← modalities.
 * @param {import('./contract/index.js').ContractIndex} index
 * @returns {object[]}
 */
export function projectChatRows(index) {
  return index
    .all()
    .filter((m) => m.managementGroup === 'text')
    .map((m) => {
      const inputCapability = mergeInputCapability(m.operations ?? []) ?? { modalities: ['text'] };
      const input = Array.isArray(inputCapability.modalities) ? [...inputCapability.modalities] : ['text'];
      return Object.freeze({
        id: m.id,
        brand: typeof m.family === 'string' ? m.family : 'unknown',
        role: typeof m.role === 'string' && m.role ? m.role : 'flagship',
        input: Object.freeze(input),
        inputCapability: Object.freeze(inputCapability),
      });
    });
}

/**
 * The channel groups a model can be served on, with their pricing.
 *
 * `serving/channel-groups.js` is the single source of truth for what a line
 * costs. Surfacing it here lets the composer's model picker and any later
 * caller read one authority instead of re-declaring prices, which is how the
 * canvas mirror drifted from the hub before.
 *
 * Only the fields a caller can act on are projected: the internal record may
 * grow fields that are not part of this contract. The result is always an
 * array — a model with no configured pool reports `[]` rather than a missing
 * key, so callers never need both an optional-chain and a default.
 *
 * @param {string} modelId
 * @returns {object[]}
 */
export function projectChannelGroups(modelId) {
  return getModelChannelGroups(modelId).map((group) => {
    const pricing = group.pricing && typeof group.pricing === 'object'
      ? structuredClone(group.pricing)
      : null;
    if (pricing && pricing.pointsEstimate == null) {
      const autoPoints = resolveGroupEstimatedPoints(modelId, group);
      if (typeof autoPoints === 'number') {
        pricing.pointsEstimate = autoPoints;
      }
    }
    return {
      id: group.id,
      label: group.label,
      ...(typeof group.badge === 'string' ? { badge: group.badge } : {}),
      wireGroup: group.wireGroup || group.id,
      ...(pricing ? { pricing } : {}),
      ...(group.constraints && typeof group.constraints === 'object'
        ? { constraints: structuredClone(group.constraints) }
        : {}),
      ...(group.sla && typeof group.sla === 'object' ? { sla: structuredClone(group.sla) } : {}),
      enabled: group.enabled !== false,
    };
  });
}

/**
 * Authoritative model DTO: contract passthrough + disposition governance.
 * @param {object} model
 * @param {object} dispositionsDoc
 * @returns {object}
 */
export function projectModelDto(model, dispositionsDoc) {
  const row = resolveDisposition(dispositionsDoc, model.id);
  return {
    id: model.id,
    label: model.label,
    ...(typeof model.family === 'string' ? { family: model.family } : {}),
    ...(typeof model.badge === 'string' ? { badge: model.badge } : {}),
    ...(typeof model.subtitle === 'string' ? { subtitle: model.subtitle } : {}),
    ...(Array.isArray(model.aliases) ? { aliases: [...model.aliases] } : {}),
    operations: (model.operations ?? []).map((op) => ({
      id: op.id,
      label: op.label,
      output: structuredClone(op.output ?? {}),
      inputs: structuredClone(op.inputs ?? []),
      ...(op.parameters ? { parameters: structuredClone(op.parameters) } : {}),
      ...(Array.isArray(op.aliases) ? { aliases: [...op.aliases] } : {}),
      research: { ...(op.research ?? {}) },
      execution: { ...(op.execution ?? {}) },
      listed: op.listed === true,
    })),
    ...(model.parameters && typeof model.parameters === 'object'
      ? { parameters: structuredClone(model.parameters) }
      : {}),
    listed: model.listed === true,
    listedOperations: [...(model.listedOperations ?? [])],
    channelGroups: projectChannelGroups(model.id),
    disposition: typeof row?.disposition === 'string' ? row.disposition : 'draft',
  };
}

/**
 * Project the Catalog v1.1 DTO (without env/settings-dependent defaults —
 * buildModelCatalog layers those on top).
 * @param {import('./contract/index.js').ContractIndex} index
 * @param {object} dispositionsDoc
 * @param {object} [defaultsCfg]
 * @returns {object}
 */
export function projectCatalog(index, dispositionsDoc, defaultsCfg = {}) {
  const models = index.all().map((m) => projectModelDto(m, dispositionsDoc));
  /** @type {Record<string, object[]>} */
  const lists = { text: [], image: [], video: [], audio: [] };
  for (const model of index.all()) {
    const ops = visibleOps(model);
    const kinds = [...new Set(ops.map((op) => op.output?.type))].filter((k) =>
      CATALOG_BUCKET_KINDS.includes(/** @type {any} */ (k)),
    );
    for (const kind of kinds) {
      lists[kind].push(projectRow(model, ops.filter((op) => op.output?.type === kind)));
    }
  }
  for (const kind of CATALOG_BUCKET_KINDS) {
    lists[kind] = sortCatalogRows(lists[kind]);
  }
  const byOperation =
    defaultsCfg && typeof defaultsCfg === 'object' && defaultsCfg.byOperation && typeof defaultsCfg.byOperation === 'object'
      ? { ...defaultsCfg.byOperation }
      : {};
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    source: 'omnimux',
    models,
    text: lists.text,
    image: lists.image,
    video: lists.video,
    audio: lists.audio,
    defaultsByOperation: byOperation,
  };
}
