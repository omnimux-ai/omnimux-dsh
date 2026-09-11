/**
 * Operation and input slot schema validation operators.
 */

import {
  MEDIA_TYPES,
  OUTPUT_TYPES,
  SLOT_SOURCES,
  issue,
  validateAllowedMimes,
  validateMinMaxPair,
  validateSlotMinMax,
  validateLimitSource,
  validateAliasesArray,
} from './commonSchema.js';
import { validateSlotSizes, hasSizeLimitFields } from './imageSchema.js';
import { validateSlotDurations, hasVideoDurationFields } from './videoSchema.js';
import { validatePromptPolicy, validateInputGroups } from './textSchema.js';
import { validateResearch, validateExecution, validateImplementation } from './statusSchema.js';

/**
 * Validate required fields in an input slot.
 */
function validateSlotRequiredFields(s, basePath, context, out) {
  const { modelId, file } = context;
  const requiredKeys = ['slot', 'type', 'role', 'min', 'max'];
  for (const key of requiredKeys) {
    const val = s[key];
    const isEmpty = val === undefined || val === '';
    const isNullNonMax = key !== 'max' && val === null;
    const isMissing = isEmpty || isNullNonMax;
    if (isMissing) {
      out.push(
        issue('slot_field_missing', `input slot missing ${key} at ${basePath}`, {
          modelId,
          path: `${basePath}.${key}`,
          file,
        }),
      );
    }
  }
}

/**
 * Validate slot type and source enums.
 */
function validateSlotEnums(s, basePath, context, out) {
  const { modelId, file } = context;
  if (typeof s.type === 'string' && !MEDIA_TYPES.has(s.type)) {
    out.push(issue('schema_invalid', `invalid slot type ${s.type}`, { modelId, path: `${basePath}.type`, file }));
  }
  if (s.source != null && (typeof s.source !== 'string' || !SLOT_SOURCES.has(s.source))) {
    out.push(issue('schema_invalid', `invalid slot source ${s.source}`, { modelId, path: `${basePath}.source`, file }));
  }
}

/**
 * Validate one input slot declaration.
 * @param {unknown} slot
 * @param {string} basePath
 * @param {string} [modelId]
 * @param {string} [file]
 * @returns {object[]}
 */
export function validateSlot(slot, basePath, modelId, file) {
  const out = [];
  const context = { modelId, file };
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
    out.push(issue('schema_invalid', `input slot must be object at ${basePath}`, { modelId, path: basePath, file }));
    return out;
  }
  const s = /** @type {Record<string, unknown>} */ (slot);
  validateSlotRequiredFields(s, basePath, context, out);
  validateSlotEnums(s, basePath, context, out);

  const hasMin = s.min !== undefined && s.min !== null;
  if (hasMin && Object.prototype.hasOwnProperty.call(s, 'max')) {
    out.push(...validateSlotMinMax(s.min, s.max, basePath, context));
  }
  if (s.allowedMimes != null) {
    out.push(...validateAllowedMimes(s.allowedMimes, `${basePath}.allowedMimes`, modelId, file));
  }
  out.push(...validateSlotSizes(s, basePath, context));
  out.push(...validateSlotDurations(s, basePath, context));

  const hasLimits = hasSizeLimitFields(s) || hasVideoDurationFields(s);
  if (hasLimits) {
    out.push(...validateLimitSource(s.limitSource, `${basePath}.limitSource`, modelId, file));
  }
  return out;
}

/**
 * Extract operation id or mode fallback.
 */
function extractOperationId(o) {
  if (typeof o.id === 'string') return o.id;
  if (typeof o.mode === 'string') return o.mode;
  return '';
}

/**
 * Validate operation identifier.
 */
function validateOperationId(opId, base, context, out) {
  const { modelId, file, opIds } = context;
  if (!opId) {
    out.push(issue('slot_field_missing', `operation missing id at ${base}`, { modelId, path: `${base}.id`, file }));
    return;
  }
  if (opIds && !opIds.has(opId)) {
    out.push(
      issue('operation_unknown', `unknown operation id "${opId}"`, {
        modelId,
        path: `${base}.id`,
        file,
        operationId: opId,
      }),
    );
  }
}

/**
 * Validate output type string and membership.
 */
function validateOutputType(outObj, base, context, out) {
  const { modelId, file, opId } = context;
  if (outObj.type == null || outObj.type === '') {
    out.push(issue('output_type_missing', `missing output.type at ${base}`, { modelId, path: `${base}.output.type`, file, operationId: opId }));
    return;
  }
  if (typeof outObj.type !== 'string' || !OUTPUT_TYPES.has(outObj.type)) {
    out.push(issue('output_type_invalid', `invalid output.type "${outObj.type}"`, { modelId, path: `${base}.output.type`, file, operationId: opId }));
  }
}

