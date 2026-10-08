/** @typedef {import('../types/index.js').ParameterDefinition} ParameterDefinition */
/** @typedef {import('../types/index.js').ParameterMemberResult} ParameterMemberResult */
/** @typedef {import('../types/index.js').ParameterPolicy} ParameterPolicy */

/** @param {unknown} value @returns {boolean} */
function plain(value) {
  return typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** @param {ParameterPolicy | undefined} policy @returns {'canonical' | 'legacyGuard'} */
function modeOf(policy) {
  if (policy === undefined) return 'canonical'
  if (!plain(policy) || Object.getOwnPropertySymbols(policy).length > 0
    || Object.getOwnPropertyNames(policy).some((key) => key !== 'mode')
    || (policy.mode !== undefined && policy.mode !== 'canonical' && policy.mode !== 'legacyGuard')) {
    throw new TypeError('parameter policy must be { mode?: canonical | legacyGuard }')
  }
  return policy.mode ?? 'canonical'
}

/** @param {unknown} value @returns {value is string | boolean | number | null} */
function primitive(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

/** @param {unknown} left @param {unknown} right @param {boolean | undefined} fold */
function matches(left, right, fold) {
  return Object.is(left, right) || (left === 0 && right === 0) || (fold === true && typeof left === 'string' && typeof right === 'string'
    && left.toLowerCase() === right.toLowerCase())
}

/**
 * Only native finite Number strings enter this bounded decimal representation.
 * Normalized coefficients have at most 17 digits and exponents lie in [-324, 308].
 * @param {number} value
 * @returns {{ coefficient: bigint, exponent: number } | null}
 */
function decimal(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value))
  if (!match) return null
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '') || '0'
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0)
  while (digits.length > 1 && digits.endsWith('0')) { digits = digits.slice(0, -1); exponent += 1 }
  if (digits.length > 17 || exponent < -324 || exponent > 308 || !Number.isInteger(exponent)) return null
  return { coefficient: BigInt((match[1] || '') + digits), exponent }
}

/**
 * Exact integer residual for the shortest-decimal near-grid policy, not binary
 * Number subtraction. The strict quarter-cell budget precedes any membership.
 * @param {number} value @param {number} min @param {number} step
 * @returns {ParameterMemberResult}
 */
function stepped(value, min, step) {
  const parts = [decimal(value), decimal(min), decimal(step)]
  if (parts.some((part) => part === null)) return { status: 'indeterminate', diagnostic: 'precision_unproven' }
  const valid = /** @type {{ coefficient: bigint, exponent: number }[]} */ (parts)
  const exponent = valid.reduce((lowest, part) => part.exponent < lowest ? part.exponent : lowest, 308)
  if (valid.some((part) => part.exponent - exponent > 632)) return { status: 'indeterminate', diagnostic: 'precision_unproven' }
  const [V, M, S] = valid.map((part) => part.coefficient * 10n ** BigInt(part.exponent - exponent))
  const D = V - M
  if (D < 0n || S <= 0n) return { status: 'indeterminate', diagnostic: 'precision_unproven' }
  const Q = D > S ? D : S
  const scale = 2n ** 49n
  if (4n * Q >= scale * S) return { status: 'indeterminate', diagnostic: 'precision_unproven' }
  const remainder = D % S
  const R = remainder < S - remainder ? remainder : S - remainder
  return R * scale <= Q ? { status: 'member' } : { status: 'nonmember', reason: 'range' }
}

/**
 * Test a declared domain without coercing or changing the supplied value.
 * @param {ParameterDefinition} definition
 * @param {unknown} value
 * @param {ParameterPolicy} [policy]
 * @returns {ParameterMemberResult}
 */
