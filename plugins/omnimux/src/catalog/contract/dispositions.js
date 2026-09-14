/**
 * Dispositions registry (H2): the machine source of truth governing every
 * runtime catalog id (canonical ids plus documented wire aliases). Disposition expresses governance intent only;
 * listing is still decided by the H1 op-level five-predicate conjunction.
 *
 * Rules D1-D7 (design doc 2026-09-04-model-io-contract-h2-catalog-design §5.2):
 *   D1 every runtime id must have a disposition row          disposition_missing
 *   D2 canonical/draft ⇒ YAML contract row exists             disposition_contract_missing
 *   D3 alias ⇒ no YAML model.id; target canonical + aliases[] disposition_alias_inconsistent
 *   D4 unavailable/quarantine/deprecated ⇒ no listed op       disposition_listed_forbidden
 *   D5 disposition row id must be a known runtime id          disposition_unknown_id
 *      (exempt: tombstones — unavailable/deprecated rows lose their YAML row by design)
 *   D6 YAML model.id not runtime / not alias-covered          coverage_extra (strict error)
 *   D7 catalog-defaults byOperation ∈ canonical + op exists   defaults_unknown
 * Shape errors for defaults (defaults_invalid) fail in every mode, like disposition_invalid.
 *
 * Shape errors (disposition_invalid) are machine-truth self-checks and fail in
 * every mode (audit included). Consistency issues are error under --strict and
 * warnings under --audit.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DISPOSITIONS_PATH = join(__dirname, 'dispositions.json');
export const DEFAULT_CATALOG_DEFAULTS_PATH = join(__dirname, 'catalog-defaults.json');
/** cordis.patch.yml lives at plugins/omnimux/cordis.patch.yml (three levels up). */
export const DEFAULT_CORDIS_PATCH_PATH = join(__dirname, '..', '..', '..', 'cordis.patch.yml');

export const DISPOSITION_KINDS = Object.freeze([
  'canonical',
  'alias',
  'draft',
  'unavailable',
  'deprecated',
  'quarantine',
]);

/** Dispositions whose ids (and whose models) must never expose a listed op. */
export const FORBIDDEN_LISTED_DISPOSITIONS = new Set(['unavailable', 'quarantine', 'deprecated']);

/** Dispositions that legitimately lack a YAML model.id row. */
const MISSING_YAML_OK = new Set(['alias', 'unavailable', 'quarantine', 'deprecated']);

/**
 * Tombstone dispositions: a withdrawn model keeps a registry row as its audit trail
 * while its YAML contract row is deleted, so its id is deliberately absent from the
 * runtime universe (the same absence MISSING_YAML_OK already permits). D5 exists to
 * catch invented/typo ids, so it skips tombstones instead of flagging them.
 */
const TOMBSTONE_DISPOSITIONS = new Set(['unavailable', 'deprecated']);

/** @type {{ path: string, doc: object } | null} */
let dispositionsCache = null;
/** @type {{ path: string, doc: object } | null} */
let catalogDefaultsCache = null;

