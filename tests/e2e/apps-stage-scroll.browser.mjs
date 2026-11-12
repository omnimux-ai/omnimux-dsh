/**
 * tests/e2e/apps-stage-scroll.browser.mjs
 *
 * Worktree-isolated real-browser regression for the OmniMux desktop 「开始 (Apps)」
 * page scroll bug. Bundles the harness (which injects the REAL hub CSS), serves
 * it on an ephemeral port, drives headless Chrome, and asserts the plugin card
 * list is clamped inside the viewport, scrolls, and reaches the first and last
 * cards. Mirrors tests/e2e/app-input-exposure.browser.mjs.
 *
 * Usage: node tests/e2e/apps-stage-scroll.browser.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const OUT_DIR = join(ROOT, 'tmp/apps-stage-scroll-qa')

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) if (existsSync(candidate)) return candidate
  throw new Error('no chrome binary found')
}

const THEME_TOKENS = `:root{--dsw-alias-bg-base:#111113;--dsw-alias-bg-primary:#141416;--dsw-alias-label-primary:#fff;--dsw-alias-label-secondary:rgba(255,255,255,.72);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-brand-primary:#3b82f6;}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:13px;}`

async function bundle() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  await esbuild.build({
    entryPoints: [join(__dirname, 'apps-stage-scroll.harness.js')],
    outfile: join(OUT_DIR, 'bundle.js'),
    bundle: true,
    format: 'iife',
    loader: { '.css': 'css', '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
    absWorkingDir: ROOT,
    nodePaths: [join(ROOT, 'node_modules')],
  })
  writeFileSync(
    join(OUT_DIR, 'index.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>apps-stage-scroll QA</title>
<style>${THEME_TOKENS}</style></head><body>
<script>window.onerror=function(m,s,l){var p=document.createElement('pre');p.id='boot-error';p.textContent='ERR: '+m+' @ '+s+':'+l;document.body.appendChild(p)};</script>
<script src="./bundle.js"></script></body></html>`,
  )
}

function startServer() {
  const server = http.createServer((req, res) => {
    const name = (req.url || '/').split('?')[0]
    const file = name === '/' ? 'index.html' : name.replace(/^\//, '')
    const path = join(OUT_DIR, file)
    if (!existsSync(path)) { res.writeHead(404).end('not found'); return }
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
    res.end(readFileSync(path))
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }))
  })
}

function runChrome(chrome, url, args, timeoutMs = 45000) {
  return new Promise((resolvePromise) => {
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', ...args, url], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => { stderr += c })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (code) => { clearTimeout(timer); resolvePromise({ stdout, stderr, code }) })
  })
}

async function main() {
  await bundle()
  const { server, port } = await startServer()
  const url = `http://127.0.0.1:${port}/`
  const chrome = findChrome()
  const chromeVersion = spawnSync(chrome, ['--version'], { encoding: 'utf8' }).stdout.trim()

  let report
  try {
    const dom = await runChrome(chrome, url, ['--virtual-time-budget=20000', '--timeout=25000', '--dump-dom'], 40000)
    const html = dom.stdout || ''
    const match = html.match(/<pre id="qa-report"[^>]*>([\s\S]*?)<\/pre>/)
    if (!match) {
      const bootError = (html.match(/<pre id="boot-error">([\s\S]*?)<\/pre>/) || [])[1] || null
      report = { task: 'apps-stage-scroll', pass: false, error: 'harness produced no report', bootError, exitCode: dom.code, stderr: (dom.stderr || '').slice(0, 2000) }
    } else {
      const parsed = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
      report = { ...parsed, pass: parsed.failed === 0 }
    }
    const pngPath = join(OUT_DIR, 'apps-stage-scroll-qa.png')
    await runChrome(chrome, url, [`--screenshot=${pngPath}`, '--window-size=1280,900', '--virtual-time-budget=20000', '--timeout=25000'], 40000)
    report.screenshot = pngPath
    report.screenshotBytes = existsSync(pngPath) ? readFileSync(pngPath).length : 0
  } finally {
    server.close()
  }

  report.url = url
  report.chrome = chromeVersion
  report.baseSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  report.ranAt = new Date().toISOString()
  writeFileSync(join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

  console.log(JSON.stringify({ pass: report.pass, total: report.total, failed: report.failed, screenshotBytes: report.screenshotBytes }, null, 2))
  for (const a of report.assertions || []) console.log(`${a.pass ? '✅' : '❌'} ${a.name}${a.detail ? ` — ${a.detail}` : ''}`)
  if (!report.pass) { console.error(report.error || ''); process.exitCode = 1 }
}

await main()
