import { posix } from 'node:path'
import { parse } from 'acorn'
import { LineCounter, parseDocument } from 'yaml'

const CATEGORIES = ['ciRequired', 'localRequired', 'manual', 'deprecated']
const SCRIPT = /\.(?:mjs|js|sh|py)$/
const JS = /\.(?:mjs|js)$/
const MAX_EXPANSIONS = 64
const PROCESS_CALLS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function entries(value) {
  return value instanceof Map ? [...value.entries()] : record(value) ? Object.entries(value) : []
}

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !/[\\\x00-\x20?#:*\[\]{}]/.test(path)
    && !posix.isAbsolute(path) && !path.split('/').some(part => part === '..' || part === '.' || !part)
    && !path.split('/').some(part => part === 'node_modules' || part === '.worktrees')
}

function literal(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null
}

function calleeName(node) {
  if (node?.type === 'Identifier') return node.name
  if (node?.type === 'MemberExpression') {
    const object = calleeName(node.object)
    const property = node.computed ? literal(node.property) : node.property.name
    return object && property ? `${object}.${property}` : null
  }
  return null
}

function visit(node, callback, ancestors = []) {
  if (!node || typeof node.type !== 'string') return
  callback(node, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    if (Array.isArray(child)) {
      for (const item of child) if (item?.type) visit(item, callback, [...ancestors, node])
    } else if (child?.type) visit(child, callback, [...ancestors, node])
  }
}

// Shell is deliberately a small command tokenizer, not a shell interpreter.
function tokenize(line) {
  const result = []
  let text = '', quote = null, started = false, dynamic = false
  const flush = () => {
    if (started) result.push({ text, dynamic })
    text = ''; started = false; dynamic = false
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (!quote && char === '#' && !started) break
    if (char === "'" || char === '"') {
      if (!quote) { quote = char; started = true; continue }
      if (quote === char) { quote = null; continue }
    }
    if (quote !== "'" && (char === '`' || (char === '$' && line[i + 1] === '('))) return { unknown: 'shell-substitution' }
    if (!quote && /[|;<>()[\]]/.test(char)) return { unknown: 'complex-shell' }
    if (!quote && char === '&') {
      if (line[i + 1] !== '&') return { unknown: 'complex-shell' }
      flush(); result.push({ text: '&&', operator: true }); i++; continue
    }
    if (char === '\\' && quote !== "'") {
      if (i + 1 === line.length) return { unknown: 'shell-escape' }
      text += line[++i]; started = true; continue
    }
    if (!quote && /\s/.test(char)) { flush(); continue }
    if (quote !== "'" && char === '$') dynamic = true
    text += char; started = true
  }
  if (quote) return { unknown: 'shell-quote' }
  flush()
  return { tokens: result }
}

/**
 * Pure inspection of a caller-supplied repository snapshot. No filesystem reads,
 * process execution, imports of inspected sources, or ambient workspace discovery.
 * @param {object} manifest Version 2 registry, or an object containing all four inputs.
 * @param {Map<string,string>|Object<string,string>} files Repository-relative paths to UTF-8 sources.
 * @param {object|string} packageJson Root package JSON; only its scripts field supplies local roots.
 * @param {Map|object|Array} workflows Workflow paths to YAML/object, or {path, content} records.
 * @returns {{diagnostics: object[], evidence: object[], unknowns: object[], reachability: object}}
 */
