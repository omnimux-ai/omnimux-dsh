#!/usr/bin/env node
/**
 * Controlled runner for extension end-to-end checks (issue #3536).
 *
 * Why this exists: ego lite is a fixed Chromium and cannot load an unpacked
 * extension, so extension e2e still needs a real Chrome. What must not happen is
 * the old ad-hoc pattern — one fresh Chrome per scenario, a throwaway /tmp
 * script, and no cleanup when an assertion throws. That pattern flashes the Dock
 * and leaks orphan browsers.
 *
 * Contract (docs/contracts/plugin-qa.md): one browser process per run, every
 * scenario reuses that browser through Target.createTarget, and close() always
 * kills the process and removes the temporary profile.
 *
 * Library use:
 *   const browser = await launchExtensionBrowser({ extensionDir })
 *   try {
 *     const page = await browser.newPage('https://example.com')
 *     await page.waitFor('document.readyState === "complete"')
 *     const title = await page.evaluate('document.title')
 *     await page.screenshot('/tmp/shot.png')
 *     await page.close()
 *   } finally {
 *     await browser.close()
 *   }
 *
 * Self-test: node scripts/lib/extension-e2e.mjs --self-test
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const DEFAULT_EXTENSION_DIR = join(REPO_ROOT, 'plugins', 'omnimux-browser', 'extension', 'dist')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

export function findChrome() {
  const explicit = process.env.CHROME_PATH
  if (explicit && existsSync(explicit)) return explicit
  // Branded Chrome 137+ ignores --load-extension; Chrome for Testing still loads
  // unpacked extensions, so it is the preferred extension host when present.
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache).sort().reverse()) {
      if (!entry.startsWith('chromium-')) continue
      const candidate = join(cache, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      if (existsSync(candidate)) return candidate
    }
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    '未找到 Chrome/Chromium。扩展 e2e 需要真实 Chrome（ego 不能加载未打包扩展）：设置 CHROME_PATH，或安装 Google Chrome / Chrome for Testing。',
  )
}

/** Unpacked extension id: sha256(absolute path) hex, mapped 0-f to a-p. */
export function expectedExtensionId(extensionDir) {
  return [...createHash('sha256').update(resolve(extensionDir)).digest('hex').slice(0, 32)]
    .map((char) => String.fromCharCode(97 + parseInt(char, 16)))
    .join('')
}

class CdpSocket {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    this.listeners = new Map()
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message || 'cdp call failed'))
        else entry.resolve(message.result)
        return
      }
      for (const handler of this.listeners.get(message.method) || []) handler(message.params)
    })
  }

  static async open(url, timeoutMs = 15_000) {
    const socket = new WebSocket(url)
    await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`cdp socket did not open in ${timeoutMs}ms`)), timeoutMs)
      socket.addEventListener('open', () => { clearTimeout(timer); done() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); fail(new Error('cdp socket error')) }, { once: true })
    })
    return new CdpSocket(socket)
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.socket.send(JSON.stringify(payload))
    return new Promise((done, fail) => this.pending.set(id, { resolve: done, reject: fail }))
  }

  on(method, handler) {
    const list = this.listeners.get(method) || []
    list.push(handler)
    this.listeners.set(method, list)
  }

  close() {
    try { this.socket.close() } catch {}
  }
}

