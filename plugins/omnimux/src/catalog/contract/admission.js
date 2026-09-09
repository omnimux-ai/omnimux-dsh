/**
 * Admission report builder over a ContractIndex (operation-level aware).
 */

const ADMISSION_ERROR_CODES = new Set([
  'yaml_parse_error',
  'schema_invalid',
  'schema_version_conflict',
  'schema_version_unsupported',
  'operation_unknown',
  'output_type_missing',
  'output_type_invalid',
  'slot_field_missing',
  'slot_minmax_invalid',
  'allowed_mimes_invalid',
  'limit_source_missing',
  'profile_unknown',
  'profile_incompatible',
  'profile_operation_unknown',
  'research_invalid',
  'research_verified_without_evidence',
  'duplicate_model_id',
  'duplicate_alias',
  'prompt_required_missing',
  'prompt_forbidden_injected',
  'parameter_concrete_pixels_forbidden',
  'parameter_dispatch_closure_missing',
]);

/**
 * Codes that fail admission-strict (default --audit).
 * coverage_* are handled by coverage auditor / --strict, not admission.
 * @param {object} issue
 * @returns {boolean}
 */
export function isAdmissionStrictError(issue) {
  if (!issue || issue.level !== 'error') return false;
  if (issue.code === 'coverage_missing' || issue.code === 'coverage_extra') return false;
  if (ADMISSION_ERROR_CODES.has(issue.code)) return true;
  // unknown error-level issues still fail admission
  return true;
}

/**
 * Scan model parameters to forbid hardcoded physical pixel dimensions (e.g. 1024x1024, 1792x1024).
 * @param {import('./index.js').ContractIndex} index
 * @returns {object[]}
 */
export function verifyNoConcretePixels(index) {
  const issues = [];
  const pixelRegex = /^\d{3,5}x\d{3,5}$/i;
  const models = index?.all ? index.all() : (index?.byId ? Array.from(index.byId.values()) : []);
  for (const model of models) {
    if (!model.parameters || typeof model.parameters !== 'object') continue;
    for (const [paramKey, paramDef] of Object.entries(model.parameters)) {
      if (!paramDef || typeof paramDef !== 'object') continue;
      if (Array.isArray(paramDef.options)) {
        paramDef.options.forEach((opt, idx) => {
          const val = opt && typeof opt === 'object' && 'value' in opt ? opt.value : opt;
          if (typeof val === 'string' && pixelRegex.test(val.trim())) {
            issues.push({
              level: 'error',
              code: 'parameter_concrete_pixels_forbidden',
              modelId: model.id,
              path: `parameters.${paramKey}.options[${idx}].value`,
              file: model.sourceFile,
              message: `Physical pixel dimension "${val}" is forbidden in parameters.${paramKey}.options.value; use semantic tiers (e.g. 1K, 2K, 4K) instead`,
            });
          }
        });
      }
      if (typeof paramDef.defaultValue === 'string' && pixelRegex.test(paramDef.defaultValue.trim())) {
        issues.push({
          level: 'error',
          code: 'parameter_concrete_pixels_forbidden',
          modelId: model.id,
          path: `parameters.${paramKey}.defaultValue`,
          file: model.sourceFile,
          message: `Physical pixel dimension "${paramDef.defaultValue}" is forbidden in parameters.${paramKey}.defaultValue; use semantic tiers (e.g. 1K, 2K, 4K) instead`,
        });
      }
    }
  }
  return issues;
}

/**
 * Verify parameter dispatch closure for all live models against profile logicalFields.
 * @param {import('./index.js').ContractIndex} index
 * @param {object} profilesObj
 * @returns {object[]}
 */
export function verifyParameterDispatchClosure(index, profilesObj) {
  const issues = [];
  const profilesMap = new Map();
  const profilesList = Array.isArray(profilesObj?.profiles)
    ? profilesObj.profiles
    : Array.isArray(profilesObj)
      ? profilesObj
      : [];
  for (const p of profilesList) {
    if (p?.id) profilesMap.set(p.id, p);
  }

  const models = index?.all ? index.all() : (index?.byId ? Array.from(index.byId.values()) : []);
  for (const model of models) {
    const isModelLive = model.execution?.status === 'live';
    const liveOp = (model.operations ?? []).find((op) => op.execution?.status === 'live');
    if (!isModelLive && !liveOp) continue;

    const profileId = model.execution?.profileId || liveOp?.execution?.profileId;
    if (!profileId) continue;

    const profile = profilesMap.get(profileId);
    if (!profile) continue;

    const logicalFields = new Set(profile.logicalFields ?? []);
    if (!model.parameters || typeof model.parameters !== 'object') continue;

    for (const paramKey of Object.keys(model.parameters)) {
      if (!logicalFields.has(paramKey)) {
        issues.push({
          level: 'error',
          code: 'parameter_dispatch_closure_missing',
          modelId: model.id,
          path: `parameters.${paramKey}`,
          file: model.sourceFile,
          message: `Parameter "${paramKey}" declared by live model "${model.id}" is not registered in profile "${profileId}" logicalFields`,
        });
      }
    }
  }
  return issues;
}

/**
 * @param {import('./index.js').ContractIndex} index
 * @param {{ registry?: object, profiles?: object }} [_opts]
 * @returns {{ ok: boolean, issues: object[], errorCount: number, warningCount: number }}
 */
export function checkAdmission(index, _opts = {}) {
  const issues = Array.isArray(index?.issues) ? [...index.issues] : [];

  issues.push(...verifyNoConcretePixels(index));
  const profiles = _opts.profiles ?? index?.profiles;
  if (profiles) {
    issues.push(...verifyParameterDispatchClosure(index, profiles));
  }

  if (index?.byId) {
    for (const model of index.byId.values()) {
      const extra = model._admissionIssues;
      if (Array.isArray(extra)) {
        for (const iss of extra) {
          issues.push({
            ...iss,
            modelId: iss.modelId ?? model.id,
            file: iss.file ?? model.sourceFile,
          });
        }
      }

      // Operation-level not_listed / execution_unavailable
      for (const op of model.operations ?? []) {
        if (op.listed !== true) {
          issues.push({
            level: 'info',
            code: 'not_listed',
            modelId: model.id,
            operationId: op.id,
            file: model.sourceFile,
            message: `operation "${model.id}#${op.id}" is not listed`,
          });
        }
        if (op.execution?.status === 'none' || op.execution?.status === 'stub') {
          issues.push({
            level: 'info',
            code: 'execution_unavailable',
            modelId: model.id,
            operationId: op.id,
            file: model.sourceFile,
            message: `operation "${model.id}#${op.id}" execution.status=${op.execution.status}`,
          });
        }
      }

      // Model summary info
      if (model.listed === false) {
        issues.push({
          level: 'info',
          code: 'not_listed',
          modelId: model.id,
          file: model.sourceFile,
          message: `model "${model.id}" has no listed operations (summary)`,
        });
      }
    }
  }

  // de-dupe by code+modelId+operationId+path+message
  const seen = new Set();
  const deduped = [];
  for (const iss of issues) {
    const key = `${iss.code}|${iss.modelId ?? ''}|${iss.operationId ?? ''}|${iss.path ?? ''}|${iss.file ?? ''}|${iss.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(iss);
  }

  const errorCount = deduped.filter((i) => isAdmissionStrictError(i)).length;
  const warningCount = deduped.filter((i) => i.level === 'warning').length;

  return {
    ok: errorCount === 0,
    issues: deduped,
    errorCount,
    warningCount,
  };
}

export { ADMISSION_ERROR_CODES };
