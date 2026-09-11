/**
 * Model, document root, and cross-model aliases validation operators.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  issue,
  operationIdSet,
  loadOperationRegistry,
  loadAdapterProfiles,
  validateAliasesArray,
} from './commonSchema.js';
import { validateOperation } from './operationSchema.js';
import { validateResearch, validateExecution, validateImplementation } from './statusSchema.js';

/**
 * Validate routing configuration block on a model.
 */
function validateRouting(routing, modelId, file, out) {
  if (routing == null) return;
  if (typeof routing !== 'object' || Array.isArray(routing)) {
    out.push(issue('schema_invalid', 'routing must be object', { modelId, path: 'routing', file }));
    return;
  }
  const r = /** @type {Record<string, unknown>} */ (routing);
  const requiredFields = ['channel', 'wireModel', 'endpoint'];
  for (const field of requiredFields) {
    if (typeof r[field] !== 'string' || !r[field]) {
      out.push(issue('schema_invalid', `routing.${field} required`, { modelId, path: `routing.${field}`, file }));
    }
  }
  if (r.automaticFallback != null && typeof r.automaticFallback !== 'boolean') {
    out.push(issue('schema_invalid', 'routing.automaticFallback must be boolean', {
      modelId,
      path: 'routing.automaticFallback',
      file,
    }));
  }
}

/**
 * Resolve operations list from model object.
 */
function resolveModelOperations(m, modelId, file, out) {
  const hasOperations = Array.isArray(m.operations);
  const hasModes = Array.isArray(m.modes);
  if (hasOperations) return m.operations;
  if (hasModes) {
    out.push(
      issue('legacy_key_used', 'model uses legacy key "modes"; prefer "operations"', {
        modelId,
        path: 'modes',
        file,
        level: 'warning',
      }),
    );
    return m.modes;
  }
  return null;
}

/**
 * Validate model operations array.
 */
function validateModelOperations(ops, modelId, context, out) {
  const { opIds, registry, profiles, file, opts } = context;
  const opCtx = { modelId: modelId || 'unknown', opIds, registry, profiles, file, opts };
  for (let i = 0; i < ops.length; i++) {
    out.push(...validateOperation(ops[i], i, opCtx));
  }
}

/**
 * Validate model-level status blocks.
 */
function validateModelStatusBlocks(m, context, out) {
  const { modelId, file, profiles } = context;
  out.push(...validateResearch(m.research, 'research', { modelId, file }));
  if (m.implementation != null) {
    const implCtx = { modelId, file, profiles, isNormalizedOp: false };
    out.push(...validateImplementation(m.implementation, {}, 'implementation', implCtx));
  }
  if (m.execution != null) {
    const execCtx = { modelId, file, profiles, isNormalizedOp: false };
    out.push(...validateExecution(m.execution, {}, 'execution', execCtx));
  }
}

/**
 * Validate model header identity and label.
 */
function validateModelHeader(m, file, out) {
  const modelId = typeof m.id === 'string' ? m.id : undefined;
  if (!modelId) {
    out.push(issue('schema_invalid', 'model.id required', { path: 'id', file }));
  }
  if (typeof m.label !== 'string' || !m.label) {
    out.push(issue('schema_invalid', 'model.label required', { modelId, path: 'label', file }));
  }
  return modelId;
}

/**
 * Validate one model object (raw or normalized).
 * @param {unknown} model
 * @param {{ file?: string, registry?: object, profiles?: object, skipPromptPolicy?: boolean }} [opts]
 * @returns {object[]}
 */
export function validateModel(model, opts = {}) {
  const out = [];
  const file = opts.file;
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    out.push(issue('schema_invalid', 'model must be object', { file }));
    return out;
  }
  const m = /** @type {Record<string, unknown>} */ (model);
  const modelId = validateModelHeader(m, file, out);

  const registry = opts.registry || loadOperationRegistry();
  const opIds = operationIdSet(registry);
  const profiles = opts.profiles || loadAdapterProfiles();

  const ops = resolveModelOperations(m, modelId, file, out);
  if (!ops || ops.length === 0) {
    out.push(
      issue('schema_invalid', 'model.operations (or legacy modes) required non-empty', {
        modelId,
        path: 'operations',
        file,
      }),
    );
  } else {
    const opContext = { opIds, registry, profiles, file, opts };
    validateModelOperations(ops, modelId, opContext, out);
  }

  validateModelStatusBlocks(m, { modelId, file, profiles }, out);
  out.push(...validateAliasesArray(m.aliases, 'aliases', modelId, file));
  validateRouting(m.routing, modelId, file, out);
  return out;
}

/**
 * Validate document root schemaVersion field.
 */
