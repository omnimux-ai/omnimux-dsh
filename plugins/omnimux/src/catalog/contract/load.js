/**
 * YAML contract loader: parse (yaml package), normalize (op-level status),
 * content-hash memo index, fingerprint.
 * H1 shadow only — do not call from buildModelCatalog hot path.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  loadOperationRegistry,
  loadAdapterProfiles,
  validateDoc,
  validateModel,
  promptPolicyFor,
  validateCrossModelAliases,
  CANONICAL_SCHEMA_VERSION,
} from './schema.js';
import {
  normalizeResearch,
  normalizeImplementation,
  normalizeExecution,
  materializeOpStatus,
  computeOperationListed,
  deriveModelListedSummary,
} from './status.js';
import { mapLegacyOperation } from './legacy-operation-map.js';
import { materializeVoiceOptions, readVoiceIndexSnapshot } from '../voices/options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SPECS_DIR = join(__dirname, '..', 'specs');

/**
 * Legacy root `version` values accepted for input-only migration to
 * schemaVersion "1.1". Formal specs must already be canonical.
 * Accepts common historical strings such as "1.0" / "1.0.0".
 */
const LEGACY_ROOT_VERSION_OK = new Set(['1.0', '1.0.0', '1']);

/** @type {{ key: string, index: import('./index.js').ContractIndex } | null} */
let memoCache = null;

/**
 * @returns {void}
 */
export function resetContractCache() {
  memoCache = null;
}

/**
 * Stable JSON stringify: sort object keys recursively; arrays keep order.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  return JSON.stringify(sortKeys(value));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeys(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

/**
 * @param {unknown} payload
 * @returns {string} sha256 hex first 16 chars
 */
export function contentFingerprint(payload) {
  const body = canonicalStringify(payload);
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/**
 * Build cache key from sorted file names + content hashes (NOT mtime).
 * @param {string} specsDir
 * @param {{ name: string, content: string }[]} snapshots
 * @returns {string}
 */
export function buildContentCacheKey(specsDir, snapshots) {
  const parts = snapshots
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const h = createHash('sha256').update(s.content).digest('hex');
      return `${s.name}:${h}`;
    });
  const joined = parts.join('\0');
  const aggregate = createHash('sha256').update(joined).digest('hex');
  return `${specsDir}\n${parts.map((p) => p.split(':')[0]).join('\0')}\n${aggregate}`;
}

/**
 * Read YAML snapshots once for both cache key and parse.
 * @param {string} specsDir
 * @returns {{ name: string, path: string, content: string }[]}
 */
