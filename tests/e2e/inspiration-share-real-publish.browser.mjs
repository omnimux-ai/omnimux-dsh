#!/usr/bin/env node
/**
 * 真实浏览器验收：灵感分享浮层的「真实阶段进度 → 云端链接」体验（Issue #1978）
 *
 * 与单测/e2e 的分工：两者都在 jsdom 里断言 DOM；本脚本在**工作树内**起一个动态端口
 * 的临时静态服务，用无头 Chrome 真实渲染工作树源码构建出的分享浮层，按下真实点击
 * （分享 → 创建链接），对真实布局做正几何断言并截图留证。随测随清：进程退出即关闭
 * 服务与浏览器。
 *
 * 上游云端用页面内的脚本化同名接口替身（与 Host 契约同形），因此它证明的是"界面如何
 * 展示真实阶段与真实链接"，不证明线上发布本身；线上发布由 docs/evidence 里的联网
 * 实测记录单独佐证。
 *
 * 用法：node tests/e2e/inspiration-share-real-publish.browser.mjs
 * 证据：docs/evidence/inspiration-share-real-publish-verified.json + 同名 PNG
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')
const scratch = join(root, 'tests/e2e/.browser-scratch')
const evidenceDir = join(root, 'docs/evidence')
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** 截图必须是可解码的真实 PNG。 */
function decodePng(bytes) {
  const decoded = PNG.sync.read(Buffer.from(bytes), { checkCRC: true })
  if (!(decoded.width > 0 && decoded.height > 0)) throw new Error('截图尺寸为空')
  return { width: decoded.width, height: decoded.height }
}

/**
 * 夹具入口写在临时目录，但模块解析必须落在真正的客户端源码目录，这样装进去的
 * 是工作树里的真实组件、真实样式与真实文案（不是副本）。
 */
const resolveToClient = {
  name: 'harness-resolves-into-client-src',
  setup(build) {
    build.onResolve({ filter: /^\.\/(styles\.js|locales\.js|InspirationPreviewModal\.jsx)$/ }, (args) => ({
      path: join(clientDir, args.path.slice(2)),
    }))
  },
}

/**
 * 构建工作树源码里的分享浮层（含真实 dsh-ui-kit、真实样式表与真实文案表）。
 * @returns {Promise<string>} 构建产物路径
 */
async function buildHarness() {
  mkdirSync(scratch, { recursive: true })
  const entry = join(scratch, 'harness-entry.jsx')
  writeFileSync(entry, readFileSync(join(here, 'inspiration-share-real-publish.harness.jsx'), 'utf8'))
  const out = join(scratch, 'harness.mjs')
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile: out,
    logLevel: 'silent',
    // The real ui-kit pulls a markdown stylesheet and its fonts; the page runs in
    // a headless browser with no font mounting, so they are dropped rather than
    // copied. The popover's own styles come from the plugin's stylesheet.
    loader: {
      '.css': 'empty',
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.otf': 'empty',
      '.eot': 'empty',
    },
    plugins: [resolveToClient],
  })
  return out
}

/** 临时静态服务：动态端口，返回页面与构建产物。 */
async function serve(files) {
  const server = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(files.html)
      return
    }
    const body = files.assets[path]
    if (!body) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(body)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) }
}

/** 最小 CDP 驱动：动态调试端口、真实导航、DOM 求值、PNG 截图。 */
async function driveChrome(origin) {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,900',
    'about:blank',
  ])
  const cleanup = () => { try { chrome.kill('SIGTERM') } catch { /* 已退出 */ } }
  try {
    const cdpPort = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('chrome-start-timeout')), 20000)
      let buffer = ''
      chrome.stderr.on('data', (chunk) => {
        buffer += chunk.toString()
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer)
        if (match) {
          clearTimeout(timer)
          done(Number(match[1]))
        }
      })
    })

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
    const page = targets.find((target) => target.type === 'page')
    const socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })

    let sequence = 0
    const pending = new Map()
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !pending.has(message.id)) return
      const { done, fail } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) fail(new Error(`cdp ${message.error.message}`))
      else done(message.result)
    }
    const send = (method, params = {}) => new Promise((done, fail) => {
      const id = ++sequence
      pending.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params }))
    })

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) {
        throw new Error(`页面求值失败：${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`)
      }
      return result.result.value
    }

    const screenshot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')

    const waitFor = async (expression, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return true
        await sleep(250)
      }
      return false
    }

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url: `${origin}/` })
    await waitFor('Boolean(window.__ready)')

    return { evaluate, screenshot, waitFor, close: async () => { socket.close(); cleanup() } }
  } catch (error) {
    cleanup()
    throw error
  }
}

