import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import * as esbuild from 'esbuild'
import ts from 'typescript'

const hub = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const root = resolve(hub, '../..')
const core = join(root, 'packages/generation-capabilities')
const scope = join(root, '.tmp/3267-implementation')
const sources = ['package.json', 'src/assets.js', 'src/candidate.js', 'src/codes.js', 'src/index.js', 'src/parameters.js', 'src/units.js', 'types/index.d.ts']
const facades = ['src/catalog/contract/units.js', 'src/catalog/contract/submit-guard/codes.js', 'src/catalog/contract/submit-guard/slots.js']
const candidatePackScript = `const c = {operation:{id:'op',inputs:[]},parameters:{n:{type:'number',options:[5]}},constraints:{},knownOperationIds:['op'],currentEligibility:'eligible'}; const s = {assets:[],logicalParameters:{n:5},parameterSources:{n:{source:'explicit',value:5}},parameterAuthority:'resolved'}; const ready = core.evaluateCandidateRequest(c,s); if (ready.status!=='ready' || ready.effectiveParameters.n!==5) throw new Error('packed candidate positive'); const rejected = core.evaluateCandidateRequest({...c,constraints:{parameters:{n:{fixed:15}}}},s); if(rejected.status!=='rejected' || rejected.assignment!==undefined) throw new Error('packed candidate negative');`
const sha = (text) => createHash('sha256').update(text).digest('hex')
function digest(directory) {
  const hash = createHash('sha256')
  for (const file of sources) hash.update(file).update('\0').update(readFileSync(join(directory, file))).update('\0')
  return hash.digest('hex')
}
function temp(label) {
  mkdirSync(scope, { recursive: true })
  return mkdtempSync(join(scope, `${label}-`))
}
function run(command, args, cwd, success = true) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_cache: join(scope, 'npm-cache'), npm_config_update_notifier: 'false' }, maxBuffer: 16 * 1024 * 1024 })
  assert.ifError(result.error)
  if (success) assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}
// Deliberately narrower than lib.es*: no ambient browser/Node globals, clocks or evaluators.
const pureBuiltins = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Map', 'Set', 'TypeError', 'RangeError', 'Error', 'JSON', 'undefined', 'NaN', 'Infinity'])
function assertPure(text, file, importsAllowed = false) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' })
  walk(ast, (node) => {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
      assert.ok(importsAllowed && /^\.\/[a-z-]+\.js$/.test(node.source.value), `${file}: external or escaping import ${node.source.value}`)
    }
    assert.notEqual(node.type, 'ImportExpression', `${file}: dynamic import`)
    assert.notEqual(node.type, 'MetaProperty', `${file}: ambient meta property`)
    assert.notEqual(node.type, 'ThisExpression', `${file}: ambient this`)
    assert.notEqual(node.type, 'Super', `${file}: inherited capability`)
    if (node.type === 'MemberExpression') {
      assert.ok(!node.computed || node.property.type === 'Literal' || node.property.type === 'Identifier', `${file}: indirect computed capability`)
      const key = node.computed ? node.property.value : node.property.name
      assert.notEqual(key, 'constructor', `${file}: constructor escape`)
    }
    if (node.type === 'Property' && node.value.type !== 'Literal' && node.value.type !== 'FunctionExpression') {
      const key = node.computed ? node.key.value : (node.key.name ?? node.key.value)
      assert.notEqual(key, 'constructor', `${file}: constructor extraction`)
    }
  })

  // TypeScript owns binding, lexical scopes and reference resolution. The host contains
  // one virtual JS module only: no filesystem reads, imported modules, ambient libs or emit.
  const filename = '/purity-input.js'
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const host = {
    getSourceFile: (name) => name === filename ? source : undefined,
    getDefaultLibFileName: () => '', writeFile: () => { throw new Error('purity host cannot write') },
    getCurrentDirectory: () => '/', getDirectories: () => [],
    fileExists: (name) => name === filename, readFile: (name) => name === filename ? text : undefined,
    getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  }
  const program = ts.createProgram([filename], { allowJs: true, noLib: true, noResolve: true, noEmit: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, moduleDetection: ts.ModuleDetectionKind.Force }, host)
  const checker = program.getTypeChecker()
  function inspect(node) {
    if (ts.isElementAccessExpression(node)) {
      const key = checker.getTypeAtLocation(node.argumentExpression)
      assert.ok(!(key.flags & ts.TypeFlags.StringLiteral) || key.value !== 'constructor', `${file}: computed constructor escape`)
      const parent = node.parent
      assert.ok(!((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node) && !(ts.isTaggedTemplateExpression(parent) && parent.tag === node), `${file}: indirect computed invocation`)
    }
    if (ts.isIdentifier(node)) {
      const shorthand = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      const heritage = ts.isExpressionWithTypeArguments(node.parent) && node.parent.expression === node
      const reference = shorthand || ((heritage || ts.isExpressionNode(node)) && !ts.isDeclarationName(node) && !ts.isIdentifierName(node))
      if (reference) {
        const symbol = shorthand ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node)
        // JS expando assignments also create symbols; they are not lexical bindings.
        const local = symbol?.declarations?.some((declaration) => declaration.getSourceFile() === source && (
          ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration) || ts.isParameter(declaration) ||
          ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration) ||
          ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration) ||
          ts.isImportClause(declaration) || ts.isImportSpecifier(declaration) || ts.isNamespaceImport(declaration)
        ))
        assert.ok(local || pureBuiltins.has(node.text), `${file}: unbound runtime reference ${node.text}`)
      }
    }
    ts.forEachChild(node, inspect)
  }
  inspect(source)
  return ast
}

