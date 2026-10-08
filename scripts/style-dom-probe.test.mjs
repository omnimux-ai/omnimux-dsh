import assert from 'node:assert/strict'
import { spawnSync as realSpawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parse } from 'yaml'

const helperUrl = new URL('./test-fixtures/style-dom-probe.mjs', import.meta.url).href
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`
const calls = []
let outcome
let duringSpawn
const resultDom = '<html><head><title>RESULT:{&quot;width&quot;:321,&quot;label&quot;:&quot;A&amp;B&quot;}</title></head></html>'
globalThis.__styleProbeSpawn = (binary, args, options) => {
  const page = fileURLToPath(args.at(-1))
  const profileArg = args.find(arg => arg.startsWith('--user-data-dir='))
  const profile = profileArg?.slice('--user-data-dir='.length)
  calls.push({ binary, args, options, page, profile })
  assert.ok(existsSync(page), 'fixture must exist while the child runs')
  assert.match(readFileSync(page, 'utf8'), /document.title = 'RESULT:'/)
  duringSpawn?.()
  const controlled = outcome
  const child = realSpawnSync(process.execPath, ['--input-type=module', '-e',
    `process.stdout.write(${JSON.stringify(controlled.stdout)}); process.stderr.write(${JSON.stringify(controlled.stderr)}); process.exit(${controlled.status ?? 0})`], { encoding: 'utf8' })
  assert.equal(child.error, undefined)
  return { ...child, status: controlled.status, signal: controlled.signal, error: controlled.error }
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === helperUrl && specifier === 'node:child_process') {
      return { url: moduleUrl('export const spawnSync = (...args) => globalThis.__styleProbeSpawn(...args)'), shortCircuit: true }
    }
    if (context.parentURL === helperUrl && specifier === '../worktree-web-qa.mjs') {
      return { url: moduleUrl('export const findChromePath = () => "synthetic-chrome"'), shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { runStyleDomProbe } = await import(helperUrl)
const input = { name: 'diagnostics', styles: '.fixture { width: 321px }', html: '<div class="fixture">synthetic</div>', measure: () => ({ width: 321, label: 'A&B' }) }
const success = () => ({ status: 0, signal: null, stdout: resultDom, stderr: '' })
function reset(value = success()) { calls.length = 0; outcome = value; duringSpawn = undefined }
function assertClean() {
  for (const call of calls) assert.equal(existsSync(dirname(call.page)), false, 'only this call directory must be removed')
}
function receipt(value) {
  return { name: 'diagnostics', timeoutMs: 30000, status: value.status, signal: value.signal,
    stdoutTail: value.stdout.slice(-2048), stderrTail: value.stderr.slice(-2048), measurementPresent: /<title>RESULT:(.*?)<\/title>/s.test(value.stdout) }
}
function rejected() {
  let caught
  try { runStyleDomProbe(input) } catch (error) { caught = error }
  assert.ok(caught, 'failed browser must reject even when RESULT exists')
  assertClean()
  return caught
}

test('success keeps the original JSON and arguments with independent temporary profiles', () => {
  reset()
  assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
  assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
  for (const call of calls) {
    assert.equal(call.binary, 'synthetic-chrome')
    assert.equal(call.profile, join(dirname(call.page), 'profile'))
    assert.deepEqual(call.args, ['--headless=new', '--incognito', `--user-data-dir=${call.profile}`, '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--window-size=1600,800', '--virtual-time-budget=1500', '--dump-dom', `file://${call.page}`])
    assert.deepEqual(call.options, { encoding: 'utf8', timeout: 30000 })
  }
  assert.notEqual(calls[0].profile, calls[1].profile)
  assertClean()
})

test('overlapping calls own distinct profiles and do not remove the still-running fixture', () => {
  reset()
  duringSpawn = () => {
    duringSpawn = undefined
    const outer = calls[0]
    assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
    assert.ok(outer.profile, 'outer call needs an explicit profile')
    assert.notEqual(outer.profile, calls[1].profile)
    assert.ok(existsSync(outer.page), 'nested cleanup cannot remove the outer page')
  }
  assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
  assert.equal(calls.length, 2)
  assertClean()
})