export function readYamlSnapshots(specsDir) {
  let names;
  try {
    names = readdirSync(specsDir);
  } catch (err) {
    const e = new Error(`cannot read specs dir ${specsDir}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'yaml_parse_error';
    throw e;
  }
  return names
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const path = join(specsDir, name);
      let content;
      try {
        content = readFileSync(path, 'utf8');
      } catch (err) {
        const e = new Error(`failed to read contract file ${path}: ${err?.message ?? err}`);
        /** @type {any} */ (e).code = 'yaml_parse_error';
        /** @type {any} */ (e).file = path;
        /** @type {any} */ (e).cause = err;
        throw e;
      }
      return { name, path, content };
    });
}

/**
 * @param {string} text
 * @param {string} filePath
 * @returns {{ doc: object, file: string }}
 */
export function parseYamlText(text, filePath) {
  try {
    const doc = parseYaml(text, { maxAliasCount: 100 });
    if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
      const e = new Error(`YAML root must be a mapping in ${filePath}`);
      /** @type {any} */ (e).code = 'yaml_parse_error';
      /** @type {any} */ (e).file = filePath;
      throw e;
    }
    return { doc, file: filePath };
  } catch (err) {
    if (/** @type {any} */ (err).code === 'yaml_parse_error') throw err;
    const e = new Error(`YAML parse error in ${filePath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'yaml_parse_error';
    /** @type {any} */ (e).file = filePath;
    /** @type {any} */ (e).cause = err;
    /** @type {any} */ (e).stack = err?.stack ?? e.stack;
    throw e;
  }
}

/**
 * @param {string} filePath
 * @returns {{ doc: object, file: string }}
 */
export function parseFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    const e = new Error(`failed to read contract file ${filePath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'yaml_parse_error';
    /** @type {any} */ (e).file = filePath;
    /** @type {any} */ (e).cause = err;
    throw e;
  }
  return parseYamlText(text, filePath);
}

/**
 * Pure pre-normalization of model-capability document root.
 * Order contract: parseYaml → preNormalizeDocRoot → validateDoc (canonical) → normalize.
 *
 * Rules (Design §3.2.1):
 * - only schemaVersion:"1.1" → OK (pass-through)
 * - only legacy root version (nonempty string; preferred "1.0"/"1.0.0") → map to
 *   schemaVersion:"1.1", delete version, optional warning legacy_schema_version_key
 * - both schemaVersion + version → fail closed (even if values "look equal")
 * - missing / empty / non-string / unsupported schemaVersion → error
 *
 * Does not swallow malformed roots as warnings.
 *
 * @param {unknown} raw
 * @param {{ file?: string }} [opts]
 * @returns {{
 *   ok: boolean,
 *   doc?: object,
 *   issues: object[],
 *   schemaVersion?: string,
 * }}
 */
export function preNormalizeDocRoot(raw, opts = {}) {
  const file = opts.file;
  /** @type {object[]} */
  const issues = [];

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push({
      level: 'error',
      code: 'schema_invalid',
      message: 'document root must be object',
      path: '',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }

  // Shallow clone so callers keep the original parse tree if needed.
  /** @type {Record<string, unknown>} */
  const doc = { .../** @type {Record<string, unknown>} */ (raw) };
  const hasSchemaVersion = Object.prototype.hasOwnProperty.call(doc, 'schemaVersion');
  const hasVersion = Object.prototype.hasOwnProperty.call(doc, 'version');
  const sv = doc.schemaVersion;
  const lv = doc.version;

  if (hasSchemaVersion && hasVersion) {
    issues.push({
      level: 'error',
      code: 'schema_version_conflict',
      message:
        'document root must not declare both schemaVersion and legacy version (fail closed even if values appear equal)',
      path: 'schemaVersion',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }

  if (!hasSchemaVersion && !hasVersion) {
    issues.push({
      level: 'error',
      code: 'schema_invalid',
      message: 'document missing schemaVersion (and no legacy version to migrate)',
      path: 'schemaVersion',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }

  if (hasVersion && !hasSchemaVersion) {
    if (typeof lv !== 'string' || lv.trim() === '') {
      issues.push({
        level: 'error',
        code: 'schema_invalid',
        message: `legacy root version must be nonempty string, got ${lv === null ? 'null' : typeof lv}`,
        path: 'version',
        ...(file ? { file } : {}),
      });
      return { ok: false, issues };
    }
    // Accept known legacy literals; also accept other nonempty strings with a
    // warning so fixture history can migrate, but never invent from empty.
    if (!LEGACY_ROOT_VERSION_OK.has(lv) && lv !== CANONICAL_SCHEMA_VERSION) {
      issues.push({
        level: 'warning',
        code: 'legacy_schema_version_key',
        message: `legacy root version "${lv}" migrated to schemaVersion "${CANONICAL_SCHEMA_VERSION}" (non-standard legacy literal)`,
        path: 'version',
        ...(file ? { file } : {}),
      });
    } else {
      issues.push({
        level: 'warning',
        code: 'legacy_schema_version_key',
        message: `legacy root version "${lv}" migrated to schemaVersion "${CANONICAL_SCHEMA_VERSION}"`,
        path: 'version',
        ...(file ? { file } : {}),
      });
    }
    delete doc.version;
    doc.schemaVersion = CANONICAL_SCHEMA_VERSION;
    return {
      ok: true,
      doc,
      issues,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    };
  }

  // hasSchemaVersion only
  if (typeof sv !== 'string') {
    issues.push({
      level: 'error',
      code: 'schema_invalid',
      message: `schemaVersion must be string, got ${sv === null ? 'null' : typeof sv}`,
      path: 'schemaVersion',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }
  if (sv.trim() === '') {
    issues.push({
      level: 'error',
      code: 'schema_invalid',
      message: 'schemaVersion must be nonempty string',
      path: 'schemaVersion',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }
  if (sv !== CANONICAL_SCHEMA_VERSION) {
    issues.push({
      level: 'error',
      code: 'schema_version_unsupported',
      message: `unsupported schemaVersion "${sv}"; required exact "${CANONICAL_SCHEMA_VERSION}"`,
      path: 'schemaVersion',
      ...(file ? { file } : {}),
    });
    return { ok: false, issues };
  }

  // Ensure no residual version key slipped in somehow
  if (Object.prototype.hasOwnProperty.call(doc, 'version')) {
    delete doc.version;
  }

  return {
    ok: true,
    doc,
    issues,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

/**
 * @param {Record<string, unknown>} slot
 * @returns {object}
 */
function normalizeSlot(slot) {
  const role = typeof slot.role === 'string' ? slot.role : 'reference';
  let source = typeof slot.source === 'string' ? slot.source : undefined;
  if (!source) {
    source = role === 'prompt' ? 'node_field' : 'upstream_edge';
  }
  /** @type {Record<string, unknown>} */
  const out = {
    slot: String(slot.slot ?? ''),
    type: slot.type,
    role,
    source,
    min: Number(slot.min),
    max: slot.max === null ? null : Number(slot.max),
  };
  if (Array.isArray(slot.allowedMimes)) out.allowedMimes = [...slot.allowedMimes];
  if (slot.maxSizeMb != null) out.maxSizeMb = Number(slot.maxSizeMb);
  if (typeof slot.maxSizeExclusive === 'boolean') out.maxSizeExclusive = slot.maxSizeExclusive;
  if (slot.minDurationSec != null) out.minDurationSec = Number(slot.minDurationSec);
  if (slot.maxDurationSec != null) out.maxDurationSec = Number(slot.maxDurationSec);
  if (slot.totalMinDurationSec != null) out.totalMinDurationSec = Number(slot.totalMinDurationSec);
  if (slot.totalMaxDurationSec != null) out.totalMaxDurationSec = Number(slot.totalMaxDurationSec);
  if (slot.combinedOutputMaxDurationSec != null) out.combinedOutputMaxDurationSec = Number(slot.combinedOutputMaxDurationSec);
  if (typeof slot.totalMinExclusive === 'boolean') out.totalMinExclusive = slot.totalMinExclusive;
  if (typeof slot.totalMaxExclusive === 'boolean') out.totalMaxExclusive = slot.totalMaxExclusive;
  if (slot.limitSource && typeof slot.limitSource === 'object') {
    out.limitSource = { .../** @type {object} */ (slot.limitSource) };
  }
  if (typeof slot.hint === 'string') out.hint = slot.hint;
  return out;
}

/**
 * Apply promptPolicy: NEVER magic-inject required prompt (validator errors instead).
 * optional/none also never inject.
 * @param {object[]} inputs
 * @param {'required'|'optional'|'none'|undefined} policy
 * @returns {{ inputs: object[], warning?: object }}
 */
function applyPromptPolicy(inputs, policy) {
  // H1 hard rule: no ensurePromptSlot magic. YAML must list prompt when required.
  void policy;
  return { inputs };
}

/**
 * @param {Record<string, unknown>} op
 * @param {{ research?: object, implementation?: object, execution?: object, governance?: object }} modelDefaults
 * @param {object} registry
 * @param {object} profiles
 * @param {string} modelId
 * @param {{ gateAllows?: Function }} [ctx]
 * @returns {{ op: object, warnings: object[] }}
 */
function normalizeOperation(op, modelDefaults, registry, profiles, modelId, ctx = {}) {
  const rawId = typeof op.id === 'string' ? op.id : typeof op.mode === 'string' ? op.mode : '';
  const id = mapLegacyOperation(rawId);
  const inputsRaw = Array.isArray(op.inputs) ? op.inputs : [];
  const slots = inputsRaw.map((s) => normalizeSlot(/** @type {any} */ (s)));
  const policy = promptPolicyFor(id, registry);
  const { inputs, warning } = applyPromptPolicy(slots, policy);
  /** @type {object[]} */
  const warnings = [];
  if (warning) {
    warnings.push({ ...warning, modelId, operationId: id });
  }
  if (policy === 'none' && inputs.some((s) => s.role === 'prompt' || s.slot === 'prompt')) {
    warnings.push({
      level: 'warning',
      code: 'prompt_forbidden',
      modelId,
      operationId: id,
      message: `promptPolicy=none but operation "${id}" has prompt slot`,
    });
  }

  /** @type {Record<string, unknown>} */
  const out = {
    id,
    label: typeof op.label === 'string' ? op.label : id,
    output:
      op.output && typeof op.output === 'object'
        ? { .../** @type {object} */ (op.output) }
        : { type: undefined },
    inputs,
  };
  if (op.parameters && typeof op.parameters === 'object') {
    out.parameters = { .../** @type {object} */ (op.parameters) };
  }
  if (Array.isArray(op.inputGroups)) {
    out.inputGroups = op.inputGroups.map((group) => ({ .../** @type {object} */ (group) }));
  }
  if (Array.isArray(op.aliases)) {
    out.aliases = [...op.aliases];
  }

  // Carry raw statuses for materialize.
  if (op.research != null) out._rawResearch = op.research;
  if (op.implementation != null) out._rawImplementation = op.implementation;
  if (op.execution != null) out._rawExecution = op.execution;

  const { research, implementation, execution } = materializeOpStatus(
    { research: op.research, implementation: op.implementation, execution: op.execution },
    modelDefaults,
  );
  out.research = research;
  out.implementation = implementation;
  out.execution = execution;

  return { op: out, warnings };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ managementGroup?: string, profiles?: object, registry?: object, gateAllows?: Function }} [ctx]
 * @returns {object}
 */
export function normalizeModel(raw, ctx = {}) {
  const registry = ctx.registry ?? loadOperationRegistry();
  const profiles = ctx.profiles ?? loadAdapterProfiles();

  const modelResearch = normalizeResearch(raw.research, /** @type {any} */ (raw.governance));
  const modelImplementation = normalizeImplementation(raw.implementation);
  const modelExecution = normalizeExecution(raw.execution);
  const modelDefaults = {
    research: modelResearch,
    implementation: modelImplementation,
    execution: modelExecution,
    governance: raw.governance,
  };

  const opsSrc = Array.isArray(raw.operations)
    ? raw.operations
    : Array.isArray(raw.modes)
      ? raw.modes
      : [];

  /** @type {object[]} */
  const allWarnings = [];
  const operations = opsSrc.map((o) => {
    const { op, warnings } = normalizeOperation(
      /** @type {any} */ (o),
      modelDefaults,
      registry,
      profiles,
      String(raw.id ?? ''),
      ctx,
    );
    allWarnings.push(...warnings);
    return op;
  });

  /** @type {Record<string, unknown>} */
  const model = {
    id: String(raw.id ?? ''),
    label: String(raw.label ?? raw.id ?? ''),
    operations,
    // Keep model-level defaults for diagnostics (optional after normalize)
    research: modelResearch,
    implementation: modelImplementation,
    execution: modelExecution,
  };
  if (typeof raw.family === 'string') model.family = raw.family;
  if (typeof raw.badge === 'string') model.badge = raw.badge;
  if (typeof raw.subtitle === 'string') model.subtitle = raw.subtitle;
  // H2: chat directory role (flagship/classic) for the text facade projection
  if (typeof raw.role === 'string') model.role = raw.role;
  if (raw.parameters && typeof raw.parameters === 'object') {
    model.parameters = { .../** @type {object} */ (raw.parameters) };
  }
  if (raw.routing && typeof raw.routing === 'object') {
    model.routing = { .../** @type {object} */ (raw.routing) };
  }
  if (Array.isArray(raw.aliases)) model.aliases = [...raw.aliases];
  if (ctx.managementGroup) model.managementGroup = ctx.managementGroup;

  // Per-op admission + listed
  /** @type {object[]} */
  const issues = [];

  // Validate model shape with materialized ops (prompt already handled)
  const shapeIssues = validateModel(
    {
      id: model.id,
      label: model.label,
      operations: model.operations.map((op) => ({
        id: op.id,
        label: op.label,
        output: op.output,
        inputs: op.inputs,
        inputGroups: op.inputGroups,
        research: op.research,
        implementation: op.implementation,
        execution: op.execution,
        aliases: op.aliases,
      })),
      research: model.research,
      implementation: model.implementation,
      execution: model.execution,
      routing: model.routing,
      aliases: model.aliases,
    },
    { profiles, registry },
  );
  issues.push(...shapeIssues);

  for (const op of operations) {
    const opErrors = shapeIssues.filter(
      (i) => i.level === 'error' && (i.operationId === op.id || (i.path && i.path.includes(`"${op.id}"`))),
    );
    // contractComplete for this op: no error whose path references this op index or operationId
    const opIndex = operations.indexOf(op);
    const opPathPrefix = `operations[${opIndex}]`;
    const hasOpError = shapeIssues.some(
      (i) =>
        i.level === 'error' &&
        (i.operationId === op.id ||
          (typeof i.path === 'string' && (i.path === opPathPrefix || i.path.startsWith(`${opPathPrefix}.`)))),
    );
    // Also fail contractComplete if model-level critical missing id/label (shared)
    const modelCritical = shapeIssues.some(
      (i) => i.level === 'error' && (i.path === 'id' || i.path === 'label' || !i.path),
    );
    const contractComplete = !hasOpError && !modelCritical;
    op.listed = computeOperationListed(op, model.id, profiles, {
      contractComplete,
      gateAllows: ctx.gateAllows,
    });
    // strip internal
    delete op._rawResearch;
    delete op._rawImplementation;
    delete op._rawExecution;
  }

  const summary = deriveModelListedSummary(model);
  model.listed = summary.listed;
  model.listedOperations = summary.listedOperations;
  model._admissionIssues = [...issues, ...allWarnings];
  return model;
}

/**
 * @param {object} doc canonical root (schemaVersion already set; no root version)
 * @param {{ file?: string, profiles?: object, registry?: object, gateAllows?: Function }} [ctx]
 * @returns {object[]}
 */
export function normalizeDoc(doc, ctx = {}) {
  const managementGroup =
    (typeof doc.managementGroup === 'string' && doc.managementGroup) ||
    (typeof doc.modality === 'string' && doc.modality) ||
    undefined;
  const models = Array.isArray(doc.models) ? doc.models : [];
  return models.map((m) =>
    normalizeModel(/** @type {any} */ (m), {
      managementGroup,
      profiles: ctx.profiles,
      registry: ctx.registry,
      gateAllows: ctx.gateAllows,
    }),
  );
}

/**
 * Parse → preNormalize → validateDoc pipeline helper for a single YAML snapshot.
 * Fail-closed on root version issues; never lets malformed roots become soft warnings only.
 *
 * @param {object} rawDoc
 * @param {{ file?: string, registry?: object, profiles?: object }} [opts]
 * @returns {{
 *   ok: boolean,
 *   doc?: object,
 *   issues: object[],
 *   schemaVersion?: string,
 * }}
 */
export function prepareCanonicalDoc(rawDoc, opts = {}) {
  const pre = preNormalizeDocRoot(rawDoc, { file: opts.file });
  if (!pre.ok || !pre.doc) {
    return { ok: false, issues: pre.issues };
  }
  const validation = validateDoc(pre.doc, {
    file: opts.file,
    registry: opts.registry,
    profiles: opts.profiles,
  });
  const issues = [...pre.issues, ...validation];
  const hasError = issues.some((i) => i.level === 'error');
  return {
    ok: !hasError,
    doc: pre.doc,
    issues,
    schemaVersion: pre.schemaVersion ?? CANONICAL_SCHEMA_VERSION,
  };
}

/**
 * @param {string} specsDir
 * @returns {string[]}
 */
export function listYamlFiles(specsDir) {
  return readYamlSnapshots(specsDir).map((s) => s.path);
}

/**
 * @param {string} [specsDir]
 * @param {{ gateAllows?: Function, useCache?: boolean }} [opts]
 * @returns {import('./index.js').ContractIndex}
 */
export function loadAll(specsDir = DEFAULT_SPECS_DIR, opts = {}) {
  const useCache = opts.useCache !== false;

  const snapshots = readYamlSnapshots(specsDir);
  const voiceSnapshot = readVoiceIndexSnapshot();
  const cacheKey = buildContentCacheKey(specsDir, [...snapshots, voiceSnapshot]);

  if (useCache && memoCache && memoCache.key === cacheKey) {
    return memoCache.index;
  }

  const registry = loadOperationRegistry();
  const profiles = loadAdapterProfiles();

  /** @type {object[]} */
  const allIssues = [];
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {string[]} */
  const parseErrors = [];

  for (const snap of snapshots) {
    let parsed;
    try {
      parsed = parseYamlText(snap.content, snap.path);
      parsed.doc = materializeVoiceOptions(parsed.doc, voiceSnapshot);
    } catch (err) {
      parseErrors.push(err?.message ?? String(err));
      allIssues.push({
        level: 'error',
        code: 'yaml_parse_error',
        file: snap.path,
        message: err?.message ?? String(err),
        stack: err?.stack,
      });
      continue;
    }

    // parse → preNormalize → validateDoc (canonical only)
    const prepared = prepareCanonicalDoc(parsed.doc, {
      file: snap.path,
      registry,
      profiles,
    });
    allIssues.push(...prepared.issues);
    if (!prepared.ok || !prepared.doc) {
      // Fail closed: do not normalize/index models from malformed roots.
      continue;
    }

    const normalized = normalizeDoc(prepared.doc, {
      file: snap.path,
      profiles,
      registry,
      gateAllows: opts.gateAllows,
    });
    for (const model of normalized) {
      const id = model.id;
      if (!id) continue;
      if (byId.has(id)) {
        allIssues.push({
          level: 'error',
          code: 'duplicate_model_id',
          modelId: id,
          file: snap.path,
          message: `duplicate model id "${id}" across contract files`,
        });
        continue;
      }
      model.sourceFile = basename(snap.path);
      byId.set(id, model);
    }
  }

  // Cross-model alias conflicts (model.aliases wire ids + op.aliases uniqueness)
  allIssues.push(...validateCrossModelAliases(byId.values()));

  const sortedModels = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const fingerprintPayload = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    models: sortedModels.map((m) => {
      const { _admissionIssues, sourceFile, ...rest } = m;
      return {
        id: rest.id,
        label: rest.label,
        aliases: rest.aliases,
        listed: rest.listed,
        listedOperations: rest.listedOperations,
        parameters: rest.parameters,
        operations: (rest.operations ?? []).map((op) => ({
          id: op.id,
          listed: op.listed,
          research: op.research,
          execution: op.execution,
          output: op.output,
          inputs: op.inputs,
          parameters: op.parameters,
          // operation aliases are legacy op-name only; included for content stability
          aliases: op.aliases,
        })),
      };
    }),
  };
  // Never put a root `version` into fingerprint input.
  const fp = contentFingerprint(fingerprintPayload);

  /** @type {string[]} */
  const listedOperations = [];
  for (const m of sortedModels) {
    for (const key of m.listedOperations ?? []) {
      listedOperations.push(key);
    }
  }
  listedOperations.sort((a, b) => a.localeCompare(b));

  const index = {
    /** Canonical Contract v1.1 schema version; never root `version`. */
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    contentFingerprint: fp,
    contentCacheKey: cacheKey,
    byId,
    specsDir,
    issues: allIssues,
    parseErrors,
    registry,
    profiles,
    listedOperations,
    all() {
      return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    },
    get(id) {
      return byId.get(id);
    },
    byOutputType(outType) {
      return this.all().filter((m) =>
        (m.operations ?? []).some((op) => op.output?.type === outType),
      );
    },
    listedOperationsFor() {
      return [...listedOperations];
    },
  };

  if (useCache) {
    memoCache = { key: cacheKey, index };
  }
  return index;
}
