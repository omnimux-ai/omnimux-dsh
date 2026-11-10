/**
 * Normalize one gateway Contract v2 payload into the additive execution profile
 * carried by the public model catalog.
 *
 * The gateway is the source of these values. This module never invents a
 * context window, output cap, modality or reasoning level: a field the gateway
 * does not declare stays absent, and the contract's `unknowns` list rides with
 * it so callers can distinguish "not declared" from "declared false".
 */

const KNOWN_MODALITIES = new Set(['text', 'image', 'video', 'audio', 'pdf', 'document']);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function objectOrUndefined(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value)
    : undefined;
}

/**
 * @param {object|undefined|null} contract
 * @returns {{
 *   contextWindowTokens?: number,
 *   maxOutputTokens?: number,
 *   inputModalities: string[],
 *   outputModalities: string[],
 *   toolCalling?: boolean,
 *   streaming?: boolean,
 *   promptCaching?: boolean,
 *   reasoningEfforts?: Record<string, unknown>,
 *   defaultReasoningEffort?: string,
 *   unknowns: string[],
 *   source: 'gateway',
 * }}
 */
export function executionProfileFromContract(contract) {
  const input = contract && typeof contract === 'object' && !Array.isArray(contract) ? contract : {};
  const outputModalities = [];
  for (const operation of Array.isArray(input.operations) ? input.operations : []) {
    const type = operation && typeof operation === 'object' ? operation.output?.type : '';
    if (typeof type === 'string' && type && !outputModalities.includes(type)) outputModalities.push(type);
  }

  const profile = {
    inputModalities: stringList(input.input_modalities).filter((item) => KNOWN_MODALITIES.has(item)),
    outputModalities,
    unknowns: stringList(input.unknowns),
    source: 'gateway',
  };
  const contextWindowTokens = finiteNumber(input.context_window_tokens);
  if (contextWindowTokens !== undefined) profile.contextWindowTokens = contextWindowTokens;
  const maxOutputTokens = finiteNumber(input.max_output_tokens);
  if (maxOutputTokens !== undefined) profile.maxOutputTokens = maxOutputTokens;
  if (typeof input.tool_calling === 'boolean') profile.toolCalling = input.tool_calling;
  if (typeof input.streaming === 'boolean') profile.streaming = input.streaming;
  if (typeof input.prompt_caching === 'boolean') profile.promptCaching = input.prompt_caching;
  const reasoningEfforts = objectOrUndefined(input.reasoning_efforts);
  if (reasoningEfforts) profile.reasoningEfforts = reasoningEfforts;
  if (reasoningEfforts && typeof input.default_reasoning_effort === 'string'
    && Object.prototype.hasOwnProperty.call(reasoningEfforts, input.default_reasoning_effort)) {
    profile.defaultReasoningEffort = input.default_reasoning_effort;
  }
  return profile;
}

/**
 * A text execution profile needs both capacity numbers before it can safely
 * participate in automatic default selection or a chat provider row. Other
 * output families do not depend on those fields.
 *
 * @param {object|undefined|null} profile
 * @param {string} [family]
 * @returns {boolean}
 */
export function isExecutionProfileComplete(profile, family = '') {
  if (!profile || typeof profile !== 'object') return false;
  if (family !== 'llm' && family !== 'text') return true;
  return Number.isFinite(profile.contextWindowTokens) && Number.isFinite(profile.maxOutputTokens);
}

/**
 * Merge a gateway profile with a local fallback, keeping gateway values
 * authoritative where both describe the same field.
 *
 * @param {object|undefined} local
 * @param {object|undefined} gateway
 * @returns {object|undefined}
 */
export function mergeExecutionProfiles(local, gateway) {
  if (!local && !gateway) return undefined;
  return {
    ...(local && typeof local === 'object' ? local : {}),
    ...(gateway && typeof gateway === 'object' ? gateway : {}),
    source: gateway ? 'gateway' : (local?.source ?? 'local'),
  };
}
