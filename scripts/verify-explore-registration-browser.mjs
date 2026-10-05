#!/usr/bin/env node
/**
 * Real-browser acceptance for the explore-menu runtime registration seam (Issue #3108).
 *
 * What it proves, against the REAL client source (no logic is copied or rewritten):
 * `plugins/omnimux/src/client/sidebar-coordinator.js` is bundled with esbuild into a
 * single ESM file, served from a throw-away static server on 127.0.0.1:0, loaded into a
 * headless Chrome page that carries a minimal official sidebar skeleton, and driven step
 * by step over CDP (`Runtime.evaluate` / `Input.dispatchMouseEvent` / `Page.captureScreenshot`).
 *
 * Journey: boot → menu has the 11 builtin items → register a runtime item → 12 items with
 * the new one last → a REAL mouse click opens the workbench tab → unregister → back to 11
 * → malformed input is rejected without throwing or changing the menu.
 *
 * Artifacts land in `docs/evidence/explore-registration-3108/`:
 *   - explore-registration-browser.png   (the registered item visible in the open menu)
 *   - explore-registration-browser.json  (runId, chrome version, per-assertion pass/actual)
 *
 * Exit code is non-zero when any assertion fails. Nothing is written when the browser
 * cannot be started or driven — a failed run must never leave a fabricated artifact.
 */

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

/** Worktree root, derived from this file — never a hardcoded checkout path. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const COORDINATOR_SOURCE = path.join(ROOT, 'plugins/omnimux/src/client/sidebar-coordinator.js')
const EVIDENCE_DIR = path.join(ROOT, 'docs/evidence/explore-registration-3108')
const PNG_PATH = path.join(EVIDENCE_DIR, 'explore-registration-browser.png')
const JSON_PATH = path.join(EVIDENCE_DIR, 'explore-registration-browser.json')

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CHROME_PATH = process.env.CHROME_PATH || DEFAULT_CHROME
const VIEWPORT = { width: 1280, height: 900 }

/** The runtime item under test — exactly the shape the seam documents. */
const REGISTERED_ITEM = {
  id: 'fast-news-workbench',
  label: '快讯中枢',
  iconSvg:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5h12v9H2z"/><path d="M4.5 6.5h7M4.5 9h4.5"/></svg>',
  tabId: 'fast-news-workbench',
}
const EXPECTED_OPENED = { tabId: 'fast-news-workbench', title: '快讯中枢' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message, actual) {
  const error = new Error(message)
  error.actual = actual
  return error
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  for (;;) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    if (Date.now() > deadline) {
      throw new Error(`等待超时 ${timeoutMs}ms · ${label}${lastError ? ` · ${lastError.message}` : ''}`)
    }
    await sleep(100)
  }
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { width: null, height: null }
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function normalize(value) {
  return JSON.stringify(value)
}

/** esbuild resolves from the worktree's node_modules; fall back to an explicit require. */
async function loadEsbuild() {
  try {
    return await import('esbuild')
  } catch {
    const require = createRequire(path.join(ROOT, 'package.json'))
    return require('esbuild')
  }
}

