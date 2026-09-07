/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value @returns {value is string[]} */
export function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** @param {unknown} value @returns {string[]} */
export function stringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}
