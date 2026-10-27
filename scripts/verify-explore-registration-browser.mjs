#!/usr/bin/env node
/**
 * Real-browser acceptance for the 「更多」menu runtime registration seam (Issue #3785).
 *
 * What it proves, against the REAL client source (no logic is copied or rewritten):
 * `plugins/omnimux/src/client/explore-more-menu.jsx` + `sidebar-coordinator.js` are
 * bundled with esbuild into a single ESM file, served from a throw-away static server on
 * 127.0.0.1:0, loaded into a headless Chrome page that renders the official
 * `sidebar.panellist.actions` menu content with a stand-in row primitive, and driven step
 * by step over CDP (`Runtime.evaluate` / `Input.dispatchMouseEvent` / `Page.captureScreenshot`).
 * 点击走真实鼠标事件（`mousePressed` / `mouseReleased`），不靠脚本 `.click()`。
 *
 * 自绘「探索」常驻行与浮动菜单已在 #3785 退役；本脚本的渲染面随之改为官方「更多」菜单，
 * 不再驱动 `#omnimux-explore-entry` / `#omnimux-explore-menu`。
 *
 * Journey: boot → menu has the 10 builtin items → register a runtime item → 11 items with
 * the new one last → a REAL mouse click on it opens the workbench tab and dismisses the
 * menu → unregister → back to 10 → malformed input and builtin-id conflicts are rejected
 * without throwing or changing the menu.
 *
 * Artifacts land in `docs/evidence/explore-registration-3124/`:
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
const MENU_SOURCE = path.join(ROOT, 'plugins/omnimux/src/client/explore-more-menu.jsx')
const COORDINATOR_SOURCE = path.join(ROOT, 'plugins/omnimux/src/client/sidebar-coordinator.js')
const EVIDENCE_DIR = path.join(ROOT, 'docs/evidence/explore-registration-3124')
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
  .pane { padding: 24px 28px; }
  .pane-hint { margin: 0 0 16px; color: var(--dsw-alias-label-secondary); }
  /* 官方 MenuItemButton 的替身行：同一份 icon / children / separatorBefore / onSelect 契约。 */
  .menu {
    width: 260px; box-sizing: border-box; padding: 5px;
    border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
    background: var(--dsw-alias-bg-layer-2);
    box-shadow: 0 10px 28px var(--dsw-alias-bg-mask-1);
  }
  .menu-row {
    display: flex; align-items: center; gap: 8px; width: 100%; height: 32px;
    box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: inherit; cursor: pointer;
    font: var(--dsw-font-s-14); text-align: left;
  }
  .menu-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
  .menu-row-icon {
    flex: none; display: inline-flex; width: 14px; height: 14px;
    align-items: center; justify-content: center;
  }
  .menu-row-icon svg { display: block; width: 14px; height: 14px; }
  /* 官方 .itemLabel 的度量：flex:1 + 单行省略。Alpha 标识必须在这条约束下仍可见。 */
  .menu-row-label {
    flex: 1; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .menu-separator { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l1); }
</style>
</head>
<body>
<main class="pane">
  <p class="pane-hint">官方「更多」菜单（sidebar.panellist.actions）· 运行时注册接缝真实浏览器验收</p>
  <div class="menu" id="root"></div>
</main>
<script type="module">
import * as mod from '/bundle.js'

// 注入生产真源样式：标识的可见性必须由 injectHubStyles() 产出的 CSS 证明，
// 不能靠本页自绘的等价规则自证。
mod.hubStyles.injectHubStyles()

// 未捕获错误计数：注册 / 注销 / 点击都不应让页面抛错。
window.__qaErrors = []
window.addEventListener('error', (event) => {
  window.__qaErrors.push(String((event && event.message) || event))
})
window.addEventListener('unhandledrejection', (event) => {
  window.__qaErrors.push(String((event && event.reason) || event))
})

const rowNodes = () => Array.from(document.querySelectorAll('[data-row-label]'))
let reactRoot = null
let lastUnregister = null
let dismissCount = 0

/**
 * 官方 MenuItemButton 的替身：只复用它的输入契约
 * （icon / children / separatorBefore / onSelect），不复制菜单逻辑 ——
 * 行内容、顺序与分组全部由被测模块产出。
 */
