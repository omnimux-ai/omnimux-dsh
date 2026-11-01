#!/usr/bin/env node
/**
 * scripts/builtin-apps-browser-qa.mjs（任务临时验收驱动，Issue #3876）
 *
 * 在**工作树内**跑一次真实浏览器验收，证明「项目页 → AI应用」分类真的同时显示
 * 官方内置应用与用户已发布应用，且内置卡片可点开应用表单：
 *
 *   1. 起一个真实 HTTP 服务，挂载 `omnimux-apps` 的**真实 host 路由**
 *      （`createAppsRoutes`，即生产同款 `GET /omnimux-apps/api/apps[/:appId]`）；
 *   2. 用真实 esbuild 把 `ProjectLibraryPage.jsx` + `AppTab.jsx` 打进同一浏览器 bundle
 *      （生产里它们就在同一个 lib/client.js 里）；
 *   3. 起无头 Chrome，真实点击「AI应用」分类、真实点击内置卡片、真实读 DOM；
 *   4. 落 PNG 截图与结构化 JSON 报告。
 *
 * 不写 ~/.omnimux-dev，不占用共享端口，跑完自清理。
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findChromePath, assertPng } from './worktree-web-qa.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// host 半边必须来自**当前源码**：先重建 dist，再从 dist 导入。否则证据会跑在旧产物上，
// 报告里的 head 标签与真正执行的代码对不上（独立评审 B5）。
execFileSync(process.execPath, [join(root, 'plugins/omnimux-apps/scripts/build-host.mjs')], {
  cwd: join(root, 'plugins/omnimux-apps'),
  stdio: 'pipe',
})
const { createAppsRoutes } = await import('../plugins/omnimux-apps/dist/index.js')
const require = createRequire(join(root, 'package.json'))

const runId = randomUUID()
const evidenceDir = join(root, '.workbuddy/evidence/worktree-qa', `builtin-apps-${runId}`)
mkdirSync(evidenceDir, { recursive: true })
/** 报告里的路径一律写成相对仓库根：绝对路径既泄露本机家目录，也让证据无法在别处复现。 */
const relToRoot = (absolute) => relative(root, absolute)

const headSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
// 记录真正执行的 host 产物哈希：head 标签 + 产物哈希一起才能证明「跑的就是这份源码」。
const hostDistPath = join(root, 'plugins/omnimux-apps/dist/index.js')
const hostDistSha256 = createHash('sha256').update(readFileSync(hostDistPath)).digest('hex')

const report = {
  runId,
  head: headSha,
  headShort: headSha.slice(0, 7),
  hostDist: { path: relToRoot(hostDistPath), sha256: hostDistSha256, bytes: statSync(hostDistPath).size },
  task: 'Issue #3876 项目页「AI应用」同时列出官方内置应用',
  startedAt: new Date().toISOString(),
  completedAt: null,
  pass: false,
  serverPort: null,
  cdpPort: null,
  assertions: [],
  screenshot: null,
  errors: [],
}

/* --------------------------------------------------------------- 1. 真实 host 路由 */

const savedManifests = new Map()
const appsService = {
  getManifest: async (appId) => savedManifests.get(appId) ?? null,
  saveManifest: async () => ({ success: true, filePath: '' }),
  executeApp: async () => ({}),
  getJobStatus: async () => null,
  cancelJob: async () => ({ success: true, canceledAt: '' }),
  recordTask: async () => ({ success: true, taskId: '' }),
  getTask: async () => null,
  listTasks: async () => [],
}
const appsRoutes = createAppsRoutes({ service: appsService, getHeadlessSeam: () => null })

/* ---------------------------------------------------------------- 2. 浏览器 bundle */

