#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DEMO_HTML = join(ROOT, 'docs', 'demos', 'product-media-preview-zoom-demo.html')
const EVIDENCE_DIR = join(ROOT, 'docs', 'evidence', 'product-media-preview-zoom')

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('no Chrome found')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    const record = pending.get(message.id)
    if (!record) return
    pending.delete(message.id)
    if (message.error) record.reject(new Error(message.error.message || 'cdp call failed'))
    else record.resolve(message.result)
  })
  return {
    ready,
    send(method, params = {}, sessionId = undefined) {
      const id = ++nextId
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    },
    close() {
      try { socket.close() } catch {}
    },
  }
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const chrome = findChrome()
  const profileDir = mkdtempSync(join(tmpdir(), 'omnimux-evidence-'))

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--window-size=1200,850',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: 'ignore' })

  let cdp
  try {
    const portFile = join(profileDir, 'DevToolsActivePort')
    for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100)
    if (!existsSync(portFile)) throw new Error('Chrome never opened a debugging port')
    const [port, browserPath] = readFileSync(portFile, 'utf8').split('\n')
    cdp = createCdp(`ws://127.0.0.1:${port}${browserPath}`)
    await cdp.ready

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const send = (method, params) => cdp.send(method, params, sessionId)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 850,
      deviceScaleFactor: 2,
      mobile: false,
    })

    await send('Page.navigate', { url: `file://${DEMO_HTML}` })
    await sleep(800)

    // 状态1：悬停放大浮窗展示
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wrap = document.querySelector('.omnimux-products-thumb-wrap');
        if (wrap) {
          const popover = wrap.querySelector('.omnimux-products-thumb-popover');
          if (popover) {
            popover.style.opacity = '1';
            popover.style.visibility = 'visible';
            popover.style.transform = 'translateY(-50%) scale(1)';
          }
        }
      })()`,
    })
    await sleep(200)

    const shot1 = await send('Page.captureScreenshot', { format: 'png' })
    const p1 = join(EVIDENCE_DIR, 'hover-zoom-preview.png')
    writeFileSync(p1, Buffer.from(shot1.data, 'base64'))
    console.log('✔ Captured:', p1)

    // 状态2：点击第一个缩略图打开大图灯箱
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.omnimux-products-thumb-button');
        if (btn) btn.click();
      })()`,
    })
    await sleep(400)

    const shot2 = await send('Page.captureScreenshot', { format: 'png' })
    const p2 = join(EVIDENCE_DIR, 'lightbox-full-view.png')
    writeFileSync(p2, Buffer.from(shot2.data, 'base64'))
    console.log('✔ Captured:', p2)
  } finally {
    if (cdp) cdp.close()
    child.kill('SIGKILL')
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
