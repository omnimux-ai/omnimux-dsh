#!/usr/bin/env node
/**
 * 探索模板一级 Tab 素材卡片 → 输入框功能路径门禁（Issue #3812）。
 *
 * 真实浏览器内核（Chrome headless）、动态端口、临时 profile、用完即焚。
 * 生产源码经 esbuild 现场打包后真实挂载 SessionGuide，不走静态字符串比对：
 * 断言的是「点卡片之后输入框里真的多了一句话、卡槽里真的多了一张图」。
 *
 * 反向对照：把 SessionGuide 里交给 dock() 的载荷换回命令信封（修复前的写法），
 * 同一套断言必须失败——夹具与断言都不失真，否则判定本次验收无效。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SESSION_GUIDE = 'plugins/omnimux-inspiration/src/explore/SessionGuide.jsx'

function findChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error('未找到 Chrome / Chromium，可用 CHROME_PATH 指定')
}

/**
 * 把生产 SessionGuide 打包成浏览器可加载的 IIFE 并挂到 window.__qa.mount()。
 * 载荷身份改写由 `mutateSource` 决定：null = 生产原样，反向对照用它退回修复前写法。
 */
async function bundleGuide(mutateSource) {
  const entry = resolve(ROOT, SESSION_GUIDE)
  const source = readFileSync(entry, 'utf8')
  const plugin = {
    name: 'qa-entry',
    setup(builder) {
      builder.onLoad({ filter: /SessionGuide\.jsx$/ }, () => {
        const next = mutateSource ? mutateSource(source) : source
        const appended = `${next}\n\nexport function __qaMount(props, container) {\n  return BlankSessionGuide(props, container)\n}\n`
        return { contents: appended, loader: 'jsx', resolveDir: dirname(entry) }
      })
    },
  }
  const output = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { SessionGuide } from '${entry}'
        import { createGuideStore } from '${resolve(ROOT, 'plugins/omnimux/src/client/session-guide/state.js')}'
        import { guideZh } from '${resolve(ROOT, 'plugins/omnimux/src/client/session-guide/catalog.js')}'
        import { getGlobalAttachmentStore } from '${resolve(ROOT, 'plugins/omnimux/src/client/attachments/store.ts')}'
        window.__qa = { React, createRoot, SessionGuide, createGuideStore, guideZh, getGlobalAttachmentStore }
      `,
      resolveDir: ROOT,
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    plugins: [plugin],
    define: { 'process.env.NODE_ENV': '"development"' },
  })
  return output.outputFiles[0].text
}

/** 修复前的写法：把命令信封原样交给 dock()，守卫会拒收。 */
const revertPayloadIdentity = (source) => {
  assert.ok(source.includes('const docked = dock(dockEntity, {'), '生产源码已不是预期的修复后写法，反向对照夹具失真')
  return source.replace('const docked = dock(dockEntity, {', 'const docked = dock(payload, {')
}

/** 精选货架的模板来自创意模板快照（与素材库不同的代码路径：handleItemRecreate）。 */
const CREATIVE_SNAPSHOT = {
  schemaVersion: 1,
  dataVersion: 'a'.repeat(64),
  items: [{ id: 'tpl_qa_1', titleZh: '黄金开场模板', categorySlug: 'hook-intro', promptZh: '请用黄金开场模板生成脚本' }],
}

const FIXTURES = {
  assets: {
    path: '/omnimux/assets/library',
    body: { assets: [{ id: 'asset_qa_1', name: '夏日海边素材', type: 'image', url: '/qa/a.jpg' }], total: 1 },
    title: '夏日海边素材',
  },
  inspiration: {
    path: '/omnimux/inspiration/local',
    body: { data: { items: [{ id: 'insp_qa_1', title: 'US beauty hook', cover_url: '/qa/c.jpg', source_url: '/qa/v.mp4' }], total: 1 } },
    title: 'US beauty hook',
  },
  products: {
    path: '/omnimux/products',
    body: { products: [{ id: 'prod_qa_1', name: '香薰蜡烛', price: '99', image: '/qa/p.jpg' }], total: 1 },
    title: '香薰蜡烛',
  },
}

const HARNESS = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>explore library card dock QA</title>
<style>
  html, body { margin: 0; background: #18181b; color: #eee; font: 14px/1.5 -apple-system, sans-serif; }
  [data-phase] { min-height: 100vh; }
  #guide { padding: 24px; }
  [data-composer-card] {
    position: sticky; bottom: 0; z-index: 10;
    margin: 24px; padding: 16px; border-radius: 16px;
    background: #26262b; min-height: 96px;
    border: 1px solid #3a3a40;
  }
  [data-composer-input] { min-height: 56px; outline: none; }
  #draft { white-space: pre-wrap; color: #c7c7cc; }
  #dock { min-height: 44px; margin-bottom: 8px; }
  .slot {
    display: inline-flex; align-items: center; gap: 6px; height: 44px;
    padding: 0 10px 0 6px; border-radius: 8px; background: #3a3a40;
    margin-right: 6px; color: #e5e5ea; font-size: 12px;
  }
  .slot::before { content: ''; width: 28px; height: 28px; border-radius: 6px; background: #5a5a62; }
</style>
</head>
<body>
  <div data-phase="hero" data-omnimux-starter-host>
    <div id="guide"></div>
    <div data-composer-card>
      <div id="dock" data-qa-dock></div>
      <div data-composer-input contenteditable="true"></div>
      <div id="draft"></div>
    </div>
  </div>
  <script src="/bundle.js"></script>
  <script>
    window.__qaState = { ready: false, error: null }
    const fixtures = ${JSON.stringify(FIXTURES)}
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = String(input && input.url ? input.url : input)
      if (url.includes('/omnimux/templates/creative')) {
        return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(CREATIVE_SNAPSHOT)}), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      const hit = Object.values(fixtures).find((f) => url.includes(f.path))
      if (hit) {
        return Promise.resolve(new Response(JSON.stringify(hit.body), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return realFetch(input, init)
    }
    window.__omnimuxActiveSkill = null
    window.__omnimuxAttachments = window.__qa.getGlobalAttachmentStore()
    try {
      const sessionId = 'sess-qa-3812'
      const store = window.__qa.createGuideStore()
      const draftHost = document.getElementById('draft')
      const dockHost = document.getElementById('dock')
      let draft = ''
      const renderDock = () => {
        const items = window.__omnimuxAttachments.getSnapshot(sessionId)
        dockHost.innerHTML = ''
        for (const item of items) {
          const slot = document.createElement('span')
          slot.className = 'slot'
          slot.setAttribute('data-qa-attachment', item.title || item.id)
          slot.title = item.title || item.id
          slot.textContent = item.title || item.id
          dockHost.appendChild(slot)
        }
        draftHost.textContent = draft
      }
      window.__omnimuxAttachments.setActiveSessionId(sessionId)
      window.__omnimuxAttachments.subscribe(sessionId, renderDock)
      const props = {
        sessionId,
        useSession: (selector) => selector({ blank: true }),
        useConversation: (selector) => selector({ activeTargets: new Set() }),
        useInput: (selector) => selector({ draft, phase: 'plain' }),
        inputActions: {
          setDraft(value) {
            draft = String(value || '')
            renderDock()
          },
        },
        getCurrentSessionId: () => sessionId,
        store,
        workbench: { subscribe: () => () => {}, getSnapshot: () => ({ sessionId, state: { panelOpen: false } }) },
        t: (key) => window.__qa.guideZh[key] || key,
      }
      window.__qa.createRoot(document.getElementById('guide')).render(window.__qa.React.createElement(window.__qa.SessionGuide, props))
      renderDock()
      window.__qaState.ready = true
    } catch (error) {
      window.__qaState.error = String(error && error.message ? error.message : error)
    }
  </script>
</body>
</html>`

const CLICK_TAB = (tab) => `(() => {
  const button = document.querySelector('[data-primary-tab="${tab}"]')
  if (!button) return { ok: false, error: 'missing tab ${tab}' }
  button.click()
  return { ok: true }
})()`

const CLICK_CARD = `(() => {
  const cell = document.querySelector('.omx-library-flow-cell')
  if (!cell) return { ok: false, error: 'no library cell' }
  const target = cell.querySelector('[role="checkbox"], button, [role="button"]') || cell.firstElementChild
  if (!target) return { ok: false, error: 'no clickable card' }
  target.click()
  return { ok: true, text: (cell.innerText || '').slice(0, 40) }
})()`

const READ_RESULT = `(() => {
  const notice = document.querySelector('.omnimux-starter-notice')
  const dockOpen = document.querySelector('[data-omnimux-starter-host]')?.hasAttribute('data-omnimux-dock-open') || false
  return JSON.stringify({
    draft: document.getElementById('draft')?.textContent || '',
    attachments: [...document.querySelectorAll('[data-qa-attachment]')].map((n) => n.getAttribute('data-qa-attachment')),
    notice: notice ? notice.textContent.trim() : null,
    dockOpen,
  })
})()`

async function startServer(bundleText) {
  const server = http.createServer((req, res) => {
    if (String(req.url).startsWith('/bundle.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(bundleText)
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HARNESS)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return { server, port: server.address().port }
}

async function openCdp(profileDir) {
  const chrome = spawn(findChromePath(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,1000', 'about:blank',
  ])
  const cdpPort = await new Promise((resolvePort, rejectPort) => {
    const portFile = join(profileDir, 'DevToolsActivePort')
    const timer = setTimeout(() => rejectPort(new Error('浏览器启动超时')), 25000)
    const poll = setInterval(() => {
      try {
        const value = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim())
        if (Number.isInteger(value) && value > 0) {
          clearInterval(poll)
          clearTimeout(timer)
          resolvePort(value)
        }
      } catch {}
    }, 120)
  })
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((res) => res.json())
  const page = targets.find((item) => item.type === 'page')
  assert.ok(page?.webSocketDebuggerUrl, '未找到有效的浏览器 Page 调试目标')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
    else waiter.resolve(message.result)
  })
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen)
    socket.addEventListener('error', () => rejectOpen(new Error('浏览器调试连接失败')))
  })
  const send = (method, params = {}, timeoutMs = 10000) => new Promise((resolveSend, rejectSend) => {
    const id = ++nextId
    const timer = setTimeout(() => {
      pending.delete(id)
      rejectSend(new Error(`浏览器指令超时: ${method}`))
    }, timeoutMs)
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolveSend(value) },
      reject: (error) => { clearTimeout(timer); rejectSend(error) },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  return { chrome, socket, send }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * 走完一轮「切 Tab → 点卡片 → 读输入框」，返回每个 Tab 的实测结果。
 * 判定只看外部世界：输入框里的文字、卡槽里的附件、有没有「未准备好」提示。
 */
async function runJourney({ send, port, expectPass, evidenceDir, label }) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await sleep(1200)
  const stateEval = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__qaState || {})', returnByValue: true })
  const state = JSON.parse(stateEval.result?.value || '{}')
  assert.equal(state.ready, true, `引导未挂载成功: ${state.error || '未就绪'}`)

  const results = {}
  for (const [tab, fixture] of Object.entries(FIXTURES)) {
    await send('Runtime.evaluate', { expression: CLICK_TAB(tab), returnByValue: true })
    await sleep(700)
    const cardRes = await send('Runtime.evaluate', { expression: CLICK_CARD, returnByValue: true })
    assert.equal(cardRes.result?.value?.ok, true, `Tab ${tab} 卡片点击失败: ${cardRes.result?.value?.error}`)
    await sleep(700)
    const readRes = await send('Runtime.evaluate', { expression: READ_RESULT, returnByValue: true })
    const read = JSON.parse(readRes.result?.value || '{}')
    // 每个 Tab 留一张图：三路素材库各自看得见「卡槽里有它、输入框里有话」。
    await send('Runtime.evaluate', {
      expression: `(() => { document.querySelector('[data-composer-card]')?.scrollIntoView({ block: 'center' }); return true })()`,
      returnByValue: true,
    })
    await sleep(350)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const png = Buffer.from(shot.data, 'base64')
    const shotPath = join(evidenceDir, `${label}-${tab}.png`)
    writeFileSync(shotPath, png)
    const decoded = PNG.sync.read(png, { checkCRC: true })

    results[tab] = {
      expectedTitle: fixture.title,
      screenshot: { path: shotPath, width: decoded.width, height: decoded.height, bytes: png.length },
      draft: read.draft,
      attachments: read.attachments || [],
      notice: read.notice,
      dockOpen: Boolean(read.dockOpen),
      prefilled: String(read.draft || '').includes(fixture.title),
      attached: (read.attachments || []).some((title) => String(title).includes(fixture.title)),
    }
  }

  // 精选货架的模板卡片走另一条分发路径，单独验一遍
  await send('Runtime.evaluate', { expression: CLICK_TAB('featured'), returnByValue: true })
  await sleep(500)
  await send('Runtime.evaluate', { expression: `(() => { document.querySelector('[data-sub-category="hook-intro"]')?.click(); return true })()`, returnByValue: true })
  await sleep(700)
  const featuredRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('[data-template-id="tpl_qa_1"]')
      if (!card) return { ok: false, error: 'featured template card missing' }
      const button = card.querySelector('.omnimux-trending-recreate-btn')
      if (!button) return { ok: false, error: 'featured recreate button missing' }
      button.click()
      return { ok: true }
    })()`,
    returnByValue: true,
  })
  assert.equal(featuredRes.result?.value?.ok, true, `精选模板卡片点击失败: ${featuredRes.result?.value?.error}`)
  await sleep(700)
  const featuredRead = JSON.parse((await send('Runtime.evaluate', { expression: READ_RESULT, returnByValue: true })).result?.value || '{}')
  await send('Runtime.evaluate', { expression: `(() => { document.querySelector('[data-composer-card]')?.scrollIntoView({ block: 'center' }); return true })()`, returnByValue: true })
  await sleep(350)
  const featuredShot = await send('Page.captureScreenshot', { format: 'png' })
  const featuredPng = Buffer.from(featuredShot.data, 'base64')
  const featuredPath = join(evidenceDir, `${label}-featured.png`)
  writeFileSync(featuredPath, featuredPng)
  const featuredDecoded = PNG.sync.read(featuredPng, { checkCRC: true })
  results.featuredTemplate = {
    expectedTitle: '黄金开场模板',
    screenshot: { path: featuredPath, width: featuredDecoded.width, height: featuredDecoded.height, bytes: featuredPng.length },
    draft: featuredRead.draft,
    attachments: featuredRead.attachments || [],
    notice: featuredRead.notice,
    dockOpen: Boolean(featuredRead.dockOpen),
    prefilled: String(featuredRead.draft || '').includes('黄金开场模板'),
    attached: (featuredRead.attachments || []).some((title) => String(title).includes('黄金开场模板')),
  }

  const assertions = []
  for (const [tab, result] of Object.entries(results)) {
    assertions.push({ name: `${tab}-card-prefills-composer`, pass: result.prefilled, expected: result.expectedTitle, actual: result.draft })
    // 精选模板按合同只交付 Prompt，不生成物理附件载荷（asset-hub-data: featured → null）；
    // 素材库三路则必须真的挂进卡槽。
    if (tab !== 'featuredTemplate') {
      assertions.push({ name: `${tab}-card-attaches-to-slot`, pass: result.attached, expected: result.expectedTitle, actual: result.attachments })
    }
    assertions.push({ name: `${tab}-no-unavailable-notice`, pass: result.notice === null, actual: result.notice })
  }
  const pass = assertions.every((item) => item.pass)
  return { results, assertions, pass, matchesExpectation: pass === expectPass }
}

async function runScenario({ label, bundleText, expectPass, evidenceDir, runId }) {
  const { server, port } = await startServer(bundleText)
  const profileDir = join(ROOT, 'tmp', `explore-library-dock-chrome-${process.pid}-${runId.slice(0, 8)}-${expectPass ? 'fix' : 'control'}`)
  mkdirSync(profileDir, { recursive: true })
  let chrome = null
  let socket = null
  try {
    const cdp = await openCdp(profileDir)
    chrome = cdp.chrome
    socket = cdp.socket
    const outcome = await runJourney({ send: cdp.send, port, expectPass, evidenceDir, label })
    return { label, ...outcome }
  } finally {
    try { socket?.close() } catch {}
    try { chrome?.kill('SIGKILL') } catch {}
    try { server.close() } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  const runId = randomUUID()
  const evidenceDir = join(ROOT, '.workbuddy/evidence/worktree-qa', `explore-library-dock-${runId}`)
  mkdirSync(evidenceDir, { recursive: true })
  const report = { runId, pass: false, assertions: [], errors: [], scenarios: [] }
  try {
    const fixedBundle = await bundleGuide(null)
    const controlBundle = await bundleGuide(revertPayloadIdentity)

    const fixed = await runScenario({ label: 'fixed', bundleText: fixedBundle, expectPass: true, evidenceDir, runId })
    const control = await runScenario({ label: 'control-before-fix', bundleText: controlBundle, expectPass: false, evidenceDir, runId })
    report.scenarios = [fixed, control]
    report.assertions.push(...fixed.assertions.map((item) => ({ ...item, scenario: 'fixed' })))
    report.assertions.push({
      name: 'negative-control-reproduces-defect',
      pass: control.matchesExpectation && control.pass === false,
      detail: '把交给 dock() 的载荷换回命令信封（修复前写法）后，同一套断言必须失败',
    })
    report.assertions.push({ name: 'fixed-scenario-passes', pass: fixed.pass === true })
    for (const [tab, result] of Object.entries(fixed.results)) {
      report.assertions.push({
        name: `fixed-${tab}-screenshot-png-verified`,
        pass: result.screenshot.bytes > 32 && result.screenshot.width > 0 && result.screenshot.height > 0,
        dimensions: { width: result.screenshot.width, height: result.screenshot.height },
        path: result.screenshot.path,
      })
    }
    report.pass = report.assertions.every((item) => item.pass)
    if (!report.pass) {
      report.errors.push('功能路径断言未全部通过')
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    report.completedAt = new Date().toISOString()
    const json = JSON.stringify(report, null, 2)
    writeFileSync(join(evidenceDir, 'explore-library-card-dock-qa-report.json'), json)
    mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true })
    writeFileSync(join(ROOT, 'docs/evidence/explore-library-card-dock-qa-report.json'), json)
    const fixedRun = report.scenarios.find((item) => item.label === 'fixed')
    for (const [tab, result] of Object.entries(fixedRun?.results || {})) {
      writeFileSync(join(ROOT, `docs/evidence/explore-library-card-dock-qa-${tab}.png`), readFileSync(result.screenshot.path))
    }
  }

  const failed = report.assertions.filter((item) => !item.pass).map((item) => `${item.name} (${item.scenario || 'control'})`)
  if (report.pass) {
    console.log('✅ PASS 探索模板素材卡片 → 输入框功能路径（真实浏览器内核）')
    console.log(`   场景: ${report.scenarios.map((item) => item.label).join(' / ')}`)
    console.log(`   证据: ${evidenceDir}`)
    return
  }
  console.log(`❌ FAIL -> ${[...report.errors, ...failed].join('; ')}`)
  process.exit(1)
}

await main()
