/**
 * Adapter profiles and operation registry validation operators.
 */

import {
  EXPECTED_OPERATION_COUNT,
  PROFILE_STATUSES,
  PROMPT_POLICIES,
  OUTPUT_TYPES,
  issue,
  operationIdSet,
  loadOperationRegistry,
  loadAdapterProfiles,
} from './commonSchema.js';

/**
 * Validate operations in adapter profile entry.
 */
function validateProfileOps(p, pi, knownOps, out) {
  if (!Array.isArray(p.operations) || p.operations.length === 0) {
    out.push(
      issue('schema_invalid', `profile "${p.id}" operations[] required nonempty`, {
        path: `profiles[${pi}].operations`,
      }),
    );
    return;
  }
  for (let j = 0; j < p.operations.length; j++) {
    const op = p.operations[j];
    if (typeof op !== 'string' || !op) {
      out.push(
        issue('schema_invalid', `profile "${p.id}" operations must be nonempty strings`, {
          path: `profiles[${pi}].operations[${j}]`,
        }),
      );
      continue;
    }
    if (!knownOps.has(op)) {
      out.push(
        issue(
          'profile_operation_unknown',
          `profile "${p.id}" operations[${j}] unknown operation "${op}" (not in operation registry)`,
          { path: `profiles[${pi}].operations[${j}]`, operationId: op },
        ),
      );
    }
  }
}

/**
 * Validate output types in adapter profile entry.
 */
function validateProfileOutputs(p, pi, out) {
  if (!Array.isArray(p.outputTypes) || p.outputTypes.length === 0) {
    out.push(
      issue('schema_invalid', `profile "${p.id}" outputTypes[] required nonempty`, {
        path: `profiles[${pi}].outputTypes`,
      }),
    );
    return;
  }
  for (const t of p.outputTypes) {
    if (!OUTPUT_TYPES.has(t)) {
      out.push(
        issue('schema_invalid', `profile "${p.id}" invalid outputType "${t}"`, {
          path: `profiles[${pi}].outputTypes`,
        }),
      );
    }
  }
}

/**
 * Validate single profile item.
 */
function validateSingleProfile(p, pi, context) {
  const { knownOps, seen, out } = context;
  if (!p || typeof p !== 'object') {
    out.push(issue('schema_invalid', 'profile entry must be object', { path: `profiles[${pi}]` }));
    return;
  }
  if (typeof p.id !== 'string' || !p.id) {
    out.push(issue('schema_invalid', 'profile.id required', { path: `profiles[${pi}].id` }));
    return;
  }
  if (seen.has(p.id)) {
    out.push(issue('schema_invalid', `duplicate profile id "${p.id}"`, { path: `profiles[${pi}].id` }));
  }
  seen.add(p.id);

  if (typeof p.status !== 'string' || !PROFILE_STATUSES.has(p.status)) {
    out.push(issue('schema_invalid', `profile "${p.id}" invalid status`, { path: `profiles[${pi}].status` }));
  }
  if (p.seam != null && typeof p.seam !== 'string') {
    out.push(issue('schema_invalid', `profile "${p.id}" seam must be string or null`, { path: `profiles[${pi}].seam` }));
  }
  validateProfileOps(p, pi, knownOps, out);
  validateProfileOutputs(p, pi, out);
}

/**
 * Validate adapter-profiles.json shape.
 * @param {object} [profiles]
 * @param {object} [registry]
 * @returns {object[]}
 */
export function validateAdapterProfiles(profiles, registry) {
  const profileDoc = profiles || loadAdapterProfiles();
  const regDoc = registry || loadOperationRegistry();
  const out = [];

  if (!profileDoc || typeof profileDoc !== 'object') {
    out.push(issue('schema_invalid', 'adapter-profiles root must be object'));
    return out;
  }
  if (typeof profileDoc.version !== 'string' || !profileDoc.version) {
    out.push(issue('schema_invalid', 'adapter-profiles.version required'));
  }
  if (!Array.isArray(profileDoc.profiles)) {
    out.push(issue('schema_invalid', 'adapter-profiles.profiles must be array'));
    return out;
  }

  const knownOps = operationIdSet(regDoc);
  const seen = new Set();
  const context = { knownOps, seen, out };
  for (let pi = 0; pi < profileDoc.profiles.length; pi++) {
    validateSingleProfile(profileDoc.profiles[pi], pi, context);
  }
  return out;
}

/**
 * Validate single registry operation entry.
 */
function validateRegistryOp(op, seen, out) {
  if (!op || typeof op !== 'object') {
    out.push(issue('schema_invalid', 'registry operation must be object'));
    return;
  }
  if (typeof op.id !== 'string' || !op.id) {
    out.push(issue('schema_invalid', 'registry operation.id required'));
    return;
  }
  if (seen.has(op.id)) {
    out.push(issue('schema_invalid', `duplicate registry operation id "${op.id}"`));
  }
  seen.add(op.id);
  if (!PROMPT_POLICIES.has(op.promptPolicy)) {
    out.push(issue('schema_invalid', `registry operation "${op.id}" promptPolicy must be required|optional|none`));
  }
  if (typeof op.defaultOutputType === 'string' && !OUTPUT_TYPES.has(op.defaultOutputType)) {
    out.push(issue('schema_invalid', `registry operation "${op.id}" invalid defaultOutputType`));
  }
}

/**
 * Validate operation-registry.json shape including promptPolicy.
 * @param {object} [registry]
 * @returns {object[]}
 */
export function validateOperationRegistry(registry) {
  const regDoc = registry || loadOperationRegistry();
  const out = [];
  if (!regDoc || typeof regDoc !== 'object') {
    out.push(issue('schema_invalid', 'operation-registry root must be object'));
    return out;
  }
  if (typeof regDoc.version !== 'string' || !regDoc.version) {
    out.push(issue('schema_invalid', 'operation-registry.version required'));
  }
  if (!Array.isArray(regDoc.operations)) {
    out.push(issue('schema_invalid', 'operation-registry.operations must be array'));
    return out;
  }

  const seen = new Set();
  for (const op of regDoc.operations) {
    validateRegistryOp(op, seen, out);
  }
  if (seen.size !== EXPECTED_OPERATION_COUNT) {
    out.push(
      issue('schema_invalid', `operation registry must have exactly ${EXPECTED_OPERATION_COUNT} ops, got ${seen.size}`),
    );
  }
  return out;
}
