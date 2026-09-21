#!/usr/bin/env node
/**
 * Issue #2507 工作树浏览器验证：灵感社区分类下拉为「全部」+ gxgen 官方 18 行业。
 *
 * 隔离纪律与 scripts/verify-inspiration-dynamic-category.mjs 相同：动态端口、
 * 无头 Chrome、测完即焚。页面真实渲染 InspirationSection，本机 HTTP 扮演 Host。
 * 下拉不得依赖 /categories；未登录时仍为 全部+18 中文；筛选发官方 id。
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OFFICIAL_CATEGORIES } from '../plugins/omnimux-inspiration/src/gxgen-category-map.js'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')
const TMP_DIR = join(REPO_ROOT, 'tmp', 'verify-inspiration-gxgen-category-converge')
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence')
const SHOT_PATH = join(EVIDENCE_DIR, 'inspiration-gxgen-category-converge-verified.png')
const REPORT_PATH = join(EVIDENCE_DIR, 'inspiration-gxgen-category-converge-verify.json')

const OFFICIAL_ZH = OFFICIAL_CATEGORIES.map((row) => row.zh)
const EXPECTED_LABELS = ['全部', ...OFFICIAL_ZH]

const CLOUD_ITEMS = [
  { id: 'c1', type: 'video', title: 'cloud beauty item', category: 'beauty_skincare', source_platform: 'tiktok' },
  { id: 'c2', type: 'video', title: 'cloud home item', category: 'home_living', source_platform: 'tiktok' },
]
const LOCAL_ITEMS = [
  { id: 'l1', type: 'video', title: 'local item', category: '', source_platform: 'tiktok' },
]

const ENTRY_SOURCE = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationSection } from '../../plugins/omnimux-inspiration/src/client/InspirationSection.jsx'
import { zh } from '../../plugins/omnimux-inspiration/src/client/locales.js'

window.__omnimuxAuth = { ensureLogin() {} }
const t = (key) => zh[key] || key
createRoot(document.getElementById('root')).render(React.createElement(InspirationSection, { t, active: true }))
`

async function bundleEntry() {
  mkdirSync(TMP_DIR, { recursive: true })
  const entryPath = join(TMP_DIR, 'entry.jsx')
  writeFileSync(entryPath, ENTRY_SOURCE)
  const hubRequire = createRequire(join(REPO_ROOT, 'plugins/omnimux/package.json'))
  const { build } = hubRequire('esbuild')
  const shimEntry = join(REPO_ROOT, 'plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs')
  const result = await build({
    absWorkingDir: REPO_ROOT,
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    loader: {
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.css': 'empty',
      '.svg': 'text',
      '.png': 'empty',
    },
    plugins: [{
      name: 'ui-kit-shim',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
    outdir: 'dist',
    logLevel: 'silent',
  })
  const code = result.outputFiles?.[0]?.text
  assert.ok(code, 'esbuild 未产出验证页 bundle')
  return code
}

function harnessHtml(bundledJs) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Issue #2507 官方 18 行业分类下拉验证</title>
  <style>
    body { margin: 0; background: #111113; font-family: -apple-system, sans-serif; }
    #root { width: 100vw; min-height: 100vh; }
  </style>
</head>
<body>
  <script>
    window.__pageErrors = [];
    window.addEventListener('error', function (event) {
      window.__pageErrors.push(String(event.message || event.error || 'error'));
    });
    window.addEventListener('unhandledrejection', function (event) {
      window.__pageErrors.push(String(event.reason || 'unhandledrejection'));
    });
  </script>
  <div id="root"></div>
  <script>${bundledJs}</script>
</body>
</html>`
}

function startServer(html, options = {}) {
  const logCategories = options.logCategories || []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (url.pathname === '/omnimux/inspiration/categories') {
      logCategories.push(url.search)
      json(200, { data: [{ name: 'digital', count: 1178 }] })
      return
    }
    if (url.pathname === '/omnimux/inspiration/local') {
      if (Array.isArray(options.logLocal)) options.logLocal.push(url.search)
      json(200, { success: true, data: { items: LOCAL_ITEMS, total: LOCAL_ITEMS.length, platforms: [{ name: 'tiktok', count: 1 }] } })
      return
    }
    if (url.pathname === '/omnimux/inspiration') {
      if (Array.isArray(options.logCloud)) options.logCloud.push(url.search)
      if (options.cloudStatus === 401) {
        json(401, { error: 'needs-omnimux' })
        return
      }
      json(200, { success: true, data: { items: CLOUD_ITEMS, total: CLOUD_ITEMS.length } })
      return
    }
    json(404, { error: 'not found' })
  })
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer(server))
  })
}

async function launchChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
  ].filter(Boolean)
  const bin = candidates.find((candidate) => existsSync(candidate))
  assert.ok(bin, '未找到 Chrome / Chromium，可用 CHROME_PATH 指定')
  const proc = spawn(bin, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,800',
    'about:blank',
  ])
  const cdpPort = await new Promise((resolvePort, rejectPort) => {
    const timeout = setTimeout(() => rejectPort(new Error('启动无头 Chrome 超时')), 8000)
    proc.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (match) {
        clearTimeout(timeout)
        resolvePort(Number(match[1]))
      }
    })
    proc.on('error', (error) => {
      clearTimeout(timeout)
      rejectPort(error)
    })
  })
  return { proc, cdpPort }
}

async function connectCdp(cdpPort) {
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  assert.ok(page?.webSocketDebuggerUrl, '未找到 Chrome Page 调试目标')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let msgId = 0
  const send = (method, params = {}) => new Promise((resolveCdp, rejectCdp) => {
    const id = ++msgId
    const onMsg = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === id) {
        ws.removeEventListener('message', onMsg)
        if (message.error) rejectCdp(new Error(`CDP [${method}] 失败: ${JSON.stringify(message.error)}`))
        else resolveCdp(message.result || message)
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
  await new Promise((resolveWs, rejectWs) => {
    ws.addEventListener('open', resolveWs)
    ws.addEventListener('error', rejectWs)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) {
      throw new Error(`页面脚本执行失败: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`)
    }
    return result.result?.value
  }
  return { ws, send, evaluate }
}

async function waitFor(evaluate, expression, budgetMs = 6000) {
  const start = Date.now()
  for (;;) {
    const value = await evaluate(expression)
    if (value) return value
    if (Date.now() - start > budgetMs) return null
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
}

const CATEGORY_TRIGGER = '[aria-haspopup="listbox"][aria-label="商品分类"]'
const OPTION_QUERY = '[role="option"], [role="menuitem"]'

const PAGE_ERROR_HOOK = `(function() {
  if (window.__pageErrorHooked) return true;
  window.__pageErrorHooked = true;
  window.__pageErrors = window.__pageErrors || [];
  window.addEventListener('error', function (event) {
    window.__pageErrors.push(String(event.message || event.error || 'error'));
  });
  window.addEventListener('unhandledrejection', function (event) {
    window.__pageErrors.push(String(event.reason || 'unhandledrejection'));
  });
  return true;
})()`

async function navigateWithErrorHooks(send, url) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_ERROR_HOOK })
  await send('Page.navigate', { url })
}

async function openCategoryLabels(evaluate) {
  await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`)
  return waitFor(evaluate, `(function() {
    const options = [...document.querySelectorAll('${OPTION_QUERY}')].map((node) => node.textContent.trim());
    return options.length >= 19 ? options : null;
  })()`)
}

async function withBrowser(html, options, run) {
  const server = await startServer(html, options)
  const { proc, cdpPort } = await launchChrome()
  let client = null
  try {
    client = await connectCdp(cdpPort)
    await navigateWithErrorHooks(client.send, `http://127.0.0.1:${server.address().port}/`)
    await run(client)
  } finally {
    if (client) {
      try { client.ws.close() } catch {}
    }
    try { proc.kill('SIGTERM') } catch {}
    try { server.close() } catch {}
  }
}

async function scenarioOfficialOptions(bundledJs, report) {
  const logCategories = []
  await withBrowser(harnessHtml(bundledJs), { logCategories }, async ({ send, evaluate }) => {
    const mounted = await waitFor(evaluate, `(function() {
      const el = document.querySelector('${CATEGORY_TRIGGER}');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    })()`)
    assert.ok(mounted, '分类下拉触发器未渲染或尺寸为空')
    report.assertions.push({ name: 'category-trigger-mounted', pass: true, dimensions: mounted })

    const labels = await openCategoryLabels(evaluate)
    assert.ok(labels, '分类下拉未展开 19 项')
    assert.deepEqual(labels, EXPECTED_LABELS)
    assert.equal(labels[0], '全部')
    assert.equal(labels.includes('digital'), false)
    assert.equal(logCategories.length, 0, `下拉不得请求 /categories，实际: ${JSON.stringify(logCategories)}`)
    report.assertions.push({ name: 'official-18-industry-options', pass: true, options: labels })

    await evaluate(`document.querySelector('[role="menu"], [role="listbox"]')?.scrollIntoView({ block: 'center' })`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 400))
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    assert.ok(shot?.data, '截图数据为空')
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    writeFileSync(SHOT_PATH, Buffer.from(shot.data, 'base64'))
    report.assertions.push({ name: 'screenshot-saved', pass: true, path: SHOT_PATH })
  })
}

async function scenarioUnauthorizedStillOfficial(bundledJs, report) {
  await withBrowser(harnessHtml(bundledJs), { cloudStatus: 401 }, async ({ evaluate }) => {
    const mounted = await waitFor(evaluate, `Boolean(document.querySelector('${CATEGORY_TRIGGER}'))`)
    assert.ok(mounted, '未登录场景下分类下拉未渲染')
    const labels = await openCategoryLabels(evaluate)
    assert.deepEqual(labels, EXPECTED_LABELS)
    const pageErrors = await evaluate(`(window.__pageErrors || []).length`)
    assert.equal(pageErrors || 0, 0, '未登录时页面出现未捕获错误')
    report.assertions.push({ name: 'unauthorized-still-official-18', pass: true, options: labels })
  })
}

async function scenarioSendsOfficialIdThenLocalDropsCategory(bundledJs, report) {
  const logLocal = []
  const logCloud = []
  const logCategories = []
  await withBrowser(harnessHtml(bundledJs), { logLocal, logCloud, logCategories }, async ({ evaluate }) => {
    const mounted = await waitFor(evaluate, `Boolean(document.querySelector('${CATEGORY_TRIGGER}'))`)
    assert.ok(mounted, '筛选场景下分类下拉未渲染')
    const labels = await openCategoryLabels(evaluate)
    assert.deepEqual(labels, EXPECTED_LABELS)
    const clicked = await evaluate(`(function() {
      const node = [...document.querySelectorAll('${OPTION_QUERY}')].find((item) => item.textContent.trim() === '美妆护肤');
      if (!node) return false;
      node.click();
      return true;
    })()`)
    assert.ok(clicked, '未点到美妆护肤')

    const started = Date.now()
    let landed = false
    while (Date.now() - started < 5000) {
      landed = logCloud.some((search) => /(?:^|[?&])category=beauty_skincare(?:&|$)/.test(search))
      if (landed) break
      await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    assert.ok(landed, `选中美妆护肤后云端请求必须带 category=beauty_skincare。cloud: ${JSON.stringify(logCloud)}`)
    report.assertions.push({ name: 'filter-sends-official-id', pass: true, cloud: logCloud })

    const beforeSwitch = logLocal.length
    const localClicked = await evaluate(`(function() {
      const tabs = [...document.querySelectorAll('[role="tab"], [data-tab="local"]')];
      const local = tabs.find((node) => (node.getAttribute('data-tab') === 'local') || (node.textContent || '').trim() === '本地');
      if (!local) return false;
      local.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })()`)
    assert.ok(localClicked, '未找到「本地」tab')

    const localStarted = Date.now()
    let afterSwitch = []
    while (Date.now() - localStarted < 6000) {
      afterSwitch = logLocal.slice(beforeSwitch)
      if (afterSwitch.length > 0) break
      await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    assert.ok(afterSwitch.length > 0, `切到本地后本地查询切片为空。全量: ${JSON.stringify(logLocal)}`)
    const leaked = afterSwitch.filter((search) => /(?:^|[?&])category=/.test(search))
    assert.equal(leaked.length, 0, `切到本地后不得含 category=。切片: ${JSON.stringify(afterSwitch)}`)

    const localLabels = await openCategoryLabels(evaluate)
    assert.deepEqual(localLabels, EXPECTED_LABELS)
    assert.equal(logCategories.length, 0, `全程不得请求 /categories: ${JSON.stringify(logCategories)}`)
    const pageErrors = await evaluate(`(window.__pageErrors || []).length`)
    assert.equal(pageErrors || 0, 0, '切本地时页面出现未捕获错误')
    report.assertions.push({ name: 'local-tab-keeps-official-18-drops-category', pass: true, options: localLabels, localQueries: afterSwitch })
  })
}

const report = {
  task: 'inspiration-gxgen-category-converge',
  issue: 2507,
  startedAt: new Date().toISOString(),
  pass: false,
  assertions: [],
  errors: [],
}

try {
  const bundledJs = await bundleEntry()
  await scenarioOfficialOptions(bundledJs, report)
  await scenarioUnauthorizedStillOfficial(bundledJs, report)
  await scenarioSendsOfficialIdThenLocalDropsCategory(bundledJs, report)
  report.pass = true
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error))
} finally {
  report.completedAt = new Date().toISOString()
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  rmSync(TMP_DIR, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
process.exit(report.pass ? 0 : 1)