/** Minimal official sidebar skeleton plus the `window.__QA` step driver. */
function buildIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>探索菜单运行时注册接缝 · 浏览器验收</title>
<style>
  :root {
    --dsw-alias-bg-base: #ffffff;
    --dsw-alias-bg-layer-2: #ffffff;
    --dsw-alias-border-l1: rgba(0, 0, 0, 0.08);
    --dsw-alias-border-l2: rgba(0, 0, 0, 0.12);
    --dsw-alias-label-primary: #1b1b1f;
    --dsw-alias-label-secondary: #6b6b73;
    --dsw-alias-interactive-bg-hover: rgba(0, 0, 0, 0.05);
    --dsw-alias-interactive-bg-active: rgba(0, 0, 0, 0.08);
    --dsw-alias-bg-mask-1: rgba(15, 15, 20, 0.14);
    --dsw-font-s-14: 14px/20px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
    font: var(--dsw-font-s-14);
  }
  [data-omnimux-frame] { display: flex; flex-direction: column; height: 100%; }
  [data-slot="root"] { display: flex; flex: 1 1 auto; min-height: 0; }
  [data-pane="sidebar"] {
    flex: none; width: 240px; box-sizing: border-box;
    padding: 10px 8px; display: flex; flex-direction: column; gap: 2px;
    border-right: 1px solid var(--dsw-alias-border-l1);
    background: #fafafa;
  }
  [data-pane="sidebar"] .logoRow { padding: 0 4px 10px; }
  [data-pane="sidebar"] .logoRow .brand {
    border: 0; background: transparent; padding: 0; cursor: pointer;
    font: var(--dsw-font-s-14); font-weight: 600; color: inherit;
  }
  [data-pane="sidebar"] .newSession {
    display: block; width: 100%; height: 32px; box-sizing: border-box;
    padding: 0 8px; border: 0; border-radius: 8px; cursor: pointer;
    background: var(--dsw-alias-interactive-bg-hover);
    color: inherit; font: var(--dsw-font-s-14); text-align: left;
  }
  .pane { flex: 1 1 auto; padding: 24px 28px; }
  .pane-hint { margin: 0; color: var(--dsw-alias-label-secondary); }
</style>
</head>
<body>
<div data-omnimux-frame>
  <div data-slot="root">
    <aside data-pane="sidebar" class="sidebarCol">
      <div class="logoRow"><button type="button" class="brand">OmniMux</button></div>
      <button type="button" class="newSession" aria-label="新建会话">新建会话</button>
    </aside>
    <main class="pane">
      <p class="pane-hint">官方侧栏骨架 · 探索菜单运行时注册接缝（Issue #3108）真实浏览器验收</p>
    </main>
  </div>
</div>
<script type="module">
import * as mod from '/bundle.js'

window.__QA_ERRORS = []
window.addEventListener('error', (event) => window.__QA_ERRORS.push(String(event.message || event.error)))
window.addEventListener('unhandledrejection', (event) => window.__QA_ERRORS.push('unhandledrejection: ' + String(event.reason)))

const q = (selector) => document.querySelector(selector)
let lastUnregister = null

