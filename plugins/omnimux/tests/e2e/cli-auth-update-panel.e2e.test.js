/**
 * E2E / real-browser acceptance for Issue #3178: the settings panel's "本机 CLI"
 * tab must report each CLI's sign-in state and update state, and signing in must
 * converge the row on its own.
 *
 * The page under test is the REAL `plugins/omnimux/src/client/RuntimeModeSection.jsx`
 * bundled with esbuild — not a copy, not a re-implementation, not a jsdom render.
 * It is mounted in a real Chrome page and talks to a stub origin over real HTTP
 * that answers the contract routes from `specs/cli-auth-update.spec.md` §3 with
 * the same payloads the retained evidence run used
 * (`docs/evidence/cli-auth-update/`), so the two artifacts describe one behaviour.
 *
 * Three properties of `scripts/test-fixtures/style-dom-probe.mjs` shape this file:
 *
 * 1. It drives Chrome with `spawnSync`, which blocks this process's event loop for
 *    the whole browser run. An HTTP server living in this process could therefore
 *    never answer the page — the first request would stay pending, the probe's
 *    virtual clock would stay paused, and Chrome would never exit. The stub origin
 *    is started as a child process for that reason, and torn down in `finally`.
 * 2. It navigates to a `file://` page, while the panel's `api()` helper calls the
 *    global `fetch` with a relative path (`/omnimux/agents`). A `<base>` element
 *    installed before the bundle gives the document the stub origin as its base
 *    URL, so those relative requests resolve to it and make real round trips.
 *    Nothing is stubbed on the client: the request log the assertions read is the
 *    server's own.
 * 3. Its browser invocation is fixed at a 1500 ms virtual-time budget while the
 *    panel's sign-in poll ticks every 3 s. The page therefore compresses long
 *    timers before the bundle loads. The poll stays the panel's own interval and
 *    the follow-up request stays the panel's own; only the clock is squeezed to
 *    fit the probe window. Without it the poll cannot be observed at all.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const pluginDir = join(repoRoot, 'plugins/omnimux')

/* ---------------- stubbed contract payloads (spec §3) ---------------- */

const AGENTS = [
  {
    id: 'claude', name: 'Claude Code', installed: true,
    version: '2.1.223 (Claude Code)', models: ['claude-3-7-sonnet'],
    auth: { state: 'signed-out', method: 'command', loginSupported: true },
  },
  {
    id: 'codex', name: 'Codex CLI', installed: true,
    version: 'codex-cli 0.159.3', models: ['gpt-6-sol'],
    auth: { state: 'signed-in', method: 'command', loginSupported: true },
  },
  {
    id: 'qwen', name: 'Qwen Code', installed: true,
    version: '0.19.6', models: ['qwen-max'],
    auth: { state: 'signed-out', method: 'file', loginSupported: false },
  },
]

const UPDATES = {
  checkedAt: 1,
  updates: {
    claude: { state: 'available', current: '2.1.223 (Claude Code)', latest: '2.1.289', channel: 'npm', installShape: 'npm', supported: true },
    codex: { state: 'current', current: 'codex-cli 0.159.3', latest: '0.160.1', channel: 'npm', installShape: 'npm', supported: true },
    qwen: { state: 'unknown', current: '0.19.6', latest: '', channel: 'npm', installShape: 'unknown', supported: false },
  },
}

/* ---------------- bundle: the real component ---------------- */

/**
 * Mirrors the retained evidence harness entry: real `RuntimeModeSection`, real
 * `zh` dictionary, real `HUB_CSS`. The translator and the settings-seat scope are
 * host-supplied in production, so the harness supplies them here.
 */
