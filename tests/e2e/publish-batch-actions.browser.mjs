/**
 * 浏览器预演驱动：图文发布前图片格式校验（Issue #3969）。
 * 用 esbuild 打包真实 Composer + 替身 api，起临时 HTTP 服务，headless Chrome 跑断言并留证。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const EVIDENCE_DIR = join(ROOT, 'docs/evidence')
const OUT_DIR = join(ROOT, 'tmp/publish-batch-actions-qa')

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('no chrome binary found')
}

const THEME_TOKENS = `
:root {
  --dsw-alias-bg-base: #111113;
  --dsw-alias-bg-primary: #141416;
  --dsw-alias-bg-layer-1: rgba(255,255,255,0.04);
  --dsw-alias-bg-layer-2: rgba(255,255,255,0.06);
  --dsw-alias-label-primary: #ffffff;
  --dsw-alias-label-secondary: rgba(255,255,255,0.72);
  --dsw-alias-label-tertiary: rgba(255,255,255,0.40);
  --dsw-alias-border-l1: rgba(255,255,255,0.12);
  --dsw-alias-state-error: #ef4444;
  --dsw-alias-state-error-subtle: rgba(239,68,68,0.12);
  --dsw-alias-state-error-text: #fca5a5;
  --dsw-alias-state-warn: #f59e0b;
  --dsw-alias-state-warn-subtle: rgba(245,158,11,0.12);
  --dsw-alias-state-warn-text: #fbbf24;
  --dsw-alias-state-success: #10b981;
  --dsw-alias-button-primary-fill: #ffffff;
  --dsw-alias-interactive-bg-hover: rgba(255,255,255,0.08);
}
body { margin: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; }
#stage { display: flex; min-height: 100vh; }
.qa-mount { display: flex; flex: 1 1 auto; min-height: 0; }
`

async function bundle() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  await esbuild.build({
    entryPoints: [join(__dirname, 'publish-batch-actions.harness.jsx')],
    outfile: join(OUT_DIR, 'bundle.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
    absWorkingDir: ROOT,
    nodePaths: [join(ROOT, 'node_modules')],
    alias: {
      react: join(ROOT, 'plugins/omnimux-publish/node_modules/react'),
      'react-dom': join(ROOT, 'plugins/omnimux-publish/node_modules/react-dom'),
    },
    plugins: [{
      name: 'mock-api',
      setup(build) {
        build.onResolve({ filter: /(^|\/)api\.js$/ }, () => ({
          path: join(__dirname, 'publish-batch-actions.api-mock.js'),
        }))
      },
    }],
  })
  writeFileSync(
    join(OUT_DIR, 'index.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA #3969</title>
<style>${THEME_TOKENS}</style></head><body><div id="stage"></div>
<script>window.onerror=function(m,s,l){var p=document.createElement('pre');p.id='boot-error';p.textContent='ERR: '+m+' @ '+s+':'+l;document.body.appendChild(p)}</script>
<script src="./bundle.js"></script></body></html>`,
  )
}

function startServer() {
  const server = http.createServer((req, res) => {
    const name = (req.url || '/').split('?')[0]
    const file = name === '/' ? 'index.html' : name.replace(/^\//, '')
    const path = join(OUT_DIR, file)
    if (!existsSync(path)) { res.writeHead(404).end('not found'); return }
    const type = file.endsWith('.js') ? 'text/javascript' : 'text/html'
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
    res.end(readFileSync(path))
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }))
  })
}

function runChrome(chrome, url, args, timeoutMs = 45000) {
  return new Promise((resolvePromise) => {
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', ...args, url], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => { child.kill('SIGKILL') }, timeoutMs)
    child.on('close', (code) => { clearTimeout(timer); resolvePromise({ stdout, stderr, code }) })
  })
}

async function main() {
  await bundle()
  const bundleHash = createHash('sha256').update(readFileSync(join(OUT_DIR, 'bundle.js'))).digest('hex')
  const { server, port } = await startServer()
  const url = `http://127.0.0.1:${port}/`
  const chrome = findChrome()
  const chromeVersion = spawnSync(chrome, ['--version'], { encoding: 'utf8' }).stdout.trim()
  let report
  try {
    const dom = await runChrome(chrome, url, ['--virtual-time-budget=20000', '--timeout=25000', '--dump-dom'], 45000)
    const html = dom.stdout || ''
    console.log('DOM_HAS_BADGE', html.includes('omnimux-publish-media-badge'), 'DOM_HAS_TEXT', html.includes('格式不支持'))
    const match = html.match(/<pre id="qa-report"[^>]*>([\s\S]*?)<\/pre>/)
    if (!match) {
      const bootError = (html.match(/<pre id="boot-error">([\s\S]*?)<\/pre>/) || [])[1] || null
      report = { task: 'Issue #3969', pass: false, error: 'harness did not produce a report', bootError, stderr: dom.stderr.slice(0, 2000) }
    } else {
      const parsed = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
      report = { ...parsed, pass: parsed.failed === 0 }
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    const pngPath = join(EVIDENCE_DIR, 'publish-batch-actions.png')
    await runChrome(chrome, url, [`--screenshot=${pngPath}`, '--window-size=1680,1050', '--virtual-time-budget=20000', '--timeout=25000'], 45000)
    report.screenshot = 'docs/evidence/publish-batch-actions.png'
    report.screenshotBytes = existsSync(pngPath) ? readFileSync(pngPath).length : 0
  } finally {
    server.close()
  }
  report.url = url
  report.chrome = chromeVersion
  report.bundleSha256 = bundleHash
  report.headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  report.ranAt = new Date().toISOString()
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(join(EVIDENCE_DIR, 'publish-batch-actions-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ pass: report.pass, total: report.total, failed: report.failed, screenshotBytes: report.screenshotBytes }, null, 2))
  for (const assertion of report.assertions || []) {
    console.log(`${assertion.pass ? '✅' : '❌'} ${assertion.name}${assertion.detail ? ` — ${assertion.detail}` : ''}`)
  }
  if (!report.pass) process.exitCode = 1
}

await main()