/**
 * 行内容的文案文本：非 Alpha 行是纯字符串，Alpha 行是「文案 + 标识」片段。
 * 与官方 .itemLabel 同一渲染面，因此这里按 DOM 文本读取而不是按 props 类型断言。
 */
function labelTextOf(children) {
  if (typeof children === 'string') return children
  const inner = children?.props?.children
  const nodes = Array.isArray(inner) ? inner : [inner]
  for (const node of nodes) {
    if (typeof node === 'string') return node
    if (typeof node?.props?.children === 'string') return node.props.children
  }
  return ''
}

function StubMenuItemButton(props) {
  const children = []
  if (props.separatorBefore) {
    children.push(mod.React.createElement('div', {
      key: 'separator', className: 'menu-separator', role: 'separator',
    }))
  }
  children.push(mod.React.createElement('button', {
    key: 'row',
    type: 'button',
    className: 'menu-row',
    'data-row-label': labelTextOf(props.children),
    'data-row-alpha': hasAlphaBadge(props.children) ? 'true' : 'false',
    onClick: props.onSelect,
  },
  mod.React.createElement('span', { key: 'icon', className: 'menu-row-icon' }, props.icon),
  mod.React.createElement('span', { key: 'label', className: 'menu-row-label' }, props.children)))
  return mod.React.createElement('div', { className: 'menu-row-wrap' }, children)
}

/** 行内容里是否带 Alpha 标识元素。 */
function hasAlphaBadge(children) {
  if (children === null || typeof children !== 'object') return false
  const inner = children.props?.children
  return (Array.isArray(inner) ? inner : [inner])
    .some((node) => {
      if (node?.props?.className === 'omnimux-explore-more-alpha') return true
      const nested = node?.props?.children
      return (Array.isArray(nested) ? nested : [nested])
        .some((child) => child?.props?.className === 'omnimux-explore-more-alpha')
    })
}

/** 重新挂载菜单内容：官方菜单每次展开重新挂载即读最新集合。 */
async function remount() {
  if (reactRoot) reactRoot.unmount()
  reactRoot = mod.ReactDOMClient.createRoot(document.getElementById('root'))
  const Content = mod.createExploreMoreMenuContent({ MenuItemButton: StubMenuItemButton })
  reactRoot.render(mod.React.createElement(Content, {
    onDismiss: () => { dismissCount += 1 },
  }))
  await new Promise((resolve) => setTimeout(resolve, 60))
  return rowNodes().length
}

/** coordinator 的运行时注册接缝（幂等安装）。 */
function registry() {
  mod.coordinator.installSidebarGlobal()
  return window.__omnimuxSidebar
}

function readMenu() {
  const list = rowNodes()
  const labels = list.map((el) => el.getAttribute('data-row-label'))
  return {
    count: list.length,
    labels,
    firstLabel: labels.length ? labels[0] : null,
    lastLabel: labels.length ? labels[labels.length - 1] : null,
    separatorCount: document.querySelectorAll('.menu-separator').length,
    alphaLabels: list.filter((el) => el.getAttribute('data-row-alpha') === 'true')
      .map((el) => el.getAttribute('data-row-label')),
    alphaBadgeCount: document.querySelectorAll('.omnimux-explore-more-alpha').length,
  }
}

