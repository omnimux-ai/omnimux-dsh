import { parse } from 'acorn'

const scope = 'syntax-only; changed test standards still require independent review'
const blocked = new Set(['skip', 'only', 'todo'])
const execution = new Set(['eval', 'Function', 'constructor', 'defineProperty', 'defineProperties', 'call', 'apply', 'bind', 'getBuiltinModule', 'binding', '_linkedBinding', 'dlopen', 'createRequire'])
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

// Preserve node bodies and literal values, but not comments or source coordinates.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return typeof value === 'bigint' ? String(value) + 'n' : value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc'].includes(key)).map(([key, child]) => [key, canonical(child)]))
}

function contextOf(node) {
  if (functions.has(node.type)) return { type: node.type, id: node.id, params: node.params, async: node.async, generator: node.generator }
  if (node.type === 'VariableDeclarator') return { type: node.type, id: node.id }
  if (node.type === 'VariableDeclaration') return { type: node.type, kind: node.kind }
  if (['ReturnStatement', 'ThrowStatement', 'AwaitExpression', 'YieldExpression'].includes(node.type)) return { type: node.type, delegate: node.delegate }
  if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') return { type: node.type, key: node.key, computed: node.computed, kind: node.kind, static: node.static }
  if (node.type === 'CallExpression' || node.type === 'NewExpression') return { type: node.type, optional: node.optional, callee: node.callee, arguments: node.arguments.map(arg => functions.has(arg.type) ? contextOf(arg) : arg) }
  if (node.type === 'TaggedTemplateExpression') return { type: node.type, quasi: node.quasi }
  if (node.type === 'MemberExpression') return { type: node.type, property: node.property, computed: node.computed, optional: node.optional }
  if (['ArrayExpression', 'ArrayPattern', 'TryStatement', 'ChainExpression', 'SequenceExpression', 'ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(node.type)) return { type: node.type }
  if (node.type === 'ImportDeclaration') return node
  if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression') return { type: node.type, operator: node.operator, left: node.left }
  if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression') return { type: node.type, operator: node.operator, prefix: node.prefix }
  if (node.type === 'AssignmentExpression') return { type: node.type, operator: node.operator, left: node.left }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return { type: node.type, id: node.id, superClass: node.superClass }
  if (node.type === 'BlockStatement' || node.type === 'StaticBlock') return { type: node.type }
  if (['IfStatement', 'ConditionalExpression', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement', 'SwitchCase', 'CatchClause'].includes(node.type)) return { type: node.type, await: node.await, test: node.test, init: node.init, update: node.update, left: node.left, right: node.right, discriminant: node.discriminant, param: node.param }
  return null
}

/** Collect the existing bounded risk rules, not a general JavaScript dataflow model. */
function collectRisks(code) {
  let ast
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }) }
  catch { return { reason: 'unsupported-or-incomplete-test-syntax' } }
  const risks = []
  const runners = new Set(['test', 'it', 'describe'])
  const imports = new Map()
  for (const statement of ast.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      imports.set(specifier.local.name, statement)
      if (['node:test', 'vitest', '@jest/globals'].includes(statement.source.value)) runners.add(specifier.local.name)
    }
  }
  function inspect(node, parent = null, contexts = [], siblings = new Map()) {
    if (!node || typeof node !== 'object' || !node.type) return
    const context = contextOf(node)
    let nextContexts = contexts
    let nestedSiblings = siblings
    if (context) {
      const key = JSON.stringify(canonical(context))
      let occurrence
      if (functions.has(node.type) || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
        occurrence = siblings.get(key) || 0
        siblings.set(key, occurrence + 1)
        nestedSiblings = new Map()
      }
      nextContexts = [...contexts, { node: context, occurrence }]
    }
    function risk(reason) {
      const anchor = (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') && parent.callee === node ? parent : node
      const detail = canonical({ node: anchor, contexts: nextContexts })
      const names = new Set()
      function identifiers(value) {
        if (!value || typeof value !== 'object') return
        if (value.type === 'Identifier') names.add(value.name)
        for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(identifiers); else identifiers(child)
      }
      identifiers(detail)
      const bindings = [...names].filter(name => imports.has(name)).sort().map(name => imports.get(name))
      risks.push({ reason, fingerprint: JSON.stringify(canonical({ reason, detail, bindings })) })
    }
    if (node.type === 'MemberExpression') {
      const property = node.computed ? node.property.type === 'Literal' ? node.property.value : null : node.property.name
      if (property === null) risk('dynamic-test-member-needs-review')
      else if (blocked.has(property) || execution.has(property) || node.object.type === 'Identifier' && node.object.name === 'Reflect') risk('test-execution-selector-needs-review')
    }
    if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
      const key = node.computed ? node.key.type === 'Literal' ? node.key.value : null : node.key.name ?? node.key.value
      if (key === null) risk('dynamic-test-property-needs-review')
      if (parent?.type === 'ObjectPattern' && execution.has(key)) risk('runtime-code-execution-binding-needs-review')
      if (key === 'only' || blocked.has(key) && !(node.value?.type === 'Literal' && node.value.value === false)) risk('test-execution-option-needs-review')
    }
    if (node.type === 'CallExpression') {
      const directRunner = node.callee.type === 'Identifier' && runners.has(node.callee.name)
      const namespaceRunner = node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && runners.has(node.callee.object.name)
      if (directRunner || namespaceRunner) {
        const first = node.arguments[0]
        const named = first?.type === 'Literal' && typeof first.value === 'string'
        const options = named ? node.arguments[1] : first
        const callback = options && functions.has(options.type)
        if (options && !callback && (options.type !== 'ObjectExpression' || options.properties.some(property => property.type !== 'Property'))) risk('dynamic-test-options-needs-review')
      }
    }
    if (node.type === 'ImportDeclaration' && /^(?:node:)?(?:vm|child_process|worker_threads|module)$/.test(node.source.value)) risk('runtime-code-execution-import-needs-review')
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') risk('dynamic-test-execution-needs-review')
    if (node.type === 'SpreadElement' || node.type === 'ImportExpression' || node.type === 'WithStatement') risk('dynamic-test-execution-needs-review')
    if (node.type === 'Identifier' && ['eval', 'Function'].includes(node.name)) risk('dynamic-test-execution-needs-review')
    if (node.type === 'ImportSpecifier' && (blocked.has(node.imported.name ?? node.imported.value) || execution.has(node.imported.name ?? node.imported.value))) risk('test-execution-import-needs-review')
    for (const [key, value] of Object.entries(node)) {
      const branch = ['IfStatement', 'ConditionalExpression', 'LogicalExpression', 'TryStatement', 'TaggedTemplateExpression', 'MemberExpression', 'ChainExpression', 'SequenceExpression', 'ArrayExpression', 'ArrayPattern', 'ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(node.type) ? [...nextContexts, { edge: key }] : nextContexts
      if (Array.isArray(value)) for (const [index, child] of value.entries()) {
        const argumentsContext = ['arguments', 'elements', 'expressions', 'cases'].includes(key) ? [...branch, { slot: key, index }] : branch
        inspect(child, node, argumentsContext, nestedSiblings)
      }
      else if (value && typeof value === 'object') inspect(value, node, branch, nestedSiblings)
    }
  }
  inspect(ast)
  return { risks }
}

/** Narrow complete-candidate inspection; neither semantic equivalence nor independent review. */
export function inspectTestAuthoring(code) {
  const result = collectRisks(code)
  const reason = result.reason || result.risks[0]?.reason || null
  return { allowed: !reason, reason, scope }
}

/** Pure comparison; the guard, never tool-supplied metadata, owns the actual before source. */
export function inspectTestAuthoringDelta(before, after) {
  const old = collectRisks(before)
  const candidate = collectRisks(after)
  if (old.reason || candidate.reason) return { allowed: false, reason: old.reason || candidate.reason, scope }
  const remaining = new Map()
  for (const risk of old.risks) remaining.set(risk.fingerprint, (remaining.get(risk.fingerprint) || 0) + 1)
  for (const risk of candidate.risks) {
    const count = remaining.get(risk.fingerprint) || 0
    if (!count) return { allowed: false, reason: risk.reason, scope }
    remaining.set(risk.fingerprint, count - 1)
  }
  return { allowed: true, reason: null, scope }
}