async function main() {
  const harness = await buildHarness()
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>灵感分享验收</title>
<style>html,body{margin:0;background:#0b0b0c;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif}
#stage{padding:24px;min-height:100vh}#host{display:block}</style></head>
<body><div id="stage"><div id="host"></div></div>
<script type="module" src="/harness.mjs"></script></body></html>`

  const server = await serve({ html, assets: { '/harness.mjs': readFileSync(harness, 'utf8') } })
  const report = {
    task: 'inspiration-share-real-publish',
    issue: 1978,
    origin: server.origin,
    headSha: null,
    startedAt: new Date().toISOString(),
    assertions: [],
    screenshots: [],
    pass: false,
    errors: [],
  }
  let browser = null
  try {
    report.headSha = (await new Promise((done) => {
      const child = spawn('git', ['-C', root, 'rev-parse', 'HEAD'])
      let out = ''
      child.stdout.on('data', (chunk) => { out += chunk.toString() })
      child.on('close', () => done(out.trim()))
    }))
    browser = await driveChrome(server.origin)
    mkdirSync(evidenceDir, { recursive: true })

    // 场景一：真实阶段进度 → 云端链接
    await browser.evaluate('window.__scenario("success")')
    const clicked = await browser.evaluate('window.__clickShare()')
    report.assertions.push({ name: 'share-popover-opened-by-click', pass: clicked === true })
    const created = await browser.evaluate('window.__clickCreate()')
    report.assertions.push({ name: 'create-link-clicked', pass: created === true })

    const sawProgress = await browser.waitFor("Boolean(document.querySelector('.omnimux-inspiration-share-progress'))")
    // 真实阶段：服务端把行推进到 uploading 之后才截图，不摆拍。
    const reachedUploading = await browser.waitFor(
      "Boolean(document.querySelector('[data-share-step=\"uploading\"][data-share-state=\"active\"]'))",
    )
    const progressState = await browser.evaluate(`JSON.stringify({
      steps: [...document.querySelectorAll('[data-share-step]')].map((el) => ({
        id: el.dataset.shareStep, state: el.dataset.shareState, label: el.textContent.trim(),
      })),
      linkShown: Boolean(document.querySelector('.omnimux-inspiration-share-input')),
      box: (() => { const el = document.querySelector('.omnimux-inspiration-share-progress'); if (!el) return null; const r = el.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) } })(),
    })`)
    report.assertions.push({ name: 'progress-rendered', pass: sawProgress })
    const progress = JSON.parse(progressState)
    report.assertions.push({
      name: 'progress-follows-the-server-stage',
      pass: reachedUploading && progress.steps.some((step) => step.id === 'uploading' && step.state === 'active'),
      steps: progress.steps,
    })
    report.assertions.push({
      name: 'progress-has-positive-geometry',
      pass: Boolean(progress.box) && progress.box.width > 100 && progress.box.height > 20,
      box: progress.box,
    })
    report.assertions.push({ name: 'no-link-while-running', pass: progress.linkShown === false })

    const progressShot = join(evidenceDir, 'inspiration-share-real-publish-progress.png')
    const progressPng = await browser.screenshot()
    writeFileSync(progressShot, progressPng)
    report.screenshots.push({ path: progressShot, ...decodePng(progressPng) })

    const settled = await browser.waitFor("Boolean(document.querySelector('.omnimux-inspiration-share-input'))", 30000)
    const result = await browser.evaluate(`JSON.stringify({
      link: document.querySelector('.omnimux-inspiration-share-input')?.value || '',
      meta: document.querySelector('.omnimux-inspiration-share-meta')?.textContent || '',
      box: (() => { const el = document.querySelector('.omnimux-inspiration-share-link-box'); if (!el) return null; const r = el.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) } })(),
    })`)
    const settledResult = JSON.parse(result)
    report.assertions.push({ name: 'published-link-rendered', pass: settled, ...settledResult })
    report.assertions.push({
      name: 'link-is-the-cloud-url',
      pass: settledResult.link === 'https://omnimux.ai/s/insp_e2e_9f2c41ab',
      link: settledResult.link,
    })
    report.assertions.push({
      name: 'validity-comes-from-expires-in',
      pass: /链接有效期 72 小时/.test(settledResult.meta),
      meta: settledResult.meta,
    })
    report.assertions.push({
      name: 'result-has-positive-geometry',
      pass: Boolean(settledResult.box) && settledResult.box.width > 100 && settledResult.box.height > 20,
      box: settledResult.box,
    })

    const resultShot = join(evidenceDir, 'inspiration-share-real-publish-result.png')
    const resultPng = await browser.screenshot()
    writeFileSync(resultShot, resultPng)
    report.screenshots.push({ path: resultShot, ...decodePng(resultPng) })

    // 场景二：失败时只在浮层内给原因，且不给链接
    await browser.evaluate('window.__scenario("failed")')
    await browser.evaluate('window.__clickShare()')
    await browser.waitFor("Boolean(document.querySelector('.omnimux-inspiration-share-tip.is-error'))")
    const failure = JSON.parse(await browser.evaluate(`JSON.stringify({
      error: document.querySelector('.omnimux-inspiration-share-tip.is-error')?.textContent || '',
      linkShown: Boolean(document.querySelector('.omnimux-inspiration-share-input')),
      retry: document.querySelector('.omnimux-inspiration-share-submit-btn')?.textContent || '',
    })`))
    report.assertions.push({
      name: 'failure-reason-shown-in-popover',
      pass: /网关密钥/.test(failure.error),
      error: failure.error,
    })
    report.assertions.push({ name: 'failure-shows-no-link', pass: failure.linkShown === false })
    report.assertions.push({ name: 'failure-offers-retry', pass: /重新创建链接/.test(failure.retry) })

    const failureShot = join(evidenceDir, 'inspiration-share-real-publish-failure.png')
    const failurePng = await browser.screenshot()
    writeFileSync(failureShot, failurePng)
    report.screenshots.push({ path: failureShot, ...decodePng(failurePng) })

    report.pass = report.assertions.every((assertion) => assertion.pass)
  } catch (error) {
    report.errors.push(error?.message || String(error))
  } finally {
    if (browser) await browser.close()
    await server.close()
    rmSync(scratch, { recursive: true, force: true })
    report.completedAt = new Date().toISOString()
    mkdirSync(evidenceDir, { recursive: true })
    const target = join(evidenceDir, 'inspiration-share-real-publish-verified.json')
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`[inspiration-share] pass=${report.pass} evidence=${target}`)
    for (const assertion of report.assertions) {
      console.log(`  ${assertion.pass ? '✔' : '✖'} ${assertion.name}`)
    }
    if (report.errors.length > 0) console.log(`  errors: ${report.errors.join('; ')}`)
  }
  if (!report.pass) process.exitCode = 1
}

await main()