window.__QA = {
  errors: () => window.__qaErrors.slice(),

  module: mod,
  builtinIds: () => mod.coordinator.EXPLORE_MENU_ITEMS.map((item) => item.id),
  builtinCount: () => mod.coordinator.EXPLORE_MENU_ITEMS.length,

  /** 首次挂载官方「更多」菜单内容，返回行数。 */
  boot() {
    return remount()
  },
  /** 重新挂载（模拟再次展开菜单），返回行数。 */
  rerender() {
    return remount()
  },
  readMenu,
  dismissed: () => dismissCount,

  register(item) {
    lastUnregister = registry().registerExploreItem(item)
    return typeof lastUnregister === 'function'
  },
  registerRaw(item) {
    try {
      const off = registry().registerExploreItem(item)
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

  /**
   * Alpha 标识在行内的实际几何：必须落在行矩形内、宽高非零，
   * 且不把行文案挤到不可见（文案矩形宽度 > 0）。
   */
  alphaBadgeGeometry(label) {
    const row = rowNodes().find((node) => node.getAttribute('data-row-label') === label)
    if (!row) return null
    const badge = row.querySelector('.omnimux-explore-more-alpha')
    const text = row.querySelector('.omnimux-explore-more-label-text')
    if (!badge) return null
    const rowRect = row.getBoundingClientRect()
    const badgeRect = badge.getBoundingClientRect()
    const textRect = text ? text.getBoundingClientRect() : null
    return {
      badge: { width: badgeRect.width, height: badgeRect.height, top: badgeRect.top, right: badgeRect.right },
      text: textRect ? { width: textRect.width, height: textRect.height } : null,
      row: { width: rowRect.width, height: rowRect.height, top: rowRect.top, right: rowRect.right },
      insideRow: badgeRect.top >= rowRect.top - 0.5 && badgeRect.right <= rowRect.right + 0.5,
      title: badge.getAttribute('title'),
    }
  },

  /** 行在视口中的位置：真实鼠标点击与截图就绪判定都用它。 */
  rowRect(label) {
    const el = rowNodes().find((node) => node.getAttribute('data-row-label') === label)
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
    issue: '3785',
    title: '官方「更多」菜单运行时注册接缝 · 真实浏览器验收',
    startedAt,
    root: ROOT,
    source: path.relative(ROOT, MENU_SOURCE),
    sources: [path.relative(ROOT, MENU_SOURCE), path.relative(ROOT, COORDINATOR_SOURCE)],
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
    // 入口同时导出被测菜单模块、coordinator 注册接缝、真实 hub 样式与 React：
    // 页面用同一份实例渲染，注册 / 注销与菜单读到的集合必然一致；
    // 样式走生产真源 injectHubStyles()，标识的可见性断言才不是自绘 CSS 自证。
    const entry = [
      "export * from './explore-more-menu.jsx'",
      "export * as coordinator from './sidebar-coordinator.js'",
      "export * as hubStyles from './styles.js'",
      "export * as React from 'react'",
      "export * as ReactDOMClient from 'react-dom/client'",
      '',
    ].join('\n')
    await esbuild.build({
      stdin: { contents: entry, resolveDir: path.dirname(MENU_SOURCE), loader: 'js' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'chrome120',
      jsx: 'automatic',
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
    await assert('boot：官方「更多」菜单渲染内置 10 项，文案与真源清单一致', async () => {
      const rendered = await evalIn(`window.__QA.boot()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const builtinCount = await evalIn(`window.__QA.builtinCount()`)
      const builtinLabels = await evalIn(`window.__QA.module.coordinator.EXPLORE_MENU_ITEMS.map((item) => item.label)`)
      const builtinIds = await evalIn(`window.__QA.builtinIds()`)
      const actual = {
        rendered, count: menu.count, labels: menu.labels,
        builtinCount, builtinLabels, builtinIds, separatorCount: menu.separatorCount,
      }
      if (builtinCount !== 10) throw fail(`内置白名单应为 10 项，实际 ${builtinCount}`, actual)
      if (menu.count !== 10) throw fail(`菜单行数应为 10，实际 ${menu.count}`, actual)
      if (!deepEqual(menu.labels, builtinLabels)) throw fail('行文案与真源清单不一致', actual)
      if (builtinIds.length !== 10) throw fail(`真源清单 id 应为 10 个，实际 ${builtinIds.length}`, actual)
      if (menu.separatorCount !== 2) throw fail(`分组分隔线应为 2 条，实际 ${menu.separatorCount}`, actual)
      return actual
    })
    await capture('step-1-boot')

    // ---- step 1b: Alpha 内测标识（Issue #3823） ---------------------------------
    await assert('Alpha 内测标识：只出现在 5 个 Alpha 项，文案与顺序不变', async () => {
      const menu = await evalIn(`window.__QA.readMenu()`)
      const expectedAlphaLabels = await evalIn(
        `window.__QA.module.coordinator.EXPLORE_MENU_ITEMS
          .filter((item) => window.__QA.module.coordinator.isAlphaEntry(item.entryId))
          .map((item) => item.label)`,
      )
      const actual = {
        alphaLabels: menu.alphaLabels,
        expectedAlphaLabels,
        alphaBadgeCount: menu.alphaBadgeCount,
        labels: menu.labels,
      }
      if (!deepEqual(menu.alphaLabels, expectedAlphaLabels)) {
        throw fail('带标识的行与 Alpha 真源名单不一致', actual)
      }
      if (menu.alphaBadgeCount !== expectedAlphaLabels.length) {
        throw fail(`标识元素数应为 ${expectedAlphaLabels.length}，实际 ${menu.alphaBadgeCount}`, actual)
      }
      if (expectedAlphaLabels.length !== 5) {
        throw fail(`Alpha 项应为 5 个，实际 ${expectedAlphaLabels.length}`, actual)
      }
      return actual
    })
    await capture('step-1b-alpha-badges')

    // ---- step 1c: 标识在真实布局里可见（不是只在 props 里存在） -----------------
    await assert('Alpha 标识在行内可见：落在行矩形内、宽高非零、文案未被挤没', async () => {
      const label = '自动化'
      const geometry = await evalIn(`window.__QA.alphaBadgeGeometry(${JSON.stringify(label)})`)
      const actual = geometry
      if (!geometry) throw fail(`未找到「${label}」行的 Alpha 标识`, actual)
      if (!(geometry.badge.width > 0) || !(geometry.badge.height > 0)) {
        throw fail('标识宽高必须非零（真实渲染，不是隐藏元素）', actual)
      }
      if (!geometry.insideRow) throw fail('标识必须完整落在行矩形内，不被裁掉', actual)
      if (!geometry.text || !(geometry.text.width > 0)) {
        throw fail('标识不得把行文案挤到零宽', actual)
      }
      if (geometry.title !== 'Alpha · 内测：开发阶段优先完善非 Alpha 功能；正式版不包含此功能。') {
        throw fail('标识必须承载完整内测说明', actual)
      }
      return actual
    })
    await capture('step-1c-alpha-badge-visible')

    // ---- step 2: register -------------------------------------------------------
    await assert('注册运行时项：返回注销函数', async () => {
      const registered = await evalIn(`window.__QA.register(${JSON.stringify(REGISTERED_ITEM)})`)
      const actual = { returnedFunction: registered }
      if (!registered) throw fail('registerExploreItem 未返回函数', actual)
      return actual
    })

    // ---- step 3: 11 rows, new one last ------------------------------------------
    await assert("重新挂载菜单：11 行，末项文案为「快讯中枢」", async () => {
      const rendered = await evalIn(`window.__QA.rerender()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { rendered, count: menu.count, lastLabel: menu.lastLabel, labels: menu.labels }
      if (menu.count !== 11) throw fail(`菜单行数应为 11，实际 ${menu.count}`, actual)
      if (menu.lastLabel !== '快讯中枢') throw fail(`末项文案应为「快讯中枢」，实际「${menu.lastLabel}」`, actual)
      return actual
    })

    // ---- screenshot: the registered item visible in the menu --------------------
    await assert('截图就绪：注册项完整落在视口内（功能专属证据，非首页冒烟）', async () => {
      await waitFor(async () => (await evalIn(`window.__QA.rowRect('快讯中枢')`)) !== null, 2_000, '菜单稳定')
      const rect = await evalIn(`window.__QA.rowRect('快讯中枢')`)
      const actual = { rect }
      if (!rect) throw fail('注册项不在菜单中', actual)
      if (rect.top < 0 || rect.bottom > rect.viewportHeight) {
        throw fail('注册项超出视口，截图无法作为证据', actual)
      }
      requiredShot = await capture('step-3-registered-menu')
      report.screenshot = {
        path: path.relative(ROOT, PNG_PATH),
        ...pngSize(requiredShot),
        bytes: requiredShot.length,
        capturedAtStep: 'step-3-registered-menu',
      }
      return { rect, screenshot: report.screenshot }
    })

    // ---- step 4: real mouse click on the registered item ------------------------
    await assert('点击注册项（真实鼠标）：先 onDismiss 关菜单，再打开 workbench tab', async () => {
      await evalIn(`window.__QA.setWorkbenchStub()`)
      const dismissedBefore = await evalIn(`window.__QA.dismissed()`)
      const rect = await evalIn(`window.__QA.rowRect('快讯中枢')`)
      if (!rect) throw fail('注册项不在菜单中', { rect })
      await realClick(rect)
      await waitFor(async () => (await evalIn(`window.__QA.opened()`)) !== null, 4_000, '__opened 被写入')
      const opened = await evalIn(`window.__QA.opened()`)
      const dismissedAfter = await evalIn(`window.__QA.dismissed()`)
      const pageErrors = await evalIn(`window.__QA.errors()`)
      const actual = {
        opened, expected: EXPECTED_OPENED, dismissedBefore, dismissedAfter, pageErrors, clickRect: rect,
      }
      if (!deepEqual(opened, EXPECTED_OPENED)) {
        throw fail(`__opened 应为 ${normalize(EXPECTED_OPENED)}，实际 ${normalize(opened)}`, actual)
      }
      if (dismissedAfter !== dismissedBefore + 1) throw fail('点击行必须先调用 onDismiss 关菜单', actual)
      if (pageErrors.length > 0) throw fail('点击行时页面抛出未捕获错误', actual)
      return actual
    })
    await capture('step-4-after-click')

    // ---- step 5: unregister -----------------------------------------------------
    await assert('注销：重新挂载后回到 10 行且不含该项', async () => {
      const removed = await evalIn(`window.__QA.unregister()`)
      const rendered = await evalIn(`window.__QA.rerender()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { removed, rendered, count: menu.count, labels: menu.labels }
      if (!removed) throw fail('注销函数调用失败', actual)
      if (menu.count !== 10) throw fail(`注销后应为 10 行，实际 ${menu.count}`, actual)
      if (menu.labels.includes('快讯中枢')) throw fail('注销后菜单仍含「快讯中枢」', actual)
      return actual
    })
    await capture('step-5-unregistered')

    // ---- step 6: malformed input ------------------------------------------------
    await assert('非法形状输入（null / {} / 缺 label / 缺 iconSvg / id 为空白）不抛错且不改变菜单行数', async () => {
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
      await evalIn(`window.__QA.rerender()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { results, count: menu.count, labels: menu.labels }
      const threw = results.filter((r) => r.threw)
      if (threw.length > 0) throw fail(`非法输入抛错：${normalize(threw)}`, actual)
      if (menu.count !== 10) throw fail(`非法输入后菜单行数应为 10，实际 ${menu.count}`, actual)
      return actual
    })

    // ---- step 7: builtin id conflict --------------------------------------------
    await assert('与内置 10 项 id 冲突时不注册（菜单仍 10 行，首项仍为「应用」）', async () => {
      const outcome = await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'apps', label: '冲突项', iconSvg: '<svg viewBox="0 0 16 16"></svg>' })})`,
      )
      await evalIn(`window.__QA.rerender()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { outcome, count: menu.count, firstLabel: menu.firstLabel, labels: menu.labels }
      if (outcome.threw) throw fail('冲突注册抛错', actual)
      if (menu.count !== 10) throw fail(`冲突注册后应仍为 10 行，实际 ${menu.count}`, actual)
      if (actual.firstLabel !== '应用') throw fail(`内置首项文案应仍为「应用」，实际「${actual.firstLabel}」`, actual)
      return actual
    })

    // ---- step 8: same-id re-registration overwrites -----------------------------
    await assert('同 id 二次注册覆盖（11 行，末项为后一次注册的文案）', async () => {
      await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'dup-probe', label: '首次', iconSvg: '<svg viewBox="0 0 16 16"></svg>', tabId: 'dup' })})`,
      )
      await evalIn(
        `window.__QA.registerRaw(${JSON.stringify({ id: 'dup-probe', label: '二次', iconSvg: '<svg viewBox="0 0 16 16"></svg>', tabId: 'dup' })})`,
      )
      const rendered = await evalIn(`window.__QA.rerender()`)
      const menu = await evalIn(`window.__QA.readMenu()`)
      const actual = { rendered, count: menu.count, lastLabel: menu.lastLabel, labels: menu.labels }
      if (menu.count !== 11) throw fail(`二次注册后应为 11 行，实际 ${menu.count}`, actual)
      if (menu.lastLabel !== '二次') throw fail('二次注册未覆盖同 id 条目', actual)
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
      // 头图取「注册项已出现在官方『更多』菜单里」那一帧：功能专属证据，非首页冒烟。
      const registeredShot = captured.get('step-3-registered-menu')
      if (registeredShot) {
        requiredShot = registeredShot
        report.screenshot = {
          path: path.relative(ROOT, PNG_PATH),
          ...pngSize(registeredShot),
          bytes: registeredShot.length,
          capturedAtStep: 'step-3-registered-menu',
        }
      }
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