test('pure shared source and neutral/browser bundle have no runtime dependency or I/O escape', async () => {
  assert.equal(ts.version, '5.9.3')
  const pkg = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'))
  assert.equal(pkg.private, true)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.sideEffects, false)
  assert.deepEqual(pkg.dependencies ?? {}, {})
  assert.deepEqual(pkg.peerDependencies ?? {}, {})
  assert.deepEqual(readdirSync(join(core, 'src')).sort(), ['assets.js', 'candidate.js', 'codes.js', 'index.js', 'parameters.js', 'units.js'])
  for (const file of sources.filter((file) => file.endsWith('.js'))) assertPure(readFileSync(join(core, file), 'utf8'), file, true)
  for (const platform of ['neutral', 'browser']) {
    const result = await esbuild.build({ absWorkingDir: core, entryPoints: ['src/index.js'], bundle: true, platform, format: 'esm', write: false, metafile: true })
    assertPure(result.outputFiles[0].text, platform)
    for (const output of Object.values(result.metafile.outputs)) assert.deepEqual(output.imports, [])
  }
  const browser = await esbuild.build({ absWorkingDir: core, entryPoints: ['src/index.js'], bundle: true, platform: 'browser', format: 'iife', globalName: 'Core', write: false })
  const isolated = runInNewContext(`${browser.outputFiles[0].text}\nJSON.stringify(Core.validateAssetAgainstSlot({ type: 'image', sizeBytes: 1048577 }, { slot: 'image', type: 'image', maxSizeMb: 1 }))`, Object.create(null))
  assert.deepEqual(JSON.parse(isolated), {
    ok: false, rejection: { code: 'size_exceeded', message: 'sizeBytes 1048577 exceeds slot image maxSizeMb 1', slot: 'image', sizeBytes: 1048577, maxSizeMb: 1, maxSizeExclusive: false },
  })
  const artifact = readFileSync(join(hub, 'lib/generation-core.js'), 'utf8')
  assertPure(artifact, 'Hub bundled core')
  assert.ok(artifact.startsWith(`// Generated from @omnimux/generation-capabilities; source-sha256: ${digest(core)}\n`))
  const forbidden = [
    'self.location.href = "https://example.invalid"', 'location.href = "https://example.invalid"',
    'console.log("side effect")', 'setTimeout(() => {}, 1)', 'setInterval(() => {}, 1)',
    'clearTimeout(1)', 'clearInterval(1)', 'sendBeacon("https://example.invalid")',
    'unknownRuntimeCapability()', 'typeof unknownRuntimeCapability', 'unknownRuntimeCapability.value = 1',
    'unknownRuntimeCapability = 1', '({ location } = {})',
    'const object = { get self() { return self } }',
    'const object = { set self(value) { unknownRuntimeCapability(value) } }',
    'class Local extends unknownRuntimeCapability {}',
    'function local({ value = unknownRuntimeCapability }) { return value }',
    'function local({ [unknownRuntimeCapability]: value }) { return value }',
    'const object = { self() { return self } }',
    'try { throw 1 } catch (location) {} location',
    'for (const self of [1]) {} self',
    'const object = { self }', 'const object = { [location]: 1 }',
    'const object = { [unknownRuntimeCapability]() {} }',
    'function outer() { { const location = 1 } return () => location }',
    'function first(self) { return self } function second() { return self }',
    'const local = () => 1; local.constructor("return this")()',
    'const local = () => 1; local["constructor"]("return this")()',
    'const local = () => 1; const key = "constructor"; local[key]("return this")()',
    'const local = () => 1; local["con" + "structor"]("return this")()',
    'const local = () => 1; const key = ["constructor"][0]; local[key]("return this")()',
    'const { constructor: escape } = {}; escape("return this")()',
    'this.location', 'function local() { return this }', 'import.meta.url',
    'eval("side effect")', 'Function("return this")()',
    "import 'node:fs'", "import 'react'", "export * from '../../plugins/omnimux/src/index.js'",
    'fetch("x")', 'process.env.KEY', 'import("./units.js")',
    'Date.now()', 'new Date()', 'performance.now()', 'Math.random()',
    'const clock = Date; clock.now()', 'const clock = performance; clock.now()',
    'const { random } = Math; random()',
  ]
  for (const bad of forbidden) assert.throws(() => assertPure(bad, 'negative gate', true), undefined, bad)
  const allowed = [
    'const exact = BigInt(17); exact % 3n',
    'const self = 1, location = 2, console = 3, setTimeout = 4, sendBeacon = 5; [self, location, console, setTimeout, sendBeacon]',
    'const process = 1, window = 2, evalLocal = 3; [process, window, evalLocal]',
    'const object = { self: 1, location: 2, console() { return 3 }, process: 4, constructor: 5 }; object.self',
    'function outer({ self, location: alias }, [console], setTimeout = 1) { return () => ({ self, alias, console, setTimeout }) }',
    'function outer() { let self = 1; { const location = 2; self += location } return self }',
    'const key = "slot"; const object = { [key]: 1, [key + "Method"]() { return key } }; object[key]',
    'try { throw 1 } catch (location) { const self = location; (() => self)() }',
    'for (const self of [1]) { (() => self)() }',
    'import { value as location } from "./units.js"; import * as self from "./codes.js"; const object = { location, self }',
    'const object = Object.freeze([String(Number.isFinite(1)), Array.isArray([]), undefined, NaN, Infinity]); new TypeError("local")',
  ]
  for (const good of allowed) assert.doesNotThrow(() => assertPure(good, 'positive gate', true), good)
})