function entrySource() {
  const section = join(pluginDir, 'src/client/RuntimeModeSection.jsx')
  const locales = join(pluginDir, 'src/client/locales.js')
  const styles = join(pluginDir, 'src/client/styles.js')
  return `
import { createRoot } from 'react-dom/client'
import { RuntimeModeSection } from ${JSON.stringify(section)}
import { zh } from ${JSON.stringify(locales)}
import { HUB_CSS } from ${JSON.stringify(styles)}

const consoleErrors = []
window.__consoleErrors = consoleErrors
const nativeError = console.error.bind(console)
console.error = (...args) => {
  consoleErrors.push(args.map((a) => (a && a.stack ? a.stack : String(a))).join(' '))
  nativeError(...args)
}
window.addEventListener('error', (e) => { consoleErrors.push('window.error: ' + (e.message || String(e.error))) })
window.addEventListener('unhandledrejection', (e) => { consoleErrors.push('unhandledrejection: ' + String(e.reason)) })

const style = document.createElement('style')
style.setAttribute('data-harness', 'hub-css')
style.textContent = HUB_CSS
document.head.appendChild(style)

function t(key, params) {
  let text = zh[key]
  if (typeof text !== 'string') text = key
  if (params && typeof params === 'object') {
    text = text.replace(/\\{(\\w+)\\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
  }
  return text
}

let scopeValue = {}
let snapshot = { status: 'ready', value: scopeValue, writable: true }
const listeners = new Set()
const scope = {
  getSnapshot: () => snapshot,
  subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
  set: async (field, next) => {
    scopeValue = { ...scopeValue, [field]: next }
    snapshot = { status: 'ready', value: scopeValue, writable: true }
    listeners.forEach((listener) => listener())
  },
}

createRoot(document.getElementById('root')).render(<RuntimeModeSection t={t} scope={scope} />)
`
}

/* ---------------- stub origin (separate process, real HTTP, port 0) ---------------- */

/**
 * The stub origin, generated into the run directory and started as a child
 * process — see note 1 in the file header. It serves the bundled component plus
 * the contract routes, records every request, and reports its ephemeral origin on
 * stdout. `GET /__requests` hands the log to the probe, so the counts the
 * assertions compare are the server's own.
 */
function stubServerSource() {
  return `import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const AGENTS = ${JSON.stringify(AGENTS, null, 2)}
const UPDATES = ${JSON.stringify(UPDATES, null, 2)}

let claudeSignedIn = false
const requests = []

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { ...CORS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    const method = req.method || 'GET'

    // The probe page is a file:// document, so every contract call is
    // cross-origin and the JSON POSTs are preflighted.
    if (method === 'OPTIONS') {
      res.writeHead(204, CORS)
      return res.end()
    }
    // Harness-control route: not part of the observed contract surface.
    if (path === '/__requests') return sendJson(res, 200, { requests })

    const body = method === 'POST' || method === 'PUT' ? await readBody(req) : ''
    requests.push({ method, path, body })

    if (path === '/omnimux/agents' && method === 'GET') {
      return sendJson(res, 200, {
        agents: AGENTS.map((agent) => (
          agent.id === 'claude' && claudeSignedIn
            ? { ...agent, auth: { ...agent.auth, state: 'signed-in' } }
            : agent
        )),
      })
    }
    if (path === '/omnimux/agents/updates' && method === 'GET') return sendJson(res, 200, UPDATES)
    if (path === '/omnimux/agents/login' && method === 'POST') {
      // Flip claude to signed-in so the panel's own poll converges on its next
      // tick, exactly as the real server does once the terminal sign-in finishes.
      claudeSignedIn = true
      return sendJson(res, 200, { ok: true, launched: true, mode: 'terminal' })
    }
    if (path === '/omnimux/agents/update' && method === 'POST') {
      return sendJson(res, 200, { ok: true, version: '2.1.289 (Claude Code)' })
    }
    if (path === '/omnimux/auth/status') return sendJson(res, 200, { logged_in: false })

    if (path === '/bundle.js' || path === '/bundle.css') {
      const file = path === '/bundle.js' ? 'entry.js' : 'entry.css'
      const type = path === '/bundle.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8'
      const buf = await readFile(join(dir, file))
      res.writeHead(200, { 'content-type': type, 'content-length': buf.length })
      return res.end(buf)
    }

    return sendJson(res, 404, { error: 'not-found', path })
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: String(error) })
    return res.end()
  }
})

server.listen(0, 'localhost', () => {
  console.log('OMNIMUX_STUB_ORIGIN=http://localhost:' + server.address().port)
})
`
}

function startStubServer(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dir, 'stub-server.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error(`stub origin did not start: ${out}`)), 15000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out += chunk
      const match = /OMNIMUX_STUB_ORIGIN=(\S+)/.exec(out)
      if (!match || settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        origin: match[1],
        close: () => new Promise((done) => {
          if (child.exitCode !== null || child.signalCode !== null) return done()
          child.once('exit', () => done())
          child.kill()
        }),
      })
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('error', fail)
    child.on('exit', (code) => fail(new Error(`stub origin exited with ${code}: ${out}`)))
  })
}

/* ---------------- the page the fixture renders ---------------- */

/**
 * Compresses long timers in the page only (see note 3 in the file header). Long
 * waits are shortened; short ones — React's scheduler, the probe's own polling —
 * are left alone.
 */
