import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

export const roots = []
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
export const origin = 'http://127.0.0.1:45120'
export const ready = { origin, authPage: false, rootMounted: true, workbenchReady: true, connectionWarning: false, ready: true }
export const auth = { origin, authPage: true, rootMounted: false, workbenchReady: false, connectionWarning: false, ready: false }
export const loading = { origin, authPage: false, rootMounted: true, workbenchReady: false, connectionWarning: false, ready: false }
let taskId = 1000000 + process.pid * 1000

export function cleanup() {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
}

export function fakeTab(values = [ready], { url = `${origin}/`, error, onSend, goto } = {}) {
  const calls = []; const navigations = []
  let currentUrl = url
  const cdp = { readEvents: async () => ({ cursor: 0, events: [] }), send: async (method, params, options) => {
    calls.push({ method, params, options }); onSend?.(calls.length)
    if (error) throw error
    const value = values.shift() ?? { kind: 'response', status: 200, sameOrigin: true }
    if (value instanceof Error) throw value
    return { result: { value } }
  } }
  const tab = {
    tool: 'ego-browser', taskSpaceId: taskId++, id: 'ego-test', calls, navigations, url: async () => currentUrl,
    goto: async value => { navigations.push(value); currentUrl = await (goto ? goto(value) : `${origin}/`) },
    click: async () => {}, waitForElement: async () => {}, cdp,
    assertIdentity: async () => ({ taskSpaceId: tab.taskSpaceId, tabId: tab.id }),
  }
  return tab
}

export function vmTab({ body, mounted, workbench, fetch: fetchImpl, delayNavigationMs = 0, pageOrigin = origin, protocol = 'http:' }) {
  const tab = fakeTab()
  const assignments = []; const root = { childElementCount: mounted ? 1 : 0 }
  const context = {
    AbortController, URL, setTimeout, clearTimeout,
    location: { origin: pageOrigin, protocol, assign(value) {
      assignments.push(value); context.document.body.innerText = 'OmniMux'; root.childElementCount = 1
      context.__omnimuxWorkbench = { getSnapshot() {}, getUiContext() {}, open() {} }
    } },
    document: { body: { innerText: body }, getElementById: id => id === 'root' ? root : null, querySelectorAll: () => [] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), fetch: fetchImpl,
    __omnimuxWorkbench: workbench ? { getSnapshot() {}, getUiContext() {}, open() {} } : undefined,
  }
  tab.cdp.send = async (method, params, options) => {
    tab.calls.push({ method, params, options })
    if (delayNavigationMs && params.expression.includes('location.assign')) await new Promise(done => setTimeout(done, delayNavigationMs))
    return { result: { value: await vm.runInNewContext(params.expression, context) } }
  }
  return Object.assign(tab, { assignments, context })
}

export async function request(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-ego-qa-')); roots.push(root)
  const scripts = join(root, 'scripts'); mkdirSync(scripts)
  for (const file of ['ego-live-qa.mjs', 'ego-browser-page.mjs', 'ego-task-lock.mjs', 'live-browser-utils.mjs', 'live-page-preparation.mjs', 'live-qa-request.mjs', 'live-qa-validation.mjs', 'live-stage-probe.mjs', 'live-runtime-proof.mjs']) copyFileSync(join(process.cwd(), 'scripts', file), join(scripts, file))
  symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'))
  execFileSync('git', ['init', '-q'], { cwd: root }); writeFileSync(join(root, 'README'), 'fixture\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
  const runner = await import(pathToFileURL(join(scripts, 'ego-live-qa.mjs')).href)
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const value = {
    version: 1, root, runId: 'run-ego', commitSha: sha, target: 'dev', profile: 'omnimux-dev',
    url: `${origin}/`, stage: 'assets', targets: [], sidebarSelectors: [],
    evidenceDir: join(root, '.workbuddy/evidence/live-qa/run-ego'), reportPath: join(root, 'docs/evidence/live-qa-report.json'),
    createdAt: new Date(1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), consumedAt: null, ...overrides,
  }
  const path = join(root, 'request.json'); writeFileSync(path, `${JSON.stringify(value)}\n`)
  return { root, path, value, runner }
}
