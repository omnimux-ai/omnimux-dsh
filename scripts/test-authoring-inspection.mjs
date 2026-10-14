import { parse } from 'acorn'

/** Narrow write-time JS inspection; neither semantic equivalence nor independent review. */
export function inspectTestAuthoring(code) {
  let ast
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }) }
  catch { return { allowed: false, reason: 'unsupported-or-incomplete-test-syntax' } }
  const blocked = new Set(['skip', 'only', 'todo'])
  let reason = null
  function inspect(node) {
    if (!node || typeof node !== 'object' || reason) return
    if (node.type === 'MemberExpression') {
      const property = node.computed ? node.property.type === 'Literal' ? node.property.value : null : node.property.name
      if (property === null) reason = 'dynamic-test-member-needs-review'
      else if (blocked.has(property)) reason = 'test-execution-selector-needs-review'
    }
    if (node.type === 'Property') {
      const key = node.computed ? node.key.type === 'Literal' ? node.key.value : null : node.key.name ?? node.key.value
      if (key === null) reason = 'dynamic-test-property-needs-review'
      if (blocked.has(key) && !(node.value.type === 'Literal' && [false, null, 0, ''].includes(node.value.value))) reason = 'test-execution-option-needs-review'
    }
    if (node.type === 'ImportExpression' || node.type === 'WithStatement') reason = 'dynamic-test-execution-needs-review'
    if (node.type === 'Identifier' && ['eval', 'Function'].includes(node.name)) reason = 'dynamic-test-execution-needs-review'
    if (node.type === 'ImportSpecifier' && blocked.has(node.imported.name ?? node.imported.value)) reason = 'test-execution-import-needs-review'
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) inspect(child)
      else if (value && typeof value === 'object') inspect(value)
    }
  }
  inspect(ast)
  return { allowed: !reason, reason, scope: 'syntax-only; changed test standards still require independent review' }
}