export async function launchExtensionBrowser(options = {}) {
  const extensionDir = resolve(options.extensionDir || DEFAULT_EXTENSION_DIR)
  if (!existsSync(join(extensionDir, 'manifest.json'))) {
    throw new Error(`扩展目录无效（缺少 manifest.json）：${extensionDir}。请先构建 extension/dist。`)
  }
  const width = options.width ?? 1280
  const height = options.height ?? 800
  const deviceScaleFactor = options.deviceScaleFactor ?? 1
  const chromePath = options.chromePath || findChrome()
  const profileDir = mkdtempSync(join(tmpdir(), 'omnimux-ext-e2e-'))
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--load-extension=${extensionDir}`,
    `--disable-extensions-except=${extensionDir}`,
    `about:blank`,
  ]
  if (/for Testing/i.test(chromePath)) args.splice(5, 0, '--enable-unsafe-extension-debugging')

  const chrome = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const state = {
    spawnCount: 1,
    pid: chrome.pid,
    closed: false,
    profileDir,
    chromePath,
    stderr: '',
  }
  const killChrome = () => {
    try { if (chrome.exitCode === null) chrome.kill('SIGKILL') } catch {}
  }
  const processExitHook = () => {
    killChrome()
    try { rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
  process.once('exit', processExitHook)

  let cdp = null
  try {
    chrome.stderr.on('data', (chunk) => {
      state.stderr += chunk.toString()
      if (state.stderr.length > 20_000) state.stderr = state.stderr.slice(-20_000)
    })
    const portFile = join(profileDir, 'DevToolsActivePort')
    const deadline = Date.now() + 20_000
    let wsUrl = ''
    while (Date.now() < deadline) {
      if (existsSync(portFile)) {
        const [port, browserPath] = readFileSync(portFile, 'utf8').split('\n')
        if (Number(port) > 0) {
          wsUrl = `ws://127.0.0.1:${port}${browserPath || '/devtools/browser'}`
          break
        }
      }
      if (chrome.exitCode !== null) throw new Error(`Chrome 提前退出（code ${chrome.exitCode}）\n${state.stderr.slice(-2000)}`)
      await sleep(100)
    }
    if (!wsUrl) throw new Error(`Chrome 未暴露调试端点\n${state.stderr.slice(-2000)}`)
    cdp = await CdpSocket.open(wsUrl)
    await cdp.send('Target.setDiscoverTargets', { discover: true })

    const pages = new Set()
    async function newPage(url = 'about:blank') {
      // Extension pages must be opened as the target URL: navigating a normal tab
      // to chrome-extension:// is restricted to web-accessible resources.
      const { targetId } = await cdp.send('Target.createTarget', { url })
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
      const send = (method, params) => cdp.send(method, params, sessionId)
      await send('Page.enable')
      await send('Runtime.enable')
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false })
      const page = {
        targetId,
        async evaluate(expression) {
          const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
          if (result.exceptionDetails) {
            const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text
            throw new Error(`evaluate failed: ${detail}`)
          }
          return result.result ? result.result.value : undefined
        },
        async waitFor(expression, { timeoutMs = 15_000 } = {}) {
          const stop = Date.now() + timeoutMs
          let last = ''
          while (Date.now() < stop) {
            try {
              if (await page.evaluate(expression)) return true
            } catch (error) {
              last = String(error?.message || error)
            }
            await sleep(100)
          }
          throw new Error(`waitFor timed out: ${expression}${last ? ` (${last})` : ''}`)
        },
        async goto(targetUrl) {
          const navigation = await send('Page.navigate', { url: targetUrl })
          if (navigation && navigation.errorText) {
            throw new Error(`navigation failed: ${targetUrl} -> ${navigation.errorText}`)
          }
          await page.waitFor('document.readyState === "complete"', { timeoutMs: 20_000 })
        },
        async screenshot(filePath) {
          const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
          writeFileSync(filePath, Buffer.from(shot.data, 'base64'))
          return filePath
        },
        async close() {
          pages.delete(page)
          try { await cdp.send('Target.closeTarget', { targetId }) } catch {}
        },
      }
      pages.add(page)
      if (url !== 'about:blank') await page.waitFor('document.readyState === "complete"', { timeoutMs: 20_000 })
      return page
    }

    const browser = {
      pid: state.pid,
      chromePath,
      extensionDir,
      profileDir,
      extensionId: null,
      async extensionServiceWorker() {
        const { targetInfos } = await cdp.send('Target.getTargets')
        const expectedId = expectedExtensionId(extensionDir)
        const worker = targetInfos.find(
          (info) => info.type === 'service_worker' && String(info.url).startsWith(`chrome-extension://${expectedId}/`),
        )
        if (!worker) return null
        browser.extensionId = expectedId
        return { url: worker.url, extensionId: expectedId }
      },
      newPage,
      async listTargets() {
        const { targetInfos } = await cdp.send('Target.getTargets')
        return targetInfos.map((info) => ({ type: info.type, url: info.url, title: info.title }))
      },
      async close() {
        if (state.closed) return
        state.closed = true
        for (const page of [...pages]) await page.close().catch(() => {})
        cdp?.close()
        killChrome()
        await new Promise((done) => {
          if (chrome.exitCode !== null) return done()
          chrome.once('exit', done)
          setTimeout(done, 3000)
        })
        rmSync(profileDir, { recursive: true, force: true })
        process.removeListener('exit', processExitHook)
      },
      async assertSingleSpawn() {
        return state.spawnCount === 1
      },
    }
    return browser
  } catch (error) {
    cdp?.close()
    killChrome()
    rmSync(profileDir, { recursive: true, force: true })
    process.removeListener('exit', processExitHook)
    throw error
  }
}