/** @returns {void} */
export function resetDispositionsCache() {
  dispositionsCache = null;
  catalogDefaultsCache = null;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {{ level?: 'error'|'warning'|'info', modelId?: string, path?: string, file?: string }} [extra]
 * @returns {object}
 */
function issue(code, message, extra = {}) {
  return {
    level: extra.level ?? 'error',
    code,
    message,
    ...(extra.modelId ? { modelId: extra.modelId } : {}),
    ...(extra.path ? { path: extra.path } : {}),
    ...(extra.file ? { file: extra.file } : {}),
  };
}

/**
 * @param {string} filePath
 * @param {string} what
 * @returns {object}
 */
function readJson(filePath, what) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    const e = new Error(`cannot read ${what} at ${filePath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'disposition_invalid';
    /** @type {any} */ (e).file = filePath;
    throw e;
  }
  try {
    const doc = JSON.parse(text);
    if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
      throw new Error('root must be an object');
    }
    return doc;
  } catch (err) {
    const e = new Error(`invalid ${what} JSON at ${filePath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'disposition_invalid';
    /** @type {any} */ (e).file = filePath;
    throw e;
  }
}

/**
 * Load dispositions.json (cached by path). Throws on unreadable/malformed JSON —
 * fail-closed machine truth, never a soft warning.
 * @param {string} [path]
 * @returns {object}
 */
export function loadDispositions(path = DEFAULT_DISPOSITIONS_PATH) {
  if (dispositionsCache && dispositionsCache.path === path) return dispositionsCache.doc;
  const doc = readJson(path, 'dispositions');
  dispositionsCache = { path, doc };
  return doc;
}

/**
 * Load catalog-defaults.json (cached by path). Throws on unreadable/malformed JSON.
 * @param {string} [path]
 * @returns {object}
 */
export function loadCatalogDefaults(path = DEFAULT_CATALOG_DEFAULTS_PATH) {
  if (catalogDefaultsCache && catalogDefaultsCache.path === path) return catalogDefaultsCache.doc;
  const doc = readJson(path, 'catalog defaults');
  catalogDefaultsCache = { path, doc };
  return doc;
}

/**
 * Shape self-check for a dispositions document. Always error-level (fails audit too).
 * @param {object} doc
 * @returns {object[]}
 */
export function validateDispositionsShape(doc) {
  /** @type {object[]} */
  const out = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    out.push(issue('disposition_invalid', 'dispositions root must be object'));
    return out;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (typeof d.version !== 'string' || !d.version) {
    out.push(issue('disposition_invalid', 'dispositions.version required', { path: 'version' }));
  }
  if (!Array.isArray(d.dispositions)) {
    out.push(issue('disposition_invalid', 'dispositions.dispositions must be array', { path: 'dispositions' }));
    return out;
  }
  const seen = new Set();
  for (let i = 0; i < d.dispositions.length; i++) {
    const row = d.dispositions[i];
    const base = `dispositions[${i}]`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      out.push(issue('disposition_invalid', 'disposition row must be object', { path: base }));
      continue;
    }
    const r = /** @type {Record<string, unknown>} */ (row);
    if (typeof r.id !== 'string' || !r.id.trim()) {
      out.push(issue('disposition_invalid', 'disposition row id required nonempty', { path: `${base}.id` }));
      continue;
    }
    if (seen.has(r.id)) {
      out.push(issue('disposition_invalid', `duplicate disposition id "${r.id}"`, {
        modelId: r.id,
        path: `${base}.id`,
      }));
    }
    seen.add(r.id);
    if (typeof r.disposition !== 'string' || !DISPOSITION_KINDS.includes(r.disposition)) {
      out.push(
        issue(
          'disposition_invalid',
          `disposition "${r.disposition}" must be one of ${DISPOSITION_KINDS.join('|')}`,
          { modelId: r.id, path: `${base}.disposition` },
        ),
      );
    }
    if (r.disposition === 'alias') {
      if (typeof r.target !== 'string' || !r.target.trim()) {
        out.push(issue('disposition_invalid', 'alias disposition requires nonempty target', {
          modelId: r.id,
          path: `${base}.target`,
        }));
      }
    } else if (r.target != null) {
      out.push(issue('disposition_invalid', 'target only allowed on alias disposition', {
        modelId: r.id,
        path: `${base}.target`,
      }));
    }
    if (typeof r.reason !== 'string' || !r.reason.trim()) {
      out.push(issue('disposition_invalid', 'disposition row reason required (no silent dispositions)', {
        modelId: r.id,
        path: `${base}.reason`,
      }));
    }
    if (r.evidence != null && (!Array.isArray(r.evidence) || r.evidence.some((e) => typeof e !== 'string' || !e))) {
      out.push(issue('disposition_invalid', 'evidence must be a nonempty string array', {
        modelId: r.id,
        path: `${base}.evidence`,
      }));
    }
    if (r.batch != null && !['A', 'B', 'C'].includes(/** @type {any} */ (r.batch))) {
      out.push(issue('disposition_invalid', 'batch must be A|B|C when present', {
        modelId: r.id,
        path: `${base}.batch`,
      }));
    }
  }
  return out;
}

