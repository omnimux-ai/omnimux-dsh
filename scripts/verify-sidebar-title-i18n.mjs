#!/usr/bin/env node
/**
 * @file scripts/verify-sidebar-title-i18n.mjs
 * @description 侧边栏「开始」区条目名称国际化回归：真实无头浏览器内核里跑
 *   omnimux-assets 与 omnimux-viewer 的真实注册代码（esbuild 打包），
 *   用内置 zh 词条驱动 locale 服务，断言注册到宿主 Tab 系统的标题文本
 *   为「素材工作台」「图像生成」，并渲染成真实 DOM 截图留证。
 *
 * 证据输出：<worktree>/docs/evidence/sidebar-title-i18n/
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const EVIDENCE_DIR = join(ROOT, 'docs/evidence/sidebar-title-i18n')

function findChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (existsSync(mac)) return mac
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/opt/homebrew/bin/chromium']) {
    if (existsSync(c)) return c
  }
  throw new Error('未找到 Chrome 可执行文件')
}

async function bundle(entryPath, globalName) {
  const hubRequire = createRequire(join(ROOT, 'plugins/omnimux/package.json'))
  const { build } = hubRequire('esbuild')
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    globalName,
    write: false,
    outdir: 'dist',
    logLevel: 'silent',
    loader: { '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.css': 'empty', '.svg': 'text', '.png': 'empty' },
  })
  assert.ok(result.outputFiles?.length > 0, `bundle 产物为空: ${entryPath}`)
  return result.outputFiles[0].text
}

const PAGE_HTML = (assetsJs, viewerJs) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
body { background:#141414; color:#e8e8e8; font-family:-apple-system,sans-serif; padding:24px; }
.row { display:flex; align-items:center; gap:8px; height:32px; padding:0 8px; border-radius:8px; font-size:14px; }
.row:hover { background:rgba(255,255,255,.06); }
h2 { font-size:13px; color:#888; font-weight:500; margin:0 0 8px; }
</style></head><body>
<h2>开始</h2>
<div id="panel"></div>
<script>
window.__registeredTabs = []
window.__ctxErrors = []
const stubSidebar = {
  registerTab(def) {
    window.__registeredTabs.push(def)
    return () => {}
  },
}
function makeCtx(zhDict) {
  const t = (key) => Object.prototype.hasOwnProperty.call(zhDict, key) ? zhDict[key] : key
  const ctx = {
    locale: { register() {}, bind: () => t },
    effect(fn) { try { fn() } catch (e) { window.__ctxErrors.push(String(e && e.stack || e)) } return () => {} },
    inject(deps, cb) {
      if (deps.includes('betterSidebar')) cb({ betterSidebar: stubSidebar, get: () => stubSidebar, inject: ctx.inject.bind(ctx), effect: ctx.effect.bind(ctx) })
    },
    slots: { inject() {}, register() {} },
    get() { return undefined },
  }
  return ctx
}
window.__runVerification = (zhAssets, zhViewer) => {
  window.__ASSETS_ZH = zhAssets
  window.__VIEWER_ZH = zhViewer
}
</script>
<script>${assetsJs}</script>
<script>${viewerJs}</script>
<script>
window.__mountedTitles = () => {
  const panel = document.getElementById('panel')
  for (const def of window.__registeredTabs) {
    const title = typeof def.title === 'function' ? def.title() : def.title
    const row = document.createElement('div')
    row.className = 'row'
    row.textContent = title
    row.setAttribute('data-tab-id', def.id)
    panel.appendChild(row)
  }
  return window.__registeredTabs.map((d) => ({ id: d.id, title: typeof d.title === 'function' ? d.title() : d.title }))
}
</script>
</body></html>`

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })

  // 资产词条（纯数据，Node 侧直接 import 供页面驱动用）
  const { zh: zhAssets } = await import(join(ROOT, 'plugins/omnimux-assets/src/client/locales.js'))
  const viewerLocalesSrc = (await import('node:fs')).readFileSync(join(ROOT, 'plugins/omnimux-viewer/src/client/locales.ts'), 'utf8')
  const zhViewerTitle = /'mediaViewer\.tabTitle':\s*'([^']+)'/.exec(viewerLocalesSrc)?.[1]

  const assetsJs = await bundle(join(ROOT, 'plugins/omnimux-assets/src/client/index.js'), '__qa_assets')
  const viewerJs = await bundle(join(ROOT, 'plugins/omnimux-viewer/src/client/index.ts'), '__qa_viewer')

  const html = PAGE_HTML(assetsJs, viewerJs)
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const profileDir = join(ROOT, 'tmp', `sidebar-title-qa-${process.pid}`)
  const chrome = spawn(findChromePath(), [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1280,800', `--user-data-dir=${profileDir}`, 'about:blank',
  ])
  const cdpPort = await new Promise((resolveP, reject) => {
    const to = setTimeout(() => reject(new Error('Chrome 启动超时')), 8000)
    chrome.stderr.on('data', (c) => {
      const m = String(c).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m) { clearTimeout(to); resolveP(Number(m[1])) }
    })
    chrome.on('error', reject)
  })

  let ws
  try {
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
    const page = targets.find((t) => t.type === 'page')
    assert.ok(page?.webSocketDebuggerUrl, '无页面调试目标')
    ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    }
    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id
      pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
    await send('Page.enable')
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
    await new Promise((r) => setTimeout(r, 800))

    // 词条数据注入 + 执行两个插件的真实 apply（iife 全局对象导出）
    const res = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const out = { errors: [] }
          try {
            window.__ctxAssets = makeCtx(${JSON.stringify(zhAssets)})
            window.__ctxViewer = makeCtx(${JSON.stringify({ 'mediaViewer.tabTitle': zhViewerTitle })})
            // iife globalName 暴露模块导出对象
            window.__qa_assets.apply(window.__ctxAssets)
            window.__qa_viewer.apply(window.__ctxViewer)
          } catch (e) { out.errors.push(String(e && e.stack || e)) }
          return out
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    })
    const applyResult = res.result?.value
    if (applyResult?.errors?.length) throw new Error(applyResult.errors.join('\n'))

    const ctxErr = await send('Runtime.evaluate', { expression: `window.__ctxErrors`, returnByValue: true })
    if (ctxErr.result?.value?.length) console.warn('ctx effect errors (non-fatal):', ctxErr.result.value)

    await new Promise((r) => setTimeout(r, 500))
    const titlesRes = await send('Runtime.evaluate', { expression: `window.__mountedTitles()`, returnByValue: true })
    const titles = titlesRes.result?.value || []

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const png = Buffer.from(shot.data, 'base64')
    assert.ok(png.length > 32)

    const report = {
      startedAt: new Date().toISOString(),
      scenario: 'sidebar-title-i18n',
      titles,
      pass: titles.some((t) => t.title === '素材工作台') && titles.some((t) => t.title === '图像生成'),
    }
    writeFileSync(join(EVIDENCE_DIR, 'sidebar-title-i18n-report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(EVIDENCE_DIR, 'sidebar-title-i18n.png'), png)
    console.log('TITLES:', JSON.stringify(titles))
    assert.ok(report.pass, `标题断言失败: ${JSON.stringify(titles)}`)
    console.log('✅ PASS 侧边栏条目名称：素材工作台 + 图像生成')
  } finally {
    try { ws?.close() } catch {}
    try { chrome.kill('SIGTERM') } catch {}
    try { server.close() } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
}

main().catch((err) => {
  console.error('FAIL:', err?.message || err)
  process.exit(1)
})
