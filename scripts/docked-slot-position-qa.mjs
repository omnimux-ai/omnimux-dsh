#!/usr/bin/env node
/**
 * 首页吸底时素材卡槽位置门禁。
 * 真实浏览器内核、动态端口、临时配置、用完即焚。
 * 样式从生产源码整段抽取，不手写补丁。
 * 未注入时必须复现「缩略图留在页面顶部」，否则判定夹具失真。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STYLE_PATH = 'plugins/omnimux/src/client/session-guide/styles.js'

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
  throw new Error('未找到 Chrome')
}

function extractDockStyles(source) {
  const start = source.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = source.indexOf('/* 工作区行留在 Hero')
  assert.ok(start > 0 && end > start, '未能从生产样式抽出吸底规则')
  const css = source.slice(start, end)
  assert.match(css, /\.omx-attachment-dock/)
  assert.match(css, /\.omnimux-trending-undock/)
  return css
}

const HARNESS = `<!doctype html>
<meta charset="utf-8">
<title>docked slot position</title>
<style>
  html, body { margin: 0; background: #111; color: #eee; font: 14px sans-serif; }
  .page { position: relative; height: 1600px; }
  .omx-attachment-dock { box-sizing: border-box; width: 100%; padding: 6px 12px 2px; margin: 0; background: #222; }
  .thumb { width: 44px; height: 44px; border-radius: 8px; background: #c45; }
  [data-composer-card] { box-sizing: border-box; height: 162px; background: #2a2a2e; border-radius: 16px; }
  .omnimux-trending-undock {
    position: fixed; z-index: 46; height: 26px; padding: 0 10px;
    left: calc(var(--omnimux-dock-left, 0px) + var(--omnimux-dock-width, 100%));
    bottom: calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 8px);
    transform: translateX(calc(-100% - 4px));
    background: #333; color: #eee;
  }
</style>
<body>
  <div class="page" data-phase="hero" data-omnimux-starter-host data-omnimux-dock-open
       style="--omnimux-dock-left: 200px; --omnimux-dock-width: 780px; --omnimux-dock-bottom: 20px; --omnimux-dock-card-height: 162px;">
    <div class="omx-attachment-dock" data-omnimux-attachments-dock="true"><div class="thumb"></div></div>
    <button class="omnimux-trending-undock" type="button">收起输入框</button>
    <div style="height: 900px;"></div>
    <div data-composer-card></div>
  </div>
</body>`

function measureExpression() {
  return `(() => {
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const dock = document.querySelector('.omx-attachment-dock');
    const card = document.querySelector('[data-composer-card]');
    const undock = document.querySelector('.omnimux-trending-undock');
    const dockBox = box(dock);
    const cardBox = box(card);
    const undockBox = box(undock);
    const overlaps = !(undockBox.bottom <= dockBox.top || undockBox.top >= dockBox.bottom || undockBox.right <= dockBox.left || undockBox.left >= dockBox.right);
    return JSON.stringify({
      dockPosition: getComputedStyle(dock).position,
      dock: dockBox,
      card: cardBox,
      undock: undockBox,
      gap: Math.round(cardBox.top - dockBox.bottom),
      sameLeft: Math.round(dockBox.left) === Math.round(cardBox.left),
      sameWidth: Math.round(dockBox.width) === Math.round(cardBox.width),
      overlaps,
      viewportHeight: innerHeight,
    });
  })()`
}

function judge(metrics, expectDocked) {
  const above = metrics.dock.bottom <= metrics.card.top
  const near = metrics.gap >= 0 && metrics.gap <= 16
  const aligned = metrics.sameLeft && metrics.sameWidth
  const onScreen = metrics.dock.top >= 0 && metrics.dock.bottom <= metrics.viewportHeight
  const stuckAtPageTop = metrics.dock.top < 40
  const separatedFromCard = metrics.card.top - metrics.dock.bottom > 400
  if (expectDocked) {
    return [
      { name: 'docked-position-fixed', pass: metrics.dockPosition === 'fixed' },
      { name: 'docked-above-composer', pass: above && near },
      { name: 'docked-aligned', pass: aligned },
      { name: 'docked-on-screen', pass: onScreen && !stuckAtPageTop },
      { name: 'undock-not-overlapping', pass: !metrics.overlaps && metrics.undock.bottom <= metrics.dock.top + 1 },
    ]
  }
  return [
    { name: 'inline-not-fixed', pass: metrics.dockPosition !== 'fixed' },
    { name: 'inline-stuck-at-page-top', pass: stuckAtPageTop },
    { name: 'inline-separated-from-card', pass: separatedFromCard },
  ]
}

async function main() {
  const runId = randomUUID()
  const evidenceDir = join(ROOT, '.workbuddy/evidence/worktree-qa', `docked-slot-${runId}`)
  mkdirSync(evidenceDir, { recursive: true })
  const profileDir = join(ROOT, 'tmp', `docked-slot-chrome-${process.pid}-${runId.slice(0, 8)}`)
  const report = { runId, pass: false, assertions: [], errors: [], cleanup: {} }
  let server = null
  let chrome = null
  let socket = null
  try {
    const css = extractDockStyles(readFileSync(join(ROOT, STYLE_PATH), 'utf8'))
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HARNESS)
    })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const port = server.address().port
    mkdirSync(profileDir, { recursive: true })
    chrome = spawn(findChromePath(), [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
      '--window-size=1200,800', 'about:blank',
    ])
    const cdpPort = await new Promise((resolvePort, rejectPort) => {
      const portFile = join(profileDir, 'DevToolsActivePort')
      const timer = setTimeout(() => rejectPort(new Error('浏览器启动超时')), 25000)
      const poll = setInterval(() => {
        try {
          const value = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim())
          if (Number.isInteger(value) && value > 0) {
            clearInterval(poll); clearTimeout(timer); resolvePort(value)
          }
        } catch {}
      }, 120)
    })
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((res) => res.json())
    const page = targets.find((item) => item.type === 'page')
    assert.ok(page?.webSocketDebuggerUrl)
    socket = new WebSocket(page.webSocketDebuggerUrl)
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
    const failPending = (error) => {
      for (const waiter of pending.values()) waiter.reject(error)
      pending.clear()
    }
    socket.addEventListener('close', () => failPending(new Error('浏览器调试连接已关闭')))
    socket.addEventListener('error', () => failPending(new Error('浏览器调试连接失败')))
    const send = (method, params = {}, timeoutMs = 8000) => new Promise((resolveSend, rejectSend) => {
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
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen)
      socket.addEventListener('error', () => rejectOpen(new Error('浏览器调试连接失败')))
    })
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
    const loaded = new Promise((resolveLoaded) => {
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.method === 'Page.loadEventFired') {
          socket.removeEventListener('message', onMessage)
          resolveLoaded()
        }
      }
      socket.addEventListener('message', onMessage)
    })
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
    await Promise.race([
      loaded,
      new Promise((_, rejectLoaded) => setTimeout(() => rejectLoaded(new Error('页面加载超时')), 8000)),
    ])

    const readMetrics = async () => {
      const result = await send('Runtime.evaluate', { expression: measureExpression(), returnByValue: true })
      return JSON.parse(result.result.value)
    }
    const before = await readMetrics()
    const negative = judge(before, false)
    report.assertions.push(...negative)
    assert.ok(negative.every((item) => item.pass), `反向对照失败: ${JSON.stringify(before)}`)

    await send('Runtime.evaluate', {
      expression: `(() => { const node = document.createElement('style'); node.textContent = ${JSON.stringify(css)}; document.head.appendChild(node); return node.textContent.length; })()`,
      returnByValue: true,
    })
    const after = await readMetrics()
    const positive = judge(after, true)
    report.assertions.push(...positive)
    report.before = before
    report.after = after

    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 120, y: 500, width: 980, height: 290, scale: 2 } })
    const bytes = Buffer.from(shot.data, 'base64')
    const decoded = PNG.sync.read(bytes, { checkCRC: true })
    assert.ok(decoded.width > 0 && decoded.height > 0)
    const shotPath = join(evidenceDir, 'docked-slot-above-composer.png')
    writeFileSync(shotPath, bytes)
    report.screenshot = relative(ROOT, shotPath)
    report.pass = positive.every((item) => item.pass)
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    try { socket?.close() } catch {}
    if (chrome && chrome.exitCode === null) {
      try { chrome.kill('SIGTERM') } catch {}
      const exited = await Promise.race([
        new Promise((done) => chrome.once('exit', () => done(true))),
        new Promise((done) => setTimeout(() => done(false), 1000)),
      ])
      if (!exited) {
        try { chrome.kill('SIGKILL') } catch {}
        await new Promise((done) => chrome.once('exit', done))
      }
    }
    if (server) {
      await Promise.race([
        new Promise((done) => server.close(done)),
        new Promise((done) => setTimeout(done, 1000)),
      ])
    }
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error))
    }
    report.cleanup.profileRemoved = !existsSync(profileDir)
    try {
      writeFileSync(join(evidenceDir, 'docked-slot-position-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    } catch (error) {
      report.pass = false
      report.errors.push(error instanceof Error ? error.message : String(error))
      console.error(report.errors.at(-1))
    }
  }
  console.log(JSON.stringify({ pass: report.pass, assertions: report.assertions, after: report.after, errors: report.errors, screenshot: report.screenshot }, null, 2))
  if (!report.pass) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
