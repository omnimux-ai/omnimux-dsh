#!/usr/bin/env node
/**
 * 新会话引导页工作区行对齐门禁（Issue #3868）。
 *
 * 真实浏览器内核、动态端口、临时配置、用完即焚；两份样式整段取自生产源码：
 *   - plugins/omnimux/src/client/session-guide/styles.js        （GUIDE_CSS，starter 引导页）
 *   - plugins/omnimux/src/client/composer-compact.js            （COMPOSER_COMPACT_CSS，通用 Hero）
 *
 * 两份样式由不同插件注入（omnimux-inspiration / omnimux hub），跨包注入顺序无保证，
 * 且两条工作区行规则同为 !important。本门禁同一页面内按两种注入顺序实测：
 *   1. 反向对照：把 starter 规则的 [data-phase] 复合条件去掉（修复前形态），
 *      在「通用规则后注入」顺序下必须复现行宽 920 / 左移约 120px 的错位；
 *   2. 正向：修复后的生产样式在「先 guide 后通用」和「先通用后 guide」两种顺序下
 *      都必须让工作区行与输入框卡片同宽（680）、同左缘。
 *
 * 任一步不成立即门禁失败（反向对照失败表示夹具失真，不能算正向通过）。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GUIDE_PATH = 'plugins/omnimux/src/client/session-guide/styles.js'
const COMPACT_PATH = 'plugins/omnimux/src/client/composer-compact.js'
const STARTER_COMPOUND = '[data-phase][data-omnimux-starter-host]'
const PLAIN_STARTER = '[data-omnimux-starter-host]'

function findChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error('未找到 Chrome：请安装 Chrome/Chromium，或用 CHROME_PATH 指定可执行文件')
}

/** 修复前形态：去掉 starter 行规则的 [data-phase] 复合条件。 */
export function legacyGuideCss(guideCss) {
  return guideCss.split(STARTER_COMPOUND).join(PLAIN_STARTER)
}

/**
 * 夹具：official-ish 的会话 DOM + 覆盖尺寸计算所需 CSS 变量。
 * GUIDE_CSS / COMPOSER_COMPACT_CSS 由页面里的 <style> 节点注入，顺序由用例控制。
 */
