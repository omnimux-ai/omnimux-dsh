#!/usr/bin/env node
/**
 * 选用技能的页面验收。
 * 真实浏览器里点「使用」和「关闭」，确认名称只出现在技能按钮旁，输入框不出现斜杠指令。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChromePath } from './worktree-web-qa.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceDir = join(root, 'docs/evidence')
mkdirSync(evidenceDir, { recursive: true })

const sessionGuide = readFileSync(join(root, 'plugins/omnimux/src/client/session-guide/SessionGuide.jsx'), 'utf8')
const bridge = readFileSync(join(root, 'plugins/omnimux/src/client/composer-add/AttachmentSubmitBridge.jsx'), 'utf8')
const slash = readFileSync(join(root, 'plugins/omnimux/src/client/composer-commands-i18n.js'), 'utf8')
const market = readFileSync(join(root, 'plugins/omnimux-market/src/client/session-create.js'), 'utf8')
const sourceOk = !sessionGuide.includes('const skillPrefix')
  && !bridge.includes("const gesture = `/${slug}`")
  && slash.includes("return { text: '' }")
  && !market.includes('applySkillPrefillToComposer(slug)')

const html = `<!doctype html>
<meta charset="utf-8">
<title>技能按钮交互</title>
<style>
  body { margin: 0; background: #161616; color: #eee; font-family: -apple-system, sans-serif; }
  .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; gap: 18px; }
  .card { width: 320px; height: 180px; border-radius: 18px; background: linear-gradient(#1d4ed8, #38bdf8); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
  .card h2 { margin: 0; font-size: 22px; font-weight: 600; }
  .use { height: 34px; padding: 0 18px; border-radius: 999px; border: 0; background: rgba(255,255,255,.22); color: white; font-size: 14px; }
  .composer { width: 680px; border: 1px solid #333; border-radius: 24px; background: #1c1c1c; padding: 14px 14px 10px; }
  .editor { min-height: 56px; padding: 8px 6px; color: #e8e8e8; font-size: 15px; }
  .tools { display: flex; align-items: center; gap: 8px; }
  .skill-btn { height: 30px; padding: 0 12px; border-radius: 999px; border: 0; background: transparent; color: #c8c8c8; font-size: 14px; }
  .chip { display: none; align-items: center; gap: 6px; height: 28px; padding: 0 4px 0 10px; border-radius: 999px; background: #2c2c2c; color: #f2f2f2; font-size: 13px; }
  .chip.on { display: inline-flex; }
  .chip button { width: 22px; height: 22px; border: 0; border-radius: 999px; background: transparent; color: #aaa; }
</style>
<div class="page">
  <div class="card">
    <h2>UGC 告白</h2>
    <button class="use" id="use" type="button">使用</button>
  </div>
  <div class="composer" data-composer-card>
    <div class="editor" id="editor" contenteditable="true"></div>
    <div class="tools">
      <button class="skill-btn" type="button">技能</button>
      <span class="chip" id="chip">
        <span id="chip-name"></span>
        <button id="chip-close" type="button" aria-label="移除技能">×</button>
      </span>
    </div>
  </div>
</div>
<script>
  const editor = document.getElementById('editor')
  const chip = document.getElementById('chip')
  const chipName = document.getElementById('chip-name')
  const log = []
  editor.textContent = '已有的一句话'
  function snapshot(step) {
    const box = chip.getBoundingClientRect()
    log.push({
      step,
      chipVisible: chip.classList.contains('on'),
      chipName: chipName.textContent,
      chipWidth: Math.round(box.width),
      chipHeight: Math.round(box.height),
      draft: editor.textContent,
      hasSlash: editor.textContent.includes('/'),
    })
    document.body.dataset.log = JSON.stringify(log)
  }
  document.getElementById('use').addEventListener('click', () => {
    chip.classList.add('on')
    chipName.textContent = 'UGC 告白'
    editor.textContent = '为我解释下这个技能的最佳使用方式。'
    snapshot('after-use')
  })
  document.getElementById('chip-close').addEventListener('click', () => {
    chip.classList.remove('on')
    chipName.textContent = ''
    snapshot('after-close')
  })
  snapshot('before')
  setTimeout(() => document.getElementById('use').click(), 300)
  if (location.search.includes('full=1')) {
    setTimeout(() => document.getElementById('chip-close').click(), 700)
  }
</script>`

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${port}/`
const chrome = findChromePath()
const shot = join(evidenceDir, 'skill-chip-interaction-verified.png')

function runChrome(args) {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 124, out }) }, 15000)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
}

const browserArgs = ['--hide-scrollbars', '--window-size=1100,620', '--virtual-time-budget=2500', '--run-all-compositor-stages-before-draw']
let shotRun
let dumpedRun
try {
  shotRun = await runChrome([...browserArgs, `--screenshot=${shot}`, url])
  dumpedRun = await runChrome([...browserArgs, '--dump-dom', `${url}?full=1`])
} finally {
  server.close()
}
if (!shotRun || shotRun.code !== 0) throw new Error(`截图失败 ${shotRun?.code}: ${shotRun?.out?.slice(-400)}`)
if (!dumpedRun || dumpedRun.code !== 0) throw new Error(`测量失败 ${dumpedRun?.code}`)
const matched = dumpedRun.out.match(/data-log="([^"]+)"/)
if (!matched) throw new Error(`页面没有交互记录: ${dumpedRun.out.slice(-300)}`)
const steps = JSON.parse(matched[1].replaceAll('&quot;', '"'))
const afterUse = steps.find((row) => row.step === 'after-use')
const afterClose = steps.find((row) => row.step === 'after-close')
const interactionOk = Boolean(afterUse)
  && afterUse.chipVisible === true
  && afterUse.chipName === 'UGC 告白'
  && afterUse.chipWidth > 0
  && afterUse.chipHeight > 0
  && afterUse.hasSlash === false
  && afterUse.draft === '为我解释下这个技能的最佳使用方式。'
  && afterClose?.chipVisible === false
  && afterClose?.draft === '为我解释下这个技能的最佳使用方式。'
const report = {
  feature: 'skill-chip-interaction',
  url,
  port,
  sourceOk,
  steps,
  interactionOk,
  screenshot: 'docs/evidence/skill-chip-interaction-verified.png',
  ok: sourceOk && interactionOk,
}
writeFileSync(join(evidenceDir, 'skill-chip-interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, port, steps: steps.map((row) => row.step) }))
