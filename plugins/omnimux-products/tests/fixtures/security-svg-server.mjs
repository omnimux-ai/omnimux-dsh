import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const root = process.cwd()
const require = createRequire(resolve(root, 'package.json'))
const { build } = require('esbuild')
const dir = mkdtempSync(join(tmpdir(), 'security-svg-1973-'))
await build({ entryPoints: [resolve(root, 'plugins/omnimux-workflow/src/workflow/routes/serveFile.ts')], outfile: join(dir, 'serve.mjs'), bundle: true, platform: 'node', format: 'esm' })
const { serveFile } = await import(pathToFileURL(join(dir, 'serve.mjs')))
const { sendPreview: products } = await import(pathToFileURL(resolve(root, 'plugins/omnimux-products/src/http-routes.js')))
const { sendPreview: assets } = await import(pathToFileURL(resolve(root, 'plugins/omnimux-assets/src/http-routes.js')))
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140"><rect width="420" height="140" fill="#edf9ef"/><text id="status" x="20" y="70" fill="#14752b" font-size="24">SVG image visible; script inert</text><script>document.getElementById('status').textContent='SCRIPT EXECUTED';fetch('/executed'+location.search)</script></svg>`
const file = join(dir, 'sample.svg'); writeFileSync(file, svg)
const executed = []
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture')
  if (url.pathname === '/executed') { executed.push(url.search); res.end('ok'); return }
  if (url.pathname === '/state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ executed })); return }
  if (url.pathname === '/control.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end(svg); return }
  if (['/products.svg', '/draft.svg', '/assets.svg'].includes(url.pathname)) { (url.pathname === '/assets.svg' ? assets : products)(res, 200, { absolutePath: file, mime: 'image/svg+xml', size: Buffer.byteLength(svg) }); return }
  if (url.pathname === '/workflow.svg') { serveFile(res, file, 'image/svg+xml', req.headers.range); return }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(`<title>Security SVG acceptance</title><style>body{font:18px system-ui;margin:30px}img,iframe{width:420px;height:140px;border:1px solid #ddd;margin:6px}section{margin-bottom:18px}</style><h1>SVG preview acceptance</h1>${['products','draft','assets','workflow'].map(id => `<section><h2>${id}</h2><img id="${id}-image" src="/${id}.svg?case=${id}-image"><iframe id="${id}-document" src="/${id}.svg?case=${id}-document"></iframe></section>`).join('')}<p><a href="/control.svg?case=positive-control">Positive executable control</a></p>`)
})
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, pid: process.pid, dir })))
const cleanup = () => server.close(() => { rmSync(dir, { recursive: true, force: true }); process.exit(0) })
process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup)