window.__QA = {
  module: mod,
  installSidebarGlobal: mod.installSidebarGlobal,
  builtinIds: () => mod.EXPLORE_MENU_ITEMS.map((item) => item.id),
  builtinCount: () => mod.EXPLORE_MENU_ITEMS.length,

  boot() {
    mod.installSidebarGlobal()
    window.__omnimuxSidebar.place()
    return Boolean(q('[data-omnimux-explore-entry]'))
  },
  place() {
    window.__omnimuxSidebar.place()
    return Boolean(q('[data-omnimux-explore-entry]'))
  },
  exploreEntryExists() {
    return Boolean(q('[data-omnimux-explore-entry]'))
  },

  openMenu() {
    const anchor = q('[data-omnimux-explore-entry]')
    if (!anchor) throw new Error('探索行未挂载')
    if (q('#omnimux-explore-menu')) mod.closeExploreMenu()
    anchor.click()
    return Boolean(q('#omnimux-explore-menu'))
  },

  register(item) {
    lastUnregister = window.__omnimuxSidebar.registerExploreItem(item)
    return typeof lastUnregister === 'function'
  },
  registerRaw(item) {
    try {
      const off = window.__omnimuxSidebar.registerExploreItem(item)
      return { threw: false, returnedFunction: typeof off === 'function' }
    } catch (error) {
      return { threw: true, returnedFunction: false, error: String((error && error.message) || error) }
    }
  },
  unregister() {
    if (typeof lastUnregister !== 'function') return false
    lastUnregister()
    lastUnregister = null
    return true
  },

  setWorkbenchStub() {
    window.__opened = undefined
    window.__omnimuxWorkbench = {
      open: (options) => {
        window.__opened = options
        return true
      },
    }
    return true
  },
  opened() {
    return window.__opened === undefined ? null : window.__opened
  },

  readMenu() {
    const menu = q('#omnimux-explore-menu')
    if (!menu) return { open: false, count: 0, ids: [], labels: [] }
    const items = Array.from(menu.querySelectorAll('[data-explore-id]'))
    const ids = items.map((el) => el.dataset.exploreId)
    const labels = items.map((el) => (el.querySelector('.omnimux-explore-menu-item-label')?.textContent ?? '').trim())
    const last = items[items.length - 1]
    return {
      open: true,
      count: items.length,
      ids,
      labels,
      lastId: last ? last.dataset.exploreId : null,
      lastLabel: last ? labels[labels.length - 1] : null,
      dividerCount: menu.querySelectorAll('.omnimux-explore-menu-divider').length,
      anchorExpanded: q('[data-omnimux-explore-entry]')?.getAttribute('aria-expanded') ?? null,
    }
  },

  menuItemRect(id) {
    const el = q('#omnimux-explore-menu [data-explore-id="' + id + '"]')
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  },

  /**
   * Skip the 120ms entrance animation so a screenshot is not captured mid-pop.
   * Standard Web Animations API on the test side; product CSS is untouched.
   */
  settleMenu() {
    const menu = q('#omnimux-explore-menu')
    if (!menu) return null
    if (typeof menu.getAnimations === 'function') {
      for (const animation of menu.getAnimations()) {
        try {
          animation.finish()
        } catch {
          /* already finished or not finishable */
        }
      }
    }
    const style = getComputedStyle(menu)
    return { opacity: style.opacity, transform: style.transform }
  },

  errors: () => window.__QA_ERRORS.slice(),
}
</script>
</body>
</html>`
}

/** Serve exactly index.html and the bundled ESM artifact. */
function startStaticServer(html, bundle) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (url.pathname === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(bundle)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, origin: `http://127.0.0.1:${address.port}` })
    })
  })
}

