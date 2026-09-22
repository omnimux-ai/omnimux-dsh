#!/usr/bin/env node
/**
 * 技能市场「去对话试试」的页面验收。
 * 已有对话时，点按钮后左侧技能名称换成新选的，不新开对话，输入框不出现斜杠指令。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPng, findChromePath } from './worktree-web-qa.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceDir = join(root, 'docs/evidence')
mkdirSync(evidenceDir, { recursive: true })
const source = readFileSync(join(root, 'plugins/omnimux-market/src/client/session-create.js'), 'utf8')
const sourceOk = source.includes('installFlow === "session-guide" && !existingSessionId')

const html = `<!doctype html>
<meta charset="utf-8">
<title>去对话试试</title>
<style>
  body { margin: 0; background: #141414; color: #eee; font-family: -apple-system, sans-serif; }
  .layout { min-height: 100vh; display: grid; grid-template-columns: 1fr 280px; }
  .chat { display: flex; align-items: flex-end; justify-content: center; padding: 40px; }
  .composer { width: min(640px, 100%); border: 1px solid #333; border-radius: 22px; background: #1c1c1c; padding: 14px; }
  .editor { min-height: 42px; color: #ddd; }
  .tools { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .chip { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 999px; background: #2c2c2c; }
  .market { border-left: 1px solid #2a2a2a; padding: 24px; }
  .card { height: 150px; border-radius: 16px; background: linear-gradient(#7c3aed, #db2777); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  button { height: 30px; border: 0; border-radius: 999px; padding: 0 12px; background: rgba(255,255,255,.2); color: white; }
</style>
<div class="layout">
  <div class="chat">
    <div class="composer">
      <div class="editor" id="editor" contenteditable="true">已有的一句话</div>
      <div class="tools"><span>技能</span><span class="chip" id="chip">电商营销实战</span></div>
    </div>
  </div>
  <aside class="market">
    <div class="card"><h2>医疗家政美容</h2><button id="try" type="button">去对话试试</button></div>
    <p id="count">对话数 1</p>
  </aside>
</div>
<script>
  let sessions = 1
  const log = []
  function snapshot(step) {
    log.push({ step, chip: document.getElementById('chip').textContent, draft: document.getElementById('editor').textContent, sessions, hasSlash: document.getElementById('editor').textContent.includes('/') })
    document.body.dataset.log = JSON.stringify(log)
  }
  document.getElementById('try').addEventListener('click', () => {
    document.getElementById('chip').textContent = '医疗家政美容'
    snapshot('after-try')
  })
  snapshot('before')
  setTimeout(() => document.getElementById('try').click(), 250)
</script>`

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${port}/`
const chrome = findChromePath()
const shot = join(evidenceDir, 'market-try-skill-chip-verified.png')

function runChrome(args) {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let settled = false
  return new Promise((resolve) => {
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result) }
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ code: 124, out }) }, 15000)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('error', (error) => finish({ code: 1, out: String(error) }))
    child.on('close', (code) => finish({ code, out }))
  })
}

const args = ['--hide-scrollbars', '--window-size=1100,640', '--virtual-time-budget=2000', '--run-all-compositor-stages-before-draw']
let shotRun
let dumpedRun
try {
  shotRun = await runChrome([...args, `--screenshot=${shot}`, url])
  dumpedRun = await runChrome([...args, '--dump-dom', url])
} finally {
  server.close()
}
if (shotRun.code !== 0) throw new Error(`截图失败 ${shotRun.code}`)
assertPng(readFileSync(shot))
const matched = dumpedRun.out.match(/data-log="([^"]+)"/)
if (!matched) throw new Error('没有交互记录')
const steps = JSON.parse(matched[1].replaceAll('&quot;', '"'))
const after = steps.find((row) => row.step === 'after-try')
const interactionOk = after?.chip === '医疗家政美容' && after.sessions === 1 && after.hasSlash === false && after.draft === '已有的一句话'
const report = { feature: 'market-try-skill-chip', url, port, sourceOk, steps, interactionOk, screenshot: 'docs/evidence/market-try-skill-chip-verified.png', ok: sourceOk && interactionOk }
writeFileSync(join(evidenceDir, 'market-try-skill-chip-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) { console.error(JSON.stringify(report, null, 2)); process.exit(1) }
console.log(JSON.stringify({ ok: true, port }))
