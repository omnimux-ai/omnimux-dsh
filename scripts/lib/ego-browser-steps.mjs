/**
 * ego-browser step driver for local, self-contained browser evidence scripts.
 *
 * Why this exists: ad-hoc QA scripts used to spawn a fresh Chrome (and a fresh
 * temporary profile) per screenshot, which flashes a Dock icon and leaves orphan
 * processes behind when a run fails. ego lite runs one long-lived browser, so a
 * TaskSpace keeps the whole run inside that already-running process.
 *
 * Screenshots intentionally go through `Page.captureScreenshot` instead of
 * `page.screenshot()`: the CDP call honours `deviceScaleFactor`, so a 2x
 * evidence shot keeps the same pixel dimensions it had under headless Chrome.
 *
 * The driver also injects a zero-duration transition/animation style. ego
 * TaskSpace Pages do not tick CSS transitions, so a settled hover state would
 * otherwise be captured (and measured) at its `opacity: 0` start value.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function resolveEgoCli() {
  const candidates = [process.env.EGO_BROWSER, join(process.env.HOME || '', '.local', 'bin', 'ego-browser')]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

export function requireEgoCli() {
  const cli = resolveEgoCli()
  if (!cli) {
    throw new Error(
      'ego-browser CLI not found. Install ego lite and keep ~/.local/bin/ego-browser on PATH, or set EGO_BROWSER to the CLI path.',
    )
  }
  return cli
}

const DRIVER_TEMPLATE = `const SPACE = @@SPACE@@
const STEPS = @@STEPS@@
const WIDTH = @@WIDTH@@
const HEIGHT = @@HEIGHT@@
const DPR = @@DPR@@
const NOMOTION = @@NOMOTION@@
const FOCUS_EMULATION = @@FOCUS@@
const RESULT = @@RESULT@@
const fs = await import('node:fs')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const task = await taskSpace(SPACE)
const pages = await task.pages()
const page = pages[0] || (await task.newPage())
const values = []
const shots = []
let userAgent = ''
const disableMotion = () => {
  const style = document.createElement('style')
  style.id = 'ego-evidence-no-motion'
  style.textContent = '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }'
  document.head.appendChild(style)
}
try {
  try { await page.cdp('Page.bringToFront') } catch {}
  try { await page.cdp('Page.setWebLifecycleState', { state: 'active' }) } catch {}
  if (FOCUS_EMULATION) {
    // Headless Chrome keeps the page focused; an ego TaskSpace Page can receive a
    // blur right after load, which page code sometimes treats as "pointer left".
    try { await page.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }) } catch {}
  }
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false })
  for (const step of STEPS) {
    if (step.type === 'goto') {
      await page.goto(step.url)
      if (!userAgent) userAgent = await page.evaluate(() => navigator.userAgent)
      if (NOMOTION) await page.evaluate(disableMotion)
      if (step.settleMs) await sleep(step.settleMs)
    } else if (step.type === 'wait') {
      await sleep(step.ms || 0)
    } else if (step.type === 'evaluate') {
      const value = await page.evaluate(step.expression)
      if (step.name) values.push({ name: step.name, value })
    } else if (step.type === 'hover') {
      const point = step.point || (await page.evaluate(step.expression))
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new Error('hover target not resolvable: ' + JSON.stringify(step.expression || step.point || null))
      }
      await page.mouse.move(point.x, point.y)
      if (step.settleMs) await sleep(step.settleMs)
    } else if (step.type === 'click') {
      const point = step.point || (await page.evaluate(step.expression))
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new Error('click target not resolvable: ' + JSON.stringify(step.expression || step.point || null))
      }
      await page.mouse.click(point.x, point.y)
      if (step.settleMs) await sleep(step.settleMs)
    } else if (step.type === 'screenshot') {
      const shot = await page.cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      const bytes = Buffer.from(shot.data, 'base64')
      fs.writeFileSync(step.path, bytes)
      shots.push({ path: step.path, bytes: bytes.length })
    } else {
      throw new Error('unknown step type: ' + step.type)
    }
  }
} finally {
  await task.finish({ keep: [] })
}
fs.writeFileSync(RESULT, JSON.stringify({ spaceId: task.spaceId, userAgent, values, shots }))
`

function renderDriver({ spaceName, steps, width, height, deviceScaleFactor, noMotion, focusEmulation, resultPath }) {
  return DRIVER_TEMPLATE.replace('@@SPACE@@', JSON.stringify(spaceName))
    .replace('@@STEPS@@', JSON.stringify(steps))
    .replace('@@WIDTH@@', String(width))
    .replace('@@HEIGHT@@', String(height))
    .replace('@@DPR@@', String(deviceScaleFactor))
    .replace('@@NOMOTION@@', String(noMotion))
    .replace('@@FOCUS@@', String(focusEmulation))
    .replace('@@RESULT@@', JSON.stringify(resultPath))
}

/**
 * Run a serial step list inside one ego TaskSpace and one Page.
 *
 * Steps:
 *   { type: 'goto', url, settleMs? }
 *   { type: 'wait', ms }
 *   { type: 'evaluate', expression, name? }   value is returned in `values`
 *   { type: 'hover', expression | point, settleMs? }   expression returns {x,y}
 *   { type: 'click', expression | point, settleMs? }
 *   { type: 'screenshot', path }
 */
export async function runEgoSteps({
  spaceName,
  steps,
  width,
  height,
  deviceScaleFactor = 1,
  noMotion = true,
  focusEmulation = false,
  timeoutMs = 180_000,
}) {
  const cli = requireEgoCli()
  const resultPath = join(tmpdir(), `ego-steps-${process.pid}-${Date.now()}.json`)
  const source = renderDriver({ spaceName, steps, width, height, deviceScaleFactor, noMotion, focusEmulation, resultPath })
  const child = spawn(cli, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, timeoutMs)
  const closed = new Promise((resolve) => child.on('close', (code) => resolve(code)))
  child.stdin.end(source)
  const code = await closed
  clearTimeout(timer)
  const tail = () => `stdout=${stdout.slice(-2000)}\nstderr=${stderr.slice(-2000)}`
  if (code !== 0) throw new Error(`ego step driver exited ${code}\n${tail()}`)
  if (!existsSync(resultPath)) throw new Error(`ego step driver produced no result file\n${tail()}`)
  const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
  rmSync(resultPath, { force: true })
  return parsed
}
