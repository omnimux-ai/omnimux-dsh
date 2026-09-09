/**
 * Public barrel for Hub model capability contracts (H1 shadow + H2 projection switch).
 *
 * @typedef {object} ContractIndex
 * @property {"1.1"} schemaVersion canonical Contract v1.1 only (never root version)
 * @property {string} contentFingerprint
 * @property {string} [contentCacheKey]
 * @property {Map<string, object>} byId
 * @property {string} [specsDir]
 * @property {object[]} [issues]
 * @property {string[]} [parseErrors]
 * @property {object} [registry]
 * @property {object} [profiles]
 * @property {string[]} [listedOperations]
 * @property {() => object[]} all
 * @property {(id: string) => object|undefined} get
 * @property {(out: string) => object[]} byOutputType
 */

export {
  loadAll,
  parseFile,
  parseYamlText,
  normalizeDoc,
  normalizeModel,
  preNormalizeDocRoot,
  prepareCanonicalDoc,
  resetContractCache,
  contentFingerprint,
  canonicalStringify,
  buildContentCacheKey,
  readYamlSnapshots,
  DEFAULT_SPECS_DIR,
  listYamlFiles,
} from './load.js';

export {
  loadOperationRegistry,
  loadAdapterProfiles,
  loadJsonSchema,
  validateDoc,
  validateModel,
  validateAdapterProfiles,
  validateOperationRegistry,
  validateCrossModelAliases,
  operationIdSet,
  promptPolicyFor,
  resetSchemaCaches,
  CANONICAL_SCHEMA_VERSION,
} from './schema.js';

export {
  normalizeResearch,
  normalizeImplementation,
  normalizeExecution,
  materializeOpStatus,
  computeListed,
  computeOperationListed,
  deriveModelListedSummary,
  adapterProfileExists,
  adapterProfileCompatible,
  getAdapterProfile,
  researchHasEvidence,
  gateAllowsModel,
} from './status.js';

export {
  checkAdmission,
  isAdmissionStrictError,
  ADMISSION_ERROR_CODES,
  verifyNoConcretePixels,
  verifyParameterDispatchClosure,
} from './admission.js';

export {
  collectRuntimeModelIds,
  collectListedOperations,
  diffCoverage,
  coverageIssues,
} from './coverage.js';

export {
  loadDispositions,
  loadCatalogDefaults,
  resetDispositionsCache,
  validateDispositionsShape,
  validateDispositions,
  validateCatalogDefaults,
  resolveDisposition,
  forbiddenListedIds,
  collectCordisModelIds,
  validateCordisCrossRefs,
  verifiedEvidenceIssues,
  DISPOSITION_KINDS,
  FORBIDDEN_LISTED_DISPOSITIONS,
  DEFAULT_DISPOSITIONS_PATH,
  DEFAULT_CATALOG_DEFAULTS_PATH,
  DEFAULT_CORDIS_PATCH_PATH,
} from './dispositions.js';

export { mbToBytes, isWithinSizeLimit, isWithinDurationLimit, BYTES_PER_MB } from './units.js';

export { LEGACY_OPERATION_MAP, mapLegacyOperation } from './legacy-operation-map.js';

export {
  GUARD_CODES,
  guardSubmit,
  assertGuardSubmit,
  assertGuardOutput,
  rejectionToError,
  toOmnimuxErrorCode,
  normalizeLogicalRequest,
  mapValidatedPlanToVendor,
  validateVendorResult,
  resolveProfilePayloadContract,
  DEFAULT_PROFILE_PAYLOADS,
  admitModel,
  admitOperation,
  admitDisposition,
  inferUniqueOperation,
  assignAndValidateSlots,
} from './submit-guard/index.js';

import { loadAll, DEFAULT_SPECS_DIR, resetContractCache } from './load.js';
import {
  loadOperationRegistry,
  loadAdapterProfiles,
  validateAdapterProfiles,
  validateOperationRegistry,
  CANONICAL_SCHEMA_VERSION,
} from './schema.js';
import { checkAdmission } from './admission.js';
import { collectRuntimeModelIds, diffCoverage, coverageIssues } from './coverage.js';
import {
  loadDispositions,
  loadCatalogDefaults,
  resetDispositionsCache,
  validateDispositionsShape,
  validateDispositions,
  validateCatalogDefaults,
  collectCordisModelIds,
  validateCordisCrossRefs,
  verifiedEvidenceIssues,
  forbiddenListedIds,
} from './dispositions.js';

/**
 * @param {string} [specsDir]
 * @param {object} [opts]
 * @returns {ContractIndex}
 */
export function getContractIndex(specsDir = DEFAULT_SPECS_DIR, opts = {}) {
  return loadAll(specsDir, opts);
}

/**
 * @param {string} id
 * @param {string} [specsDir]
 * @returns {object|undefined}
 */
export function getModelContract(id, specsDir = DEFAULT_SPECS_DIR) {
  return getContractIndex(specsDir).get(id);
}

/**
 * @param {string} [specsDir]
 * @returns {object[]}
 */
export function listContracts(specsDir = DEFAULT_SPECS_DIR) {
  return getContractIndex(specsDir).all();
}

/**
 * @returns {object}
 */
export function getOperationRegistry() {
  return loadOperationRegistry();
}

/**
 * Resolve a runtime / wire / alias id to its canonical contract id.
 * @param {ContractIndex} index
 * @param {string} id
 * @returns {string|undefined} canonical id, or undefined when unknown
 */
