import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectGovernance } from './governance-registry.mjs'

const workflow = command => ({ '.github/workflows/gate.yml': { jobs: { checks: { steps: [{ run: command }] } } } })
const registry = (ci, local, manual) => ({ version: 2, ciRequired: ci, localRequired: local, manual, deprecated: [] })

test('real CI module dependencies differ from local commands and manual tools', () => {
  const files = {
    'scripts/a.test.mjs': "import './lib/shared.mjs';",
    'scripts/lib/shared.mjs': 'export const value = 1;',
    'scripts/local.mjs': 'export const value = 2;',
    'scripts/manual.py': 'print(1)',
  }
  const result = inspectGovernance(registry(['a.test.mjs', 'lib/shared.mjs'], ['local.mjs'], ['manual.py']), files, { scripts: { local: 'node scripts/local.mjs' } }, workflow('node --test scripts/a.test.mjs'))
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.reachability.ci, ['scripts/a.test.mjs', 'scripts/lib/shared.mjs'])
  assert.deepEqual(result.reachability.local, ['scripts/local.mjs'])
})

test('syntax checking a file does not execute its import dependencies', () => {
  const files = { 'scripts/a.mjs': "import './lib/shared.mjs';", 'scripts/lib/shared.mjs': 'export const value = 1;' }
  const result = inspectGovernance(registry([], ['a.mjs'], ['lib/shared.mjs']), files, { scripts: {} }, workflow('node --check scripts/a.mjs'))
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.reachability.ci, [])
  assert.deepEqual(result.reachability.syntax, ['scripts/a.mjs'])
})

test('fixture strings and workflow comments cannot create imaginary execution edges', () => {
  const files = { 'scripts/a.mjs': "const fixture = 'import ./manual.mjs';", 'scripts/manual.mjs': 'export const value = 1;' }
  const result = inspectGovernance(registry(['a.mjs'], [], ['manual.mjs']), files, { scripts: {} }, workflow('node scripts/a.mjs\n# node scripts/manual.mjs'))
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.reachability.ci, ['scripts/a.mjs'])
})

test('ghost inventory and unsupported registry versions produce real diagnostics', () => {
  const wrong = inspectGovernance({ version: 1, ciRequired: [], localRequired: [], manual: [], deprecated: [] }, {}, { scripts: {} }, workflow(''))
  assert.equal(wrong.diagnostics.some(item => item.code === 'manifest-version'), true)
  const ghost = inspectGovernance(registry(['missing.mjs'], [], []), {}, { scripts: {} }, workflow(''))
  assert.equal(ghost.diagnostics.some(item => item.code === 'registry-ghost'), true)
  const missing = inspectGovernance(registry([], [], []), { 'scripts/real.test.mjs': 'export const value = 1;' }, { scripts: {} }, workflow(''))
  assert.equal(missing.diagnostics.some(item => item.code === 'inventory-unregistered'), true)
})

test('explicit runtime environments and dynamic directories cannot become verified roots', () => {
  const files = { 'scripts/a.mjs': 'export const value = 1;' }
  const dynamic = { '.github/workflows/gate.yml': { jobs: { checks: { steps: [{ run: 'node scripts/a.mjs', 'working-directory': '${{ matrix.dir }}/..' }] } } } }
  const result = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: {} }, dynamic)
  assert.deepEqual(result.reachability.ci, [])
  assert.equal(result.unknowns.some(item => item.code === 'workflow-cwd'), true)
  const environment = { '.github/workflows/gate.yml': { jobs: { checks: { env: { NODE_OPTIONS: '--import ./hook.mjs' }, steps: [{ run: 'node scripts/a.mjs' }] } } } }
  const controlled = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: {} }, environment)
  assert.deepEqual(controlled.reachability.ci, [])
  assert.equal(controlled.unknowns.some(item => item.code === 'workflow-runtime-environment'), true)
})

test('package manager builtins cannot be mistaken for equally named package scripts', () => {
  const files = { 'scripts/a.mjs': 'export const value = 1;' }
  const result = inspectGovernance(registry([], ['a.mjs'], []), files, { scripts: { list: 'node scripts/a.mjs' } }, workflow('pnpm list'))
  assert.deepEqual(result.reachability.ci, [])
  assert.deepEqual(result.reachability.local, ['scripts/a.mjs'])
  assert.equal(result.unknowns.some(item => item.code === 'package-builtin'), true)
})