const PAGE_STUB = `
exports.listProjects = async () => ({ ok: true, body: { projects: [] } })
exports.getProject = async () => ({ ok: false })
exports.renameProject = async () => ({ ok: true })
exports.deleteProject = async () => ({ ok: true })
exports.bindProjectSession = async () => ({ ok: true })
exports.createProjectPage = async () => ({ ok: true })
exports.updateProjectPage = async () => ({ ok: true })
exports.deleteProjectPage = async () => ({ ok: true })
exports.fetchProjectFiles = async () => ({ ok: false })
exports.mkdirProjectFile = async () => ({ ok: false })
exports.uploadProjectFiles = async () => ({ ok: false })
exports.fetchSessionProjectBinding = async () => ({ ok: false })
`
const API_CLIENT_STUB = `
exports.getWorkspaceAssets = async () => ({ ok: false })
exports.mkdirWorkspaceAsset = async () => ({ ok: false })
exports.ingestWorkspaceAssets = async () => ({ ok: false })
exports.pickLocalFiles = async () => ({ ok: false, body: { paths: [] } })
`
const NEW_PROJECT_STUB = `
exports.createProjectSession = async () => ({ id: 'sess-1' })
exports.dismissProductStage = () => {}
exports.runNewProject = async () => ({ ok: true })
`
const ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectLibraryPage } from './projects/ProjectLibraryPage.jsx'
import { AppTab } from './projects/AppTab.jsx'
import { zh } from './locales.js'

window.__boot = (options) => {
  const t = (key) => zh[key] || key
  const sidebar = {
    opened: [],
    openTab(seed) { this.opened.push(seed); window.__lastOpenedTab = seed; return true },
    updateTab() {},
    closeTab() {},
    getSnapshot: () => ({ sessionId: 'sess-1', state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } }, prefs: {} }),
  }
  window.__omnimuxBetterSidebar = sidebar
  const libRoot = createRoot(document.getElementById('library-root'))
  libRoot.render(React.createElement(ProjectLibraryPage, {
    t, stage: { set() {} }, store: null, visible: true,
    sessions: { create: async () => ({ id: 'sess-1' }), open() {} },
    workspaces: {}, layout: { closeDetails() {} }, betterSidebar: sidebar,
  }))
  window.__sidebar = sidebar
  return true
}

window.__mountAppTab = (appId) => {
  const host = document.getElementById('apptab-root')
  host.innerHTML = ''
  const root = createRoot(host)
  root.render(React.createElement(AppTab, {
    ctx: { t: (key) => zh[key] || key, betterSidebar: window.__omnimuxBetterSidebar },
    t: (key) => zh[key] || key,
    store: null, scope: { sessionId: 'sess-1' },
    tab: { id: 'tab6', meta: { appId }, title: 'AI 应用' },
    visible: true, expanded: [], revealed: [],
  }))
  return true
}
`

async function bundlePage() {
  const hubRequire = createRequire(join(root, 'plugins/omnimux/package.json'))
  const { build } = hubRequire('esbuild')
  const kitDir = join(root, 'packages/dsh-ui-kit/lib/index.js')
  assert.ok(existsSync(kitDir), 'dsh-ui-kit 产物缺失')

  const result = await build({
    absWorkingDir: join(root, 'plugins/omnimux-workflow'),
    stdin: {
      contents: ENTRY,
      resolveDir: join(root, 'plugins/omnimux-workflow/src/client'),
      sourcefile: 'builtin-apps-qa-entry.jsx',
      loader: 'jsx',
    },
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    // 单 React 实例：宿主用 18.3.1，工作树里同时存在 19.2.8（dsh-ui-kit peer），
    // 不锁死就会出现「老版本 React Element」渲染错误。
    alias: {
      'dsh-ui-kit': kitDir,
      react: join(root, 'node_modules/react'),
      'react-dom': join(root, 'node_modules/react-dom'),
    },
    loader: { '.svg': 'text', '.png': 'empty', '.woff': 'empty', '.woff2': 'empty' },
    nodePaths: [
      join(root, 'plugins/omnimux-workflow/node_modules'),
      join(root, 'node_modules'),
      join(root, 'node_modules/.pnpm/node_modules'),
    ],
    plugins: [{
      name: 'qa-seams',
      setup(builder) {
        // 官方 primitives 的 CSS 在浏览器里由宿主注入；这里统一按空模块装载。
        builder.onLoad({ filter: /\.css$/ }, () => ({
          contents: 'export default new Proxy({}, { get: (_t, k) => (typeof k === "string" ? k : undefined) })',
          loader: 'js',
        }))
        builder.onResolve({ filter: /(^|\/)api\.js$/ }, () => ({ path: 'api-seam', namespace: 'seam' }))
        builder.onResolve({ filter: /bridge\/apiClient\.ts$/ }, () => ({ path: 'apiclient-seam', namespace: 'seam' }))
        builder.onResolve({ filter: /newProject\.js$/ }, () => ({ path: 'newproject-seam', namespace: 'seam' }))
        builder.onLoad({ filter: /.*/, namespace: 'seam' }, (args) => {
          if (args.path === 'api-seam') return { contents: PAGE_STUB, loader: 'js' }
          if (args.path === 'apiclient-seam') return { contents: API_CLIENT_STUB, loader: 'js' }
          if (args.path === 'newproject-seam') return { contents: NEW_PROJECT_STUB, loader: 'js' }
          return undefined
        })
      },
    }],
  })
  return result.outputFiles[0].text
}

/* ---------------------------------------------------------------------- 3. 页面 */

function pageHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>OmniMux · AI应用（内置 + 已发布）</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0f1117; color:#e2e8f0; font-family:-apple-system,"PingFang SC",sans-serif; }
  #app { display:flex; gap:16px; padding:16px; min-height:100vh; }
  #library-pane { flex:1.4; background:#161922; border:1px solid #232734; border-radius:10px; padding:16px; }
  #apptab-pane { flex:1; background:#161922; border:1px solid #232734; border-radius:10px; padding:16px; }
  .pane-title { font-size:12px; color:#94a3b8; margin-bottom:10px; }
</style></head>
<body>
  <div id="app">
    <div id="library-pane"><div class="pane-title">项目 → AI应用</div><div id="library-root"></div></div>
    <div id="apptab-pane"><div class="pane-title">应用标签页</div><div id="apptab-root"></div></div>
  </div>
  <script>${bundle}</script>
</body></html>`
}