/**
 * Validate operation output definition.
 */
function validateOperationOutput(output, base, opId, context) {
  const out = [];
  const { modelId, file } = context;
  if (output == null) {
    out.push(issue('output_type_missing', `missing output at ${base}`, { modelId, path: `${base}.output`, file, operationId: opId }));
    return out;
  }
  if (typeof output !== 'object' || Array.isArray(output)) {
    out.push(issue('schema_invalid', `output must be object at ${base}`, { modelId, path: `${base}.output`, file, operationId: opId }));
    return out;
  }
  const outObj = /** @type {Record<string, unknown>} */ (output);
  validateOutputType(outObj, base, context, out);

  if (outObj.allowedMimes != null) {
    out.push(...validateAllowedMimes(outObj.allowedMimes, `${base}.output.allowedMimes`, modelId, file));
  }
  const hasMinOrMax = outObj.min != null || outObj.max != null;
  if (hasMinOrMax) {
    out.push(...validateMinMaxPair(outObj.min, outObj.max, `${base}.output`, { modelId, file, code: 'schema_invalid' }));
  }
  return out;
}

/**
 * Validate array of inputs for an operation.
 */
function validateOperationInputs(inputs, base, context) {
  const out = [];
  const { modelId, file } = context;
  if (!Array.isArray(inputs)) {
    out.push(issue('schema_invalid', `inputs must be array at ${base}`, { modelId, path: `${base}.inputs`, file, operationId: context.opId }));
    return out;
  }
  for (let i = 0; i < inputs.length; i++) {
    out.push(...validateSlot(inputs[i], `${base}.inputs[${i}]`, modelId, file));
  }
  return out;
}

/**
 * Resolve call parameters to standard context.
 */
function resolveOperationContext(ctxOrModelId, rest) {
  if (typeof ctxOrModelId === 'object' && ctxOrModelId !== null && !Array.isArray(ctxOrModelId)) {
    return ctxOrModelId;
  }
  const [opIds, registry, profiles, file, opts] = rest;
  return { modelId: ctxOrModelId, opIds, registry, profiles, file, opts: opts || {} };
}

/**
 * Validate status blocks (research, implementation, execution) on operation.
 */
function validateOperationStatusBlocks(o, base, opId, context) {
  const out = [];
  const { modelId, file, profiles } = context;
  out.push(...validateResearch(o.research, `${base}.research`, { modelId, file, operationId: opId }));

  if (o.implementation != null) {
    const opRef = { id: opId, output: o.output, inputs: o.inputs };
    const statusCtx = { modelId, file, profiles, isNormalizedOp: true };
    out.push(...validateImplementation(o.implementation, opRef, `${base}.implementation`, statusCtx));
  }

  if (o.execution != null) {
    const opRef = { id: opId, output: o.output, inputs: o.inputs };
    const statusCtx = { modelId, file, profiles, isNormalizedOp: true };
    out.push(...validateExecution(o.execution, opRef, `${base}.execution`, statusCtx));
  }
  return out;
}

/**
 * Validate single operation object.
 * @param {unknown} op
 * @param {number} opIndex
 * @param {object|string} ctxOrModelId
 * @param {...unknown} rest
 * @returns {object[]}
 */
export function validateOperation(op, opIndex, ctxOrModelId, ...rest) {
  const out = [];
  const base = `operations[${opIndex}]`;
  const context = resolveOperationContext(ctxOrModelId, rest);
  const { modelId, file } = context;

  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    out.push(issue('schema_invalid', `operation must be object at ${base}`, { modelId, path: base, file }));
    return out;
  }

  const o = /** @type {Record<string, unknown>} */ (op);
  const opId = extractOperationId(o);
  context.opId = opId;

  validateOperationId(opId, base, context, out);
  out.push(...validateOperationOutput(o.output, base, opId, context));
  out.push(...validateOperationInputs(o.inputs, base, context));

  if (Array.isArray(o.inputs)) {
    out.push(...validatePromptPolicy(opId, o.inputs, base, context));
    out.push(...validateInputGroups(o.inputGroups, o.inputs, base, context));
  }

  out.push(...validateAliasesArray(o.aliases, `${base}.aliases`, modelId, file));
  out.push(...validateOperationStatusBlocks(o, base, opId, context));

  return out;
}
