import assert from 'node:assert/strict'
import { spawnSync as realSpawnSync } from 'node:child_process'
import { existsSync, fstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { parse } from 'yaml'
import { parse as parseJavaScript } from 'acorn'

const helperUrl = new URL('./test-fixtures/style-dom-probe.mjs', import.meta.url).href
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`
const calls = []
let outcome
let duringSpawn
let lifecycle
const ownedStates = []
const egoEnvironment = ['OMNIMUX_STYLE_PROBE_TRANSPORT', 'OMNIMUX_EGO_SPACE_ID', 'OMNIMUX_EGO_PROBE_STATE_DIR', 'OMNIMUX_EGO_PROBE_EVIDENCE_DIR']
const initialEnvironment = Object.fromEntries(egoEnvironment.map(key => [key, process.env[key]]))
const resultDom = '<html><head><title>RESULT:{&quot;width&quot;:321,&quot;label&quot;:&quot;A&amp;B&quot;}</title></head></html>'
globalThis.__styleProbeSpawn = (binary, args, options) => {
  const ego = binary === 'ego-browser'
  const moduleFile = ego ? fileURLToPath(JSON.parse(/^await import\((.+)\)$/.exec(args[2])[1])) : null
  const script = ego ? readFileSync(moduleFile, 'utf8') : null
  const invocation = ego ? JSON.parse(/^const input = (.+)$/m.exec(script)[1]) : null
  const page = ego ? invocation.file : fileURLToPath(args.at(-1))
  const profileArg = args.find(arg => arg.startsWith('--user-data-dir='))
  const profile = profileArg?.slice('--user-data-dir='.length)
  calls.push({ binary, args, options, page, profile, invocation, script })
  assert.ok(existsSync(page), 'fixture must exist while the child runs')
  assert.match(readFileSync(page, 'utf8'), /document.title = 'RESULT:'/)
  if (options.stdio) {
    assert.equal(options.stdio[0], 'ignore')
    for (const fd of options.stdio.slice(1)) {
      assert.equal(typeof fd, 'number')
      const file = fstatSync(fd)
      assert.ok(file.isFile(), 'child output must target a real regular file')
      assert.equal(file.nlink, 1)
      assert.equal(file.size, 0)
    }
    assert.ok(existsSync(join(dirname(page), 'stdout')))
    assert.ok(existsSync(join(dirname(page), 'stderr')))
  }
  duringSpawn?.()
  const controlled = ego ? {
    ...outcome,
    stdout: outcome.egoStdout ?? '__OMNIMUX_STYLE_PROBE__' + JSON.stringify({
      token: invocation.token, name: invocation.name, spaceId: invocation.spaceId, pageLabel: 'p1', ownership: 'agent',
      targetId: 'fixture-target', afterTargetId: 'fixture-target', fixtureToken: invocation.token,
      title: 'RESULT:{"width":321,"label":"A&B"}', sourceTransport: 'file', pageNeutralized: true,
      ...outcome.egoReceipt,
    }) + '\n',
  } : outcome
  if (ego && outcome.egoUsesStderr) {
    controlled.stderr = controlled.stdout
    controlled.stdout = ''
  }
  const code = lifecycle === 'descendant'
    ? `import { spawn } from 'node:child_process'; import { writeSync } from 'node:fs'; const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 400)'], { stdio: ['ignore', 1, 2] }); child.unref(); writeSync(1, ${JSON.stringify(controlled.stdout)}); process.exit(0)`
    : lifecycle === 'direct-live'
      ? `import { writeSync } from 'node:fs'; writeSync(1, ${JSON.stringify(controlled.stdout)}); setTimeout(() => process.exit(0), 400)`
      : `process.stdout.write(${JSON.stringify(controlled.stdout)}); process.stderr.write(${JSON.stringify(controlled.stderr)}); process.exit(${controlled.status ?? 0})`
  const childOptions = Object.assign({}, options, lifecycle ? { timeout: 100 } : {})
  const child = realSpawnSync(process.execPath, ['--input-type=module', '-e', code], childOptions)
  calls.at(-1).child = child
  if (lifecycle) return child
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
function reset(value = success()) {
  calls.length = 0; outcome = value; duringSpawn = undefined; lifecycle = undefined
  for (const key of egoEnvironment) delete process.env[key]
}
function resetEgo(value = success()) {
  reset(value)
  const state = mkdtempSync(join(tmpdir(), 'omnimux-ego-probe-unit-'))
  ownedStates.push(state)
  process.env.OMNIMUX_STYLE_PROBE_TRANSPORT = 'ego'
  process.env.OMNIMUX_EGO_SPACE_ID = '107'
  process.env.OMNIMUX_EGO_PROBE_STATE_DIR = state
  return state
}
function assertClean() {
  for (const call of calls) {
    assert.equal(existsSync(dirname(call.page)), false, 'only this call directory must be removed')
    for (const fd of call.options.stdio?.slice(1) || []) {
      assert.throws(() => fstatSync(fd), { code: 'EBADF' }, 'output descriptors must be closed')
    }
  }
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
    assert.deepEqual(call.options, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', call.options.stdio[1], call.options.stdio[2]] })
    assert.equal(call.child.stdout, null, 'measurement comes from owned files, not returned pipe text')
    assert.equal(call.child.stderr, null)
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

test('direct exit returns measurement without waiting for bounded descendants to close inherited output', () => {
  reset()
  lifecycle = 'descendant'
  assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
  assert.equal(calls.length, 1, 'one invocation must not retry')
  assert.equal(calls[0].options.timeout, 30000, 'production timeout stays unchanged')
  assert.equal(calls[0].child.status, 0)
  assert.equal(calls[0].child.error, undefined)
  assertClean()
})

test('a directly live child times out even after writing valid measurement', () => {
  reset()
  lifecycle = 'direct-live'
  const error = rejected()
  assert.equal(error, calls[0].child.error)
  assert.equal(error.code, 'ETIMEDOUT')
  assert.equal(error.diagnostic.measurementPresent, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.timeout, 30000)
})

test('Ego opt-in reuses the explicit space and page through the CLI without a browser executable', () => {
  const state = resetEgo()
  assert.deepEqual(runStyleDomProbe({ ...input, viewportHeight: 600 }), { width: 321, label: 'A&B' })
  const call = calls[0]
  assert.equal(call.binary, 'ego-browser')
  assert.deepEqual(call.args.slice(0, 2), ['nodejs', '-e'])
  assert.match(call.args[2], /^await import\("file:\/\//)
  assert.equal(call.options.timeout, 30000)
  assert.equal(call.invocation.spaceId, 107)
  assert.equal(call.invocation.viewportHeight, 600)
  assert.equal(call.invocation.pageLabel, 'p1')
  assert.match(call.script, /taskSpace\(input.spaceId\)/)
  assert.doesNotMatch(call.script, /task\.finish|newPage|createBrowser|launch\(/)
  assert.doesNotThrow(() => parseJavaScript(call.script, { ecmaVersion: 'latest', sourceType: 'module' }), 'generated Ego module must parse before any real-browser run')
  assert.equal(existsSync(join(state, 'active.lock')), false)
  assert.equal(existsSync(join(state, 'blocked.json')), false)
  assertClean()
})

test('Ego requires valid explicit selection and never falls back to a browser', () => {
  for (const [key, value] of [['OMNIMUX_EGO_SPACE_ID', ''], ['OMNIMUX_EGO_SPACE_ID', '107x'], ['OMNIMUX_EGO_PROBE_STATE_DIR', '']]) {
    resetEgo()
    process.env[key] = value
    assert.throws(() => runStyleDomProbe(input), /Ego/)
    assert.equal(calls.length, 0)
  }
})

test('Ego accepts its single tagged module receipt on stderr without changing output limits', () => {
  resetEgo({ ...success(), egoUsesStderr: true })
  assert.deepEqual(runStyleDomProbe(input), { width: 321, label: 'A&B' })
  assertClean()
})

test('Ego failures latch the current run, keep diagnostics and prohibit further browser actions', () => {
  const failures = [
    { status: 9 }, { signal: 'SIGTERM' },
    { status: null, error: Object.assign(new Error('synthetic Ego missing'), { code: 'ENOENT' }) },
    { status: null, error: Object.assign(new Error('synthetic Ego timeout'), { code: 'ETIMEDOUT' }) },
    { egoReceipt: { spaceId: 999 } }, { egoReceipt: { pageLabel: 'p2' } },
    { egoReceipt: { ownership: 'user' } }, { egoReceipt: { afterTargetId: 'other' } },
    { egoReceipt: { fixtureToken: 'old-page' } }, { egoReceipt: { sourceTransport: 'other' } },
    { egoReceipt: { pageNeutralized: false } }, { egoStdout: '' },
    { egoStdout: '__OMNIMUX_STYLE_PROBE__not-json\n' },
    { egoReceipt: { title: 'RESULT:not-json' } },
  ]
  for (const override of failures) {
    const state = resetEgo({ ...success(), ...override })
    rejected()
    assert.equal(calls.length, 1)
    assert.equal(existsSync(join(state, 'active.lock')), false)
    assert.equal(existsSync(join(state, 'blocked.json')), true)
    assert.throws(() => runStyleDomProbe(input), /Ego.*blocked/)
    assert.equal(calls.length, 1, 'a blocked run must not invoke any browser transport')
  }
})

test('Ego rejects duplicate receipts, oversized output, pending async sentinels and concurrent ownership', () => {
  resetEgo()
  duringSpawn = () => { outcome.egoStdout = '__OMNIMUX_STYLE_PROBE__{}\n__OMNIMUX_STYLE_PROBE__{}\n' }
  rejected()
  resetEgo({ ...success(), egoStdout: 'x'.repeat(8 * 1024 * 1024 + 1) })
  rejected()
  resetEgo({ ...success(), egoReceipt: { title: 'RESULT:{"done":false,"phase":"async-not-finished"}' } })
  assert.throws(() => runStyleDomProbe({ ...input, waitForCompletion: true }), /completed/)
  assertClean()
  const state = resetEgo()
  writeFileSync(join(state, 'active.lock'), 'synthetic owner', { flag: 'wx' })
  assert.throws(() => runStyleDomProbe(input), /Ego/)
  assert.equal(calls.length, 0)
  assert.equal(readFileSync(join(state, 'active.lock'), 'utf8'), 'synthetic owner')
})

test('Ego cleanup rejects a replaced lock without deleting the replacement', () => {
  const state = resetEgo()
  duringSpawn = () => {
    rmSync(join(state, 'active.lock'))
    writeFileSync(join(state, 'active.lock'), 'replacement owner', { flag: 'wx' })
  }
  rejected()
  assert.equal(readFileSync(join(state, 'active.lock'), 'utf8'), 'replacement owner')
  assert.equal(existsSync(join(state, 'blocked.json')), true)
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

test.after(async () => {
  hooks.deregister()
  delete globalThis.__styleProbeSpawn
  for (const state of ownedStates) rmSync(state, { recursive: true })
  for (const [key, value] of Object.entries(initialEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await new Promise(resolve => setTimeout(resolve, 450))
})