/**
 * @param {object} doc
 * @param {string} id
 * @returns {object|undefined}
 */
export function resolveDisposition(doc, id) {
  const rows = Array.isArray(doc?.dispositions) ? doc.dispositions : [];
  return rows.find((r) => r && r.id === id);
}

/**
 * Ids that must never expose a listed operation (unavailable/quarantine/deprecated).
 * @param {object} doc
 * @returns {Set<string>}
 */
export function forbiddenListedIds(doc) {
  const out = new Set();
  const rows = Array.isArray(doc?.dispositions) ? doc.dispositions : [];
  for (const r of rows) {
    if (r && typeof r.id === 'string' && FORBIDDEN_LISTED_DISPOSITIONS.has(r.disposition)) {
      out.add(r.id);
    }
  }
  return out;
}

/**
 * Cross-validate dispositions against the contract index and runtime id set (D1-D6).
 * Consistency issues are error under strict, warning under audit.
 * @param {object} doc
 * @param {{ index: object, runtimeIds: string[], strict?: boolean }} ctx
 * @returns {object[]}
 */
export function validateDispositions(doc, ctx) {
  const strict = Boolean(ctx?.strict);
  const level = strict ? 'error' : 'warning';
  /** @type {object[]} */
  const out = [];
  const index = ctx?.index;
  const runtimeIds = Array.isArray(ctx?.runtimeIds) ? ctx.runtimeIds.map(String) : [];
  const runtimeSet = new Set(runtimeIds);
  const rows = Array.isArray(doc?.dispositions) ? doc.dispositions : [];
  const byDispositionId = new Map(rows.map((r) => [r?.id, r]));

  // D1: every runtime id must have a disposition row.
  for (const id of runtimeIds) {
    if (!byDispositionId.has(id)) {
      out.push(
        issue('disposition_missing', `runtime id "${id}" has no disposition row`, {
          level,
          modelId: id,
        }),
      );
    }
  }

  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) continue;
    const id = row.id;
    const disp = row.disposition;

    // D5: no ghost disposition rows (id unknown to runtime universe).
    // Tombstones are exempt: an unavailable/deprecated id has no YAML row by design.
    if (!runtimeSet.has(id) && !TOMBSTONE_DISPOSITIONS.has(disp)) {
      out.push(
        issue('disposition_unknown_id', `disposition row "${id}" is not a known runtime id`, {
          level,
          modelId: id,
        }),
      );
    }

    if (disp === 'canonical' || disp === 'draft') {
      // D2: canonical/draft requires a YAML contract row.
      if (!index?.get?.(id)) {
        out.push(
          issue('disposition_contract_missing', `disposition "${disp}" for "${id}" but no YAML contract row`, {
            level,
            modelId: id,
          }),
        );
      }
    } else if (disp === 'alias') {
      // D3: alias must not appear as model.id; target must be canonical and declare the alias.
      const target = typeof row.target === 'string' ? row.target : '';
      const targetRow = byDispositionId.get(target);
      const targetModel = target ? index?.get?.(target) : undefined;
      const aliasAsModel = index?.get?.(id);
      const targetDeclaresAlias =
        targetModel && Array.isArray(targetModel.aliases) && targetModel.aliases.includes(id);
      if (aliasAsModel || !targetRow || targetRow.disposition !== 'canonical' || !targetModel || !targetDeclaresAlias) {
        const why = aliasAsModel
          ? `alias "${id}" still present as YAML model.id (double listing)`
          : !targetRow || targetRow.disposition !== 'canonical'
            ? `alias target "${target}" is not a canonical disposition row`
            : !targetModel
              ? `alias target "${target}" has no YAML contract row`
              : `alias target "${target}" does not declare "${id}" in aliases[]`;
        out.push(
          issue('disposition_alias_inconsistent', `alias "${id}" inconsistent: ${why}`, {
            level,
            modelId: id,
          }),
        );
      }
    }
  }

  // D4: forbidden dispositions must not expose listed operations.
  const forbidden = forbiddenListedIds(doc);
  for (const model of index?.all?.() ?? []) {
    const listedOps = Array.isArray(model.listedOperations) ? model.listedOperations : [];
    if (listedOps.length === 0) continue;
    const row = byDispositionId.get(model.id);
    if (row && forbidden.has(row.id)) {
      out.push(
        issue(
          'disposition_listed_forbidden',
          `model "${model.id}" disposition "${row.disposition}" must not have listed operations: ${listedOps.join(', ')}`,
          { level, modelId: model.id },
        ),
      );
    }
  }

  // D6: YAML model.id unknown to runtime and not alias-covered ⇒ ghost extra (strict error).
  for (const model of index?.all?.() ?? []) {
    if (!runtimeSet.has(model.id)) {
      out.push(
        issue('coverage_extra', `YAML contract "${model.id}" is not in runtime catalog and has no disposition`, {
          level,
          modelId: model.id,
        }),
      );
    }
  }

  return out;
}

