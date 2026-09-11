/**
 * Research, execution, and adapter implementation status validation operators.
 */

import { issue } from './commonSchema.js';
import {
  RESEARCH_STATUS_SET,
  IMPLEMENTATION_STATUS_SET,
  EXECUTION_STATUS_SET,
  researchHasEvidence,
  adapterProfileCompatible,
  getAdapterProfile,
} from '../status.js';

/**
 * Validate research object (model default or operation-level).
 * @param {unknown} research
 * @param {string} path
 * @param {{ modelId?: string, file?: string, operationId?: string }} [context]
 * @returns {object[]}
 */
export function validateResearch(research, path, context = {}) {
  const out = [];
  if (research == null) return out;
  const { modelId, file, operationId } = context;

  if (typeof research !== 'object' || Array.isArray(research)) {
    out.push(issue('research_invalid', `research must be object at ${path}`, { modelId, path, file, operationId }));
    return out;
  }

  const r = /** @type {Record<string, unknown>} */ (research);
  const isInvalidStatus = typeof r.status !== 'string' || !RESEARCH_STATUS_SET.has(r.status);
  if (isInvalidStatus) {
    out.push(
      issue('research_invalid', `invalid research.status "${r.status}" at ${path}`, {
        modelId,
        path: `${path}.status`,
        file,
        operationId,
      }),
    );
    return out;
  }

  const isVerifiedWithoutEvidence = r.status === 'verified' && !researchHasEvidence(/** @type {any} */ (r));
  if (isVerifiedWithoutEvidence) {
    out.push(
      issue('research_verified_without_evidence', 'research.status verified requires docUrl evidence', {
        modelId,
        path: `${path}.docUrl`,
        file,
        operationId,
      }),
    );
  }
  return out;
}

/**
 * Validate live execution state profile consistency.
 */
function validateLiveExecutionProfile(profileId, context, out) {
  const { path, modelId, file, op, profiles } = context;
  if (!profileId) {
    out.push(
      issue('profile_unknown', 'execution.live requires profileId', {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
    return;
  }
  const hit = getAdapterProfile(profiles, profileId);
  if (!hit) {
    out.push(
      issue('profile_unknown', `unknown execution.profileId "${profileId}"`, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
    return;
  }
  if (hit.status !== 'live') {
    out.push(
      issue('profile_unknown', `execution.profileId "${profileId}" is not live`, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
  }
}

/**
 * Validate non-live execution profile reference.
 */
function validateNonLiveExecutionProfile(profileId, context, out) {
  const { path, modelId, file, op, profiles } = context;
  if (!profileId) return;
  const hit = getAdapterProfile(profiles, profileId);
  if (!hit) {
    out.push(
      issue('profile_unknown', `unknown execution.profileId "${profileId}"`, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
  }
}

/**
 * Validate execution + profile compatibility for live claims.
 * @param {unknown} execution
 * @param {object} op
 * @param {string} path
 * @param {object} [context]
 * @returns {object[]}
 */
export function validateExecution(execution, op, path, context = {}) {
  const out = [];
  if (execution == null) return out;
  const { modelId, file, profiles } = context;

  if (typeof execution !== 'object' || Array.isArray(execution)) {
    out.push(issue('schema_invalid', `execution must be object at ${path}`, { modelId, path, file }));
    return out;
  }

  const e = /** @type {Record<string, unknown>} */ (execution);
  const isInvalidStatus = typeof e.status !== 'string' || !EXECUTION_STATUS_SET.has(e.status);
  if (isInvalidStatus) {
    out.push(
      issue('schema_invalid', `invalid execution.status "${e.status}" at ${path}`, {
        modelId,
        path: `${path}.status`,
        file,
      }),
    );
    return out;
  }

  const profileId = typeof e.profileId === 'string' ? e.profileId : undefined;
  const execContext = { path, modelId, file, op, profiles };
  if (e.status === 'live') {
    validateLiveExecutionProfile(profileId, execContext, out);
  } else {
    validateNonLiveExecutionProfile(profileId, execContext, out);
  }
  return out;
}

/**
 * Determine if an operation has enough output info for compatibility check.
 */
function canCheckCompatibility(op, isNormalizedOp) {
  if (isNormalizedOp) return true;
  if (!op) return false;
  if (!op.id) return false;
  if (!op.output) return false;
  return Boolean(op.output.type);
}

/**
 * Check ready implementation profile compatibility.
 */
function checkReadyCompatibility(op, value, context, out) {
  const { path, modelId, file, profiles, isNormalizedOp } = context;
  if (!canCheckCompatibility(op, isNormalizedOp)) return;

  const inputs = Array.isArray(op.inputs) ? op.inputs : [];
  const candidate = {
    id: op.id,
    output: op.output,
    inputs,
    implementation: value,
  };
  const compat = adapterProfileCompatible(candidate, profiles);

  if (!compat.ok) {
    const reason = compat.reason || 'profile incompatible';
    out.push(
      issue('profile_incompatible', reason, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
  }
}

/**
 * Validate ready implementation profile existence and compatibility.
 */
function validateReadyImplementation(profileId, value, context, out) {
  const { path, modelId, file, op, profiles } = context;
  if (!profileId) {
    out.push(
      issue('profile_unknown', 'implementation.ready requires profileId', {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
    return;
  }
  const hit = getAdapterProfile(profiles, profileId);
  const isNotLive = !hit || hit.status !== 'live';
  if (isNotLive) {
    out.push(
      issue('profile_unknown', `implementation.profileId "${profileId}" is not a live profile`, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
    return;
  }
  checkReadyCompatibility(op, value, context, out);
}

/**
 * Validate non-ready implementation profile id reference.
 */
function validateNonReadyImplementationProfile(profileId, context, out) {
  if (!profileId) return;
  const { profiles, modelId, file, op, path } = context;
  if (!getAdapterProfile(profiles, profileId)) {
    out.push(
      issue('profile_unknown', `unknown implementation.profileId "${profileId}"`, {
        modelId,
        path: `${path}.profileId`,
        file,
        operationId: op?.id,
      }),
    );
  }
}

/**
 * Validate adapter readiness and its profile compatibility.
 * @param {unknown} implementation
 * @param {object} op
 * @param {string} path
 * @param {object} [context]
 * @returns {object[]}
 */
export function validateImplementation(implementation, op, path, context = {}) {
  const out = [];
  if (implementation == null) return out;
  const { modelId, file, profiles } = context;

  if (typeof implementation !== 'object' || Array.isArray(implementation)) {
    out.push(issue('schema_invalid', `implementation must be object at ${path}`, { modelId, path, file }));
    return out;
  }

  const value = /** @type {Record<string, unknown>} */ (implementation);
  const isInvalidStatus = typeof value.status !== 'string' || !IMPLEMENTATION_STATUS_SET.has(value.status);
  if (isInvalidStatus) {
    out.push(
      issue('schema_invalid', `invalid implementation.status "${value.status}" at ${path}`, {
        modelId,
        path: `${path}.status`,
        file,
        operationId: op?.id,
      }),
    );
    return out;
  }

  const profileId = typeof value.profileId === 'string' ? value.profileId : undefined;
  const implContext = { path, modelId, file, op, profiles, isNormalizedOp: context.isNormalizedOp };

  if (value.status === 'ready') {
    validateReadyImplementation(profileId, value, implContext, out);
  } else {
    validateNonReadyImplementationProfile(profileId, implContext, out);
  }
  return out;
}