test('assignment consumers narrow concrete rejection payloads and reject invalid pending metadata', () => {
  const filename = join(core, 'assignment-type-consumer.ts')
  const text = `
    import { solveAssetAssignment, type AssignmentPending, type AssignmentRejection } from './types/index.js';
    const result = solveAssetAssignment({ inputs: [{ slot: 'ref', type: 'image', maxSizeMb: 1 }] }, [{ type: 'image', sizeBytes: 2000000 }]);
    if (result.status === 'rejected') for (const reason of result.rejections) {
      if (reason.code === 'size_exceeded') { const size: number = reason.maxSizeMb; void size; }
      if (reason.code === 'mime_unsupported') { const formats: readonly string[] = reason.allowedMimes; void formats; }
    }
    // @ts-expect-error metadata may not identify contract structure
    const invalidField: AssignmentPending = { code: 'metadata_unknown', message: 'x', slot: 'A', field: 'inputs' };
    // @ts-expect-error capacity is a hard rejection
    const invalidPending: AssignmentPending = { code: 'slot_capacity', message: 'x', slot: 'A', max: 0 };
    // @ts-expect-error invalid asset metadata must name a metadata field
    const invalidDiagnostic: AssignmentRejection = { code: 'operation_incompatible', message: 'x', slot: 'A', diagnostic: 'invalid_metadata', field: 'inputs' };
    void invalidField; void invalidPending; void invalidDiagnostic;
  `
  const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] }
  const host = ts.createCompilerHost(options)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  const source = ts.createSourceFile(filename, text, options.target, true)
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => file === filename ? source : originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile)
  host.writeFile = () => { throw new Error('type consumer cannot emit') }
  const program = ts.createProgram([filename], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.deepEqual(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})