/**
 * Shape + D7 validation for catalog-defaults.json.
 * Shape errors are always error-level; D7 reference errors follow strict mode.
 * @param {object} cfg
 * @param {{ index: object, dispositions: object, registry?: object, strict?: boolean }} ctx
 * @returns {object[]}
 */
export function validateCatalogDefaults(cfg, ctx) {
  /** @type {object[]} */
  const out = [];
  const strict = Boolean(ctx?.strict);
  const level = strict ? 'error' : 'warning';
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    out.push(issue('defaults_invalid', 'catalog-defaults root must be object'));
    return out;
  }
  const c = /** @type {Record<string, unknown>} */ (cfg);
  if (typeof c.version !== 'string' || !c.version) {
    out.push(issue('defaults_invalid', 'catalog-defaults.version required', { path: 'version' }));
  }
  if (c.byOperation == null || typeof c.byOperation !== 'object' || Array.isArray(c.byOperation)) {
    out.push(issue('defaults_invalid', 'catalog-defaults.byOperation must be object', { path: 'byOperation' }));
    return out;
  }
  const index = ctx?.index;
  const registryOps = new Set(
    (Array.isArray(ctx?.registry?.operations) ? ctx.registry.operations : []).map((o) => o?.id).filter(Boolean),
  );
  for (const [opId, modelId] of Object.entries(/** @type {Record<string, unknown>} */ (c.byOperation))) {
    if (registryOps.size > 0 && !registryOps.has(opId)) {
      out.push(
        issue('defaults_unknown', `byOperation key "${opId}" is not a registry operation`, {
          level,
          path: `byOperation.${opId}`,
        }),
      );
      continue;
    }
    if (typeof modelId !== 'string' || !modelId) {
      out.push(
        issue('defaults_unknown', `byOperation.${opId} must be a nonempty model id`, {
          level,
          path: `byOperation.${opId}`,
        }),
      );
      continue;
    }
    const row = resolveDisposition(ctx?.dispositions, modelId);
    const model = index?.get?.(modelId);
    const hasOp = Boolean(model) && (model.operations ?? []).some((op) => op.id === opId);
    if (!row || row.disposition !== 'canonical' || !model || !hasOp) {
      const why = !row
        ? `no disposition row for "${modelId}"`
        : row.disposition !== 'canonical'
          ? `disposition "${row.disposition}" is not canonical`
          : !model
            ? `no YAML contract row for "${modelId}"`
            : `model "${modelId}" has no operation "${opId}"`;
      out.push(
        issue('defaults_unknown', `byOperation.${opId} → "${modelId}" invalid: ${why}`, {
          level,
          modelId,
          path: `byOperation.${opId}`,
        }),
      );
    }
  }
  return out;
}

