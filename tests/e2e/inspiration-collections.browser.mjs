import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { assertPng, findChromePath } from '../../scripts/worktree-web-qa.mjs'

/** Independent automated Chromium regression; does not control an Ego TaskSpace. */
export async function startCollectionsBrowser(evidenceDir) {
  const chromePath = findChromePath()
  const profile = mkdtempSync(join(evidenceDir, 'chromium-profile-'))
  const child = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--disable-breakpad', '--disable-crash-reporter', '--no-sandbox', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  let socket
  let nextId = 0
  let exited = false
  let processError
  const pending = new Map()
  const consoleErrors = []
  const network = []
  const networkUrls = new Map()
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192) })
  child.once('error', error => { processError = error })
  const exit = new Promise(done => child.once('close', () => { exited = true; done() }))
  const close = async () => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Browser closed')) }
    pending.clear()
    socket?.close()
    if (!exited) child.kill('SIGTERM')
    await Promise.race([exit, sleep(3000, undefined, { ref: false })])
    if (!exited) { child.kill('SIGKILL'); await Promise.race([exit, sleep(3000, undefined, { ref: false })]) }
    assert.equal(exited, true, 'Independent Chromium must exit before profile cleanup')
    rmSync(profile, { recursive: true, force: true })
    writeFileSync(join(evidenceDir, 'chromium.log'), stderr)
    return { chromeExited: exited, profileRemoved: !existsSync(profile) }
  }
  try {
    const portFile = join(profile, 'DevToolsActivePort')
    const startupDeadline = Date.now() + 15000
    while (!existsSync(portFile)) {
      if (processError) throw processError
      assert.equal(exited, false, stderr)
      assert.ok(Date.now() < startupDeadline, 'Independent Chromium startup timed out')
      await sleep(50)
    }
    const port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
    assert.ok(Number.isInteger(port) && port > 0)
    // The fixture intentionally restricts global fetch to its own origin.
    // This loopback CDP discovery uses node:http and never a user browser profile.
    const { get } = await import('node:http')
    const pages = await new Promise((done, reject) => {
      get('http://127.0.0.1:' + port + '/json/list', res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => { try { done(JSON.parse(body)) } catch (error) { reject(error) } })
      }).on('error', reject)
    })
    const page = pages.find(entry => entry.type === 'page')
    assert.ok(page?.webSocketDebuggerUrl)
    socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id)
        pending.delete(message.id)
        clearTimeout(request.timer)
        if (message.error) request.reject(new Error(JSON.stringify(message.error)))
        else request.resolve(message.result || {})
      }
      if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text)
      if (message.method === 'Network.requestWillBeSent') networkUrls.set(message.params.requestId, message.params.request.url)
      if (message.method === 'Network.loadingFinished' || message.method === 'Network.loadingFailed') network.push({ url: networkUrls.get(message.params.requestId), status: message.method })
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 10000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async (fn, arg) => {
      const expression = '(' + fn.toString() + ')(' + JSON.stringify(arg ?? null) + ')'
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      return result.result?.value
    }
    const wait = async (fn, arg, timeout = 10000) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        const result = await evaluate(fn, arg)
        if (result) return result
        await sleep(50)
      }
      throw new Error('DOM condition timed out: ' + fn.toString().slice(0, 180))
    }
    const point = async selector => {
      const box = await evaluate(selector => {
        const element = document.querySelector(selector)
        if (!element) return null
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const rect = element.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 160), width: rect.width, height: rect.height }
      }, selector)
      assert.ok(box?.width > 0 && box.height > 0, 'Missing visible target: ' + selector)
      return box
    }
    const clickPoint = async ({ x, y }) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x, y })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x, y })
    }
    const click = async selector => clickPoint(await point(selector))
    const clickText = async (text, selector = 'button') => {
      const target = await evaluate(({ text, selector }) => {
        const matches = [...document.querySelectorAll(selector)].filter(element => element.textContent.trim() === text && element.getBoundingClientRect().width > 0)
        if (matches.length !== 1) return { count: matches.length }
        matches[0].scrollIntoView({ block: 'nearest' })
        const rect = matches[0].getBoundingClientRect()
        return { count: 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      }, { text, selector })
      assert.equal(target.count, 1, 'Expected one visible text target: ' + text)
      await clickPoint(target)
    }
    const fill = async (selector, value) => {
      await click(selector)
      await evaluate(selector => { const element = document.querySelector(selector); element.focus(); element.select() }, selector)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
      if (value) await send('Input.insertText', { text: value })
      await wait(({ selector, value }) => document.querySelector(selector)?.value === value, { selector, value })
    }
    const drag = async (sourceSelector, targetSelector) => {
      const source = await point(sourceSelector)
      const target = await point(targetSelector)
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.x, y: source.y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: source.x, y: source.y })
      for (let step = 1; step <= 16; step++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: source.x + (target.x - source.x) * step / 16, y: source.y + (target.y - source.y) * step / 16 })
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: target.x, y: target.y })
      await wait(() => Boolean(document.querySelector('.omnimux-inspiration-collection-dialog')))
    }
    const screenshot = async name => {
      if (name !== 'failure') {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1590, y: 10 })
        await wait(() => {
          const visible = element => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 }
          return [...document.querySelectorAll('[data-inspiration-id] img')].filter(visible).every(image => image.complete && image.naturalWidth > 0)
            && [...document.querySelectorAll('.omnimux-inspiration-card-shimmer')].filter(visible).every(element => Number(getComputedStyle(element).opacity) <= 0.01)
        })
      }
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      const bytes = Buffer.from(data, 'base64')
      const dimensions = assertPng(bytes)
      writeFileSync(join(evidenceDir, name + '.png'), bytes)
      return { name: name + '.png', ...dimensions, bytes: bytes.length }
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false })
    const input = value => fill('.omnimux-inspiration-collection-dialog input', value)
    return { send, evaluate, wait, click, clickText, fill, input, drag, screenshot, consoleErrors, network, close, port, pid: child.pid }
  } catch (error) {
    await close()
    throw error
  }
}
