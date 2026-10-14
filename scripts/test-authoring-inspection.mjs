import { parse } from 'acorn'

/** Narrow write-time JS inspection; neither semantic equivalence nor independent review. */
export function inspectTestAuthoring(code) {
  let ast
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }) }
  catch { return { allowed: false, reason: 'unsupported-or-incomplete-test-syntax' } }
  const blocked = new Set(['skip', 'only', 'todo'])
  const runners = new Set(['test', 'it', 'describe'])
  for (const statement of ast.body) {
    if (statement.type === 'ImportDeclaration' && ['node:test', 'vitest', '@jest/globals'].includes(statement.source.value)) {
      for (const specifier of statement.specifiers) runners.add(specifier.local.name)
    }
  }
  let reason = null
  function inspect(node) {
    if (!node || typeof node !== 'object' || reason) return
    if (node.type === 'MemberExpression') {
      const property = node.computed ? node.property.type === 'Literal' ? node.property.value : null : node.property.name
      if (property === null) reason = 'dynamic-test-member-needs-review'
      else if (blocked.has(property) || ['eval', 'Function', 'constructor', 'defineProperty', 'defineProperties', 'call', 'apply', 'bind'].includes(property) || node.object.type === 'Identifier' && node.object.name === 'Reflect') reason = 'test-execution-selector-needs-review'
    }
    if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
      const key = node.computed ? node.key.type === 'Literal' ? node.key.value : null : node.key.name ?? node.key.value
      if (key === null) reason = 'dynamic-test-property-needs-review'
      if (blocked.has(key) && !(node.value?.type === 'Literal' && [false, null, 0, ''].includes(node.value.value))) reason = 'test-execution-option-needs-review'
    }
    if (node.type === 'CallExpression') {
      const directRunner = node.callee.type === 'Identifier' && runners.has(node.callee.name)
      const namespaceRunner = node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && runners.has(node.callee.object.name)
      if (directRunner || namespaceRunner) {
        const first = node.arguments[0]
        const named = first?.type === 'Literal' && typeof first.value === 'string'
        const options = named ? node.arguments[1] : first
        const callback = options && ['ArrowFunctionExpression', 'FunctionExpression'].includes(options.type)
        if (options && !callback && (options.type !== 'ObjectExpression' || options.properties.some(property => property.type !== 'Property'))) reason = 'dynamic-test-options-needs-review'
      }
    }
    if (node.type === 'SpreadElement' || node.type === 'ImportExpression' || node.type === 'WithStatement') reason = 'dynamic-test-execution-needs-review'
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