/**
 * Read composer model ids from cordis.patch.yml (llm-pi-ai → providers.omnimux.models).
 * Read-only; never mutates the patch.
 * @param {string} [patchPath]
 * @returns {string[]}
 */
export function collectCordisModelIds(patchPath = DEFAULT_CORDIS_PATCH_PATH) {
  let text;
  try {
    text = readFileSync(patchPath, 'utf8');
  } catch (err) {
    const e = new Error(`cannot read cordis patch at ${patchPath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'cordis_unresolvable_model';
    /** @type {any} */ (e).file = patchPath;
    throw e;
  }
  let doc;
  try {
    doc = parseYaml(text, { maxAliasCount: 100 });
  } catch (err) {
    const e = new Error(`cordis patch YAML parse error at ${patchPath}: ${err?.message ?? err}`);
    /** @type {any} */ (e).code = 'cordis_unresolvable_model';
    /** @type {any} */ (e).file = patchPath;
    throw e;
  }
  const rows = Array.isArray(doc) ? doc : [];
  const piAi = rows.find((r) => r && r.id === 'llm-pi-ai');
  const models = piAi?.config?.providers?.omnimux?.models;
  if (!Array.isArray(models)) return [];
  return models.map((m) => (m && typeof m.id === 'string' ? m.id : '')).filter(Boolean);
}

/**
 * Every cordis composer id must resolve to a canonical contract id or a
 * declared alias (wire 归一). Content of cordis.patch.yml is owned elsewhere;
 * this is cross-validation only.
 * @param {string[]} cordisIds
 * @param {object} index
 * @param {(index: object, id: string) => string|undefined} resolveModelId
 * @param {{ strict?: boolean }} [opts]
 * @returns {object[]}
 */
export function validateCordisCrossRefs(cordisIds, index, resolveModelId, opts = {}) {
  const level = opts.strict ? 'error' : 'warning';
  /** @type {object[]} */
  const out = [];
  for (const id of cordisIds) {
    const resolved = typeof resolveModelId === 'function' ? resolveModelId(index, id) : undefined;
    if (!resolved) {
      out.push(
        issue('cordis_unresolvable_model', `cordis composer id "${id}" does not resolve to any contract canonical/alias`, {
          level,
          modelId: id,
        }),
      );
    }
  }
  return out;
}

/**
 * H2 hardening of researchHasEvidence: a verified op on real specs must carry
 * BOTH docUrl and verifiedAt (dated, referenceable evidence).
 * @param {object} index
 * @param {{ strict?: boolean }} [opts]
 * @returns {object[]}
 */
export function verifiedEvidenceIssues(index, opts = {}) {
  const level = opts.strict ? 'error' : 'warning';
  /** @type {object[]} */
  const out = [];
  for (const model of index?.all?.() ?? []) {
    for (const op of model.operations ?? []) {
      const research = op.research ?? {};
      if (research.status !== 'verified') continue;
      const missing = [];
      if (typeof research.docUrl !== 'string' || !research.docUrl.trim()) missing.push('docUrl');
      if (typeof research.verifiedAt !== 'string' || !research.verifiedAt.trim()) missing.push('verifiedAt');
      if (missing.length > 0) {
        out.push(
          issue(
            'evidence_missing_for_verified',
            `operation "${model.id}#${op.id}" research.verified requires dated evidence (${missing.join(' + ')} missing)`,
            { level, modelId: model.id, path: `operations.${op.id}.research` },
          ),
        );
      }
    }
  }
  return out;
}
