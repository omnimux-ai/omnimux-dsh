#!/usr/bin/env node
/**
 * Issue #2511 工作树浏览器验证：全部 Tab 选具体行业后只展示该类云端素材。
 *
 * 隔离纪律与 scripts/verify-inspiration-gxgen-category-converge.mjs 相同：
 * 动态端口、无头 Chrome、测完即焚。页面真实渲染 InspirationSection。
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')
const TMP_DIR = join(REPO_ROOT, 'tmp', 'verify-inspiration-all-tab-category')
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence')
const SHOT_PATH = join(EVIDENCE_DIR, 'inspiration-all-tab-category-filter-verified.png')
const REPORT_PATH = join(EVIDENCE_DIR, 'inspiration-all-tab-category-filter-verify.json')

const CLOUD_BEAUTY = { id: 'c1', type: 'video', title: 'cloud beauty item', category: 'beauty_skincare', source_platform: 'tiktok', is_local: false }
const CLOUD_HOME = { id: 'c2', type: 'video', title: 'cloud home item', category: 'home_living', source_platform: 'tiktok', is_local: false }
const LOCAL_ITEM = { id: 'l1', type: 'video', title: 'local cowboy item', category: '', source_platform: 'tiktok', is_local: true }

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
  <title>Issue #2511 全部 Tab 选行业只出云端</title>
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
      json(200, { data: [] })
      return
    }
    if (url.pathname === '/omnimux/inspiration/local') {
      if (Array.isArray(options.logLocal)) options.logLocal.push(url.search)
      json(200, { success: true, data: { items: [LOCAL_ITEM], total: 1, platforms: [{ name: 'tiktok', count: 1 }] } })
      return
    }
    if (url.pathname === '/omnimux/inspiration') {
      if (Array.isArray(options.logCloud)) options.logCloud.push(url.search)
      const category = url.searchParams.get('category')
      const items = category
        ? [CLOUD_BEAUTY, CLOUD_HOME].filter((item) => item.category === category)
        : [CLOUD_BEAUTY, CLOUD_HOME]
      json(200, { success: true, data: { items, total: items.length } })
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

const report = {
  task: 'inspiration-all-tab-category-filter',
  issue: 2511,
  startedAt: new Date().toISOString(),
  pass: false,
  assertions: [],
  errors: [],
}

try {
  const bundledJs = await bundleEntry()
  const logLocal = []
  const logCloud = []
  const html = harnessHtml(bundledJs)
  const server = await startServer(html, { logLocal, logCloud })
  const { proc, cdpPort } = await launchChrome()
  let client = null
  try {
    client = await connectCdp(cdpPort)
    const { send, evaluate } = client
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })

    const mounted = await waitFor(evaluate, `(function() {
      const el = document.querySelector('${CATEGORY_TRIGGER}');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    })()`)
    assert.ok(mounted, '分类下拉触发器未渲染或尺寸为空')
    report.assertions.push({ name: 'category-trigger-mounted', pass: true, dimensions: mounted })

    const mixed = await waitFor(evaluate, `(function() {
      const text = document.body.innerText || '';
      return text.includes('local cowboy item') && text.includes('cloud beauty item') ? true : null;
    })()`)
    assert.ok(mixed, '分类「全部」时必须同时看到本地与云端卡片')
    report.assertions.push({
      name: 'all-tab-mixes-local-and-cloud',
      pass: true,
      localQueries: logLocal.slice(),
      cloudQueries: logCloud.slice(),
    })

    await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`)
    const labels = await waitFor(evaluate, `(function() {
      const options = [...document.querySelectorAll('${OPTION_QUERY}')].map((node) => node.textContent.trim());
      return options.includes('美妆护肤') ? options : null;
    })()`)
    assert.ok(labels, '分类下拉未展开')
    const beforePickLocal = logLocal.length
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
    assert.equal(
      logLocal.slice(beforePickLocal).length,
      0,
      `全部 + 具体行业不得再请求本地库。切片: ${JSON.stringify(logLocal.slice(beforePickLocal))}`,
    )
    report.assertions.push({
      name: 'all-tab-industry-skips-local',
      pass: true,
      cloud: logCloud,
      localAfterPick: logLocal.slice(beforePickLocal),
    })

    const filtered = await waitFor(evaluate, `(function() {
      const text = document.body.innerText || '';
      const hasBeauty = text.includes('cloud beauty item');
      const hasLocal = text.includes('local cowboy item');
      const hasHome = text.includes('cloud home item');
      const trigger = document.querySelector('${CATEGORY_TRIGGER}');
      const label = (trigger?.textContent || '').trim();
      return (hasBeauty && !hasLocal && !hasHome && label === '美妆护肤') ? { label, text: text.slice(0, 800) } : null;
    })()`, 5000)
    assert.ok(filtered, '选美妆护肤后列表仍混有本地或其它行业卡片')
    report.assertions.push({ name: 'all-tab-industry-shows-cloud-slice', pass: true, trigger: filtered.label })

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    assert.ok(shot?.data, '截图数据为空')
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    writeFileSync(SHOT_PATH, Buffer.from(shot.data, 'base64'))
    report.assertions.push({ name: 'screenshot-saved', pass: true, path: SHOT_PATH })
    report.pass = true
  } finally {
    if (client) {
      try { client.ws.close() } catch {}
    }
    try { proc.kill('SIGTERM') } catch {}
    try { server.close() } catch {}
  }
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
