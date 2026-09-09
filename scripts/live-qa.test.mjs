import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveTarget, runLiveQa, verifyL2Runtime } from './live-qa.mjs'
import { captureStageContract, captureStageContracts, selectStages, STAGE_STATUS } from './live-stage-contracts.mjs'
import { assertStageState, readStageState, runStageProbe, PROBE_ASSERTIONS, STAGE_ASSERTIONS } from './live-stage-probe.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-live-qa-'))
  roots.push(root)
  symlinkSync(join(repo, 'plugins'), join(root, 'plugins'))
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'))
  execFileSync('git', ['init', '-q', root])
  writeFileSync(join(root, 'README'), 'QA fixture\n')
  execFileSync('git', ['add', 'README'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
  return root
}
function allocate(root, changes = {}) {
  const values = { TOPIC: 'qa', PLUGIN: 'omnimux', PORT: '44201', URL: 'http://127.0.0.1:44201',
    COMMIT: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    SOURCE: join(root, 'plugins'), PROFILE_DIR: join(root, 'omnimux-dev-qa'), ...changes }
  writeFileSync(join(root, '.l2-dev.env'), Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'))
}

test('Dev has a fixed 45120 default and rejects stale env ports, production and remote origins', () => {
  assert.deepEqual(resolveTarget({}, repo), { target: 'dev', profile: 'omnimux-dev', url: 'http://127.0.0.1:45120/' })
  for (const url of ['http://127.0.0.1:44200', 'http://127.0.0.1:44120', 'http://example.com:45120', 'http://127.0.0.1:45120/?token=secret']) {
    assert.throws(() => resolveTarget({ url }, repo))
  }
  assert.throws(() => resolveTarget({ target: 'prod' }, repo), /Unknown target/)
})

test('L2 must match its worktree URL, port, source and current code revision', () => {
  const root = fixture()
  const options = { target: 'l2', url: 'http://127.0.0.1:44201/' }
  assert.throws(() => resolveTarget({ target: 'l2' }, root), /requires --url/)
  assert.throws(() => resolveTarget(options, root), /ENOENT/)
  allocate(root)
  assert.equal(resolveTarget(options, root).profile, 'omnimux-dev-qa')
  for (const mismatch of [{ URL: 'http://127.0.0.1:44202' }, { PORT: '44202' }, { SOURCE: root }, { COMMIT: '0000000' }]) {
    allocate(root, mismatch)
    assert.throws(() => resolveTarget(options, root))
  }
  allocate(root, { PORT: '44200', URL: 'http://127.0.0.1:44200' })
  assert.throws(() => resolveTarget({ target: 'l2', url: 'http://127.0.0.1:44200' }, root), /production/)
})

test('reused L2 ports and changed plugin links cannot certify another worktree', () => {
  const root = fixture()
  allocate(root)
  const target = resolveTarget({ target: 'l2', url: 'http://127.0.0.1:44201' }, root)
  const dir = target.allocation.profileDir
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  writeFileSync(join(dir, 'port.txt'), '44201')
  writeFileSync(join(dir, 'host.pid'), '123')
  const linked = join(dir, 'node_modules/omnimux')
  symlinkSync(join(root, 'plugins/omnimux'), linked)
  const processInfo = (command, args) => command === 'lsof' ? 'p123\n' : args.at(-1) === 'command='
    ? 'node bin.js --profile omnimux-dev-qa --port 44201' : 'Sat Sep 5 12:00:00 2026'
  const runtime = verifyL2Runtime(target, processInfo)
  assert.equal(runtime.pid, '123')
  assert.throws(() => verifyL2Runtime(target, () => 'p456\n'), /not listening/)
  assert.throws(() => verifyL2Runtime(target, (command, args) => command === 'ps' && args.at(-1) === 'command='
    ? 'node bin.js --profile another-task' : processInfo(command, args)), /profile does not match/)
  rmSync(linked)
  symlinkSync(join(root, 'plugins/omnimux-assets'), linked)
  assert.throws(() => verifyL2Runtime(target, processInfo), /another worktree source/)
})

test('stage selection and actual runtime discovery reject empty or unknown targets', async () => {
  assert.throws(() => selectStages('typo'), /Unknown stage/)
  assert.throws(() => selectStages(''), /Unknown stage/)
  await assert.rejects(captureStageContracts(repo, []), /Zero stage/)
  const targets = await captureStageContracts(repo)
  assert.equal(targets.length, 9)
  assert.equal(targets.filter((target) => target.adapter === 'six-methods-and-disposer').length, 8)
  const forms = targets.find((target) => target.stage === 'forms')
  assert.equal(forms.selector, '[data-omnimux-forms-entry]')
  assert.equal(forms.tabId, 'omnimux-forms:tasks')
  assert.equal(targets.find((target) => target.stage === 'workflow').selector, '[data-dsh-omnimux-workflow-entry]')
  const market = targets.find((target) => target.stage === 'market')
  assert.equal(market.adapter, 'sidebar-coordinator')
  assert.equal(market.rank, 4.1)
  assert.equal(market.selector, '[data-omnimux-market-entry]')
  assert.equal(market.tabId, 'omnimux-market:plaza')
})

const target = { stage: 'assets', selector: '[data-omnimux-assets-entry]', tabId: 'omnimux-assets:library' }
const visible = { hasState: true, sessionId: 's1', contextSessionId: 's1', entryCount: 1, panelOpen: true, active: true,
  activeTab: target.tabId, selected: [target.selector], contentCount: 1, contentLength: 12, loadingOnly: false, visibleErrors: 0 }
test('homepage content cannot replace a visible, nonempty and uniquely selected target Tab', () => {
  assertStageState(visible, target, 's1')
  for (const bad of [{ contentCount: 0 }, { contentLength: 0 }, { loadingOnly: true }, { selected: [] },
    { selected: [target.selector, '[data-other-entry]'] }, { activeTab: 'wrong' }, { visibleErrors: 1 }, { contextSessionId: 's2' }]) {
    assert.throws(() => assertStageState({ ...visible, ...bad }, target, 's1'))
  }
})

test('positive-size content outside the viewport or covered by another panel is not visible', () => {
  const { JSDOM } = createRequire(join(repo, 'plugins/omnimux/package.json'))('jsdom')
  const dom = new JSDOM('<div id="root"><button data-omnimux-assets-entry data-active="true">Assets</button></div><main>Real assets</main><aside>Overlay</aside>', { runScripts: 'outside-only' })
  try {
    const win = dom.window
    const doc = win.document
    const content = doc.querySelector('main')
    const entry = doc.querySelector('button')
    win.HTMLElement.prototype.getAnimations = () => []
    Object.defineProperty(win.HTMLElement.prototype, 'innerText', { get() { return this.textContent } })
    const box = (x) => ({ x, y: 100, left: x, top: 100, right: x + 200, bottom: 300, width: 200, height: 200 })
    entry.getBoundingClientRect = () => box(0)
    content.getBoundingClientRect = () => box(300)
    doc.elementFromPoint = (x) => x < 200 ? entry : content
    const read = () => win.eval(`(${readStageState.toString()})(${JSON.stringify({ ...target, content: 'main' })}, ${JSON.stringify([target.selector])})`)
    assert.equal(read().contentCount, 1)
    content.getBoundingClientRect = () => box(2000)
    assert.equal(read().contentCount, 0)
    content.getBoundingClientRect = () => box(300)
    doc.elementFromPoint = () => doc.querySelector('aside')
    assert.equal(read().contentCount, 0)
    doc.elementFromPoint = () => content
    content.style.opacity = '0'
    assert.equal(read().contentCount, 0)
  } finally { dom.window.close() }
})

test('session drift aborts cleanup without modifying the newly active session', async () => {
  const { JSDOM } = createRequire(join(repo, 'plugins/omnimux/package.json'))('jsdom')
  const dom = new JSDOM('', { runScripts: 'outside-only' })
  const mutations = []
  let sessionId = 'qa-a'
  dom.window.__omnimuxWorkbench = {
    getSnapshot: () => ({ sessionId, state: { panelOpen: false } }),
    isActive: () => false,
    getUiContext: () => ({ sessionId, surface: { focus: 'chat', openedTabs: [] } }),
    waitForService: async () => ({ closeTab: (...args) => mutations.push(args) }),
    setFocus: (...args) => mutations.push(args),
  }
  try {
    await assert.rejects(runStageProbe({
      js: (source) => dom.window.eval(source),
      waitForElement() { sessionId = 'user-b'; throw new Error('session changed during wait') },
    }, { targets: [target], evidenceDir: '/unused' }), /Restoration is forbidden/)
    assert.deepEqual(mutations, [])
  } finally { dom.window.close() }
})

test('stage-specific loading and failure markers cannot pass as valid empty content', async () => {
  const market = await captureStageContract(repo, 'market')
  const require = createRequire(join(repo, 'plugins/omnimux/package.json'))
  const { JSDOM } = require('jsdom')
  const { build } = require('esbuild')
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const output = await build({ entryPoints: [join(repo, 'plugins/omnimux-analytics/src/client/components/EmptyState.jsx')],
    bundle: true, packages: 'external', platform: 'node', format: 'cjs', jsx: 'automatic', write: false })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output.outputFiles[0].text)(module, module.exports, (name) => name === 'dsh-ui-kit' ? {} : require(name))
  const { LoadingState, EmptyState } = module.exports
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' })
  try {
    const win = dom.window
    win.HTMLElement.prototype.getAnimations = () => []
    Object.defineProperty(win.HTMLElement.prototype, 'innerText', { get() { return this.textContent } })
    win.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 })
    const body = win.document.querySelector('main')
    const read = (status) => {
      win.document.elementFromPoint = () => body.lastElementChild || body
      return win.eval(`(${readStageState.toString()})(${JSON.stringify({ ...target, ...status, content: 'main' })}, [])`)
    }
    for (const text of ['正在加载数据看板…', 'Loading analytics…']) {
      body.innerHTML = renderToStaticMarkup(React.createElement(LoadingState, { t: () => text }))
      assert.equal(read(STAGE_STATUS.analytics).loadingOnly, true)
    }
    for (const code of ['fetch_failed', 'no_accounts', 'no_data']) {
      body.innerHTML = renderToStaticMarkup(React.createElement(EmptyState, { t: (key) => key, hint: { code } }))
      assert.equal(read(STAGE_STATUS.analytics).visibleErrors, code === 'fetch_failed' ? 1 : 0)
      assert.equal(Boolean(read(STAGE_STATUS.analytics).loadingOnly), false)
    }
    body.innerHTML = '<button>Add inspiration</button><div class="omnimux-inspiration-skeleton"></div>'
    assert.equal(read(STAGE_STATUS.inspiration).loadingOnly, true)
    body.innerHTML = '<div class="sh-mkt"><p class="sh-mkt-status">Loading plugins...</p></div>'
    assert.equal(read(market).loadingOnly, true)
    for (const text of market.allowedStatusTexts) {
      body.innerHTML = '<div class="sh-mkt"><p class="sh-mkt-status"></p></div>'
      body.querySelector('p').textContent = text
      assert.equal(Boolean(read(market).loadingOnly), false)
    }
    body.innerHTML = '<div class="sh-mkt"><div class="sh-mkt-results">50 plugins</div><article>Plugin</article></div>'
    body.querySelector('.sh-mkt-results').getBoundingClientRect = () => ({ left: 0, right: 400, top: -200, bottom: -100, width: 400, height: 100 })
    assert.equal(Boolean(read(market).loadingOnly), false)
  } finally { dom.window.close() }
})

