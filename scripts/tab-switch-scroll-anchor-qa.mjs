#!/usr/bin/env node
/**
 * 探索模板切 Tab 不跳顶门禁（Issue #3812 后续）。
 *
 * 真实浏览器内核（Chrome headless）、动态端口、临时 profile、用完即焚。
 * 生产源码经 esbuild 现场打包后真实挂载 SessionGuide，断言的是真实滚动几何：
 *
 *   1. 把页面滚到素材区中部 → 点一张卡片 → 输入框吸底；
 *   2. 再切一级 Tab（资产库 → 灵感库）与二级分类；
 *   3. 断言：页面没有跳回顶部、Tab 栏仍贴着视口顶部、输入框仍在吸底。
 *
 * 反向对照：把「换库不清空旧卡片 + 不声明静默窗口」退回修复前写法，
 * 同一套断言必须失败——否则夹具或断言失真，本次验收无效。
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
const SECTION = 'plugins/omnimux-inspiration/src/explore/templates/ExploreTemplatesSection.jsx'
const HOOK = 'plugins/omnimux-inspiration/src/explore/useComposerDocking.js'
const STYLES = 'plugins/omnimux/src/client/session-guide/styles.js'

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
 * 打包真实生产组件。`mutate` 决定是否退回修复前写法（反向对照）。
 */