test('parameter consumers narrow domain/default failures and strict JS agrees with public types', () => {
  const filename = join(core, 'parameter-type-consumer.ts')
  const text = `
    import { checkParameterMember, evaluateDeclaredParameters, type ParameterPolicy, type ParameterMemberResult } from './types/index.js';
    const member = checkParameterMember({ type: 'number', range: { min: .1, step: .1 } }, .3);
    if (member.status === 'indeterminate') { const reason: 'malformed_definition' | 'unresolved_options' | 'precision_unproven' = member.diagnostic; void reason; }
    const declared = evaluateDeclaredParameters({ n: 0 }, { n: { type: 'integer', defaultValue: 5 } });
    if (!declared.ok) { const source: 'request' | 'default' | 'definition' = declared.source; const field: string = declared.field; void source; void field; }
    // @ts-expect-error policy is not a string
    checkParameterMember({}, 1, 'canonical');
    // @ts-expect-error unknown policy keys are forbidden
    const policy: ParameterPolicy = { mode: 'canonical', extra: true };
    // @ts-expect-error malformed is diagnostic, not a nonmember reason
    const invalid: ParameterMemberResult = { status: 'nonmember', diagnostic: 'malformed_definition' };
    void policy; void invalid;
  `
  const options = { strict: true, noEmit: true, allowJs: true, checkJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] }
  const host = ts.createCompilerHost(options)
  const get = host.getSourceFile.bind(host)
  host.getSourceFile = (file, version, onError, fresh) => file === filename ? ts.createSourceFile(filename, text, options.target, true) : get(file, version, onError, fresh)
  host.writeFile = () => { throw new Error('parameter type check cannot emit') }
  const program = ts.createProgram([filename, join(core, 'src/parameters.js')], options, host)
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [])
})