export function inspectGovernance(manifest, files, packageJson, workflows) {
  if (arguments.length === 1 && record(manifest) && Object.hasOwn(manifest, 'manifest')) {
    ({ manifest, files, packageJson, workflows } = manifest)
  }
  const diagnostics = [], evidence = [], unknowns = []
  const unknownKeys = new Set(), evidenceKeys = new Set()
  const error = (code, detail = {}) => diagnostics.push({ severity: 'error', code, ...detail })
  const unknown = (code, detail = {}) => {
    const item = { code, ...detail }, key = JSON.stringify(item)
    if (!unknownKeys.has(key)) { unknownKeys.add(key); unknowns.push(item) }
  }
  const prove = item => {
    const key = JSON.stringify(item)
    if (!evidenceKeys.has(key)) { evidenceKeys.add(key); evidence.push(item) }
  }
  const sources = new Map()
  if (!(files instanceof Map) && !record(files)) error('files-shape')
  for (const [path, content] of entries(files)) {
    if (!safePath(path)) { error('file-path-unsafe', { path }); continue }
    if (typeof content !== 'string') { error('file-content-shape', { path }); continue }
    sources.set(path, content)
  }
  const inventory = [...sources.keys()].filter(path => path.startsWith('scripts/') && SCRIPT.test(path)).sort()
  const registered = new Map()
  if (!record(manifest)) { error('manifest-shape'); manifest = {} }
  if (manifest.version !== 2) error('manifest-version', { expected: 2, actual: manifest.version })
  for (const category of CATEGORIES) {
    if (!Array.isArray(manifest[category])) { error('category-shape', { category }); continue }
    const seen = new Set()
    for (const path of manifest[category]) {
      if (!safePath(path) || path.startsWith('scripts/') || !SCRIPT.test(path)) {
        error('registry-path-unsafe', { category, path }); continue
      }
      if (seen.has(path)) error('registry-duplicate', { category, path })
      seen.add(path)
      if (registered.has(path) && registered.get(path) !== category) {
        error('registry-cross-category', { path, categories: [registered.get(path), category] })
      } else registered.set(path, category)
      if (!sources.has(`scripts/${path}`)) error('registry-ghost', { category, path })
    }
  }
  for (const path of inventory) if (!registered.has(path.slice(8))) error('inventory-unregistered', { path })

  let pkg = packageJson
  if (typeof pkg === 'string') {
    try { pkg = JSON.parse(pkg) } catch (cause) { error('package-json-parse', { message: cause.message }); pkg = {} }
  }
  if (!record(pkg)) { error('package-json-shape'); pkg = {} }
  const scripts = record(pkg.scripts) ? pkg.scripts : {}
  if (!record(pkg.scripts)) error('package-scripts-shape')

  const roots = [], astCache = new Map(), invocationEdges = new Map(), usedInvocations = new Set()
  function getAst(path) {
    if (astCache.has(path)) return astCache.get(path)
    const content = sources.get(path)
    if (!JS.test(path) || content === undefined) return null
    let ast = null
    try { ast = parse(content, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }) }
    catch (cause) { unknown('js-parse', { path, line: cause.loc?.line, message: cause.message }) }
    astCache.set(path, ast)
    return ast
  }

  function resolveTarget(target, cwd, context) {
    if (typeof target !== 'string' || !target || /[\\\x00-\x20?#:*\[\]{}$]/.test(target) || posix.isAbsolute(target)) {
      unknown('target-unsupported', { ...context, target }); return null
    }
    const path = posix.normalize(posix.join(cwd, target))
    if (!safePath(path)) { error('target-outside-scope', { ...context, target }); return null }
    if (!sources.has(path)) {
      if (path.startsWith('scripts/')) error('target-missing', { ...context, target: path })
      else unknown('target-not-supplied', { ...context, target: path })
      return null
    }
    if (!SCRIPT.test(path)) { unknown('target-language', { ...context, target: path }); return null }
    return path
  }

  function addRoot(path, context, mode, args = []) {
    roots.push({ path, mode, args, context })
    prove({ kind: 'root', channel: context.channel, mode, target: path, ...context, args })
  }

  function parseCommand(command, context, cwd = '.', stack = [], budget = { remaining: MAX_EXPANSIONS }) {
    if (typeof command !== 'string') { unknown('command-shape', context); return }
    if (/\\\r?\n/.test(command)) { unknown('shell-line-continuation-unmapped', { ...context, command }); return }
    const joined = command
    if (/^\s*(?:if\b|for\b|while\b|case\b|until\b|function\b|\w+\s*\(\))/m.test(joined)) {
      unknown('shell-control-flow', { ...context, command }); return
    }
    if (joined.includes('<<') || /(?:^|&&)\s*(?:(?:cd|pushd|popd|source|eval|exec|set|export)\b|\.\s)/m.test(joined)) {
      unknown('shell-context-or-heredoc', { ...context, command }); return
    }
    const lines = joined.split(/\r?\n/)
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      const location = { ...context, line: context.line == null ? null : context.line + index, command: line.trim() }
      const lexed = tokenize(line)
      if (lexed.unknown) { unknown(lexed.unknown, location); return }
      let segments = [[]]
      for (const token of lexed.tokens) {
        if (token.operator) segments.push([])
        else segments.at(-1).push(token)
      }
      if (segments.some(tokens => !tokens.length)) { unknown('shell-chain-shape', location); return }
      for (const tokens of segments) {
        let words = tokens.map(token => token.text)
        if (tokens.some(token => token.dynamic)) { unknown('command-dynamic-arguments', location); return }
        if (words[0] === 'corepack' && words[1] === 'pnpm') { words = words.slice(1); tokens.shift() }
        if (words[0] === 'pnpm') {
          let offset = 1
          while (words[offset] === '--config.verify-deps-before-run=false') offset++
          const explicitRun = words[offset] === 'run'
          if (explicitRun) offset++
          const name = words[offset]
          if (!explicitRun && !['test', 'start', 'rebuild', 'rb', 'setup', 'deploy', 'clean', 'purge'].includes(name)) {
            const knownBuiltin = ['install', 'i', 'exec', 'dlx', 'list', 'ls', 'audit', 'why', 'add', 'remove', 'rm', 'update', 'up', 'help', 'config', 'prune', 'dedupe', 'run-script'].includes(name)
            unknown(knownBuiltin ? 'package-builtin' : 'package-bare-dispatch-unproven', location); return
          }
          if (!name || name.startsWith('-') || tokens[offset]?.dynamic || /[*?{}]/.test(name)) {
            unknown('package-command-unsupported', location); return
          }
          if (!Object.hasOwn(scripts, name)) {
            // pnpm built-ins are not root package scripts.
            if (['install', 'exec', 'dlx', 'list', 'ls', 'audit', 'why', 'add', 'remove', 'update', 'help', 'config', 'prune', 'store', 'import', 'fetch', 'pack', 'publish', 'link', 'unlink', 'patch', 'patch-commit', 'env', 'root'].includes(name)) unknown('package-builtin', location)
            else error('package-script-missing', { ...location, script: name })
            return
          }
          if (cwd !== '.') { unknown('package-cwd-unsupported', { ...location, cwd }); return }
          if (words.length !== offset + 1) { unknown('package-script-arguments', { ...location, script: name }); return }
          if (stack.includes(name)) { error('package-script-cycle', { ...location, cycle: [...stack, name] }); return }
          if (stack.length >= MAX_EXPANSIONS || budget.remaining-- <= 0) { error('package-expansion-limit', location); return }
          if (typeof scripts[name] !== 'string') { error('package-script-shape', { script: name }); return }
          prove({ kind: 'package-expansion', ...location, script: name, chain: [...stack, name] })
          parseCommand(scripts[name], { ...location, viaPackage: [...stack, name], line: null }, cwd, [...stack, name], budget)
          // A package command may alter shell cwd/environment. Preserve its own proven roots, not its suffix.
          if (segments.length > 1 || index + 1 < lines.length) unknown('package-command-suffix-unproven', location)
          return
        }
        const runtime = words[0]
        if (runtime !== 'node' && runtime !== 'bash' && runtime !== 'python' && runtime !== 'python3') {
          unknown('command-unsupported', location); return
        }
        let offset = 1, mode = 'execution', testing = false
        if (runtime === 'node') {
          if (words[offset] === '--check') { mode = 'syntax'; offset++ }
          else if (words[offset] === '--test') { testing = true; offset++ }
        } else if (runtime === 'bash' && words[offset] === '-n') { mode = 'syntax'; offset++ }
        if (!words[offset] || words[offset].startsWith('-')) { unknown('runtime-options-or-discovery', location); return }
        if (testing && words.slice(offset).some(word => word.startsWith('-'))) {
          unknown('test-runner-options', location); return
        }
        const targets = testing ? words.slice(offset) : [words[offset]]
        for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
          const target = targets[targetIndex], token = tokens[offset + targetIndex]
          if (token?.dynamic || target.startsWith('-')) { unknown('target-unsupported', { ...location, target }); return }
          const path = resolveTarget(target, cwd, location)
          if (!path) return
          const compatible = path && (runtime === 'node' ? JS.test(path) : runtime === 'bash' ? path.endsWith('.sh') : path.endsWith('.py'))
          if (!compatible) { unknown('runtime-language-mismatch', { ...location, runtime, target: path }); return }
          const fixedArgs = !tokens.some(token => token.dynamic || /[*?\[\]{}]/.test(token.text))
          if (compatible) addRoot(path, location, mode, testing ? [] : fixedArgs ? words.slice(offset + 1) : null)
        }
      }
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') { error('package-script-shape', { script: name }); continue }
    parseCommand(command, { channel: 'local', source: 'package.json', script: name, line: null }, '.', [name])
  }

  let workflowEntries
  if (Array.isArray(workflows)) workflowEntries = workflows.map(item => [item?.path, item?.content])
  else {
    workflowEntries = entries(workflows)
    if (!(workflows instanceof Map) && !record(workflows)) error('workflows-shape')
  }
  for (const [path, value] of workflowEntries) {
    if (!safePath(path)) { error('workflow-path-unsafe', { path }); continue }
    let workflow = value, document = null, counter = null
    if (typeof value === 'string') {
      counter = new LineCounter()
      document = parseDocument(value, { lineCounter: counter, uniqueKeys: true, maxAliasCount: 100, keepSourceTokens: true })
      if (document.errors.length) { error('workflow-parse', { path, messages: document.errors.map(item => item.message) }); continue }
      try { workflow = document.toJS({ maxAliasCount: 100 }) }
      catch (cause) { error('workflow-parse', { path, message: cause.message }); continue }
    }
    if (!record(workflow) || !record(workflow.jobs)) { error('workflow-jobs-shape', { path }); continue }
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      if (!record(job) || !Array.isArray(job.steps)) continue
      for (let stepIndex = 0; stepIndex < job.steps.length; stepIndex++) {
        const step = job.steps[stepIndex]
        if (!record(step) || !Object.hasOwn(step, 'run')) continue
        const node = document?.getIn(['jobs', jobId, 'steps', stepIndex, 'run'], true)
        const folded = node?.srcToken?.type === 'block-scalar' && node.srcToken.props?.some(token => token.type === 'block-scalar-header' && token.source.startsWith('>'))
        const line = folded ? null : node?.srcToken?.type === 'block-scalar'
          ? counter.linePos(node.range[0]).line + 1
          : node?.range ? counter.linePos(node.range[0]).line : null
        const context = {
          channel: 'ci', source: path, job: jobId, step: stepIndex, stepName: step.name ?? null, line,
          conditions: [workflow.if, job.if, step.if].filter(item => item !== undefined),
        }
        if (folded) unknown('workflow-folded-location-unmapped', context)
        const runDefaults = [step, job.defaults?.run, workflow.defaults?.run].filter(record)
        const shellOwner = runDefaults.find(level => Object.hasOwn(level, 'shell'))
        const shell = shellOwner ? shellOwner.shell : undefined
        if (shellOwner && !['bash', 'sh'].includes(shell)) { unknown('workflow-shell', { ...context, shell }); continue }
        const directoryOwner = runDefaults.find(level => Object.hasOwn(level, 'working-directory'))
        const directory = directoryOwner ? directoryOwner['working-directory'] : '.'
        if (typeof directory !== 'string' || /[\\\x00-\x20$`?#:*\[\]{}]/.test(directory) || posix.isAbsolute(directory)) { unknown('workflow-cwd', { ...context, cwd: directory }); continue }
        const cwd = posix.normalize(directory)
        if (!cwd || (cwd !== '.' && !safePath(cwd))) { unknown('workflow-cwd', { ...context, cwd: directory }); continue }
        if ([workflow, job, step].some(level => Object.hasOwn(level, 'env') && !record(level.env))) {
          unknown('workflow-environment-shape', context); continue
        }
        const environment = Object.assign({}, record(workflow.env) ? workflow.env : {}, record(job.env) ? job.env : {}, record(step.env) ? step.env : {})
        if (Object.hasOwn(environment, 'PATH') || Object.hasOwn(environment, 'NODE_OPTIONS') || Object.hasOwn(environment, 'BASH_ENV') || Object.hasOwn(environment, 'ENV')) {
          unknown('workflow-runtime-environment', context); continue
        }
        parseCommand(step.run, { ...context, cwd, shell: shell ?? 'default' }, cwd)
      }
    }
  }

  const invocations = manifest.invocations ?? []
  if (!Array.isArray(invocations)) error('invocations-shape')
  const invocationSeen = new Set()
  for (const [index, invocation] of (Array.isArray(invocations) ? invocations : []).entries()) {
    if (!record(invocation)) { error('invocation-shape', { index }); continue }
    const { from, to, kind, source, selector, reason } = invocation
    if (!safePath(from) || !safePath(to) || from.startsWith('scripts/') || to.startsWith('scripts/')
      || !SCRIPT.test(from) || !SCRIPT.test(to) || !['module', 'node', 'bash', 'python'].includes(kind)
      || typeof reason !== 'string' || !reason.trim() || !record(source) || !Number.isInteger(source.line) || source.line < 1
      || typeof source.callee !== 'string' || !Number.isInteger(source.argument) || source.argument < 0
      || (selector !== undefined && (typeof selector !== 'string' || !selector))) {
      error('invocation-shape', { index }); continue
    }
    const fromPath = `scripts/${from}`, toPath = `scripts/${to}`
    if (!sources.has(fromPath) || !sources.has(toPath)) { error('invocation-missing', { index, from, to }); continue }
    const key = JSON.stringify([from, to, kind, source, selector ?? null])
    if (invocationSeen.has(key)) { error('invocation-duplicate', { index, from, to }); continue }
    invocationSeen.add(key)
    let matched = null, proven = false
    const ast = getAst(fromPath)
    if (ast) {
      const forkNames = new Set()
      const rebound = new Set()
      visit(ast, node => {
        if (node.type === 'ImportDeclaration' && ['node:child_process', 'child_process'].includes(literal(node.source))) {
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'fork') forkNames.add(specifier.local.name)
            if (specifier.type === 'ImportNamespaceSpecifier') forkNames.add(`${specifier.local.name}.fork`)
          }
        }
        const bind = pattern => {
          if (!pattern) return
          if (pattern.type === 'Identifier') rebound.add(pattern.name)
          else if (pattern.type === 'RestElement') bind(pattern.argument)
          else if (pattern.type === 'AssignmentPattern') bind(pattern.left)
          else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(bind)
          else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(property => bind(property.value ?? property.argument))
          else if (pattern.type === 'MemberExpression') bind(pattern.object)
        }
        if (node.type === 'ImportDeclaration') {
          for (const specifier of node.specifiers) if (specifier.local.name === 'process') bind(specifier.local)
        }
        if (node.type === 'VariableDeclarator') bind(node.id)
        if (/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
          bind(node.id); node.params.forEach(bind)
        }
        if (node.type === 'CatchClause') bind(node.param)
        if (node.type === 'AssignmentExpression') bind(node.left)
      })
      visit(ast, (node, ancestors) => {
        if (node.type !== 'CallExpression' || node.loc.start.line !== source.line || calleeName(node.callee) !== source.callee) return
        const target = literal(node.arguments[source.argument])
        const resolved = target?.startsWith('.') ? posix.normalize(posix.join(posix.dirname(fromPath), target)) : target
        if (resolved !== toPath) return
        const branch = [...ancestors].reverse().find(parent => parent.type === 'SwitchCase')
        if (selector !== undefined && literal(branch?.test) !== selector) return
        matched = node
        if (selector !== undefined) {
          const dispatch = [...ancestors].reverse().find(parent => parent.type === 'SwitchStatement')?.discriminant
          const directArg = dispatch?.type === 'MemberExpression' && dispatch.computed
            && dispatch.property.type === 'Literal' && dispatch.property.value === 2
            && calleeName(dispatch.object) === 'process.argv'
          if (!directArg || rebound.has('process') || ancestors.some(parent => /Function/.test(parent.type))) return
        }
        // A literal fork target uses execution cwd, not the importing module directory.
        if (source.argument === 0 && forkNames.has(source.callee) && !rebound.has(source.callee.split('.')[0])
          && kind === 'node' && node.arguments.length === 1 && posix.normalize(target) === toPath
          && !ancestors.some(parent => /Function/.test(parent.type))) {
          let changesCwd = false
          visit(ast, child => { if (child.type === 'CallExpression' && calleeName(child.callee) === 'process.chdir') changesCwd = true })
          // Imported modules may change cwd/argv before this call. A local AST cannot certify that context.
          if (!changesCwd) unknown('fork-execution-context-not-proven', { from: fromPath, to: toPath, line: source.line })
          proven = false
        }
        // A wrapper's name alone is not proof that its string argument is executed.
      })
    } else if (fromPath.endsWith('.sh') && selector === undefined) {
      const line = sources.get(fromPath).split(/\r?\n/)[source.line - 1]
      const tokens = typeof line === 'string' ? tokenize(line) : {}
      const expected = { node: ['node'], bash: ['bash'], python: ['python', 'python3'] }[kind] ?? []
      const complexSource = sources.get(fromPath).split(/\r?\n/).some(text => {
        const lexed = tokenize(text)
        return lexed.unknown || (lexed.tokens.length > 0 && (!['node', 'bash', 'python', 'python3'].includes(lexed.tokens[0].text)
          || lexed.tokens.some(token => token.dynamic || token.operator)))
      })
      const compatibleTarget = kind === 'node' ? JS.test(toPath) : kind === 'bash' ? toPath.endsWith('.sh') : kind === 'python' ? toPath.endsWith('.py') : false
      if (!complexSource && compatibleTarget && tokens.tokens?.length && expected.includes(tokens.tokens[0].text) && source.callee === tokens.tokens[0].text
        && source.argument === 0 && tokens.tokens[1]?.text === toPath && !tokens.tokens.some(token => token.dynamic || token.operator)) {
        matched = { loc: { start: { line: source.line } } }; proven = true
      }
    }
    if (!matched) { error('invocation-source-mismatch', { index, from, to, source, selector }); continue }
    if (!proven) { unknown('invocation-semantics-unproven', { index, from, to, source, selector }); continue }
    const edge = { index, from: fromPath, to: toPath, kind: 'invocation', invocationKind: kind, line: source.line, selector, reason }
    if (!invocationEdges.has(fromPath)) invocationEdges.set(fromPath, [])
    invocationEdges.get(fromPath).push(edge)
  }

  function dependencies(path) {
    const edges = []
    const ast = getAst(path)
    if (!ast) {
      if (!JS.test(path)) unknown('opaque-source', { path, language: path.endsWith('.sh') ? 'shell' : 'python' })
      return edges
    }
    const processAliases = new Set()
    visit(ast, node => {
      if (node.type === 'ImportDeclaration' && ['node:child_process', 'child_process'].includes(literal(node.source))) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && PROCESS_CALLS.has(specifier.imported.name)) processAliases.add(specifier.local.name)
          if (specifier.type === 'ImportNamespaceSpecifier' || specifier.type === 'ImportDefaultSpecifier') {
            for (const name of PROCESS_CALLS) processAliases.add(`${specifier.local.name}.${name}`)
          }
        }
      }
    })
    visit(ast, node => {
      let value = null, kind = null
      if (node.type === 'ImportDeclaration') { value = literal(node.source); kind = 'import' }
      if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') { value = literal(node.source); kind = 're-export' }
      if (node.type === 'ImportExpression') {
        value = literal(node.source); kind = 'literal-import'
        if (value === null) unknown('dynamic-import', { path, line: node.loc.start.line })
      }
      if (value !== null) {
        if (value.startsWith('./') || value.startsWith('../')) {
          const context = { path, line: node.loc.start.line, kind }
          const target = resolveTarget(value, posix.dirname(path), context)
          if (target && !JS.test(target)) unknown('import-language-unsupported', { ...context, target })
          else if (target) edges.push({ from: path, to: target, kind, line: node.loc.start.line })
        } else if (!value.startsWith('node:')) unknown('external-import', { path, line: node.loc.start.line, specifier: value })
      }
      if (node.type === 'CallExpression') {
        const name = calleeName(node.callee), tail = name?.split('.').at(-1)
        if (tail === 'require') unknown('require-unsupported', { path, line: node.loc.start.line })
        if (PROCESS_CALLS.has(tail) || processAliases.has(name) || /^(?:runNodeScript|runBash|fresh|runForkCommand)$/.test(tail ?? '')) {
          unknown('opaque-invocation', { path, line: node.loc.start.line, callee: name })
        }
      }
    })
    return edges
  }

  const graph = new Map(), ci = new Set(), local = new Set(), syntax = new Set()
  for (const root of roots) {
    if (root.mode === 'syntax') {
      syntax.add(root.path)
      if (registered.get(root.path.slice(8)) === 'deprecated') error('deprecated-referenced', { path: root.path, channel: root.context.channel, mode: root.mode })
      continue
    }
    const reached = root.context.channel === 'ci' ? ci : local
    const seen = new Set(), queue = [{ path: root.path, chain: [root.path], args: root.args }]
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const state = queue[cursor]
      if (seen.has(state.path)) continue
      seen.add(state.path); reached.add(state.path)
      prove({ kind: 'reachability', channel: root.context.channel, mode: 'execution', root: root.path, target: state.path, chain: state.chain, source: root.context })
      if (registered.get(state.path.slice(8)) === 'deprecated') error('deprecated-reachable', { path: state.path, channel: root.context.channel, chain: state.chain })
      if (!graph.has(state.path)) graph.set(state.path, dependencies(state.path))
      const edges = [...graph.get(state.path)]
      for (const edge of invocationEdges.get(state.path) ?? []) {
        if ((root.context.cwd ?? '.') !== '.') {
          unknown('invocation-cwd-not-proven', { index: edge.index, from: edge.from, cwd: root.context.cwd }); continue
        }
        if (edge.selector !== undefined && state.args?.[0] !== edge.selector) {
          unknown('invocation-selector-not-proven', { index: edge.index, from: edge.from, selector: edge.selector }); continue
        }
        usedInvocations.add(edge.index); edges.push(edge)
      }
      for (const edge of edges) {
        prove({ ...edge, channel: root.context.channel, root: root.path, conditions: root.context.conditions ?? [] })
        if (state.chain.includes(edge.to)) {
          prove({ kind: 'import-cycle', channel: root.context.channel, root: root.path, chain: [...state.chain, edge.to] }); continue
        }
        queue.push({ path: edge.to, chain: [...state.chain, edge.to], args: null })
      }
    }
  }
  for (const edges of invocationEdges.values()) {
    for (const edge of edges) if (!usedInvocations.has(edge.index)) error('invocation-unreachable', { index: edge.index, from: edge.from, to: edge.to })
  }
  const classification = {}
  for (const path of inventory) {
    const category = registered.get(path.slice(8))
    const expected = ci.has(path) ? 'ciRequired' : local.has(path) || syntax.has(path) ? 'localRequired' : 'manual'
    classification[path] = { registered: category ?? null, expected, ci: ci.has(path), local: local.has(path), syntaxOnly: syntax.has(path) && !ci.has(path) && !local.has(path) }
    if (category && category !== 'deprecated' && category !== expected) error('category-evidence-mismatch', { path, category, expected })
  }
  return {
    diagnostics, evidence, unknowns,
    reachability: { inventory, ci: [...ci].sort(), local: [...local].sort(), syntax: [...syntax].sort(), classification },
  }
}