test('verify:live creates one pending, SHA-bound ego-browser request and never reports PASS', async () => {
  const root = fixture()
  const report = await runLiveQa(['assets'], { root })
  assert.equal(report.status, 'pending', JSON.stringify(report.errors))
  assert.equal(report.pass, false)
  assert.ok(report.requestPath)
  const request = JSON.parse(readFileSync(report.requestPath, 'utf8'))
  assert.equal(request.runId, report.runId)
  assert.equal(request.commitSha, report.commitSha)
  assert.equal(request.url, report.url)
  assert.equal(request.consumedAt, null)
  assert.match(request.expiresAt, /T/)
})

test('CLI argument failures overwrite stale success and retain per-run failure evidence', async () => {
  const root = fixture()
  mkdirSync(join(root, 'docs/evidence'), { recursive: true })
  writeFileSync(join(root, 'docs/evidence/live-qa-report.json'), '{"pass":true,"runId":"old"}')
  for (const args of [[], ['typo'], ['assets', '--target=dev', '--url=http://127.0.0.1:44200'], ['assets', '--evidence-dir=../outside']]) {
    const report = await runLiveQa(args, { root })
    assert.equal(report.pass, false)
    assert.ok(report.errors.length)
    assert.notEqual(report.runId, 'old')
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'docs/evidence/live-qa-report.json'), 'utf8')), report)
    assert.deepEqual(JSON.parse(readFileSync(join(report.evidenceDir, 'live-qa-report.json'), 'utf8')), report)
  }
})

test('CLI rejects production in a sandbox without overwriting workspace evidence', () => {
  const root = fixture()
  const workspaceReport = join(repo, 'docs/evidence/live-qa-report.json')
  const before = existsSync(workspaceReport) ? readFileSync(workspaceReport) : null
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMNIMUX_')))
  Object.assign(env, { HOME: root, DSH_HOME: join(root, '.dsh'), XDG_CONFIG_HOME: join(root, '.config') })
  const cli = spawnSync(process.execPath, [join(repo, 'scripts/agent-live-qa.mjs'), 'assets', '--target=prod'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(cli.status, 1, cli.stderr)
  const report = JSON.parse(readFileSync(join(root, 'docs/evidence/live-qa-report.json'), 'utf8'))
  assert.equal(report.pass, false)
  assert.match(report.errors.join(';'), /Unknown target: prod/)
  assert.deepEqual(existsSync(workspaceReport) ? readFileSync(workspaceReport) : null, before)
})