/* ------------------------------------------------------------------- 4. CDP 驱动 */

async function connectCdp(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  assert.ok(page?.webSocketDebuggerUrl, '未找到 Chrome page 调试目标')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const send = (method, params = {}) => new Promise((res, rej) => {
    const msgId = ++id
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== msgId) return
      ws.removeEventListener('message', onMsg)
      if (m.error) rej(new Error(`CDP ${method}: ${JSON.stringify(m.error)}`))
      else res(m.result || m)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Page.enable')
  await send('Runtime.enable')
  return { ws, send }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const bundle = await bundlePage()
  report.assertions.push({ name: 'client-bundle-built', pass: true, bytes: bundle.length })

  const html = pageHtml(bundle)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname.startsWith('/omnimux-apps/api/')) {
      void appsRoutes.handle({ url: req.url, method: req.method, body: {} }, {
        writeHead(status, headers) { res.writeHead(status, headers) },
        end(chunk) { res.end(chunk) },
      }).then((handled) => {
        if (!handled) { res.writeHead(404); res.end('{}') }
      })
      return
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  report.serverPort = port

  // 独立 profile：不碰用户真实 Chrome 配置，跑完即删（与仓内其它浏览器 QA 一致）。
  const profileDir = join(evidenceDir, 'chrome-profile')
  mkdirSync(profileDir, { recursive: true })
  const chrome = spawn(findChromePath(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1440,900', 'about:blank',
  ])
  const cdpPort = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('无头 Chrome 启动超时')), 8000)
    chrome.stderr.on('data', (c) => {
      const m = String(c).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m) { clearTimeout(timer); res(Number(m[1])) }
    })
    chrome.on('error', rej)
  })
  report.cdpPort = cdpPort

  let cdp
  try {
    cdp = await connectCdp(cdpPort)
    const { send } = cdp
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
      return r.result?.value
    }
    const poll = async (expression, timeout = 15000) => {
      const end = Date.now() + timeout
      while (Date.now() < end) {
        if (await evaluate(expression)) return true
        await sleep(120)
      }
      throw new Error(`轮询超时: ${expression}`)
    }

    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
    await poll('typeof window.__boot === "function"')

    // ── 真实接口先自证：内置清单由 host 路由给出，不是前端硬编码
    const apiList = await evaluate(`fetch('/omnimux-apps/api/apps').then(r=>r.json())`)
    assert.ok(Array.isArray(apiList.apps) && apiList.apps.length === 10, `内置清单条数应为 10，实际 ${apiList.apps?.length}`)
    report.assertions.push({ name: 'host-route-lists-builtin-apps', pass: true, count: apiList.apps.length })

    await evaluate(`window.__errors = []; window.addEventListener('error', (e) => window.__errors.push(String(e.error && e.error.stack || e.message))); const origErr = console.error; console.error = (...a) => { window.__errors.push(a.map(x => String(x && x.stack || x)).join(' ')); origErr(...a) }`)
    const booted = await evaluate(`(() => { try { window.__boot(); return { ok: true } } catch (e) { return { ok: false, err: String(e && e.stack || e) } } })()`)
    if (!booted?.ok) throw new Error('boot failed: ' + booted.err)
    await sleep(400)
    const diag = await evaluate(`JSON.stringify({ html: document.getElementById('library-root').innerHTML.slice(0,300), errors: window.__errors })`)
    await poll(`Boolean([...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'AI应用'))`)

    // ── 切到「AI应用」分类
    await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'AI应用').click()`)
    await poll(`document.querySelectorAll('.omnimux-workflow-app-card').length > 0`)

    const cards = await evaluate(`[...document.querySelectorAll('.omnimux-workflow-app-card')].map(card => ({
      text: card.textContent.trim(),
      hasMenu: Boolean(card.querySelector('[aria-haspopup="menu"]')),
      hasCover: Boolean(card.querySelector('img')),
      role: card.getAttribute('role'),
    }))`)
    assert.equal(cards.length, 10, `「AI应用」分类必须列出全部 10 个内置应用，实际 ${cards.length}`)
    assert.ok(cards.every((c) => c.role === 'button'), '每张卡片必须是可点击的 role=button')
    assert.ok(cards.every((c) => c.hasMenu === false), '内置卡片不得提供「更多」菜单（无删除入口）')
    assert.ok(cards.some((c) => c.text.includes('官方')), '内置卡片必须有「官方」标识')
    // 封面来自 manifest（metadata.coverUrl 或 showcase posterUrl）：有封面的条目必须真的渲染出 img。
    const withCoverInManifest = apiList.apps.filter((app) => app.metadata?.coverUrl || app.showcase?.items?.length).length
    const renderedWithCover = cards.filter((c) => c.hasCover).length
    assert.equal(
      renderedWithCover,
      withCoverInManifest,
      `清单里 ${withCoverInManifest} 个应用带封面，页面上必须同样多张卡片渲染出封面图，实际 ${renderedWithCover}`,
    )
    assert.ok(!(await evaluate(`document.body.innerText.includes('还没有 AI 应用')`)), '有内置应用时不得显示空态')
    report.assertions.push({ name: 'builtin-cards-rendered', pass: true, count: cards.length })

    // ── 用户已发布应用与内置应用合并：同 appId 去重、用户版在前且可删
    await evaluate(`localStorage.setItem('omnimux_apps_manifests', JSON.stringify({
      'app-builtin-product-video': { appId: 'app-builtin-product-video', version: '9.9.9', createdAt: '2026-11-01T00:00:00.000Z', metadata: { name: '我的商品生视频', category: 'video' }, workflowBinding: { workspaceId: 'ws_user_override' } },
      'app_user_only': { appId: 'app_user_only', version: '1.0.0', createdAt: '2026-10-31T00:00:00.000Z', metadata: { name: '我发布的应用', category: 'image' }, workflowBinding: { workspaceId: 'ws_user_only' } },
    }))`)
    await evaluate(`document.querySelector('[role="tab"]')?.click()`)
    await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'AI应用').click()`)
    await poll(`document.querySelectorAll('.omnimux-workflow-app-card').length === 11`)

    const merged = await evaluate(`[...document.querySelectorAll('.omnimux-workflow-app-card')].map(card => ({
      text: card.textContent.trim(),
      hasMenu: Boolean(card.querySelector('[aria-haspopup="menu"]')),
    }))`)
    assert.equal(merged.length, 11, '10 个内置 + 2 个用户应用，同 appId 去重后应为 11')
    assert.ok(merged[0].text.includes('我的商品生视频'), '用户已发布应用按 createdAt 倒序排在最前')
    assert.ok(merged[1].text.includes('我发布的应用'), '第二个用户应用紧随其后')
    assert.ok(!merged.slice(2).some((c) => c.text.includes('商品生视频')), '同 appId 的内置条目必须被用户版本替换而不是重复出现')
    assert.equal(merged.filter((c) => c.hasMenu).length, 2, '只有两个用户应用带「更多」菜单')
    report.assertions.push({ name: 'published-and-builtin-merged', pass: true, total: merged.length })

    // ── 点内置卡片 → 打开 app_<appId> 标签页
    await evaluate(`[...document.querySelectorAll('.omnimux-workflow-app-card')].find(c => c.textContent.includes('爆款复刻')).click()`)
    const opened = await evaluate(`JSON.stringify(window.__lastOpenedTab || null)`)
    const tab = JSON.parse(opened)
    assert.ok(tab, '点内置卡片必须调用侧栏 openTab')
    assert.equal(tab.id, 'app_app-builtin-viral-replication', '标签页 id 必须走 app_<appId> 约定')
    assert.equal(tab.type, 'omnimux-workflow:app')
    assert.equal(tab.meta.appId, 'app-builtin-viral-replication')
    report.assertions.push({ name: 'builtin-card-opens-app-tab', pass: true, tabId: tab.id })

    // ── 内置应用标签页真的渲染表单（本地无缓存 → 走只读接口解析 manifest）
    await evaluate(`window.__mountAppTab('app-builtin-viral-replication')`)
    await poll(`Boolean(document.querySelector('.omx-apptab-root'))`)
    const formState = await evaluate(`(() => {
      const root = document.querySelector('.omx-apptab-root')
      return {
        title: root?.querySelector('.omx-apptab-title')?.textContent.trim() || null,
        badge: root?.querySelector('.omx-apptab-badge')?.textContent.trim() || null,
        fieldCount: root?.querySelectorAll('input,textarea,select,[role="radio"],[role="switch"]').length || 0,
        hasEmptyState: Boolean(root?.querySelector('.omx-apptab-empty')),
        bodyText: root?.textContent.slice(0, 120) || '',
      }
    })()`)
    assert.equal(formState.hasEmptyState, false, '内置应用不得停在「暂无已加载的 AI 应用」空态')
    assert.equal(formState.title, '爆款复刻', `标签页标题必须是应用名，实际 ${formState.title}`)
    assert.ok(formState.fieldCount > 0, '内置应用必须渲染出真实表单控件')
    report.assertions.push({
      name: 'builtin-app-tab-renders-form',
      pass: true,
      title: formState.title,
      badge: formState.badge,
      fieldCount: formState.fieldCount,
    })

    // ── 截图证据
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const png = Buffer.from(shot.data, 'base64')
    const dims = assertPng(png)
    const shotPath = join(evidenceDir, 'builtin-apps-library.png')
    writeFileSync(shotPath, png)
    report.screenshot = { path: relToRoot(shotPath), width: dims.width, height: dims.height, bytes: png.length }
    report.assertions.push({ name: 'screenshot-png-verified', pass: true, dimensions: dims })

    writeFileSync(join(evidenceDir, 'dom-state.json'), JSON.stringify({ cards, merged, formState, tab }, null, 2))
    report.pass = report.assertions.every((a) => a.pass)
  } finally {
    try { cdp?.ws?.close() } catch {}
    try { chrome.kill('SIGTERM') } catch {}
    // 核验浏览器真的退出了：残留进程会占着 profile 与端口，下一次运行结果不可信。
    const exited = await new Promise((done) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) { done(true); return }
      const timer = setTimeout(() => done(false), 5000)
      chrome.once('exit', () => { clearTimeout(timer); done(true) })
    })
    report.browserExited = exited
    report.assertions.push({ name: 'browser-process-exited', pass: exited })
    try { server.close() } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
    report.completedAt = new Date().toISOString()
    writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  }

  console.log(report.pass ? '✅ 通过' : '❌ 未通过')
  console.log(`   证据目录: ${evidenceDir}`)
  if (report.screenshot) console.log(`   截图: ${report.screenshot.path} (${report.screenshot.width}x${report.screenshot.height})`)
  for (const a of report.assertions) console.log(`   ${a.pass ? '✔' : '✖'} ${a.name}`)
  if (!report.pass) process.exitCode = 1
}

main().catch((error) => {
  report.errors.push(error instanceof Error ? error.message : String(error))
  report.completedAt = new Date().toISOString()
  writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.error('❌ 验收驱动异常:', error)
  process.exitCode = 1
})
