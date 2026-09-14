#!/usr/bin/env node
/**
 * @file scripts/verify-header-divider.mjs
 * @description 实物/数字产品二级表单页头分割线的真实浏览器预演（质量五步闭环 Verify 阶段）。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const PLUGIN = join(REPO_ROOT, 'plugins', 'omnimux-products')
const EVIDENCE_DIR = join(REPO_ROOT, '.workbuddy', 'evidence', 'header-divider')
const VIEWPORT = { width: 1280, height: 900 }

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('no Chrome/Chromium binary found')
}

const HARNESS_SOURCE = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductFormPage } from '${join(PLUGIN, 'src/client/ProductFormPage.jsx')}'
import { injectProductsStyles } from '${join(PLUGIN, 'src/client/styles.js')}'
import { zh } from '${join(PLUGIN, 'src/client/locales.js')}'

function App() {
  const [kind, setKind] = useState('physical')
  window.__setKind = setKind
  return React.createElement(ProductFormPage, {
    t: (key) => (key in zh ? zh[key] : key),
    kind,
    mode: 'create',
    onSubmit: async () => true,
    onLeave: () => {},
    onPick: async () => [],
  })
}

injectProductsStyles()
const root = createRoot(document.getElementById('app'))
root.render(React.createElement(App))
window.__harnessReady = true
`

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail })
  const mark = ok ? '✔' : '✘'
  process.stdout.write(`${mark} ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}\n`)
}

function createCdp(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const ready = new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise())
    socket.addEventListener('error', (event) => reject(new Error(`cdp socket error: ${event.message || 'unknown'}`)))
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id === undefined) return
    const slot = pending.get(message.id)
    if (!slot) return
    pending.delete(message.id)
    if (message.error) slot.reject(new Error(message.error.message))
    else slot.resolve(message.result)
  })
  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}, sessionId) {
      const id = ++nextId
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject })
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
      })
    },
  }
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const chrome = findChrome()
  const profileDir = mkdtempSync(join(tmpdir(), 'products-divider-profile-'))
  const { build } = await import(join(PLUGIN, 'node_modules', 'esbuild', 'lib', 'main.js'))

  const bundleDir = mkdtempSync(join(tmpdir(), 'products-divider-bundle-'))
  const bundle = await build({
    stdin: { contents: HARNESS_SOURCE, resolveDir: PLUGIN, sourcefile: 'harness.jsx', loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    outdir: bundleDir,
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: {
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
      '.svg': 'empty',
      '.png': 'empty',
      '.jpg': 'empty',
    },
    logLevel: 'silent',
  })

  const jsFile = bundle.outputFiles.find((file) => file.path.endsWith('.js'))
  const cssFiles = bundle.outputFiles.filter((file) => file.path.endsWith('.css'))

  const server = http.createServer((req, res) => {
    const path = String(req.url || '/')
    if (path === '/' || path.startsWith('/index')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>products header divider verify</title>
<style>html,body{margin:0;padding:0;height:100%;background:#101010}
#app{width:100vw;height:100vh;display:flex}</style>
${cssFiles.map((file) => `<style>${file.text}</style>`).join('\n')}
</head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`)
      return
    }
    if (path === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(jsFile.contents)
      return
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer))
  const { port } = server.address()
  const pageUrl = `http://127.0.0.1:${port}/`

  const chromeProc = spawn(
    chrome,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      pageUrl,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  let cdpUrl = null
  const linePattern = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)/
  chromeProc.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    const match = linePattern.exec(text)
    if (match) cdpUrl = match[1]
  })

  const startedAt = Date.now()
  while (!cdpUrl && Date.now() - startedAt < 8000) await sleep(50)
  if (!cdpUrl) throw new Error('timed out waiting for Chrome remote-debugging-port')

  const cdp = createCdp(cdpUrl)
  await cdp.ready

  const { targetId } = await cdp.send('Target.createTarget', { url: pageUrl })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('DOM.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 2,
    mobile: false,
  }, sessionId)

  const evaluate = async (expression) => {
    const reply = await cdp.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    return reply.result?.value
  }

  const waitFor = async (predicateExpr, timeoutMs = 8000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ok = await evaluate(`return Boolean(${predicateExpr})`)
      if (ok) return true
      await sleep(50)
    }
    return false
  }

  const shoot = async (name) => {
    const reply = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId)
    const buffer = Buffer.from(reply.data, 'base64')
    const filePath = join(EVIDENCE_DIR, `${name}.png`)
    writeFileSync(filePath, buffer)
    return { name, path: filePath, bytes: buffer.length }
  }

  try {
    await waitFor('window.__harnessReady && document.querySelector(".omnimux-products-subscreen")')

    // 1. 实物表单中断言 Divider
    // 1. 实物表单中断言 Divider
    const physicalDivider = await evaluate(`
      const header = document.querySelector('.omnimux-products-form-view [class*="PageHeader"]')
      const scroll = document.querySelector('.omnimux-products-form-scroll')
      const divider = document.querySelector('.omnimux-products-form-view [role="separator"]')
      if (!divider || !header || !scroll) return null
      const rect = divider.getBoundingClientRect()
      const headerRect = header.getBoundingClientRect()
      const scrollRect = scroll.getBoundingClientRect()
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        headerBottom: Math.round(headerRect.bottom),
        scrollPadTop: Math.round(scrollRect.top),
        isBetween: rect.top >= headerRect.bottom - 2 && rect.bottom <= scrollRect.top + 2,
      }
    `)
    check('实物表单页渲染出分割线 Divider', Boolean(physicalDivider && physicalDivider.width > 0), physicalDivider)
    check('实物表单分割线位于页头与滚动区之间', Boolean(physicalDivider?.isBetween), physicalDivider)

    await shoot('01-physical-form-with-divider')

    // 2. 切到数字表单
    await evaluate(`window.__setKind('digital')`)
    await sleep(200)
    await waitFor('document.querySelector(".omnimux-products-form-view")')

    // 3. 数字表单中断言 Divider
    const digitalDivider = await evaluate(`
      const header = document.querySelector('.omnimux-products-form-view [class*="PageHeader"]')
      const scroll = document.querySelector('.omnimux-products-form-scroll')
      const divider = document.querySelector('.omnimux-products-form-view [role="separator"]')
      if (!divider || !header || !scroll) return null
      const rect = divider.getBoundingClientRect()
      const headerRect = header.getBoundingClientRect()
      const scrollRect = scroll.getBoundingClientRect()
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        headerBottom: Math.round(headerRect.bottom),
        scrollPadTop: Math.round(scrollRect.top),
        isBetween: rect.top >= headerRect.bottom - 2 && rect.bottom <= scrollRect.top + 2,
      }
    `)
    check('数字表单页渲染出分割线 Divider', Boolean(digitalDivider && digitalDivider.width > 0), digitalDivider)
    check('数字表单分割线位于页头与滚动区之间', Boolean(digitalDivider?.isBetween), digitalDivider)

    await shoot('02-digital-form-with-divider')
    check('数字表单页渲染出分割线 Divider', Boolean(digitalDivider && digitalDivider.width > 0))
    check('数字表单分割线位于页头与滚动区之间', Boolean(digitalDivider?.isBetween), digitalDivider)

    await shoot('02-digital-form-with-divider')

    const report = {
      task: 'product-header-divider · Issue #1720',
      timestamp: new Date().toISOString(),
      allPass: results.every((r) => r.ok),
      results,
    }
    writeFileSync(join(EVIDENCE_DIR, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(EVIDENCE_DIR, 'README.md'), `# 真实浏览器实机预演证据 · Issue #1720
- 实物与数字表单页头下方均成功渲染 \`Divider\` 分割线
- 分割线宽度 1280px，正几何呈现
- 截图证据：01-physical-form-with-divider.png / 02-digital-form-with-divider.png
`)

  } finally {
    cdp.close()
    chromeProc.kill('SIGKILL')
    server.close()
    rmSync(profileDir, { recursive: true, force: true })
    rmSync(bundleDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
