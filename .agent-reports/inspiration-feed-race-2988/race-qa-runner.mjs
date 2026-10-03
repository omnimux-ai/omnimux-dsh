// Issue #2988 worktree browser QA: same page, cloud delayed 1.5s, click 爆款趋势 -> 灵感库.
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const [,, srcRoot, label, outDir] = process.argv
const pluginDir = resolve(srcRoot, 'plugins/omnimux-inspiration')
const wt = resolve('.')
const entry = join(outDir, `entry-${label}.jsx`)
writeFileSync(entry, `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationSection } from '${pluginDir}/src/client/InspirationSection.jsx'
import { zh } from '${pluginDir}/src/client/locales.js'
window.__omnimuxAuth = { ensureLogin() {} }
window.__reqLog = []
const of = window.fetch.bind(window)
window.fetch = (u, o) => { window.__reqLog.push({ t: Math.round(performance.now()), u: String(u) }); return of(u, o) }
createRoot(document.getElementById('root')).render(React.createElement(InspirationSection, { t: (k) => zh[k] || k, active: true }))
`)
const bundle = await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', write: false, logLevel: 'error',
  nodePaths: [join(wt, 'plugins/omnimux-inspiration/node_modules'), join(wt, 'node_modules')],
  alias: { react: join(wt, 'plugins/omnimux-inspiration/node_modules/react'), 'react-dom': join(wt, 'plugins/omnimux-inspiration/node_modules/react-dom') },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'kit', setup(b) { b.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: join(pluginDir, 'src/client/test-fixtures/ui-kit-shim.mjs') })) } }],
})
const js = bundle.outputFiles[0].text
const svg = (c, t) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='270' height='480'><rect width='100%' height='100%' fill='${c}'/><text x='20' y='60' font-size='36' fill='white' font-family='sans-serif'>${t}</text></svg>`)}`
const rows = (p, n, plat, color) => Array.from({ length: n }, (_, i) => ({ id: `${p}-${i + 1}`, title: `${p === 'local' ? '本地灵感' : 'TikTok 爆款'} ${i + 1}`, source_platform: plat, cover_url: svg(color, p === 'local' ? `LOCAL ${i + 1}` : `CLOUD ${i + 1}`), type: 'video' }))
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const json = (b) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)) }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#eee;font-family:sans-serif;margin:16px}[data-inspiration-id]{display:inline-block;margin:6px;vertical-align:top}img{width:135px;height:240px;object-fit:cover}[data-tab][aria-pressed=true]{font-weight:700;text-decoration:underline}</style><div id=root></div><script type=module src=/app.js></script>`) }
  if (url.pathname === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
  if (url.pathname === '/omnimux/inspiration/local') return json({ success: true, data: { items: rows('local', 6, 'local', '#2d6a4f'), total: 6 } })
  if (url.pathname === '/omnimux/inspiration') return setTimeout(() => json({ success: true, data: { items: rows('cloud', 6, 'tiktok', '#9d0208'), total: 40 } }), 1500)
  json({ success: true, data: { items: [], total: 0 } })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const profile = mkdtempSync(join(tmpdir(), 'race-qa-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1100,760', '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
const wsUrl = await new Promise((r) => { let buf = ''; chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\S+)/.exec(buf); if (m) r(m[1]) }) })
const cdpPort = new URL(wsUrl).port
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
let id = 0; const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
await new Promise((r) => (ws.onopen = r))
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.result.data, 'base64')) }
const probe = `(()=>{const a=document.querySelector('[data-tab][aria-pressed="true"]')?.getAttribute('data-tab');const ids=[...document.querySelectorAll('[data-inspiration-id]')].map(e=>e.getAttribute('data-inspiration-id'));return {tab:a,local:ids.filter(i=>i.startsWith('local')).length,cloud:ids.filter(i=>i.startsWith('cloud')).length}})()`
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('[data-tab="local"]')`)); i++) await sleep(100)
await ev(`document.querySelector('[data-tab="public"]').click()`)
await sleep(300)
const t0 = Date.now()
await ev(`window.__switchAt=performance.now();document.querySelector('[data-tab="local"]').click()`)
const samples = []; let last = ''
while (Date.now() - t0 < 4000) { const p = JSON.stringify(await ev(probe)); if (p !== last) { samples.push({ ms: Date.now() - t0, ...JSON.parse(p) }); last = p } if (Date.now() - t0 > 400 && Date.now() - t0 < 500 && !samples.shot1) { await shot(join(outDir, `${label}-1-after-switch.png`)); samples.shot1 = true } await sleep(50) }
await shot(join(outDir, `${label}-2-after-cloud-landed.png`))
const reqLog = await ev(`window.__reqLog.filter(r=>/\\/omnimux\\/inspiration(\\/local)?\\?/.test(r.u)).map(r=>({t:r.t,u:r.u.replace(/\\?.*/,'')}))`)
const final = await ev(probe)
const reqCount = reqLog.reduce((m, r) => ((m[r.u] = (m[r.u] || 0) + 1), m), {})
const report = { label, srcRoot, serverPort: port, cdpPort, timeline: samples, final, requestCounts: reqCount, pass: final.tab === 'local' && final.cloud === 0 && final.local > 0 }
writeFileSync(join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1))
ws.close(); chrome.kill('SIGKILL'); server.close(); rmSync(profile, { recursive: true, force: true })
process.exit(0)