test('unknown shell prefixes stop subsequent execution-root claims', () => {
  const files = { 'scripts/a.mjs': 'export const value = 1;' }
  for (const command of ['set -n\nnode scripts/a.mjs', '. ./setup.sh\nnode scripts/a.mjs', 'unknown-command\nnode scripts/a.mjs']) {
    const result = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: {} }, workflow(command))
    assert.deepEqual(result.reachability.ci, [], command)
    assert.equal(result.unknowns.length > 0, true)
  }
})

test('raw directory globs and unsupported package arguments cannot promote suffix roots', () => {
  const files = { 'scripts/a.mjs': 'export const value = 1;' }
  for (const directory of ['*/..', '[abc]/..', 'bad\\path/..']) {
    const input = { '.github/workflows/gate.yml': { jobs: { checks: { steps: [{ run: 'node scripts/a.mjs', 'working-directory': directory }] } } } }
    const result = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: {} }, input)
    assert.deepEqual(result.reachability.ci, [], directory)
    assert.equal(result.unknowns.some(item => item.code === 'workflow-cwd'), true)
  }
  const suffix = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: { guard: 'exit 1' } }, workflow('pnpm run guard extra && node scripts/a.mjs'))
  assert.deepEqual(suffix.reachability.ci, [])
  assert.equal(suffix.unknowns.some(item => item.code === 'package-script-arguments'), true)
})

test('YAML source locations refer to actual command lines rather than block headers', () => {
  const input = { '.github/workflows/gate.yml': 'jobs:\n  checks:\n    steps:\n      - run: |\n          node scripts/a.mjs\n' }
  const result = inspectGovernance(registry(['a.mjs'], [], []), { 'scripts/a.mjs': '' }, { scripts: {} }, input)
  const root = result.evidence.find(item => item.kind === 'root')
  assert.equal(root.line, 5)
})

test('shell invocation declarations cannot prove a mismatched interpreter target', () => {
  const files = { 'scripts/run.sh': 'node scripts/target.py', 'scripts/target.py': 'print(1)' }
  const manifest = { version: 2, ciRequired: ['run.sh'], localRequired: [], manual: ['target.py'], deprecated: [], invocations: [{ from: 'run.sh', to: 'target.py', kind: 'node', source: { line: 1, callee: 'node', argument: 0 }, reason: 'Synthetic literal command.' }] }
  const result = inspectGovernance(manifest, files, { scripts: {} }, workflow('bash scripts/run.sh'))
  assert.deepEqual(result.reachability.ci, ['scripts/run.sh'])
  assert.equal(result.diagnostics.some(item => item.code === 'invocation-source-mismatch'), true)
})

test('a literal fork call does not prove an unchanged process execution context', () => {
  const files = { 'scripts/router.mjs': "import {fork} from 'node:child_process';\nprocess['chdir']('elsewhere');fork('scripts/target.mjs');", 'scripts/target.mjs': 'export const value = 1;' }
  const manifest = { version: 2, ciRequired: ['router.mjs'], localRequired: [], manual: ['target.mjs'], deprecated: [], invocations: [{ from: 'router.mjs', to: 'target.mjs', kind: 'node', source: { line: 2, callee: 'fork', argument: 0 }, reason: 'Synthetic literal call.' }] }
  const result = inspectGovernance(manifest, files, { scripts: {} }, workflow('node scripts/router.mjs'))
  assert.deepEqual(result.reachability.ci, ['scripts/router.mjs'])
  assert.equal(result.unknowns.some(item => item.code === 'invocation-semantics-unproven'), true)
})

test('package expansion cycles fail instead of claiming complete reachability', () => {
  const result = inspectGovernance(registry([], [], []), {}, { scripts: { a: 'pnpm run b', b: 'pnpm run a' } }, workflow('pnpm run a'))
  assert.equal(result.diagnostics.some(item => item.code === 'package-script-cycle'), true)
})

test('complex working-directory changes stay unknown rather than becoming CI roots', () => {
  const files = { 'scripts/a.mjs': 'export const value = 1;' }
  const result = inspectGovernance(registry([], [], ['a.mjs']), files, { scripts: {} }, workflow('cd other\nnode scripts/a.mjs'))
  assert.deepEqual(result.reachability.ci, [])
  assert.equal(result.unknowns.some(item => item.code === 'shell-context-or-heredoc'), true)
})