const TIMER_COMPRESSION = `
(function () {
  var THRESHOLD = 200;
  var COMPRESSED = 20;
  function compress(original) {
    return function (handler, delay) {
      var extra = Array.prototype.slice.call(arguments, 2);
      var value = typeof delay === 'number' ? delay : 0;
      return original.apply(window, [handler, value > THRESHOLD ? COMPRESSED : value].concat(extra));
    };
  }
  window.setTimeout = compress(window.setTimeout);
  window.setInterval = compress(window.setInterval);
})();
`

function probeHtml(origin) {
  return `<base href="${origin}/">
<link rel="stylesheet" href="/bundle.css">
<script>${TIMER_COMPRESSION}</script>
<div id="root"></div>
<script src="/bundle.js"></script>`
}

/* ---------------- probe: what the browser measures ---------------- */

/**
 * Runs inside the probe page (serialized by the fixture, so it must be
 * self-contained). It drives the real panel: waits for the three rows, snapshots
 * their tags/buttons/body text, clicks 登录 on the claude row, waits for the row
 * to converge, then reads the authoritative request counts from the stub origin.
 * The fixture reads the result back out of the page title.
 */
function measureProbe() {
  const encode = (value) => JSON.stringify(value)
    .replace(/[<>&\u00a0]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))

  const ROWS = ['Claude Code', 'Codex CLI', 'Qwen Code']
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const cards = () => Array.from(document.querySelectorAll('.omx-cli-card'))
  const rowFor = (name) => cards().find((card) => {
    const title = card.querySelector('.omx-cli-title-row')
    return !!title && title.textContent.includes(name)
  }) || null
  const tagsOf = (card) => Array.from(card.querySelectorAll('.omx-cli-tag')).map((el) => el.textContent.trim())
  const buttonsOf = (card) => Array.from(card.querySelectorAll('button')).map((el) => el.textContent.trim())
  const snapshot = (name) => {
    const card = rowFor(name)
    if (!card) return null
    return { tags: tagsOf(card), buttons: buttonsOf(card), text: card.innerText }
  }
  const loginButton = (name) => {
    const card = rowFor(name)
    if (!card) return null
    return Array.from(card.querySelectorAll('button')).find((el) => el.textContent.trim() === '登录') || null
  }
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (predicate()) return
      await sleep(8)
    }
    throw new Error(`probe timed out waiting for ${label}`)
  }

  const flow = (async () => {
    await waitFor(() => ROWS.every((name) => rowFor(name)), 'the three CLI rows to render')
    await waitFor(() => tagsOf(rowFor('Claude Code')).includes('有新版本'), 'the claude update tag')

    const before = {
      claude: snapshot('Claude Code'),
      codex: snapshot('Codex CLI'),
      qwen: snapshot('Qwen Code'),
      bodyText: document.body.innerText,
    }

    const button = loginButton('Claude Code')
    if (!button) throw new Error('the claude row renders no 登录 button to click')
    button.click()

    await waitFor(() => !loginButton('Claude Code'), 'the 登录 button to disappear once the sign-in poll converges')

    const after = { claude: snapshot('Claude Code'), bodyText: document.body.innerText }

    const log = await (await fetch('/__requests')).json()
    const all = (log && log.requests) || []
    let postIndex = -1
    const loginPostBodies = []
    all.forEach((entry, index) => {
      if (entry.method === 'POST' && entry.path === '/omnimux/agents/login') {
        if (postIndex === -1) postIndex = index
        loginPostBodies.push(entry.body)
      }
    })
    const followUpAgentGets = postIndex === -1 ? -1 : all.filter((entry, index) => (
      index > postIndex && entry.method === 'GET' && entry.path === '/omnimux/agents'
    )).length

    return {
      before,
      after,
      loginPostCount: loginPostBodies.length,
      loginPostBodies,
      followUpAgentGets,
      requestLog: all.map((entry) => `${entry.method} ${entry.path}`),
      consoleErrors: window.__consoleErrors || [],
    }
  })()

  return flow
    .then((payload) => { document.title = 'RESULT:' + encode(payload) })
    .catch((error) => {
      document.title = 'RESULT:' + encode({ probeError: String((error && error.message) || error) })
    })
}

/* ---------------- the test ---------------- */