function validateDocSchemaVersion(d, file, out) {
  if (Object.prototype.hasOwnProperty.call(d, 'version')) {
    out.push(
      issue(
        'schema_version_conflict',
        'document root must not carry legacy "version" after pre-normalize; use schemaVersion only',
        { path: 'version', file },
      ),
    );
  }

  const hasSchemaVer = Object.prototype.hasOwnProperty.call(d, 'schemaVersion');
  const isMissing = !hasSchemaVer || d.schemaVersion == null || d.schemaVersion === '';
  if (isMissing) {
    out.push(issue('schema_invalid', 'document.schemaVersion required (exact "1.1")', {
      path: 'schemaVersion',
      file,
    }));
    return;
  }
  if (typeof d.schemaVersion !== 'string') {
    out.push(
      issue('schema_invalid', `document.schemaVersion must be string, got ${typeof d.schemaVersion}`, {
        path: 'schemaVersion',
        file,
      }),
    );
    return;
  }
  if (d.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    out.push(
      issue(
        'schema_version_unsupported',
        `unsupported schemaVersion "${d.schemaVersion}"; required exact "${CANONICAL_SCHEMA_VERSION}"`,
        { path: 'schemaVersion', file },
      ),
    );
  }
}

/**
 * Adjust path prefix for model issue.
 */
function adjustModelIssuePath(iss, index) {
  const p = iss.path;
  if (!p) return;
  const isAlreadyPrefixed = p.startsWith('models');
  if (isAlreadyPrefixed) return;
  iss.path = `models[${index}].${p}`;
}

/**
 * Validate a canonical document root { schemaVersion, models }.
 * @param {unknown} doc
 * @param {{ file?: string, registry?: object, profiles?: object }} [opts]
 * @returns {object[]}
 */
export function validateDoc(doc, opts = {}) {
  const out = [];
  const file = opts.file;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    out.push(issue('schema_invalid', 'document root must be object', { file }));
    return out;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  validateDocSchemaVersion(d, file, out);

  if (!Array.isArray(d.models)) {
    out.push(issue('schema_invalid', 'document.models required array', { path: 'models', file }));
    return out;
  }
  for (let i = 0; i < d.models.length; i++) {
    const issues = validateModel(d.models[i], opts);
    for (const iss of issues) {
      adjustModelIssuePath(iss, i);
      out.push(iss);
    }
  }
  return out;
}

/**
 * Reserve model ID and check alias ownership collision.
 */
function reserveModelId(model, owner, out) {
  if (typeof model.id !== 'string' || !model.id) return;
  const existingOwner = owner.get(model.id);
  if (existingOwner && existingOwner !== model.id) {
    out.push(
      issue(
        'duplicate_alias',
        `model id "${model.id}" conflicts with alias owned by "${existingOwner}"`,
        { modelId: model.id },
      ),
    );
    return;
  }
  owner.set(model.id, model.id);
}

/**
 * Check model aliases pool collisions.
 */
function checkModelAliases(model, modelIds, owner, out) {
  const aliases = Array.isArray(model.aliases) ? model.aliases : [];
  for (const a of aliases) {
    if (typeof a !== 'string' || !a) continue;
    if (modelIds.has(a) && a !== model.id) {
      out.push(
        issue('duplicate_alias', `model alias "${a}" collides with model id "${a}"`, {
          modelId: model.id,
        }),
      );
      continue;
    }
    const claimedBy = owner.get(a);
    if (claimedBy && claimedBy !== model.id) {
      out.push(
        issue('duplicate_alias', `alias "${a}" claimed by both "${claimedBy}" and "${model.id}"`, {
          modelId: model.id,
        }),
      );
    } else {
      owner.set(a, model.id);
    }
  }
}

/**
 * Check single operation alias token against pools.
 */
function checkSingleOpAliasItem(a, op, model, params) {
  const { modelIds, owner, out } = params;
  if (typeof a !== 'string' || !a) return;
  if (modelIds.has(a) && a !== model.id) {
    out.push(
      issue(
        'duplicate_alias',
        `operation alias "${a}" collides with model id "${a}" (op aliases are not model wire ids)`,
        { modelId: model.id, operationId: op.id },
      ),
    );
    return;
  }
  const claimedBy = owner.get(a);
  if (claimedBy && claimedBy !== model.id) {
    out.push(
      issue('duplicate_alias', `alias "${a}" claimed by both "${claimedBy}" and "${model.id}"`, {
        modelId: model.id,
        operationId: op.id,
      }),
    );
  } else {
    owner.set(a, model.id);
  }
}

/**
 * Check operation aliases on single operation.
 */
function checkSingleOpAliases(op, model, params) {
  if (!op || !Array.isArray(op.aliases)) return;
  for (const a of op.aliases) {
    checkSingleOpAliasItem(a, op, model, params);
  }
}

/**
 * Check operation aliases across all operations of a model.
 */
function checkOperationAliases(model, modelIds, owner, out) {
  const operations = Array.isArray(model.operations) ? model.operations : [];
  const params = { modelIds, owner, out };
  for (const op of operations) {
    checkSingleOpAliases(op, model, params);
  }
}

/**
 * Cross-model alias uniqueness across an index of models.
 * @param {Iterable<object>} models
 * @returns {object[]}
 */
export function validateCrossModelAliases(models) {
  const out = [];
  const owner = new Map();
  const modelIds = new Set();
  const list = [...models];

  for (const model of list) {
    if (typeof model?.id === 'string' && model.id) {
      modelIds.add(model.id);
    }
  }

  for (const model of list) {
    reserveModelId(model, owner, out);
    checkModelAliases(model, modelIds, owner, out);
    checkOperationAliases(model, modelIds, owner, out);
  }
  return out;
}