export function resolveModelId(index, id) {
  if (!index || typeof id !== 'string' || !id) return undefined;
  if (index.get(id)) return id;
  for (const model of index.all()) {
    if ((model.aliases ?? []).includes(id)) return model.id;
  }
  return undefined;
}

/**
 * Full contract verification used by CLI (H2: dispositions-driven coverage).
 * Report exposes schemaVersion ("1.1") only — never model-capability root `version`.
 *
 * strict failure conditions (H2 §5.3): admission error ∨ any error-level
 * dispositions/defaults/coverage/cordis/evidence issue. Shape errors of the
 * machine-truth files (disposition_invalid / defaults_invalid / cordis read
 * failure) are admission-strict and fail --audit too.
 *
 * @param {{ specsDir?: string, strict?: boolean, gateAllows?: Function, profiles?: object, registry?: object, cordisPatchPath?: string }} [opts]
 */
export function verifyContracts(opts = {}) {
  const specsDir = opts.specsDir ?? DEFAULT_SPECS_DIR;
  const strict = Boolean(opts.strict);
  resetContractCache();
  resetDispositionsCache();

  const registry = opts.registry ?? loadOperationRegistry();
  const profiles = opts.profiles ?? loadAdapterProfiles();

  // Machine-truth documents: registry / profiles / dispositions / defaults.
  // Shape errors here are admission-strict (fail in audit mode too).
  const dispositions = loadDispositions();
  const defaultsCfg = loadCatalogDefaults();
  const regIssues = validateOperationRegistry(registry);
  const profileIssues = validateAdapterProfiles(profiles, registry);
  const dispShapeIssues = validateDispositionsShape(dispositions);
  const defaultsShapeIssues = validateCatalogDefaults(defaultsCfg, {
    index: { get: () => undefined },
    dispositions,
    registry,
    strict: true,
  }).filter((i) => i.code === 'defaults_invalid');
  /** @type {object[]} */
  let cordisReadIssues = [];
  /** @type {string[]} */
  let cordisIds = [];
  try {
    cordisIds = collectCordisModelIds(opts.cordisPatchPath);
  } catch (err) {
    cordisReadIssues = [
      {
        level: 'error',
        code: 'cordis_unresolvable_model',
        file: /** @type {any} */ (err)?.file,
        message: err?.message ?? String(err),
      },
    ];
  }
  const machineIssues = [
    ...regIssues,
    ...profileIssues,
    ...dispShapeIssues,
    ...defaultsShapeIssues,
    ...cordisReadIssues,
  ].map((i) => ({ ...i, level: i.level ?? 'error' }));

  const index = loadAll(specsDir, { useCache: false, gateAllows: opts.gateAllows });
  // Prepend machine issues into index for admission
  if (machineIssues.length) {
    index.issues = [...machineIssues, ...(index.issues ?? [])];
  }

  const admission = checkAdmission(index, {
    registry: index.registry ?? registry,
    profiles: index.profiles ?? profiles,
  });

  const runtimeIds = collectRuntimeModelIds(index);
  const coverage = diffCoverage(runtimeIds, index);

  // H2 consistency layer (levels follow strict flag).
  const covIssues = coverageIssues(coverage, { strict, dispositions });
  const dispIssues = validateDispositions(dispositions, { index, runtimeIds, strict });
  const defaultsIssues = validateCatalogDefaults(defaultsCfg, {
    index,
    dispositions,
    registry,
    strict,
  }).filter((i) => i.code !== 'defaults_invalid');
  const cordisIssues = validateCordisCrossRefs(cordisIds, index, resolveModelId, { strict });
  const evidenceIssues = verifiedEvidenceIssues(index, { strict });
  const h2Issues = [...covIssues, ...dispIssues, ...defaultsIssues, ...cordisIssues, ...evidenceIssues];

  const issues = [...admission.issues, ...h2Issues];

  const admissionFailed = !admission.ok;
  const strictFailed = strict && h2Issues.some((i) => i.level === 'error');
  const ok = !admissionFailed && !strictFailed;

  const listedOperations = coverage.listedOperations ?? index.listedOperations ?? [];
  const schemaVersion = index.schemaVersion ?? CANONICAL_SCHEMA_VERSION;

  /** @type {Record<string, number>} */
  const byDisposition = {};
  for (const row of dispositions?.dispositions ?? []) {
    if (row && typeof row.disposition === 'string') {
      byDisposition[row.disposition] = (byDisposition[row.disposition] ?? 0) + 1;
    }
  }

  return {
    ok,
    mode: strict ? 'strict' : 'audit',
    /** Canonical Contract v1.1; never emit model-capability root `version`. */
    schemaVersion,
    contentFingerprint: index.contentFingerprint,
    admission,
    coverage,
    dispositions: {
      total: Array.isArray(dispositions?.dispositions) ? dispositions.dispositions.length : 0,
      byDisposition,
      forbiddenListed: [...forbiddenListedIds(dispositions)].sort((a, b) => a.localeCompare(b)),
      unresolvedDispositions: dispIssues
        .filter((i) => i.level === 'error')
        .map((i) => ({ code: i.code, modelId: i.modelId ?? null })),
    },
    defaultsByOperation:
      defaultsCfg && typeof defaultsCfg === 'object' && defaultsCfg.byOperation && typeof defaultsCfg.byOperation === 'object'
        ? { ...defaultsCfg.byOperation }
        : {},
    listedOperations,
    /** @deprecated any-op model summary; prefer listedOperations */
    listedIds: coverage.listedIds ?? [],
    listedModelIds: coverage.listedModelIds ?? [],
    issues,
    exitCode: ok ? 0 : 1,
  };
}
