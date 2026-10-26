#!/usr/bin/env node
/**
 * #3753 的浏览器实测证据：在市场真实卡片代码上验证 rc.3 阶段读法。
 *
 * 为什么需要它：`tool-views.js` 的 `parseToolArgs` 只在会话内的工具卡片里执行，
 * 侧边栏页面跑不到；而门禁要求界面改动必须有任务专属的实机证据。这里把**真实的**
 * `tool-views.js` fragment 加载进无头 Chrome，在真实浏览器引擎里跑四种输入
 * （preparing / start / settled / settled 无调用头），断言结果并留存截图与结构化报告。
 *
 * 用法：node scripts/market-toolview-phase-evidence.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FRAGMENT = join(ROOT, 'plugins/omnimux-market/src/client/tool-views.js')
const EVIDENCE_DIR = join(ROOT, 'docs/evidence')
const REPORT = join(EVIDENCE_DIR, '3753-market-toolview-phase.json')
const SHOT = join(EVIDENCE_DIR, '3753-market-toolview-phase.png')

const CASES = [
  ['preparing', { block: { kind: 'tool-call', phase: 'preparing' } }, '{}'],
  ['start', { block: { kind: 'tool-call', phase: 'start', argsRaw: '{"query":"视频"}' } }, '{"query":"视频"}'],
  ['settled', { block: { kind: 'tool-result', call: { name: 'search', argsRaw: '{"query":"图像"}' } } }, '{"query":"图像"}'],
  ['settled-no-call', { block: { kind: 'tool-result' } }, '{}'],
]

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
  ].filter(Boolean)
  for (const path of candidates) {
    try { readFileSync(path); return path } catch { /* 继续找下一个 */ }
  }
  throw new Error('找不到 Chrome：设置 CHROME_PATH 或安装 Google Chrome')
}

async function bundlePage() {
  const hubRequire = createRequire(join(ROOT, 'plugins/omnimux/package.json'))
  const { build } = hubRequire('esbuild')
  const result = await build({
    absWorkingDir: ROOT,
    stdin: {
      contents: `
        ${readFileSync(FRAGMENT, 'utf8')}
        globalThis.__parseToolArgs = parseToolArgs
      `,
      resolveDir: join(ROOT, 'plugins/omnimux-market/src/client'),
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  })
  return result.outputFiles[0].text
}

/** 用仓库既有 worktree-web-qa 的同款方式驱动无头 Chrome。 */
async function driveChrome(html) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port

  const chrome = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--window-size=1280,720', 'about:blank',
  ])
  const cdpPort = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('启动无头 Chrome 超时')), 8000)
    chrome.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (match) { clearTimeout(timer); done(Number(match[1])) }
    })
    chrome.on('error', (error) => { clearTimeout(timer); fail(error) })
  })

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const send = (method, params = {}) => new Promise((done, fail) => {
    const current = ++id
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== current) return
      socket.removeEventListener('message', onMessage)
      if (message.error) fail(new Error(`CDP ${method}: ${JSON.stringify(message.error)}`))
      else done(message.result || message)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id: current, method, params }))
  })
  await new Promise((done, fail) => {
    socket.addEventListener('open', done)
    socket.addEventListener('error', fail)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await new Promise((r) => setTimeout(r, 600))

  const evaluated = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(globalThis.__result || {})',
    returnByValue: true,
  })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  socket.close()
  chrome.kill('SIGKILL')
  server.close()
  return { result: JSON.parse(evaluated.result?.value || '{}'), png: Buffer.from(shot.data, 'base64') }
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const bundle = await bundlePage()
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>#3753 market toolview phase</title>
<style>body{background:#0f1117;color:#e2e8f0;font:14px/1.6 -apple-system,sans-serif;padding:24px}
td,th{border:1px solid #2a2f3a;padding:6px 10px;text-align:left}code{color:#8fd3ff}</style></head>
<body><h1>#3753 市场工具卡片 · rc.3 阶段读法</h1>
<table id="t"><thead><tr><th>输入</th><th>parseToolArgs</th><th>期望</th></tr></thead><tbody></tbody></table>
<script>${bundle}</script>
<script>
  const cases = ${JSON.stringify(CASES)};
  const tbody = document.querySelector('#t tbody');
  const out = {};
  for (const [name, props, expected] of cases) {
    let actual;
    try { actual = JSON.stringify(globalThis.__parseToolArgs(props)); }
    catch (error) { actual = 'THREW: ' + error.message; }
    out[name] = { actual, expected };
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + name + '</td><td><code>' + actual + '</code></td><td><code>' + expected + '</code></td>';
    tbody.appendChild(tr);
  }
  globalThis.__result = out;
</script></body></html>`

  const { result, png } = await driveChrome(html)
  writeFileSync(SHOT, png)
  const size = PNG.sync.read(png, { checkCRC: true })

  const assertions = CASES.map(([name, , expected]) => {
    const actual = result[name]?.actual
    return { name: `parseToolArgs:${name}`, pass: actual === expected, actual, expected }
  })

  const report = {
    issue: 3753,
    scenario: 'market-toolview-phase',
    source: 'plugins/omnimux-market/src/client/tool-views.js',
    generatedAt: new Date().toISOString(),
    engine: 'headless Chrome（真实浏览器引擎，加载真实 tool-views.js fragment）',
    assertions,
    screenshot: { path: 'docs/evidence/3753-market-toolview-phase.png', width: size.width, height: size.height, bytes: png.length },
    pass: assertions.every((entry) => entry.pass),
  }
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)

  for (const entry of assertions) {
    assert.equal(entry.pass, true, `${entry.name}: 实际 ${entry.actual}，期望 ${entry.expected}`)
  }
  assert.ok(size.width > 0 && size.height > 0, '截图尺寸为空')
  console.log(`✅ 证据已生成：docs/evidence/3753-market-toolview-phase.json`)
  console.log(`   截图：docs/evidence/3753-market-toolview-phase.png (${size.width}x${size.height}, ${png.length} 字节)`)
  console.log(`   断言：${assertions.filter((entry) => entry.pass).length}/${assertions.length} 通过`)
}

await main()