async function selfTest() {
  const report = { pass: false, chromePath: null, chromePid: null, spawns: 0, scenarios: 0, profileRemoved: false, extensionId: null, shots: [] }
  const browser = await launchExtensionBrowser({ width: 1000, height: 700 })
  try {
    report.chromePath = browser.chromePath
    report.chromePid = browser.pid
    const worker = await (async () => {
      for (let i = 0; i < 50; i += 1) {
        const found = await browser.extensionServiceWorker()
        if (found) return found
        await sleep(100)
      }
      return null
    })()
    if (!worker) throw new Error(`扩展 service worker 未加载（期望 ${expectedExtensionId(browser.extensionDir)}）。系统 Chrome 137+ 会忽略 --load-extension，请安装 Chrome for Testing 或用 CHROME_PATH 指向它。`)
    report.extensionId = worker.extensionId

    // Scenario A: the real extension page, driven inside the same browser.
    const first = await browser.newPage(`chrome-extension://${worker.extensionId}/panel/index.html`)
    const panelState = await first.evaluate(`(async () => ({
      readyState: document.readyState,
      hasChromeStorage: typeof chrome !== 'undefined' && Boolean(chrome.storage && chrome.storage.local),
      bodyLength: document.body.innerText.length,
    }))()`)
    if (panelState.readyState !== 'complete') throw new Error(`扩展页未加载完成：${panelState.readyState}`)
    if (!panelState.hasChromeStorage) throw new Error('扩展页缺少 chrome.storage，扩展未真正注入')
    await first.screenshot(join(tmpdir(), 'omnimux-ext-e2e-selftest-a.png'))
    report.shots.push(join(tmpdir(), 'omnimux-ext-e2e-selftest-a.png'))
    report.firstScenario = panelState
    await first.close()
    report.scenarios += 1

    const second = await browser.newPage('about:blank')
    const value = await second.evaluate('1 + 1')
    if (value !== 2) throw new Error(`场景 B evaluate 异常：${value}`)
    await second.screenshot(join(tmpdir(), 'omnimux-ext-e2e-selftest-b.png'))
    report.shots.push(join(tmpdir(), 'omnimux-ext-e2e-selftest-b.png'))
    await second.close()
    report.scenarios += 1

    report.spawns = await browser.assertSingleSpawn() ? 1 : 2
  } finally {
    const profileDir = browser.profileDir
    await browser.close()
    report.profileRemoved = !existsSync(profileDir)
    report.chromeAlive = (() => {
      try { process.kill(browser.pid, 0); return true } catch { return false }
    })()
  }
  report.pass = report.scenarios === 2 && report.spawns === 1 && report.profileRemoved && report.chromeAlive === false
  console.log(JSON.stringify(report, null, 2))
  if (!report.pass) process.exitCode = 1
}

const invokedDirectly = Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) {
    selfTest().catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  } else {
    console.error('用法：node scripts/lib/extension-e2e.mjs --self-test')
    process.exitCode = 2
  }
}