test('candidate consumers forbid sensitive complete variables and strict source agrees without any', () => {
  const filename = join(core, 'candidate-type-consumer.ts')
  const text = `
    import { evaluateCandidateRequest, type Candidate, type CandidateSnapshot, type CandidateAsset, type CandidatePolicy, type CheckedAssignment } from './types/index.js';
    const base: Candidate = { operation: { id: 'op', inputs: [] }, parameters: {}, constraints: {}, knownOperationIds: ['op'], currentEligibility: 'eligible' };
    const snapshot: CandidateSnapshot<CandidateAsset> = { assets: [{ type: 'image' }], logicalParameters: {}, parameterSources: {}, parameterAuthority: 'resolved' };
    const result = evaluateCandidateRequest(base, snapshot, { maxStates: 100000 });
    if (result.status === 'ready') { const a: CheckedAssignment<CandidateAsset> = result.assignment; const original: CandidateAsset = a.bindings[0].asset; const value: string | boolean | number | null | undefined = result.effectiveParameters.x; void original; void value; }
    else {
      // @ts-expect-error failures expose no assignment
      const assignment: CheckedAssignment<CandidateAsset> = result.assignment;
      void assignment;
    }
    const providerVariable = { ...base, provider: 'private' };
    // @ts-expect-error sensitive property on a complete variable is forbidden
    const provider: Candidate = providerVariable;
    const profileVariable = { ...base, profile: 'private' };
    // @ts-expect-error sensitive property on a complete variable is forbidden
    const profile: Candidate = profileVariable;
    const endpointVariable = { ...base, endpoint: 'private' };
    // @ts-expect-error sensitive property on a complete variable is forbidden
    const endpoint: Candidate = endpointVariable;
    const costVariable = { ...base, purchaseCost: 1 };
    // @ts-expect-error sensitive property on a complete variable is forbidden
    const cost: Candidate = costVariable;
    // @ts-expect-error candidate assets require a media type
    const missingType: CandidateAsset = { role: 'reference' };
    // @ts-expect-error text is not classified media
    const textType: CandidateAsset = { type: 'text' };
    // @ts-expect-error request assets are readonly
    snapshot.assets.push({ type: 'image' });
    // @ts-expect-error logical values are readonly
    snapshot.logicalParameters.x = 1;
    // @ts-expect-error sources are readonly
    snapshot.parameterSources.x = { source: 'absent' };
    // @ts-expect-error policy has no strategy
    const policy: CandidatePolicy = { strategy: 'strict' };
    // @ts-expect-error eligibility is an exact enum
    const boolHint: Candidate = { ...base, currentEligibility: true };
    // @ts-expect-error authority is an exact enum
    const boolAuthority: CandidateSnapshot<CandidateAsset> = { ...snapshot, parameterAuthority: true };
    // @ts-expect-error explicit source requires its own value
    const incompleteSource: CandidateSnapshot<CandidateAsset> = { ...snapshot, parameterSources: { n: { source: 'explicit' } } };
    void provider; void profile; void endpoint; void cost; void missingType; void textType; void policy; void boolHint; void boolAuthority; void incompleteSource;
  `
  const options = { strict: true, noEmit: true, allowJs: true, checkJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] }
  const host = ts.createCompilerHost(options)
  const get = host.getSourceFile.bind(host)
  let consumer = text
  host.getSourceFile = (file, version, onError, fresh) => file === filename ? ts.createSourceFile(filename, consumer, options.target, true) : get(file, version, onError, fresh)
  host.writeFile = () => { throw new Error('candidate type check cannot emit') }
  const check = () => ts.getPreEmitDiagnostics(ts.createProgram([filename, join(core, 'src/candidate.js')], options, host))
  assert.deepEqual(check().map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [])
  consumer = text.replace("const providerVariable = { ...base, provider: 'private' };", 'const providerVariable = { ...base };')
  assert.ok(check().some(item => item.code === 2578), 'unused negative assertions must fail')
  const source = ts.createSourceFile('candidate.js', readFileSync(join(core, 'src/candidate.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.ok(!/\bany\b/.test(source.text), 'candidate source may not widen to any')
})

test('old facades share export identity and retain Map, original assets and valid legacy witnesses', async () => {
  const shared = await import(pathToFileURL(join(core, 'src/index.js')))
  const units = await import('./contract/units.js')
  const codes = await import('./contract/submit-guard/codes.js')
  const slots = await import('./contract/submit-guard/slots.js')
  const bundle = await import(pathToFileURL(join(hub, 'lib/generation-core.js')))
  assert.equal(units.mbToBytes, bundle.mbToBytes)
  assert.equal(codes.GUARD_CODES, bundle.GUARD_CODES)
  assert.equal(slots.validateAssetAgainstSlot, bundle.validateAssetAgainstSlot)
  assert.equal(slots.getSlotAliases, bundle.getSlotAliases)
  assert.deepEqual(codes.GUARD_CODES, shared.GUARD_CODES)
  assert.deepEqual(slots.SLOT_ALIASES, shared.SLOT_ALIASES)
  const asset = { type: 'audio', role: 'reference', targetSlot: 'audio', pathOrUrl: '/fixture.mp3', durationSec: 5 }
  const op = { inputs: [{ slot: 'audio', type: 'audio', role: 'reference', min: 1, max: 2, totalMinDurationSec: 5, totalMaxDurationSec: 5, combinedOutputMaxDurationSec: 10 }] }
  const result = slots.assignAndValidateSlots(op, [asset], { duration: 5 })
  assert.equal(result.ok, true)
  assert.ok(result.bySlot instanceof Map)
  assert.equal(result.bySlot.get('audio')[0], asset)
  assert.equal(result.bindings[0].asset, asset)
  assert.equal(slots.assignAndValidateSlots(op, [asset], { duration: 6 }).rejections[0].code, 'duration_exceeded')
  assert.equal(slots.assignAndValidateSlots({ inputs: [{ ...op.inputs[0], totalMaxExclusive: true }] }, [asset]).ok, false)
  assert.equal(slots.assignAndValidateSlots({ inputs: [{ ...op.inputs[0], totalMinExclusive: true }] }, [asset]).ok, false)
  assert.equal(slots.operationAcceptsAssets(op, []).ok, true)
  assert.equal(slots.operationAcceptsAssets(op, [], { requireMins: true }).ok, false)
  assert.equal(slots.assignAndValidateSlots({ inputs: [{ slot: 'legacy', type: 'image', max: 1 }] }, [{ type: 'image', role: 'reference', pathOrUrl: '/fixture.png' }]).ok, true)
  const greedy = { inputs: [{ slot: 'A', type: 'image', min: 1, max: 1, allowedMimes: ['image/png', 'image/jpeg'] }, { slot: 'B', type: 'image', min: 1, max: 1, allowedMimes: ['image/png'] }] }
  assert.equal(slots.assignAndValidateSlots(greedy, [{ type: 'image', mime: 'image/png' }, { type: 'image', mime: 'image/jpeg' }]).ok, true)
  for (const facade of facades.slice(0, 2)) {
    const ast = parse(readFileSync(join(hub, facade), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })
    assert.ok(ast.body.every((node) => node.type === 'ExportNamedDeclaration' && node.source && !node.declaration), facade)
  }
})

test('real Hub npm tarball relocates with only local low-level facades; missing artifact fails closed', () => {
  const dir = temp('packed')
  try {
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], hub).stdout)[0]
    assert.ok(packed.files.some((file) => file.path === 'lib/generation-core.js'))
    run('tar', ['-xzf', join(dir, packed.filename), '-C', dir], dir)
    const relocated = join(dir, 'package')
    // Close every runtime edge before execution; reject package, absolute and escaping imports.
    const seen = new Set()
    function closure(file) {
      if (seen.has(file)) return
      seen.add(file)
      assert.ok(relative(relocated, file) && !relative(relocated, file).startsWith('..'))
      const ast = parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })
      walk(ast, (node) => {
        assert.notEqual(node.type, 'ImportExpression')
        if (node.source && ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
          assert.ok(node.source.value.startsWith('.'), `nonlocal runtime edge: ${node.source.value}`)
          closure(resolve(dirname(file), node.source.value))
        }
      })
    }
    facades.forEach((file) => closure(join(relocated, file)))
    assert.equal(seen.size, 4)
    writeFileSync(join(dir, 'isolate.mjs'), `import { registerHooks } from 'node:module'; import { fileURLToPath } from 'node:url'; import { resolve, sep } from 'node:path'; const root = resolve(${JSON.stringify(relocated)}) + sep; registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); if (!r.url.startsWith('file:') || !fileURLToPath(r.url).startsWith(root)) throw new Error('outside packed closure: ' + specifier); return r; } });`)
    const script = `const core = await import('./lib/generation-core.js'); if (core.checkParameterMember({options:[5],range:{min:4,step:2}},5).status !== 'member' || core.checkParameterMember({range:{min:.1,step:.1}},.31).status !== 'nonmember') throw new Error('packed parameter mismatch'); const units = await import('./src/catalog/contract/units.js'); const codes = await import('./src/catalog/contract/submit-guard/codes.js'); const slots = await import('./src/catalog/contract/submit-guard/slots.js'); const asset = { type:'image', role:'reference', targetSlot:'reference_image', pathOrUrl:'/fixture.png', sizeBytes:1048576 }; const r = slots.assignAndValidateSlots({ inputs:[{slot:'reference_images',type:'image',role:'reference',min:1,max:1,maxSizeMb:1}] }, [asset]); if (units.mbToBytes(1)!==1048576 || codes.GUARD_CODES.SIZE_EXCEEDED!=='size_exceeded' || !r.ok || !(r.bySlot instanceof Map) || r.bindings[0].asset!==asset) throw new Error('packed facade mismatch');`
    run(process.execPath, ['--import', join(dir, 'isolate.mjs'), '--input-type=module', '-e', script + candidatePackScript], relocated)
    rmSync(join(relocated, 'lib/generation-core.js'))
    for (const facade of facades) {
      const missing = run(process.execPath, ['--import', join(dir, 'isolate.mjs'), '--input-type=module', '-e', `await import('./${facade}')`], relocated, false)
      assert.notEqual(missing.status, 0)
      assert.match(missing.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('materialized Hub pnpm pack works without workspace sources or installed dependencies', () => {
  const packScope = scope
  mkdirSync(packScope, { recursive: true })
  const dir = mkdtempSync(join(packScope, 'materialized-'))
  try {
    const managed = join(dir, '.materialize-snapshots/plugins/omnimux')
    cpSync(hub, managed, {
      recursive: true,
      filter: (file) => !relative(hub, file).split('/').includes('node_modules') && !/\.(test|spec)\.js$/.test(file),
    })
    const manifestFile = join(managed, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    manifest.dependencies['dsh-ui-kit'] = 'file:../dsh-ui-kit'
    writeFileSync(join(managed, 'src/release-channel.json'), JSON.stringify({ channel: 'development' }) + '\n')
    for (const directory of [dir, join(dir, '.materialize-snapshots'), join(dir, '.materialize-snapshots/plugins'), managed]) {
      for (const absent of ['packages', 'node_modules', 'pnpm-workspace.yaml']) assert.equal(existsSync(join(directory, absent)), false)
    }
    const args = ['pnpm', '--config.ignore-scripts=true', 'pack', '--dry-run', '--json']
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: dir, npm_config_cache: join(dir, 'npm-cache'), npm_config_update_notifier: 'false' }
    const pack = () => spawnSync('corepack', args, { cwd: managed, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    // The old build-only edge must fail on the same managed source and real pack entry.
    const old = structuredClone(manifest)
    old.devDependencies['@omnimux/generation-capabilities'] = 'workspace:*'
    writeFileSync(manifestFile, JSON.stringify(old, null, 2) + '\n')
    const red = pack()
    assert.ifError(red.error)
    assert.equal(red.status, 1, `${red.stdout}\n${red.stderr}`)
    assert.equal(JSON.parse(red.stdout).error.code, 'ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL')
    assert.match(JSON.parse(red.stdout).error.message, /@omnimux\/generation-capabilities/)
    console.log(`materialized pnpm old manifest: exit ${red.status}, ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL`)
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
    const green = pack()
    assert.ifError(green.error)
    assert.equal(green.status, 0, `corepack ${args.join(' ')}\n${green.stdout}\n${green.stderr}`)
    const records = JSON.parse(green.stdout)
    const entries = Array.isArray(records) ? records.flatMap((record) => record.files) : records.files
    const files = new Set(entries.map((file) => typeof file === 'string' ? file : file.path))
    for (const file of ['lib/client.js', 'lib/generation-core.js', ...facades]) assert.ok(files.has(file), `pack omitted ${file}`)
    const seen = new Set()
    function closure(file) {
      if (seen.has(file)) return
      seen.add(file)
      assert.ok(files.has(relative(managed, file)), `unpacked closure file: ${file}`)
      const ast = parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })
      walk(ast, (node) => {
        assert.notEqual(node.type, 'ImportExpression')
        if (node.source && ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
          assert.ok(node.source.value.startsWith('.'), `nonlocal runtime edge: ${node.source.value}`)
          const target = resolve(dirname(file), node.source.value)
          assert.ok(relative(managed, target) && !relative(managed, target).startsWith('..'), `escaping runtime edge: ${node.source.value}`)
          closure(target)
        }
      })
    }
    facades.forEach((file) => closure(join(managed, file)))
    assert.equal(seen.size, 4)
    assert.equal(sha(readFileSync(join(managed, 'lib/generation-core.js'))), sha(readFileSync(join(hub, 'lib/generation-core.js'))))
    writeFileSync(join(dir, 'isolate.mjs'), `import { registerHooks } from 'node:module'; import { fileURLToPath } from 'node:url'; import { resolve, sep } from 'node:path'; const root = resolve(${JSON.stringify(managed)}) + sep; registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); if (!r.url.startsWith('file:') || !fileURLToPath(r.url).startsWith(root)) throw new Error('outside managed closure: ' + specifier); return r; } });`)
    run(process.execPath, ['--import', join(dir, 'isolate.mjs'), '--input-type=module', '-e', "const core = await import('./lib/generation-core.js'); " + candidatePackScript], managed)
    rmSync(join(managed, 'lib/generation-core.js'))
    const missing = run(process.execPath, ['--import', join(dir, 'isolate.mjs'), '--input-type=module', '-e', "await import('./lib/generation-core.js')"], managed, false)
    assert.notEqual(missing.status, 0); assert.match(missing.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/)
    console.log(`materialized pnpm current manifest: exit ${green.status}, ${files.size} files, ${seen.size} local closure files`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('actual build-client entry rebuilds changed source deterministically and refuses missing source', async () => {
  const dir = temp('build')
  try {
    const fixtureHub = join(dir, 'plugins/omnimux')
    const fixtureCore = join(dir, 'packages/generation-capabilities')
    mkdirSync(join(fixtureHub, 'scripts'), { recursive: true })
    cpSync(join(hub, 'scripts/build-client.mjs'), join(fixtureHub, 'scripts/build-client.mjs'))
    mkdirSync(join(fixtureHub, 'src/client'), { recursive: true })
    writeFileSync(join(fixtureHub, 'src/client/index.js'), "export { mbToBytes } from '../catalog/contract/units.js'\n")
    for (const facade of facades) {
      mkdirSync(dirname(join(fixtureHub, facade)), { recursive: true })
      cpSync(join(hub, facade), join(fixtureHub, facade))
    }
    cpSync(core, fixtureCore, { recursive: true })
    cpSync(join(hub, 'package.json'), join(fixtureHub, 'package.json'))
    // Resolution through this task's allowed parent dependency links is build-only.
    run(process.execPath, ['scripts/build-client.mjs'], fixtureHub)
    const artifact = join(fixtureHub, 'lib/generation-core.js')
    const first = readFileSync(artifact, 'utf8')
    assert.ok(first.startsWith(`// Generated from @omnimux/generation-capabilities; source-sha256: ${digest(fixtureCore)}\n`))
    const units = join(fixtureCore, 'src/units.js')
    writeFileSync(units, readFileSync(units, 'utf8').replace('1024 * 1024', '1024 * 1024 + 1'))
    run(process.execPath, ['scripts/build-client.mjs'], fixtureHub)
    const unitChanged = readFileSync(artifact, 'utf8')
    const unitLoaded = await import(`${pathToFileURL(artifact).href}?unit`)
    assert.equal(unitLoaded.mbToBytes(1), 1048577)
    const candidatePath = join(fixtureCore, 'src/candidate.js')
    const candidateText = readFileSync(candidatePath, 'utf8')
    assert.ok(candidateText.includes("issue('indeterminate', 'unknown_operation')"))
    writeFileSync(candidatePath, candidateText.replace("issue('indeterminate', 'unknown_operation')", "issue('indeterminate', 'malformed_input')"))
    run(process.execPath, ['scripts/build-client.mjs'], fixtureHub)
    const mutatedCandidate = await import(`${pathToFileURL(artifact).href}?candidate`)
    const mutated = mutatedCandidate.evaluateCandidateRequest({ operation: { id: 'op', inputs: [] }, parameters: {}, constraints: {}, knownOperationIds: [], currentEligibility: 'eligible' }, { assets: [], logicalParameters: {}, parameterSources: {}, parameterAuthority: 'resolved' })
    assert.ok(mutated.diagnostics.some(reason => reason.code === 'malformed_input'))
    assert.ok(!mutated.diagnostics.some(reason => reason.code === 'unknown_operation'))
    const changed = readFileSync(artifact, 'utf8')
    assert.notEqual(sha(changed), sha(unitChanged))
    assert.notEqual(sha(changed), sha(first))
    assert.ok(changed.startsWith(`// Generated from @omnimux/generation-capabilities; source-sha256: ${digest(fixtureCore)}\n`))
    const loaded = await import(`${pathToFileURL(artifact).href}?changed`)
    assert.equal(loaded.mbToBytes(1), 1048577)
    run(process.execPath, ['scripts/build-client.mjs'], fixtureHub)
    assert.equal(readFileSync(artifact, 'utf8'), changed)
    for (const missing of sources) {
      const path = join(fixtureCore, missing)
      const saved = readFileSync(path)
      rmSync(path)
      const failure = run(process.execPath, ['scripts/build-client.mjs'], fixtureHub, false)
      assert.notEqual(failure.status, 0)
      assert.equal(readFileSync(artifact, 'utf8'), changed)
      writeFileSync(path, saved)
    }
    assert.ok(existsSync(join(fixtureHub, 'lib/client.js')))
    assertPure(changed, 'fresh fixture bundle')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