/** Launch headless Chrome and resolve once it reports its DevTools endpoint. */
async function launchChrome(profileDir) {
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ]
  const child = spawn(CHROME_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  let stdout = ''
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })

  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Chrome 未在 30s 内报告 DevTools 端点。stderr 尾部：${stderr.slice(-800)}`))
    }, 30_000)
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome 提前退出（code=${code}）。stderr 尾部：${stderr.slice(-800)}`))
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 Chrome：${error.message}`))
    })
  })

  return { child, endpoint, stderrTail: () => stderr.slice(-800), stdoutTail: () => stdout.slice(-800) }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws), { once: true })
    ws.addEventListener('error', () => reject(new Error(`CDP WebSocket 连接失败：${url}`)), { once: true })
  })
}

function createCdp(ws) {
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(`${message.error.message} (code ${message.error.code})`))
    else entry.resolve(message.result)
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify(payload))
      })
    },
  }
}

async function main() {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const report = {
    runId,
    issue: '3108',
    title: '探索菜单运行时注册接缝 · 真实浏览器验收',
    startedAt,
    root: ROOT,
    source: path.relative(ROOT, COORDINATOR_SOURCE),
    chrome: { path: CHROME_PATH, product: null, protocolVersion: null },
    page: { url: null, viewport: VIEWPORT },
    bundle: { bytes: null },
    assertions: [],
    steps: [],
    screenshot: null,
    diagnostics: {},
  }

  try {
    await fs.access(CHROME_PATH)
  } catch {
    throw new Error(`Chrome 不存在：${CHROME_PATH}（可用 CHROME_PATH 覆盖）。未写入任何证据文件。`)
  }

  const esbuild = await loadEsbuild()
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omnimux-explore-reg-'))
  const bundlePath = path.join(workDir, 'bundle.js')
  let server
  let chrome
  let ws
  let cdp
  let sessionId
  const captured = new Map()
  let requiredShot = null

  const evalIn = async (expression, { awaitPromise = true } = {}) => {
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue: true, userGesture: true },
      sessionId,
    )
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'unknown'
      throw new Error(`页面执行异常：${description}`)
    }
    return result.result?.value
  }

  const capture = async (label) => {
    const shot = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      sessionId,
    )
    const buffer = Buffer.from(shot.data, 'base64')
    const size = pngSize(buffer)
    captured.set(label, buffer)
    report.steps.push({ label, screenshot: { ...size, bytes: buffer.length } })
    return buffer
  }

  /** Real user click through the browser input pipeline (not a scripted `.click()`). */
  const realClick = async (rect) => {
    const base = { x: rect.x, y: rect.y, modifiers: 0 }
    await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', button: 'none' }, sessionId)
    await cdp.send(
      'Input.dispatchMouseEvent',
      { ...base, type: 'mousePressed', button: 'left', clickCount: 1 },
      sessionId,
    )
    await cdp.send(
      'Input.dispatchMouseEvent',
      { ...base, type: 'mouseReleased', button: 'left', clickCount: 1 },
      sessionId,
    )
    await sleep(120)
  }

  const assertions = report.assertions
  const assert = async (name, fn) => {
    try {
      const actual = await fn()
      assertions.push({ name, pass: true, actual: actual ?? null })
      console.log(`[PASS] ${name}`)
      console.log(`       actual: ${normalize(actual ?? null)}`)
    } catch (error) {
      const actual = error.actual ?? null
      assertions.push({ name, pass: false, actual, error: error.message })
      console.log(`[FAIL] ${name}`)
      console.log(`       error: ${error.message}`)
      if (actual !== null) console.log(`       actual: ${normalize(actual)}`)
    }
  }

  try {
    // ---- bundle the real source -------------------------------------------------
    await esbuild.build({
      entryPoints: [COORDINATOR_SOURCE],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'chrome120',
      outfile: bundlePath,
      legalComments: 'none',
      logLevel: 'silent',
    })
    const bundle = await fs.readFile(bundlePath, 'utf8')
    report.bundle = { bytes: Buffer.byteLength(bundle), outfile: path.basename(bundlePath) }

    // ---- static server on a random port ----------------------------------------
    const html = buildIndexHtml()
    const started = await startStaticServer(html, bundle)
    server = started.server
    report.page.url = `${started.origin}/index.html`

    // ---- headless chrome + CDP --------------------------------------------------
    const profileDir = path.join(workDir, 'chrome-profile')
    await fs.mkdir(profileDir, { recursive: true })
    chrome = await launchChrome(profileDir)
    ws = await connectWebSocket(chrome.endpoint)
    cdp = createCdp(ws)

    const version = await cdp.send('Browser.getVersion')
    report.chrome.product = version.product
    report.chrome.protocolVersion = version.protocolVersion
    report.chrome.jsVersion = version.jsVersion

    const created = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })
    sessionId = attached.sessionId

    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    )
    await cdp.send('Page.navigate', { url: report.page.url }, sessionId)
    await waitFor(
      async () =>
        await evalIn(
          `document.readyState === 'complete' && typeof window.__QA === 'object' && window.__QA !== null`,
        ),
      20_000,
      'index.html 与打包产物加载完成',
    )

    // ---- step 1: boot -----------------------------------------------------------
    await assert('boot：探索行已挂载（[data-omnimux-explore-entry] 存在）', async () => {
      const booted = await evalIn(`window.__QA.boot()`)
      await waitFor(async () => await evalIn(`window.__QA.exploreEntryExists()`), 8_000, '探索行出现')
      const exists = await evalIn(`window.__QA.exploreEntryExists()`)
      const actual = { bootReturned: booted, exploreEntryExists: exists }
      if (!exists) throw fail('boot 后 [data-omnimux-explore-entry] 不存在', actual)
      return actual
    })
    await capture('step-1-boot')

    // ---- step 2: builtin menu ---------------------------------------------------
    await assert('打开菜单：11 项，id 序列与内置白名单完全一致', async () => {
      const opened = await evalIn(`window.__QA.openMenu()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const builtinIds = await evalIn(`window.__QA.builtinIds()`)
      const builtinCount = await evalIn(`window.__QA.builtinCount()`)
      const actual = { opened, count: menu.count, ids: menu.ids, builtinIds, builtinCount }
      if (!opened || !menu.open) throw fail('菜单未展开', actual)
      if (builtinCount !== 11) throw fail(`内置白名单应为 11 项，实际 ${builtinCount}`, actual)
      if (menu.count !== 11) throw fail(`菜单项数应为 11，实际 ${menu.count}`, actual)
      if (!deepEqual(menu.ids, builtinIds)) throw fail('菜单 id 序列与内置白名单不一致', actual)
      return actual
    })
    await capture('step-2-builtin-menu')

    // ---- step 3: register -------------------------------------------------------
    await assert('注册运行时项：返回注销函数，且菜单展开时自动收起', async () => {
      const registered = await evalIn(`window.__QA.register(${JSON.stringify(REGISTERED_ITEM)})`)
      const afterRegister = await evalIn(`window.__QA.readMenu()`)
      const actual = { returnedFunction: registered, menuAfterRegister: afterRegister }
      if (!registered) throw fail('registerExploreItem 未返回函数', actual)
      if (afterRegister.open !== false) throw fail('注册时菜单已展开，应自动收起', actual)
      return actual
    })

    // ---- step 4: 12 items, new one last -----------------------------------------
    await assert("重新打开菜单：12 项，末项 data-explore-id='fast-news-workbench' 且文案为「快讯中枢」", async () => {
      const opened = await evalIn(`window.__QA.openMenu()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { opened, count: menu.count, lastId: menu.lastId, lastLabel: menu.lastLabel, ids: menu.ids }
      if (!opened || !menu.open) throw fail('注册后菜单未能展开', actual)
      if (menu.count !== 12) throw fail(`菜单项数应为 12，实际 ${menu.count}`, actual)
      if (menu.lastId !== 'fast-news-workbench') {
        throw fail(`末项 id 应为 fast-news-workbench，实际 ${menu.lastId}`, actual)
      }
      if (menu.lastLabel !== '快讯中枢') throw fail(`末项文案应为「快讯中枢」，实际「${menu.lastLabel}」`, actual)
      return actual
    })

    // ---- screenshot: the registered item visible in the open menu ---------------
    await assert('截图就绪：注册项完整落在视口内（功能专属证据，非首页冒烟）', async () => {
      // The menu pops in over 120ms; settle it so the capture is not a mid-animation frame.
      const settled = await evalIn(`window.__QA.settleMenu()`)
      await waitFor(async () => (await evalIn(`window.__QA.menuItemRect('fast-news-workbench')`)) !== null, 2_000, '菜单稳定')
      const rect = await evalIn(`window.__QA.menuItemRect('fast-news-workbench')`)
      const actual = { settled, rect }
      if (!rect) throw fail('注册项按钮不在菜单中', actual)
      if (settled && settled.opacity !== '1') throw fail(`菜单未稳定（opacity=${settled.opacity}）`, actual)
      if (rect.top < 0 || rect.bottom > rect.viewportHeight) {
        throw fail('注册项超出视口，截图无法作为证据', actual)
      }
      requiredShot = await capture('step-4-registered-menu')
      report.screenshot = {
        path: path.relative(ROOT, PNG_PATH),
        ...pngSize(requiredShot),
        bytes: requiredShot.length,
        capturedAtStep: 'step-4-registered-menu',
      }
      return { settled, rect, screenshot: report.screenshot }
    })

    // ---- step 5: real mouse click on the registered item ------------------------
    await assert('点击注册项（真实鼠标）：__opened 深等于 {tabId,title}，且菜单已关闭', async () => {
      await evalIn(`window.__QA.setWorkbenchStub()`)
      const rect = await evalIn(`window.__QA.menuItemRect('fast-news-workbench')`)
      if (!rect) throw fail('注册项按钮不在菜单中', { rect })
      await realClick(rect)
      await waitFor(async () => (await evalIn(`window.__QA.opened()`)) !== null, 4_000, '__opened 被写入')
      const opened = await evalIn(`window.__QA.opened()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { opened, expected: EXPECTED_OPENED, menuOpen: menu.open, menuCount: menu.count, clickRect: rect }
      if (!deepEqual(opened, EXPECTED_OPENED)) {
        throw fail(`__opened 应为 ${normalize(EXPECTED_OPENED)}，实际 ${normalize(opened)}`, actual)
      }
      if (menu.open !== false) throw fail('点击后菜单应已关闭', actual)
      return actual
    })
    await capture('step-5-after-click')

    // ---- step 6: unregister -----------------------------------------------------
    await assert('注销：菜单展开时自动收起，重新打开后回到 11 项且不含该项', async () => {
      const reopened = await evalIn(`window.__QA.openMenu()`)
      const beforeUnregister = await evalIn(`window.__QA.readMenu()`)
      const removed = await evalIn(`window.__QA.unregister()`)
      const afterUnregister = await evalIn(`window.__QA.readMenu()`)
      const reopenedAgain = await evalIn(`window.__QA.openMenu()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = {
        reopened,
        beforeUnregisterCount: beforeUnregister.count,
        removed,
        menuOpenAfterUnregister: afterUnregister.open,
        reopenedAgain,
        count: menu.count,
        ids: menu.ids,
      }
      if (beforeUnregister.count !== 12) throw fail(`注销前应为 12 项，实际 ${beforeUnregister.count}`, actual)
      if (!removed) throw fail('注销函数调用失败', actual)
      if (afterUnregister.open !== false) throw fail('注销时菜单已展开，应自动收起', actual)
      if (!reopenedAgain || !menu.open) throw fail('注销后菜单未能重新展开', actual)
      if (menu.count !== 11) throw fail(`注销后应为 11 项，实际 ${menu.count}`, actual)
      if (menu.ids.includes('fast-news-workbench')) throw fail('注销后菜单仍含 fast-news-workbench', actual)
      return actual
    })
    await capture('step-6-unregistered')

    // ---- step 7: malformed input ------------------------------------------------
    await assert('非法形状输入（null / {} / 缺 label / 缺 iconSvg / id 为空白）不抛错且不改变菜单项数', async () => {
      const invalidInputs = [
        { label: 'null', value: null },
        { label: '{}', value: {} },
        { label: '缺 label', value: { id: 'bad-no-label', iconSvg: '<svg viewBox="0 0 16 16"></svg>' } },
        { label: '缺 iconSvg', value: { id: 'bad-no-icon', label: '无图标' } },
        { label: 'id 为空白', value: { id: '   ', label: '空白 id', iconSvg: '<svg viewBox="0 0 16 16"></svg>' } },
        {
          label: 'label 为空白',
          value: { id: 'bad-blank-label', label: '   ', iconSvg: '<svg viewBox="0 0 16 16"></svg>' },
        },
        { label: '非对象（字符串）', value: 'not-an-item' },
      ]
      const results = []
      for (const input of invalidInputs) {
        const outcome = await evalIn(`window.__QA.registerRaw(${JSON.stringify(input.value)})`)
        results.push({ input: input.label, ...outcome })
      }
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { results, menuOpen: menu.open, count: menu.count, ids: menu.ids }
      const threw = results.filter((r) => r.threw)
      if (threw.length > 0) throw fail(`非法输入抛错：${normalize(threw)}`, actual)
      if (menu.open !== true) throw fail('非法输入不应收起菜单', actual)
      if (menu.count !== 11) throw fail(`非法输入后菜单项数应为 11，实际 ${menu.count}`, actual)
      return actual
    })

    // ---- step 8: builtin id conflict --------------------------------------------
    await assert('与内置 11 项 id 冲突时不注册（菜单仍 11 项）', async () => {
      const outcome = await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'apps', label: '冲突项', iconSvg: '<svg viewBox="0 0 16 16"></svg>' })})`,
      )
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { outcome, count: menu.count, ids: menu.ids, firstLabel: menu.labels[0] }
      if (outcome.threw) throw fail('冲突注册抛错', actual)
      if (menu.count !== 11) throw fail(`冲突注册后应仍为 11 项，实际 ${menu.count}`, actual)
      if (actual.firstLabel !== '应用') throw fail(`内置首项文案应仍为「应用」，实际「${actual.firstLabel}」`, actual)
      return actual
    })

    // ---- step 9: same-id re-registration overwrites -----------------------------
    await assert('同 id 二次注册覆盖（仍 12 项，末项为后一次注册的文案）', async () => {
      await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'dup-probe', label: '首次', iconSvg: '<svg viewBox="0 0 16 16"></svg>', tabId: 'dup' })})`,
      )
      await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'dup-probe', label: '二次', iconSvg: '<svg viewBox="0 0 16 16"></svg>', tabId: 'dup' })})`,
      )
      const opened = await evalIn(`window.__QA.openMenu()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { opened, count: menu.count, lastId: menu.lastId, lastLabel: menu.lastLabel, ids: menu.ids }
      if (menu.count !== 12) throw fail(`二次注册后应为 12 项，实际 ${menu.count}`, actual)
      if (menu.lastId !== 'dup-probe' || menu.lastLabel !== '二次') {
        throw fail('二次注册未覆盖同 id 条目', actual)
      }
      return actual
    })

    // ---- diagnostics ------------------------------------------------------------
    report.diagnostics = {
      pageErrors: await evalIn(`window.__QA.errors()`),
      registeredItem: REGISTERED_ITEM,
      expectedOpened: EXPECTED_OPENED,
      chromeStderrTail: chrome.stderrTail(),
    }
  } finally {
    // ---- teardown ---------------------------------------------------------------
    try {
      if (cdp) await cdp.send('Browser.close').catch(() => {})
    } catch {
      /* browser may already be gone */
    }
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    if (chrome?.child && chrome.child.exitCode === null) {
      chrome.child.kill('SIGTERM')
      const exited = await Promise.race([
        new Promise((resolve) => chrome.child.once('exit', () => resolve(true))),
        sleep(3_000).then(() => false),
      ])
      if (!exited) chrome.child.kill('SIGKILL')
    }
    if (server) await new Promise((resolve) => server.close(resolve))
    await fs.rm(workDir, { recursive: true, force: true })

    report.finishedAt = new Date().toISOString()
    report.passed = report.assertions.length > 0 && report.assertions.every((a) => a.pass)
    report.failed = report.assertions.filter((a) => !a.pass).map((a) => a.name)

    if (report.assertions.length > 0) {
      await fs.mkdir(EVIDENCE_DIR, { recursive: true })
      if (requiredShot) await fs.writeFile(PNG_PATH, requiredShot)
      await fs.writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`)
    }
  }

  return report
}

const report = await main()

console.log('')
console.log(`runId: ${report.runId}`)
console.log(`chrome: ${report.chrome.product} (${report.chrome.protocolVersion})`)
console.log(`bundle: ${report.bundle.bytes} bytes`)
console.log(`assertions: ${report.assertions.filter((a) => a.pass).length}/${report.assertions.length} passed`)
if (report.screenshot) {
  console.log(
    `screenshot: ${report.screenshot.path} ${report.screenshot.width}x${report.screenshot.height} ${report.screenshot.bytes} bytes`,
  )
}
console.log(`report: ${path.relative(ROOT, JSON_PATH)}`)
if (report.passed) {
  console.log('RESULT: PASS')
} else {
  console.log(`RESULT: FAIL · ${report.failed.join(' | ')}`)
  process.exitCode = 1
}
