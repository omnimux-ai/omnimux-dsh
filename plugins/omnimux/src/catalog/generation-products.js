/** @param {object} [deps] */
export function createGenerationProducts(deps = {}) {
  return { list: () => ({}), preparePreview: () => ({ status: 'pending', executable: false, issues: [] }) }
}