describe('本机 CLI 登录态与版本更新面板（Issue #3178）', () => {
  it('真实浏览器里渲染三行 CLI，并在点击登录后收敛为已登录', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omnimux-cli-auth-update-'))
    let server = null
    try {
      await writeFile(join(dir, 'entry.jsx'), entrySource())
      await esbuild.build({
        absWorkingDir: dir,
        entryPoints: [join(dir, 'entry.jsx')],
        outdir: dir,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        jsx: 'automatic',
        // CSS Modules used by @deepseek-ai/dsh-client-ui-primitives / dsh-ui-kit.
        // katex's stylesheet pulls webfonts this panel never renders: drop them.
        loader: { '.css': 'local-css', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.eot': 'empty' },
        nodePaths: [join(repoRoot, 'node_modules'), join(pluginDir, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'silent',
      })

      await writeFile(join(dir, 'stub-server.mjs'), stubServerSource())
      server = await startStubServer(dir)
      const result = runStyleDomProbe({
        name: 'cli-auth-update-panel',
        styles: '',
        html: probeHtml(server.origin),
        measure: measureProbe,
      })

      if (result.probeError) assert.fail(`probe reported: ${result.probeError}`)
      const { claude, codex, qwen } = result.before || {}
      assert.ok(claude && codex && qwen, `all three CLI rows must render: ${JSON.stringify(result.before)}`)

      // 1. claude: signed out, update available, both actions offered.
      assert.ok(claude.tags.includes('未登录'), `claude must show 未登录: ${JSON.stringify(claude.tags)}`)
      assert.ok(claude.tags.includes('有新版本'), `claude must show 有新版本: ${JSON.stringify(claude.tags)}`)
      assert.ok(claude.buttons.includes('登录'), `claude must offer 登录: ${JSON.stringify(claude.buttons)}`)
      assert.ok(
        claude.buttons.includes('更新到 2.1.289'),
        `claude must offer 更新到 2.1.289: ${JSON.stringify(claude.buttons)}`,
      )

      // 2. codex: signed in and current — neither tag nor the sign-in button.
      assert.ok(codex.tags.includes('已安装'), `codex must show 已安装: ${JSON.stringify(codex.tags)}`)
      assert.ok(!codex.tags.includes('未登录'), `codex is signed in, no 未登录: ${JSON.stringify(codex.tags)}`)
      assert.ok(!codex.tags.includes('有新版本'), `codex is current, no 有新版本: ${JSON.stringify(codex.tags)}`)
      assert.ok(!codex.buttons.includes('登录'), `codex is signed in, no 登录: ${JSON.stringify(codex.buttons)}`)

      // 3. qwen: signed out with no sign-in entry — hint text, no button.
      assert.ok(qwen.tags.includes('未登录'), `qwen must show 未登录: ${JSON.stringify(qwen.tags)}`)
      assert.ok(
        qwen.text.includes('该 CLI 已不再提供账号登录入口'),
        `qwen must explain the missing sign-in entry: ${JSON.stringify(qwen.text)}`,
      )
      assert.ok(!qwen.buttons.includes('登录'), `qwen has no sign-in entry, so no 登录: ${JSON.stringify(qwen.buttons)}`)

      // 4. An unavailable version check must never render as "already latest".
      assert.ok(!result.before.bodyText.includes('已是最新'), '已是最新 must not appear anywhere in the panel')
      assert.ok(
        !result.after.bodyText.includes('已是最新'),
        '已是最新 must not appear anywhere after the sign-in round trip',
      )

      // 5. One sign-in POST, then the panel's own poll converges the row.
      assert.equal(
        result.loginPostCount,
        1,
        `clicking 登录 must issue exactly one POST /omnimux/agents/login: ${JSON.stringify(result.requestLog)}`,
      )
      assert.deepEqual(result.loginPostBodies, ['{"id":"claude"}'])
      assert.ok(
        result.followUpAgentGets >= 1,
        `the panel must poll GET /omnimux/agents after the sign-in POST: ${JSON.stringify(result.requestLog)}`,
      )
      assert.ok(
        !result.after.claude.tags.includes('未登录'),
        `claude must drop 未登录 once signed in: ${JSON.stringify(result.after.claude.tags)}`,
      )
      assert.ok(
        !result.after.claude.buttons.includes('登录'),
        `claude must drop the 登录 button once signed in: ${JSON.stringify(result.after.claude.buttons)}`,
      )
      // The notice lives on the panel, not inside the row.
      assert.ok(
        result.after.bodyText.includes('已打开终端，请在终端里完成登录'),
        `the panel must tell the user where to finish signing in: ${JSON.stringify(result.after.bodyText)}`,
      )
      assert.ok(result.after.claude.tags.includes('有新版本'), 'signing in must not clear the update tag')
      assert.deepEqual(result.consoleErrors, [], 'rendering the panel must not log console errors')
    } finally {
      if (server) await server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