export function checkParameterMember(definition, value, policy) {
  const mode = modeOf(policy)
  if (!plain(definition)) return { status: 'indeterminate', diagnostic: 'malformed_definition' }
  const malformed = { status: /** @type {const} */ ('indeterminate'), diagnostic: /** @type {const} */ ('malformed_definition') }
  for (const flag of /** @type {const} */ (['allowAuto', 'supported', 'caseInsensitive'])) {
    if (definition[flag] !== undefined && typeof definition[flag] !== 'boolean') return malformed
  }
  for (const bound of /** @type {const} */ (['minLength', 'maxLength'])) {
    const raw = definition[bound]
    if (raw !== undefined && (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0)) return malformed
  }
  if (definition.minLength !== undefined && definition.maxLength !== undefined
    && definition.minLength > definition.maxLength) return malformed
  if (Object.prototype.hasOwnProperty.call(definition, 'defaultValue') && definition.defaultValue === undefined) return malformed
  const known = ['type', 'options', 'optionsFrom', 'range', 'defaultValue', 'minLength', 'maxLength',
    'supported', 'allowAuto', 'caseInsensitive', 'unit', 'description', 'label', 'help']
  if (Object.getOwnPropertySymbols(definition).length > 0
    || Object.getOwnPropertyNames(definition).some((key) => !known.includes(key))) return malformed
  const range = definition.range
  if (range !== undefined) {
    if (!plain(range) || Object.getOwnPropertySymbols(range).length > 0
      || Object.getOwnPropertyNames(range).some((key) => !['min', 'max', 'step'].includes(key))) return malformed
    for (const bound of /** @type {const} */ (['min', 'max', 'step'])) {
      const raw = range[bound]
      if (raw !== undefined && (typeof raw !== 'number' || !Number.isFinite(raw))) return malformed
    }
    if ((range.step !== undefined && range.step <= 0)
      || (range.min !== undefined && range.max !== undefined && range.min > range.max)) return malformed
  }
  /** @type {unknown[]} */
  const options = []
  if (definition.options !== undefined) {
    if (!Array.isArray(definition.options)) return malformed
    for (const item of definition.options) {
      const option = plain(item) ? /** @type {{ value: unknown }} */ (item).value : item
      if (!primitive(option) || options.some((candidate) => matches(candidate, option, definition.caseInsensitive))) return malformed
      options.push(option)
    }
  }
  const optionMember = options.some((option) => matches(option, value, definition.caseInsensitive))
  const inRangeBounds = range !== undefined && typeof value === 'number' && Number.isFinite(value)
    && (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max)
  // Legacy options-first explanation does not establish membership or bypass outer constraints.
  const autoMember = definition.allowAuto === true && value === -1
  if (mode === 'legacyGuard' && definition.optionsFrom === undefined
    && options.length > 0 && !optionMember && !inRangeBounds && !autoMember) {
    return { status: 'nonmember', reason: 'domain' }
  }
  if (!primitive(value)) return { status: 'nonmember', reason: 'domain' }
  if (definition.supported === true && typeof value !== 'boolean') return { status: 'nonmember', reason: 'boolean' }
  if (definition.supported === false) return { status: 'nonmember', reason: 'unsupported' }
  if (definition.type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value))) return { status: 'nonmember', reason: 'integer' }
  if (definition.type === 'number' && typeof value !== 'number') return { status: 'nonmember', reason: 'number' }
  if (definition.type === 'string' && typeof value !== 'string') return { status: 'nonmember', reason: 'string' }
  if (definition.type === 'boolean' && typeof value !== 'boolean') return { status: 'nonmember', reason: 'boolean' }
  if (definition.type !== undefined && !['integer', 'number', 'string', 'boolean'].includes(definition.type)) return { status: 'nonmember', reason: 'type' }
  if (definition.minLength !== undefined || definition.maxLength !== undefined) {
    if (typeof value !== 'string') return { status: 'nonmember', reason: 'length_type' }
    const length = Array.from(value).length
    if (definition.minLength !== undefined && length < definition.minLength) return { status: 'nonmember', reason: 'minLength' }
    if (definition.maxLength !== undefined && length > definition.maxLength) return { status: 'nonmember', reason: 'maxLength' }
  }
  if (optionMember) return { status: 'member' }
  if (autoMember) return { status: 'member' }
  /** @type {ParameterMemberResult | undefined} */
  let rangeResult
  if (range !== undefined) {
    rangeResult = typeof value !== 'number' ? { status: 'nonmember', reason: 'number' }
      : !inRangeBounds ? { status: 'nonmember', reason: 'range' }
        : range.step === undefined ? { status: 'member' }
          : range.min === undefined ? { status: 'indeterminate', diagnostic: 'precision_unproven' }
            : stepped(value, range.min, range.step)
    if (rangeResult.status === 'member') return rangeResult
  }
  if (definition.optionsFrom !== undefined) return { status: 'indeterminate', diagnostic: 'unresolved_options' }
  if (rangeResult) {
    if (definition.options && definition.options.length > 0 && rangeResult.status === 'nonmember'
      && !inRangeBounds) return { status: 'nonmember', reason: 'domain' }
    return rangeResult
  }
  return definition.options === undefined && value !== null ? { status: 'member' } : { status: 'nonmember', reason: 'domain' }
}

/**
 * Operation declarations replace whole model fields. Only legacy extraction treats
 * null/empty strings as absent and ignores undeclared transport fields.
 * @param {Readonly<Record<string, unknown>>} request
 * @param {Readonly<Record<string, ParameterDefinition>>} [operationDefinitions]
 * @param {Readonly<Record<string, ParameterDefinition>>} [modelDefinitions]
 * @param {ParameterPolicy} [policy]
 * @returns {import('../types/index.js').DeclaredParameterResult}
 */
export function evaluateDeclaredParameters(request, operationDefinitions, modelDefinitions, policy) {
  const mode = modeOf(policy)
  if (!plain(request)) throw new TypeError('parameter request must be a plain object')
  if ((operationDefinitions !== undefined && !plain(operationDefinitions))
    || (modelDefinitions !== undefined && !plain(modelDefinitions))) return {
    ok: false, field: '', source: 'definition', result: { status: 'indeterminate', diagnostic: 'malformed_definition' },
  }
  const definitions = { ...modelDefinitions, ...operationDefinitions }
  if (mode === 'canonical') for (const field of Object.keys(request)) {
    if (request[field] !== undefined && !Object.prototype.hasOwnProperty.call(definitions, field)) return {
      ok: false, field, source: 'request', result: { status: 'nonmember', reason: 'unknown_field' },
    }
  }
  /** @type {Record<string, unknown>} */
  const values = {}
  for (const [field, definition] of Object.entries(definitions)) {
    if (!plain(definition)) return { ok: false, field, source: 'definition', result: { status: 'indeterminate', diagnostic: 'malformed_definition' } }
    const supplied = Object.prototype.hasOwnProperty.call(request, field) && request[field] !== undefined
      && (mode !== 'legacyGuard' || (request[field] !== null && request[field] !== ''))
    if (!supplied && !Object.prototype.hasOwnProperty.call(definition, 'defaultValue')) continue
    const value = supplied ? request[field] : definition.defaultValue
    const domain = !supplied && mode === 'legacyGuard' && definition.supported === false
      ? Object.create(Object.getPrototypeOf(definition), {
        ...Object.getOwnPropertyDescriptors(definition),
        supported: { value: undefined, enumerable: true, writable: true, configurable: true },
      }) : definition
    const result = checkParameterMember(domain, value, policy)
    if (result.status !== 'member') return { ok: false, field, source: supplied ? 'request' : 'default', result }
    Object.defineProperty(values, field, { value, enumerable: true, writable: true, configurable: true })
  }
  return { ok: true, values }
}
