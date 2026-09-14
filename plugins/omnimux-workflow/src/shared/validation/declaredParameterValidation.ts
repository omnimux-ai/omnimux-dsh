/**
 * Parameter admission shared by the canvas and execution readiness guard.
 *
 * This mirrors the hub submit guard's declared-parameter rules: operation
 * declarations override model declarations; undeclared values are left to the
 * provider; only supplied values (or declared defaults) are checked.
 */
export interface DeclaredParameterFailure {
  field: string;
  message: string;
}

function entriesOf(definitions: unknown): Array<[string, Record<string, unknown>]> {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return [];
  return Object.entries(definitions as Record<string, unknown>).filter(
    (entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]),
  );
}

/**
 * Range admission shared with the hub guard: bounds plus the step lattice, with the
 * declared automatic value (`-1`) standing outside both.
 */
function withinRange(range: Record<string, unknown> | null, value: unknown, allowAuto: boolean): boolean {
  if (!range) return false;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (allowAuto && value === -1) return true;
  const min = typeof range.min === 'number' ? range.min : undefined;
  const max = typeof range.max === 'number' ? range.max : undefined;
  const step = typeof range.step === 'number' ? range.step : undefined;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  if (step !== undefined && min !== undefined
    && Math.abs((value - min) / step - Math.round((value - min) / step)) > Number.EPSILON) return false;
  return true;
}

/** Return the first contract-declared parameter that rejects a supplied value. */
export function findDeclaredParameterFailure(
  values: Record<string, unknown>,
  operationParameters: Record<string, unknown> | undefined,
  modelParameters: Record<string, unknown> | undefined,
): DeclaredParameterFailure | null {
  const definitions = {
    ...(modelParameters ?? {}),
    ...(operationParameters ?? {}),
  };
  for (const [field, definition] of entriesOf(definitions)) {
    const supplied = Object.prototype.hasOwnProperty.call(values, field)
      && values[field] !== undefined
      && values[field] !== null
      && values[field] !== '';
    const hasDefault = Object.prototype.hasOwnProperty.call(definition, 'defaultValue');
    if (!supplied && !hasDefault) continue;
    const value = supplied ? values[field] : definition.defaultValue;

    const options = Array.isArray(definition.options) ? definition.options : [];
    const range = definition.range && typeof definition.range === 'object' && !Array.isArray(definition.range)
      ? (definition.range as Record<string, unknown>)
      : null;
    // Options and range are alternatives, exactly as in the hub submit guard: a value
    // is admitted when it matches an option OR falls inside the range. Reading options
    // as the sole whitelist rejects every in-range value of a declaration that
    // publishes both — seedance-2-5 duration is 4~30s plus the -1 automatic option,
    // so the default 5s was refused by the canvas while the hub accepted it.
    if (options.length > 0 || range) {
      const optionMatches = options.length > 0 && options.some((option) => {
        const candidate = option && typeof option === 'object' && !Array.isArray(option)
          ? (option as Record<string, unknown>).value
          : option;
        return Object.is(candidate, value)
          || (definition.caseInsensitive === true
            && typeof candidate === 'string'
            && typeof value === 'string'
            && candidate.toLowerCase() === value.toLowerCase());
      });
      if (!optionMatches && !withinRange(range, value, definition.allowAuto === true)) {
        // A range-only declaration keeps its own range wording; a declaration that
        // also publishes options reports the enum-style rejection the hub guard uses.
        if (options.length === 0 && range) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return { field, message: `参数“${field}”必须为数字` };
          }
          return { field, message: `参数“${field}”超出合同允许范围` };
        }
        return { field, message: `参数“${field}”不支持值 ${JSON.stringify(value)}` };
      }
    }
    if (definition.supported === true && typeof value !== 'boolean') {
      return { field, message: `参数“${field}”必须为布尔值` };
    }
    if (definition.supported === false && supplied) {
      return { field, message: `当前模型或生成方式不支持参数“${field}”` };
    }
    if (definition.type === 'integer' && !Number.isInteger(value)) {
      return { field, message: `参数“${field}”必须为整数` };
    }
    if (typeof value === 'string') {
      const length = Array.from(value).length;
      if (typeof definition.minLength === 'number' && length < definition.minLength) {
        return { field, message: `参数“${field}”少于 ${definition.minLength} 个字符` };
      }
      if (typeof definition.maxLength === 'number' && length > definition.maxLength) {
        return { field, message: `参数“${field}”超过 ${definition.maxLength} 个字符` };
      }
    }
  }
  return null;
}
