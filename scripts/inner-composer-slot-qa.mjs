#!/usr/bin/env node
/**
 * 输入框内侧素材卡槽的页面验收。
 * 用真实浏览器量缩略图是否落在输入框卡片内部、文字区上方。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChromePath } from './worktree-web-qa.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'plugins/omnimux/src/client/attachments/styles.css'), 'utf8')
const evidenceDir = join(root, 'docs/evidence')
mkdirSync(evidenceDir, { recursive: true })

const html = `<!doctype html>
<meta charset="utf-8">
<title>素材卡槽位置</title>
<style>
  ${css}
  body { margin: 0; background: #111; color: #eee; font-family: sans-serif; }
  .page { min-height: 100vh; display: flex; align-items: flex-end; justify-content: center; padding: 40px; }
  [data-composer-card] {
    width: 640px; border: 1px solid #3a3a3a; border-radius: 22px; background: #1c1c1c;
    overflow: visible; display: flex; flex-direction: column;
  }
  [data-slot="conversation.input.attachments"] { display: block; }
  .editor { min-height: 72px; padding: 8px 16px 12px; color: #888; }
  .tools { display: flex; align-items: center; gap: 12px; padding: 8px 12px 12px; }
  .plus { width: 28px; height: 28px; border-radius: 999px; border: 1px solid #444; }
  .send { margin-left: auto; width: 32px; height: 32px; border-radius: 999px; background: #2f6bff; }
</style>
<div class="omx-att-card omx-att-card--media" data-outside-decoy="true" style="position:fixed;top:8px;left:8px"></div>
<div class="page">
  <div data-composer-card>
    <div data-slot="conversation.input.attachments">
      <div class="omx-attachment-dock" data-omnimux-attachments-dock="true">
        <div class="omx-attachment-tray" role="list">
          <div class="omx-att-card omx-att-card--media" data-omnimux-attachment-id="wave">
            <div class="omx-att-card__media-frame">
              <img class="omx-att-card__media-thumb" alt="海浪" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%23d36bff'/><circle cx='40' cy='34' r='14' fill='white'/></svg>">
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="editor" data-input-scroll>输入内容</div>
    <div class="tools"><div class="plus"></div><div class="send"></div></div>
  </div>
</div>
<script>
  const cardEl = document.querySelector('[data-composer-card]')
  const card = cardEl.getBoundingClientRect()
  const thumb = cardEl.querySelector('.omx-att-card--media').getBoundingClientRect()
  const editor = document.querySelector('.editor').getBoundingClientRect()
  const outsideCount = [...document.querySelectorAll('.omx-att-card--media')].filter((el) => !cardEl.contains(el)).length
  document.body.dataset.measure = JSON.stringify({
    inside: thumb.top >= card.top - 1 && thumb.bottom <= card.bottom + 1 && thumb.left >= card.left && thumb.right <= card.right,
    aboveText: thumb.bottom <= editor.top + 1,
    width: Math.round(thumb.width),
    height: Math.round(thumb.height),
    outsideCount,
  })
</script>`

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${port}/`
const chrome = findChromePath()
const shot = join(evidenceDir, 'inner-composer-slot-verified.png')

function runChrome(args) {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let settled = false
  child.stdout.on('data', (chunk) => { out += chunk })
  child.stderr.on('data', (chunk) => { out += chunk })
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({ code: 124, out: `${out}\n浏览器超时` })
    }, 15000)
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

const browserArgs = ['--hide-scrollbars', '--window-size=1100,520', '--virtual-time-budget=2000']
let shotRun
let dumpedRun
try {
  shotRun = await runChrome([...browserArgs, `--screenshot=${shot}`, url])
  if (shotRun.code !== 0) throw new Error(`截图失败 ${shotRun.code}: ${shotRun.out.slice(-400)}`)
  dumpedRun = await runChrome([...browserArgs, '--dump-dom', url])
  if (dumpedRun.code !== 0) throw new Error(`测量失败 ${dumpedRun.code}: ${dumpedRun.out.slice(-400)}`)
} finally {
  server.close()
}
const dumped = dumpedRun.out
const matched = dumped.match(/data-measure="([^"]+)"/)
if (!matched) throw new Error(`页面没有量到素材位置: ${dumped.slice(-400)}`)
const measure = JSON.parse(matched[1].replaceAll('&quot;', '"'))
const report = {
  ok: measure.inside === true && measure.aboveText === true && measure.width === 44 && measure.height === 44 && measure.outsideCount === 1,
  measure,
  screenshot: 'docs/evidence/inner-composer-slot-verified.png',
}
writeFileSync(join(evidenceDir, 'inner-composer-slot-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) {
  console.error(report)
  process.exit(1)
}
console.log(JSON.stringify(report))
