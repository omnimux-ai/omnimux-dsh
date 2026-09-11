/**
 * Text and multimodal prompt policy, and input group validation operators.
 */

import { issue, promptPolicyFor } from './commonSchema.js';

/**
 * Check if a slot is considered a prompt input slot.
 */
function isPromptSlot(slot) {
  if (!slot || typeof slot !== 'object') return false;
  return slot.role === 'prompt' || slot.slot === 'prompt';
}

/**
 * Validate prompt policy conformance on an operation's inputs.
 * @param {string} opId
 * @param {unknown[]} inputs
 * @param {string} base
 * @param {object} context
 * @returns {object[]}
 */
export function validatePromptPolicy(opId, inputs, base, context) {
  const out = [];
  const { modelId, opIds, registry, file } = context;
  if (!opId || !opIds.has(opId)) return out;

  const policy = promptPolicyFor(opId, registry);
  const hasPrompt = inputs.some(isPromptSlot);

  if (policy === 'required' && !hasPrompt) {
    out.push(
      issue('prompt_required_missing', `operation "${opId}" promptPolicy=required but inputs lack prompt slot`, {
        modelId,
        path: `${base}.inputs`,
        file,
        operationId: opId,
      }),
    );
  }

  if (policy === 'none' && hasPrompt) {
    out.push(
      issue('prompt_forbidden', `operation "${opId}" promptPolicy=none but inputs include prompt`, {
        modelId,
        path: `${base}.inputs`,
        file,
        operationId: opId,
        level: 'warning',
      }),
    );
  }
  return out;
}

/**
 * Validate slot references inside one input group.
 */
function validateGroupSlotReferences(slots, params) {
  const { groupPath, declaredSlots, context, out } = params;
  const { modelId, file, opId } = context;
  for (const slotName of slots) {
    const isMissingSlot = typeof slotName !== 'string' || !declaredSlots.has(slotName);
    if (isMissingSlot) {
      out.push(
        issue('schema_invalid', `input group references unknown slot "${slotName}"`, {
          modelId,
          path: `${groupPath}.slots`,
          file,
          operationId: opId,
        }),
      );
    }
  }
}

/**
 * Validate single input group item.
 */
function validateSingleInputGroup(rawGroup, groupIndex, groupConfig, out) {
  const { base, declaredSlots, context } = groupConfig;
  const groupPath = `${base}.inputGroups[${groupIndex}]`;
  const { modelId, file, opId } = context;

  if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
    out.push(issue('schema_invalid', `input group must be object at ${groupPath}`, {
      modelId,
      path: groupPath,
      file,
      operationId: opId,
    }));
    return;
  }

  const group = /** @type {Record<string, unknown>} */ (rawGroup);
  if (!Array.isArray(group.slots) || group.slots.length === 0) {
    out.push(issue('schema_invalid', `input group slots required at ${groupPath}`, {
      modelId,
      path: `${groupPath}.slots`,
      file,
      operationId: opId,
    }));
  } else {
    validateGroupSlotReferences(group.slots, { groupPath, declaredSlots, context, out });
  }

  const isInvalidMin = typeof group.min !== 'number' || !Number.isInteger(group.min) || group.min < 0;
  if (isInvalidMin) {
    out.push(issue('schema_invalid', `input group min must be a nonnegative integer at ${groupPath}`, {
      modelId,
      path: `${groupPath}.min`,
      file,
      operationId: opId,
    }));
  }
}

/**
 * Extract slot names set from inputs list.
 */
function extractSlotNames(inputs) {
  if (!Array.isArray(inputs)) return new Set();
  const names = [];
  for (const slot of inputs) {
    if (slot && typeof slot === 'object' && slot.slot) {
      names.push(slot.slot);
    }
  }
  return new Set(names);
}

/**
 * Validate inputGroups structure and slot bindings.
 * @param {unknown} inputGroups
 * @param {unknown[]} inputs
 * @param {string} base
 * @param {object} context
 * @returns {object[]}
 */
export function validateInputGroups(inputGroups, inputs, base, context) {
  const out = [];
  const { modelId, file, opId } = context;
  if (inputGroups == null) return out;

  if (!Array.isArray(inputGroups)) {
    out.push(issue('schema_invalid', `inputGroups must be array at ${base}`, {
      modelId,
      path: `${base}.inputGroups`,
      file,
      operationId: opId,
    }));
    return out;
  }

  const declaredSlots = extractSlotNames(inputs);
  const groupConfig = { base, declaredSlots, context };

  for (let i = 0; i < inputGroups.length; i++) {
    validateSingleInputGroup(inputGroups[i], i, groupConfig, out);
  }
  return out;
}