async function bundle({ mutate }) {
  const sectionPath = resolve(ROOT, SECTION)
  const hookPath = resolve(ROOT, HOOK)
  const plugin = {
    name: 'qa-mutate',
    setup(builder) {
      if (!mutate) return
      builder.onLoad({ filter: /ExploreTemplatesSection\.jsx$/ }, () => {
        let source = readFileSync(sectionPath, 'utf8')
        // 修复前：换库先清空卡片（高度塌陷），且不声明静默窗口。
        const before = source
        source = source.replace(
          /setLibraryData\(\(prev\) => \(\{\n      \.\.\.prev,\n      loading: prev\.cards\.length === 0,\n      refreshing: prev\.cards\.length > 0,/,
          'setLibraryData((prev) => ({\n      ...prev,\n      cards: [],\n      loading: true,\n      refreshing: false,',
        )
        assert.notEqual(source, before, '反向对照夹具失真：未找到「保留旧卡片」的修复点')
        source = source.replace(/onContentRebuild\?\.\(\)\n    setActivePrimaryTab/, 'setActivePrimaryTab')
        source = source.replace(/onContentRebuild\?\.\(\)\n    setSelectedSubCategory/, 'setSelectedSubCategory')
        return { contents: source, loader: 'jsx', resolveDir: dirname(sectionPath) }
      })
      builder.onLoad({ filter: /session-guide[\\/]styles\.js$/ }, () => {
        const stylesPath = resolve(ROOT, STYLES)
        let source = readFileSync(stylesPath, 'utf8')
        const before = source
        // 修复前：素材区没有任何视口最小高度兜底，换库时页面变矮，浏览器夹回 scrollTop。
        // 两处都要撤：shelves（精选）与 grid-view-flow（素材库）分别兜各自的分支。
        source = source.replace(
          /\n  min-height: calc\(100vh - 152px\);\n\}/,
          '\n}',
        )
        source = source.replace(
          /\[data-omnimux-starter-host\]\[data-omnimux-dock-open\] \.omnimux-explore-grid-view-wrap\.omnimux-explore-grid-view-flow \{[^}]*\}\n/,
          '',
        )
        // 精选 shelves 的两条兜底也撤掉：换库瞬间它仍在 DOM 里，会替素材库撑住高度。
        source = source.replace(
          /\[data-omnimux-starter-host\]\[data-omnimux-dock-open\] \.omnimux-explore-shelves-view \{[^}]*\}\n/,
          '',
        )
        source = source.replace(
          /(\.omnimux-explore-shelves-view \{\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  width: 100%;)\n  min-height: calc\(100vh - 152px\);\n\}/,
          '$1\n}',
        )
        assert.notEqual(source, before, '反向对照夹具失真：未找到素材库容器的视口最小高度')
        return { contents: source, loader: 'js', resolveDir: dirname(stylesPath) }
      })
      builder.onLoad({ filter: /useComposerDocking\.js$/ }, () => {
        let source = readFileSync(hookPath, 'utf8')
        const before = source
        source = source.replace(
          'if (suppressRef.current) return',
          'if (false && suppressRef.current) return',
        )
        assert.notEqual(source, before, '反向对照夹具失真：未找到静默窗口判定')
        return { contents: source, loader: 'js', resolveDir: dirname(hookPath) }
      })
    },
  }

  const output = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { SessionGuide } from '${resolve(ROOT, 'plugins/omnimux-inspiration/src/explore/SessionGuide.jsx')}'
        import { createGuideStore } from '${resolve(ROOT, 'plugins/omnimux/src/client/session-guide/state.js')}'
        import { guideZh } from '${resolve(ROOT, 'plugins/omnimux/src/client/session-guide/catalog.js')}'
        import { getGlobalAttachmentStore } from '${resolve(ROOT, 'plugins/omnimux/src/client/attachments/store.ts')}'
        import { installGuideStyles } from '${resolve(ROOT, 'plugins/omnimux/src/client/session-guide/styles.js')}'
        window.__qa = { React, createRoot, SessionGuide, createGuideStore, guideZh, getGlobalAttachmentStore, installGuideStyles }
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

/** 两个库各给足卡片：换库后高度变化才明显，才测得出塌陷。 */
const FIXTURE = {
  assets: {
    path: '/omnimux/assets/library',
    body: {
      assets: Array.from({ length: 24 }, (_, i) => ({ id: `asset_${i}`, name: `资产 ${i + 1}`, type: 'image', url: `/qa/a${i}.jpg` })),
      total: 24,
    },
  },
  inspiration: {
    path: '/omnimux/inspiration/local',
    delayMs: 700,
    body: {
      data: {
        items: Array.from({ length: 3 }, (_, i) => ({ id: `insp_${i}`, title: `灵感 ${i + 1}`, cover_url: `/qa/c${i}.jpg`, source_url: `/qa/v${i}.mp4` })),
        total: 3,
      },
    },
  },
}

const HARNESS = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>tab switch scroll anchor QA</title>
<style>
  html, body { margin: 0; background: #18181b; color: #eee; font: 14px/1.5 -apple-system, sans-serif; }
  [data-phase] { min-height: 100vh; display: block; }
  #scroller { height: 100vh; overflow-y: auto; }
  #guide { padding: 24px; }
  [data-composer-card] { margin: 24px; padding: 16px; border-radius: 16px; background: #26262b; min-height: 96px; border: 1px solid #3a3a40; }
  [data-composer-input] { min-height: 56px; outline: none; }
  #draft { white-space: pre-wrap; color: #c7c7cc; }
  #dock { min-height: 44px; margin-bottom: 8px; }
  .slot { display: inline-flex; align-items: center; height: 44px; padding: 0 10px; border-radius: 8px; background: #3a3a40; color: #e5e5ea; font-size: 12px; }
  /* 卡片高度交给生产样式；这里只给一个底色，让截图看得见卡在哪 */
  .omx-library-flow-cell { background: #2a2a30; border-radius: 10px; }
  .omx-library-flow-cell > * { min-height: 220px; }
</style>
</head>
<body>
  <div id="scroller" data-conversation-scroll>
    <div data-phase="hero" data-omnimux-starter-host>
      <div id="guide"></div>
      <div data-composer-card>
        <div id="dock" data-qa-dock></div>
        <div data-composer-input contenteditable="true"></div>
        <div id="draft"></div>
      </div>
    </div>
  </div>
  <script src="/bundle.js"></script>
  <script>
    window.__qaState = { ready: false, error: null }
    const fixture = ${JSON.stringify(FIXTURE)}
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = String(input && input.url ? input.url : input)
      const hit = Object.values(fixture).find((f) => url.includes(f.path))
      if (hit) {
        const respond = () => new Response(JSON.stringify(hit.body), { status: 200, headers: { 'content-type': 'application/json' } })
        return hit.delayMs ? new Promise((done) => setTimeout(() => done(respond()), hit.delayMs)) : Promise.resolve(respond())
      }
      if (url.includes('/omnimux/templates/creative')) {
        return Promise.resolve(new Response(JSON.stringify({ schemaVersion: 1, dataVersion: 'a'.repeat(64), items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return realFetch(input, init)
    }
    window.__qa.installGuideStyles(document)
    window.__omnimuxActiveSkill = null
    window.__omnimuxAttachments = window.__qa.getGlobalAttachmentStore()
    try {
      const sessionId = 'sess-qa-tab'
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
        inputActions: { setDraft(value) { draft = String(value || ''); renderDock() } },
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
  const b = document.querySelector('[data-primary-tab="${tab}"]')
  if (!b) return { ok: false, error: 'missing tab ${tab}' }
  b.click()
  return { ok: true }
})()`

const CLICK_CARD = `(() => {
  const cell = document.querySelector('.omx-library-flow-cell')
  if (!cell) return { ok: false, error: 'no cell' }
  const target = cell.querySelector('[role="checkbox"], button, [role="button"]') || cell.firstElementChild
  target.click()
  return { ok: true }
})()`

// 滚到最底部：只有贴着底时，内容变矮才会被浏览器夹回去（这才是跳顶的触发条件）
const SCROLL_TO_BOTTOM = `(() => {
  const sc = document.getElementById('scroller')
  sc.scrollTop = sc.scrollHeight
  return { scrollTop: Math.round(sc.scrollTop), max: Math.round(sc.scrollHeight - sc.clientHeight) }
})()`

const READ_GEOMETRY = `(() => {
  const sc = document.getElementById('scroller')
  const bar = document.querySelector('.omnimux-explore-filter-bar')
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scRect = sc.getBoundingClientRect()
  const barRect = bar ? bar.getBoundingClientRect() : null
  return JSON.stringify({
    scrollTop: Math.round(sc.scrollTop),
    scrollHeight: Math.round(sc.scrollHeight),
    clientHeight: Math.round(sc.clientHeight),
    maxScrollTop: Math.round(sc.scrollHeight - sc.clientHeight),
    dockOpen: host ? host.hasAttribute('data-omnimux-dock-open') : false,
    tabBarTop: barRect ? Math.round(barRect.top - scRect.top) : null,
    dockedComposerVisible: (() => {
      const card = document.querySelector('[data-composer-card]')
      if (!card) return false
      const r = card.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight + 1
    })(),
    attachments: [...document.querySelectorAll('[data-qa-attachment]')].length,
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
    '--window-size=1440,900', 'about:blank',
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  return { chrome, socket, send }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true })
  const value = res.result?.value
  // CDP 有时直接把对象按引用回传；统一序列化成字符串，调用方只需 JSON.parse。
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return value
}

/**
 * 走完一轮「滚动 → 吸底 → 切 Tab」，记录切 Tab 前后的滚动几何。
 */
async function runJourney({ send, port }) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await sleep(1200)
  const state = JSON.parse((await evaluate(send, 'JSON.stringify(window.__qaState || {})')) || '{}')
  assert.equal(state.ready, true, `引导未挂载成功: ${state.error || '未就绪'}`)

  // 1. 切到资产库，等卡片到位
  await evaluate(send, CLICK_TAB('assets'))
  await sleep(700)
  const beforeScroll = JSON.parse(await evaluate(send, SCROLL_TO_BOTTOM))
  await sleep(400)
  // 2. 点一张卡：输入框吸底
  const picked = JSON.parse(await evaluate(send, CLICK_CARD))
  assert.equal(picked.ok, true, `资产库卡片点击失败: ${picked.error}`)
  await sleep(800)
  const afterPick = JSON.parse(await evaluate(send, READ_GEOMETRY))

  // 3. 切一级 Tab：这一步是本次修复要守住的动作
  await evaluate(send, CLICK_TAB('inspiration'))
  await sleep(250)
  const duringSwitch = JSON.parse(await evaluate(send, READ_GEOMETRY))
  const probe = JSON.parse(await evaluate(send, `(() => {
    const wrap = document.querySelector('.omnimux-explore-grid-view-wrap')
    return JSON.stringify({
      cards: document.querySelectorAll('.omx-library-flow-cell').length,
      statusText: document.querySelector('.omx-library-flow-status')?.textContent?.trim() || null,
      wrapHeight: wrap ? Math.round(wrap.getBoundingClientRect().height) : null,
      wrapClass: wrap ? wrap.className : null,
      refreshing: wrap ? wrap.getAttribute('data-refreshing') : null,
      shelves: document.querySelectorAll('.omnimux-explore-shelves-view').length,
      shelvesHeight: document.querySelector('.omnimux-explore-shelves-view') ? Math.round(document.querySelector('.omnimux-explore-shelves-view').getBoundingClientRect().height) : null,
    })
  })()`))
  await sleep(1200)
  const afterSwitch = JSON.parse(await evaluate(send, READ_GEOMETRY))

  // 4. 再切二级分类
  const subTabs = await evaluate(send, `(() => {
    const b = document.querySelector('[data-sub-category]:not([data-sub-category="all"])')
    if (!b) return null
    b.click()
    return b.getAttribute('data-sub-category')
  })()`)
  await sleep(1200)
  const afterSub = JSON.parse(await evaluate(send, READ_GEOMETRY))

  return { beforeScroll, afterPick, duringSwitch, afterSwitch, afterSub, subTabs, probe }
}

function judge(journey) {
  const { afterPick, duringSwitch, afterSwitch, afterSub } = journey
  // 「跳顶」的判据：滚动位置塌回接近 0，或 Tab 栏离开视口顶部，或吸底标记丢失。
  const collapsed = (snap) => snap.scrollTop <= 20
  // 容器塌陷是跳顶的直接前因：换库瞬间素材区高度不得跌破半屏。
  const contentCollapsed = (probe) => typeof probe?.wrapHeight === 'number' && probe.wrapHeight < 240
  const barLeftTop = (snap) => snap.tabBarTop !== null && Math.abs(snap.tabBarTop) <= 2
  return [
    { name: 'pick-docks-composer', pass: afterPick.dockOpen === true, actual: afterPick.dockOpen },
    { name: 'pick-scrolled-deep', pass: afterPick.scrollTop > 200, actual: afterPick.scrollTop },
    { name: 'switch-does-not-jump-to-top', pass: !collapsed(duringSwitch) && !collapsed(afterSwitch), duringSwitch: duringSwitch.scrollTop, afterSwitch: afterSwitch.scrollTop },
    { name: 'switch-does-not-collapse-content', pass: !contentCollapsed(journey.probe), wrapHeight: journey.probe?.wrapHeight, cards: journey.probe?.cards },
    { name: 'switch-keeps-tab-bar-at-top', pass: barLeftTop(afterSwitch), actual: afterSwitch.tabBarTop },
    { name: 'switch-keeps-composer-docked', pass: afterSwitch.dockOpen === true, actual: afterSwitch.dockOpen },
    { name: 'switch-keeps-attachment', pass: afterSwitch.attachments >= 1, actual: afterSwitch.attachments },
    { name: 'sub-switch-does-not-jump-to-top', pass: !collapsed(afterSub), actual: afterSub.scrollTop },
    { name: 'sub-switch-keeps-composer-docked', pass: afterSub.dockOpen === true, actual: afterSub.dockOpen },
  ]
}

async function runScenario({ label, bundleText, expectPass, evidenceDir, runId }) {
  const { server, port } = await startServer(bundleText)
  const profileDir = join(ROOT, 'tmp', `tab-switch-chrome-${process.pid}-${runId.slice(0, 8)}-${label}`)
  mkdirSync(profileDir, { recursive: true })
  let chrome = null
  let socket = null
  try {
    const cdp = await openCdp(profileDir)
    chrome = cdp.chrome
    socket = cdp.socket
    const journey = await runJourney({ send: cdp.send, port })
    const assertions = judge(journey)
    const pass = assertions.every((item) => item.pass)

    await evaluate(cdp.send, `(() => { document.querySelector('[data-composer-card]')?.scrollIntoView({ block: 'center' }); return true })()`)
    await sleep(350)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const png = Buffer.from(shot.data, 'base64')
    const decoded = PNG.sync.read(png, { checkCRC: true })
    const shotPath = join(evidenceDir, `${label}.png`)
    writeFileSync(shotPath, png)

    return {
      label,
      pass,
      matchesExpectation: pass === expectPass,
      journey,
      assertions,
      screenshot: { path: shotPath, width: decoded.width, height: decoded.height, bytes: png.length },
    }
  } finally {
    try { socket?.close() } catch {}
    try { chrome?.kill('SIGKILL') } catch {}
    try { server.close() } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  const runId = randomUUID()
  const evidenceDir = join(ROOT, '.workbuddy/evidence/worktree-qa', `tab-switch-scroll-anchor-${runId}`)
  mkdirSync(evidenceDir, { recursive: true })
  const report = { runId, pass: false, assertions: [], errors: [], scenarios: [] }
  try {
    const fixedBundle = await bundle({ mutate: false })
    const controlBundle = await bundle({ mutate: true })

    const fixed = await runScenario({ label: 'fixed', bundleText: fixedBundle, expectPass: true, evidenceDir, runId })
    const control = await runScenario({ label: 'control-before-fix', bundleText: controlBundle, expectPass: false, evidenceDir, runId })
    report.scenarios = [fixed, control]

    report.assertions.push(...fixed.assertions.map((item) => ({ ...item, scenario: 'fixed' })))
    report.assertions.push({
      name: 'negative-control-reproduces-jump',
      pass: control.matchesExpectation && control.pass === false,
      detail: '退回「换库清空卡片 + 不声明静默窗口」后，切 Tab 必须复现跳顶',
      controlAssertions: control.assertions.filter((item) => !item.pass).map((item) => item.name),
    })
    report.assertions.push({ name: 'fixed-scenario-passes', pass: fixed.pass === true })
    report.pass = report.assertions.every((item) => item.pass)
    if (!report.pass) report.errors.push('功能路径断言未全部通过')
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    report.completedAt = new Date().toISOString()
    const json = JSON.stringify(report, null, 2)
    writeFileSync(join(evidenceDir, 'tab-switch-scroll-anchor-qa-report.json'), json)
    mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true })
    writeFileSync(join(ROOT, 'docs/evidence/tab-switch-scroll-anchor-qa-report.json'), json)
    for (const scenario of report.scenarios) {
      if (scenario.screenshot?.path) {
        writeFileSync(join(ROOT, `docs/evidence/tab-switch-scroll-anchor-qa-${scenario.label}.png`), readFileSync(scenario.screenshot.path))
      }
    }
  }

  const failed = report.assertions.filter((item) => !item.pass).map((item) => `${item.name} (${item.scenario || 'control'})`)
  if (report.pass) {
    console.log('✅ PASS 探索模板切 Tab 不跳顶（真实浏览器内核）')
    console.log(`   场景: ${report.scenarios.map((item) => `${item.label}=${item.pass ? 'pass' : 'fail'}`).join(' / ')}`)
    console.log(`   证据: ${evidenceDir}`)
    return
  }
  console.log(`❌ FAIL -> ${[...report.errors, ...failed].join('; ')}`)
  process.exit(1)
}

await main()
