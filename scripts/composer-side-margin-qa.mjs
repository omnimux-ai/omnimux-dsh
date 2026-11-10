#!/usr/bin/env node
/**
 * 新会话输入框左右留白对齐门禁（Issue #4028）。
 *
 * 真实 Chromium 内核、动态临时 profile、用完即焚；GUIDE_CSS 整段取自生产源码。
 * 复刻宿主 InputBar 结构：composerHero > InputBarRoot(padding: 0 var(--dsh-composer-side-clearance))
 * > [data-composer-card]；工作区行 heroWorkspaceRow 为 composerHero 的同级元素（不在 padded 根内）。
 *
 * 断言：
 *   1. 280px 窄列（split-compact）：卡片左右各 ≈16px、工作区行左右各 ≈16px，且两者同左缘；
 *   2. 1440px 宽屏：卡片与工作区行宽 ≈680px 且同左缘；
 *   3. 窄列卡片不再因 calc(100% - 24px) 二次收缩出现 ~24px 的双重留白（回退检测）。
 * 任一不成立即失败。证据（PNG 截图 + report.json）落在 .workbuddy/evidence/composer-side-margin/。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function findChromePath() {
  const cands = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const hit = cands.find((c) => existsSync(c))
  if (!hit) throw new Error('未找到 Chrome/Chromium，可用 CHROME_PATH 指定')
  return hit
}

export function fixturePage(width) {
  return `<!doctype html><html data-omnimux-split-compact><meta charset="utf-8">
<style>
:root{--dsh-chat-content-width:680px;--dsh-composer-side-clearance:16px;}
*{box-sizing:border-box}
body{margin:0;background:#111;color:#eee;font:13px sans-serif}
#col{width:${width}px;height:720px;position:relative;background:#1c1c1c;}
#phase{height:100%;display:flex;flex-direction:column;justify-content:flex-end}
[data-composer-seat]{display:flex;flex-direction:column;padding:0}
.q_composerStack{display:flex;flex-direction:column;width:100%}
.q_composerHero{display:flex;flex-direction:column;width:100%}
.q_heroWorkspaceRow{display:flex;align-items:center;height:32px;gap:8px}
.q_heroWorkspaceRow button{height:26px;padding:0 10px;border:1px solid #3a3a3a;border-radius:13px;background:#222;color:#ddd}
.q_InputBarRoot{padding:0 var(--dsh-composer-side-clearance,16px) 4px;display:flex;flex-direction:column;align-items:center;width:100%}
[data-composer-card]{height:150px;min-height:150px;border-radius:16px;background:#2a2a2a;border:1px solid #3a3a3a;display:flex;align-items:flex-start;padding:14px 16px;color:#888}
</style>
<style id="guide"></style>
<body>
<div id="col"><div id="phase" data-phase="hero" data-omnimux-starter-host><div data-composer-seat><div class="q_composerStack q_composerHero"><div class="q_heroWorkspaceRow"><button>社媒运营</button><button>全域社媒操盘手</button></div><div class="q_InputBarRoot"><div data-composer-card>描述你想要构建的内容，/ 调用指令，@ 文件或对话</div></div></div></div></div></div>
<pre id="out"></pre>
</body></html>`
}

export function measureExpression() {
  return `JSON.stringify((()=>{const col=document.getElementById('col').getBoundingClientRect(),card=document.querySelector('[data-composer-card]').getBoundingClientRect(),row=document.querySelector('.q_heroWorkspaceRow').getBoundingClientRect(),r=n=>Math.round(n*10)/10;return{colW:r(col.width),cardL:r(card.left-col.left),cardR:r(col.right-card.right),cardW:r(card.width),rowL:r(row.left-col.left),rowR:r(col.right-row.right),rowW:r(row.width),cardMax:getComputedStyle(document.querySelector('[data-composer-card]')).maxWidth};})())`
}

async function withChrome(fn) {
  const profile = join(ROOT, 'tmp', `composer-margin-chrome-${process.pid}-${randomUUID().slice(0, 8)}`)
  mkdirSync(profile, { recursive: true })
  const chrome = spawn(findChromePath(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1500,900', 'about:blank',
  ])
  try {
    const cdpPort = await new Promise((res, rej) => {
      const f = join(profile, 'DevToolsActivePort')
      const t = setTimeout(() => rej(new Error('浏览器启动超时')), 25000)
      const iv = setInterval(() => {
        try { const v = Number(readFileSync(f, 'utf8').split('\n')[0].trim()); if (v > 0) { clearInterval(iv); clearTimeout(t); res(v) } } catch {}
      }, 120)
    })
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())
    const page = targets.find((x) => x.type === 'page')
    assert.ok(page?.webSocketDebuggerUrl)
    const socket = new WebSocket(page.webSocketDebuggerUrl)
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', (e) => { const m = JSON.parse(e.data); const w = pending.get(m.id); if (!w) return; pending.delete(m.id); m.error ? w.reject(new Error(JSON.stringify(m.error))) : w.resolve(m.result) })
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); socket.send(JSON.stringify({ id: i, method, params })) })
    await new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', () => rej(new Error('CDP 连接失败'))) })
    await send('Page.enable'); await send('Runtime.enable')
    await fn({ send, socket })
    socket.close()
  } finally {
    try { chrome.kill('SIGKILL') } catch {}
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  const runId = randomUUID()
  const evidenceDir = join(ROOT, '.workbuddy/evidence/composer-side-margin', runId)
  mkdirSync(evidenceDir, { recursive: true })
  const report = { runId, pass: false, assertions: [], errors: [], evidence: {} }
  const { GUIDE_CSS } = await import(pathToFileURL(join(ROOT, 'plugins/omnimux/src/client/session-guide/styles.js')).href)
  const htmlDir = join(ROOT, 'tmp', `composer-margin-html-${process.pid}`)
  mkdirSync(htmlDir, { recursive: true })
  try {
    await withChrome(async ({ send }) => {
      for (const width of [280, 1440]) {
        const file = join(htmlDir, `c${width}.html`)
        writeFileSync(file, fixturePage(width).replace('<style id="guide"></style>', `<style id="guide">${GUIDE_CSS}</style>`))
        const url = pathToFileURL(file).href
        await send('Emulation.setDeviceMetricsOverride', { width: Math.max(width + 40, 600), height: 900, deviceScaleFactor: 1, mobile: false })
        await send('Page.navigate', { url })
        await new Promise((r) => setTimeout(r, 500))
        const evalRes = await send('Runtime.evaluate', { expression: measureExpression(), returnByValue: true })
        const m = JSON.parse(evalRes.result.value)
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        const bytes = Buffer.from(shot.data, 'base64')
        const decoded = PNG.sync.read(bytes, { checkCRC: true })
        assert.ok(decoded.width > 0 && decoded.height > 0)
        writeFileSync(join(evidenceDir, `composer-${width}.png`), bytes)
        report.assertions.push({ width, metrics: m, png: `composer-${width}.png` })
        if (width === 280) {
          const ok = Math.abs(m.cardL - 16) <= 1 && Math.abs(m.cardR - 16) <= 1 && Math.abs(m.rowL - 16) <= 1 && Math.abs(m.rowR - 16) <= 1 && Math.abs(m.cardL - m.rowL) <= 1
          assert.ok(ok, `280px 窄列应卡片/行左右各≈16px 且同左缘，实测 ${JSON.stringify(m)}`)
          assert.ok(Math.abs(m.cardL - 24) > 2, '卡片不得回退到 ~24px 双重留白')
        } else {
          const ok = Math.abs(m.cardW - 680) <= 1 && Math.abs(m.rowW - 680) <= 1 && Math.abs(m.cardL - m.rowL) <= 1
          assert.ok(ok, `1440px 宽屏应卡片/行宽≈680px 且同左缘，实测 ${JSON.stringify(m)}`)
        }
      }
    })
    report.pass = true
  } catch (error) {
    report.errors.push(String(error && error.stack || error))
  } finally {
    try { rmSync(htmlDir, { recursive: true, force: true }) } catch {}
  }
  const reportPath = join(evidenceDir, 'report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  if (!report.pass) {
    console.error('❌ composer side margin QA failed:', report.errors.join('\n'))
    process.exit(1)
  }
  console.log('✅ composer side margin QA passed. evidence:', evidenceDir)
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) main()