export function buildHarnessHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<title>starter workspace row align</title>
<style>
  :root {
    --dsh-chat-content-width: 920px;
    --dsh-composer-side-clearance: 16px;
  }
  html, body { margin: 0; background: #141414; color: #eee; font: 14px sans-serif; }
  .harness { width: 1440px; margin: 0 auto; }
  .q_composerStack.q_composerHero { display: flex; flex-direction: column; gap: 8px; }
  .q_heroWorkspaceRow { display: flex; align-items: center; gap: 8px; height: 32px; }
  .q_heroWorkspaceRow > button { height: 32px; padding: 0 12px; border: 1px solid #3a3a3a; border-radius: 16px; background: #222; color: #eee; }
  [data-composer-card] { height: 120px; border-radius: 16px; background: #222; box-sizing: border-box; }
</style>
<body>
  <div class="harness">
    <div data-phase="hero" data-omnimux-starter-host>
      <div class="q_composerStack q_composerHero">
        <div class="q_heroWorkspaceRow">
          <button type="button">browser-sessions</button>
          <button type="button">全域社媒操盘手</button>
        </div>
        <div data-composer-card></div>
      </div>
    </div>
  </div>
</body>`
}

/** 页面内测量表达式：行与卡片几何 + 计算后的 max-width。 */
export function measureExpression() {
  return `JSON.stringify((() => {
    const pick = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        maxWidth: getComputedStyle(node).maxWidth,
      };
    };
    const row = document.querySelector('[class*="heroWorkspaceRow"]');
    const card = document.querySelector('[data-composer-card]');
    const rowBox = pick(row);
    const cardBox = pick(card);
    return {
      row: rowBox,
      card: cardBox,
      widthDelta: Math.round(Math.abs(rowBox.width - cardBox.width) * 100) / 100,
      leftDelta: Math.round(Math.abs(rowBox.left - cardBox.left) * 100) / 100,
      rowMaxWidth: rowBox.maxWidth,
    };
  })())`
}

const STYLE_IDS = { guide: 'omnimux-session-guide-style', compact: 'omnimux-composer-compact-chrome' }

function setSheet(send, id, css, afterId = null) {
  return send('Runtime.evaluate', {
    expression: `(() => {
      let node = document.getElementById(${JSON.stringify(id)});
      if (!node) { node = document.createElement('style'); node.id = ${JSON.stringify(id)}; }
      node.textContent = ${JSON.stringify(css)};
      const after = ${afterId === null ? 'null' : `document.getElementById(${JSON.stringify(afterId)})`};
      if (after) after.after(node); else document.head.append(node);
      return node.id;
    })()`,
    returnByValue: true,
  })
}

function judge(metrics) {
  const widthAligned = metrics.widthDelta <= 1
  const leftAligned = metrics.leftDelta <= 1
  // 计算后的 max-width 可能是解析值，也可能保留 min() 表达式（Chromium 不展开 calc 里的 min）。
  const resolved = Number.parseFloat(metrics.rowMaxWidth)
  const capped = (Number.isFinite(resolved) && resolved >= 679 && resolved <= 681)
    || /min\(680px/.test(String(metrics.rowMaxWidth))
  return { widthAligned, leftAligned, capped }
}

async function main() {
  const runId = randomUUID()
  const evidenceDir = join(ROOT, '.workbuddy/evidence/starter-row-align-qa', runId)
  mkdirSync(evidenceDir, { recursive: true })
  const profileDir = join(ROOT, 'tmp', `starter-row-align-chrome-${process.pid}-${runId.slice(0, 8)}`)
  const report = { runId, pass: false, assertions: [], errors: [], cleanup: {}, evidence: {} }
  let server = null
  let chrome = null
  let socket = null
  try {
    // 直接 import 生产模块拿到已求值的 CSS 常量（含 ${...} 插值），不用正则抠模板原文。
    const [{ GUIDE_CSS: guideCss }, { COMPOSER_COMPACT_CSS: compactCss }] = await Promise.all([
      import(pathToFileURL(join(ROOT, GUIDE_PATH)).href),
      import(pathToFileURL(join(ROOT, COMPACT_PATH)).href),
    ])
    const fixedGuide = guideCss
    const legacyGuide = legacyGuideCss(guideCss)
    assert.notEqual(legacyGuide, fixedGuide, '反向对照必须真的去掉 [data-phase] 复合条件')

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buildHarnessHtml())
    })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const port = server.address().port
    mkdirSync(profileDir, { recursive: true })
    chrome = spawn(findChromePath(), [
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
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
    const capturePng = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const bytes = Buffer.from(shot.data, 'base64')
      const decoded = PNG.sync.read(bytes, { checkCRC: true })
      assert.ok(decoded.width > 0 && decoded.height > 0, '截图必须是可解码的真实 PNG')
      const target = join(evidenceDir, name)
      writeFileSync(target, bytes)
      return { path: relative(ROOT, target), width: decoded.width, height: decoded.height, bytes: bytes.length }
    }

    // 1) 反向对照：修复前形态 +「通用规则后注入」必须复现错位（夹具保真）。
    await setSheet(send, STYLE_IDS.guide, legacyGuide)
    await setSheet(send, STYLE_IDS.compact, compactCss, STYLE_IDS.guide)
    const bug = await readMetrics()
    const bugReproduced = bug.widthDelta >= 100 && Math.round(bug.row.width) >= 900
    report.assertions.push({ name: 'fixture-reproduces-prefix-bug', pass: bugReproduced, metrics: bug })
    report.prefixBug = bug
    report.evidence.bugPng = await capturePng('prefix-bug.png')

    // 2) 正向顺序 A：通用规则先注入、生产 GUIDE 后注入（历史上输掉的顺序）。
    await setSheet(send, STYLE_IDS.compact, compactCss)
    await setSheet(send, STYLE_IDS.guide, fixedGuide, STYLE_IDS.compact)
    const fixedA = await readMetrics()
    const judgeA = judge(fixedA)
    report.assertions.push({
      name: 'composer-first-guide-last-aligned',
      pass: judgeA.widthAligned && judgeA.leftAligned && judgeA.capped,
      metrics: fixedA,
    })
    report.fixedComposerFirst = fixedA
    report.evidence.composerFirstPng = await capturePng('composer-first.png')

    // 3) 正向顺序 B：生产 GUIDE 先注入、通用规则后注入。
    await setSheet(send, STYLE_IDS.guide, fixedGuide)
    await setSheet(send, STYLE_IDS.compact, compactCss, STYLE_IDS.guide)
    const fixedB = await readMetrics()
    const judgeB = judge(fixedB)
    report.assertions.push({
      name: 'guide-first-composer-last-aligned',
      pass: judgeB.widthAligned && judgeB.leftAligned && judgeB.capped,
      metrics: fixedB,
    })
    report.fixedGuideFirst = fixedB
    report.evidence.guideFirstPng = await capturePng('guide-first.png')

    assert.ok(
      report.assertions.every((item) => item.pass),
      `门禁断言失败: ${JSON.stringify(report.assertions.filter((item) => !item.pass))}`,
    )
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
      report.cleanup.chromeProfile = 'removed'
    } catch {
      report.cleanup.chromeProfile = 'remove-failed'
    }
    report.cleanup.chromeStopped = chrome ? chrome.exitCode !== null : true
    // 用完即焚必须计入通过条件：临时 profile 未删或 Chrome 未停都不算通过。
    report.cleanupOk = report.cleanup.chromeProfile === 'removed' && report.cleanup.chromeStopped === true
    report.pass = report.errors.length === 0 && report.assertions.length > 0
      && report.assertions.every((item) => item.pass) && report.cleanupOk
    const reportPath = join(evidenceDir, 'report.json')
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
    console.log(`${report.pass ? '✅' : '❌'} starter workspace row align QA`)
    for (const item of report.assertions) {
      console.log(`   ${item.pass ? 'PASS' : 'FAIL'} ${item.name}`)
    }
    if (!report.pass) console.log(`   errors: ${report.errors.join('; ')}`)
    console.log(`   evidence: ${relative(ROOT, reportPath)}`)
    if (report.evidence?.bugPng) console.log(`   png: ${report.evidence.bugPng.path}, ${report.evidence.guideFirstPng?.path}, ${report.evidence.composerFirstPng?.path}`)
    process.exitCode = report.pass ? 0 : 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