for (const measurementPresent of [false, true]) {
  test(`spawn timeout retains original identity, cause and bounded diagnostic (RESULT=${measurementPresent})`, () => {
    const cause = new Error('synthetic cause')
    const original = Object.assign(new Error('spawn synthetic-chrome ETIMEDOUT', { cause }), { code: 'ETIMEDOUT' })
    const value = { error: original, status: null, signal: 'SIGTERM', stdout: 'x'.repeat(2600) + (measurementPresent ? resultDom : 'no measurement'), stderr: 'e'.repeat(2700) + 'synthetic timeout' }
    reset(value)
    const error = rejected()
    assert.equal(error, original)
    assert.equal(error.code, 'ETIMEDOUT')
    assert.equal(error.cause, cause)
    assert.match(error.message, /^spawn synthetic-chrome ETIMEDOUT/)
    assert.deepEqual(error.diagnostic, receipt(value))
    assert.ok(error.message.includes('synthetic timeout'), 'runner log must include the bounded receipt')
  })
}

test('nonzero exit rejects RESULT and preserves assertion code with complete diagnostic', () => {
  const value = { status: 7, signal: null, stdout: resultDom, stderr: 'synthetic exit failure' }
  reset(value)
  const error = rejected()
  assert.equal(error.code, 'ERR_ASSERTION')
  assert.equal(error.actual, 7)
  assert.equal(error.expected, 0)
  assert.match(error.message, /^synthetic exit failure/)
  assert.deepEqual(error.diagnostic, receipt(value))
})

test('missing DOM measurement rejects and retains bounded streams rather than a false success', () => {
  const value = { status: 0, signal: null, stdout: 'synthetic empty DOM', stderr: 'synthetic browser stderr' }
  reset(value)
  const error = rejected()
  assert.equal(error.code, 'ERR_ASSERTION')
  assert.match(error.message, /^页面未回传测量结果:/)
  assert.deepEqual(error.diagnostic, receipt(value))
})

test('invalid JSON still throws SyntaxError and cleans its own temporary directory', () => {
  reset({ status: 0, signal: null, stdout: '<title>RESULT:not-json</title>', stderr: '' })
  assert.ok(rejected() instanceof SyntaxError)
})

test('quality gate retains existing verdict and uploads only explicit failure receipt paths', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/quality-gate.yml', import.meta.url), 'utf8'))
  const job = workflow.jobs['static-and-tests']
  const regression = job.steps.find(step => step.name === 'Run regression tests')
  assert.ok(regression.run.split('\n').some(line => {
    const args = line.trim().split(/\s+/)
    return args[0] === 'node' && args[1] === '--test' && args.includes('scripts/style-dom-probe.test.mjs')
  }), 'the new public-helper regression must actually run in required CI')
  const workspace = job.steps.find(step => step.name === 'Plugin unit suites (all packages)')
  assert.equal(workspace.run, 'node scripts/run-workspace-tests.mjs --logs .tmp/ci-workspace-logs --json .tmp/ci-workspace-summary.json')
  assert.equal(workspace['continue-on-error'], undefined)
  const upload = job.steps.find(step => step.name === 'Upload QA evidence')
  assert.equal(upload.if, '${{ always() }}')
  assert.equal(upload.uses, 'actions/upload-artifact@v4')
  assert.deepEqual(upload.with, { name: 'qa-evidence', path: '.workbuddy/evidence/\n.tmp/ci-workspace-logs/\n.tmp/ci-workspace-summary.json\n', 'retention-days': 7, 'include-hidden-files': true })
  const verdict = job.steps.find(step => step.name === 'Evaluate CI verdict')
  assert.equal(verdict.if, '${{ always() }}')
  assert.equal(verdict.env.CI_STATUS, '${{ job.status }}')
  assert.match(verdict.run, /--ci-status "\$CI_STATUS"/)
  assert.deepEqual(workflow.on.merge_group.types, ['checks_requested'])
})

test.after(() => { hooks.deregister(); delete globalThis.__styleProbeSpawn })
