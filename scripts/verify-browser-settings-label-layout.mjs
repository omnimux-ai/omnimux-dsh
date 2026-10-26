#!/usr/bin/env node
/**
 * Real-browser acceptance for the settings row label layout (Issue #3796).
 *
 * What it proves, against the REAL built extension (nothing is copied or rewritten):
 * `plugins/omnimux-browser/extension/dist` is loaded unpacked into a real Chrome via
 * `scripts/lib/extension-e2e.mjs` (one browser process per run, always cleaned up),
 * the panel's own settings view is opened through its settings trigger, and the
 * geometry of every settings row is measured over CDP.
 *
 * The defect this pins: `.settings label` used `grid-template-columns: 1fr auto`, so a
 * long Chinese description claimed the whole row and the label column collapsed below a
 * single character — 「文本生成模型」 then stacked one character per line.
 *
 * Journey per width: open settings → two model rows present → each label renders on one
 * line, unclipped → the control row fills the row width → the description never overlaps
 * the control → no horizontal overflow → no other settings row is clipped.
 *
 * Artifacts land in `docs/evidence/browser-settings-label-layout-3796/`:
 *   - settings-<width>px.png       (the settings view at that width)
 *   - settings-label-layout-<width>.json   (per-assertion pass/actual)
 *
 * One width per invocation (the runner contract is one browser process per run; the
 * viewport width IS the emulated window size the browser launches with).
 *
 * Usage: node scripts/verify-browser-settings-label-layout.mjs [--width 420]
 * Exit code is non-zero when any assertion fails; a browser that cannot start writes
 * nothing rather than a fabricated artifact.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchExtensionBrowser } from './lib/extension-e2e.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/evidence/browser-settings-label-layout-3796')
const EXTENSION_DIR = join(ROOT, 'plugins/omnimux-browser/extension/dist')
const NARROW_MAX = 480
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Measure every settings row from inside the real panel page. */
const MEASURE = `(() => {
  const rows = Array.from(document.querySelectorAll('.settings-panel label'))
  const pick = (label) => rows.find((row) => (row.querySelector(':scope > span')?.textContent || '').trim() === label)
  const box = (node) => node?.getBoundingClientRect()
  const describe = (row) => {
    if (!row) return null
    const span = row.querySelector(':scope > span')
    const small = row.querySelector(':scope > small')
    const controlRow = row.querySelector('.model-selector-row')
    const control = row.querySelector('.model-select-control')
    const effort = row.querySelector('.effort-select-control')
    const spanBox = box(span)
    const smallBox = box(small)
    const controlRowBox = box(controlRow)
    const controlBox = box(control)
    const effortBox = box(effort)
    const lineHeight = span ? parseFloat(getComputedStyle(span).lineHeight) : 0
    return {
      text: span?.textContent?.trim() ?? '',
      labelLines: lineHeight > 0 ? Math.round((spanBox?.height ?? 0) / lineHeight) : 0,
      labelClipped: span ? span.scrollWidth > Math.ceil(spanBox.width) + 1 : false,
      labelTop: Math.round(spanBox?.top ?? 0),
      labelHeight: Math.round(spanBox?.height ?? 0),
      smallTop: Math.round(smallBox?.top ?? 0),
      smallBottom: Math.round((smallBox?.top ?? 0) + (smallBox?.height ?? 0)),
      controlWidth: Math.round(controlBox?.width ?? 0),
      effortWidth: Math.round(effortBox?.width ?? 0),
      controlRowWidth: Math.round(controlRowBox?.width ?? 0),
      controlTop: Math.round(controlBox?.top ?? 0),
      rowWidth: Math.round(row.getBoundingClientRect().width),
    }
  }
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    chat: describe(pick('对话模型')),
    text: describe(pick('文本生成模型')),
    otherRows: rows
      .filter((row) => !row.classList.contains('setting-toggle'))
      .map((row) => describe(row))
      .filter(Boolean)
      .map((item) => ({ text: item.text, labelLines: item.labelLines, labelClipped: item.labelClipped })),
  }
})()`

/** Open the panel settings view in a page and wait until both model rows are mounted. */
async function openSettings(page) {
  await page.waitFor('!!document.querySelector(".settings-trigger")', { timeoutMs: 20_000 })
  await page.evaluate('document.querySelector(".settings-trigger").click()')
  await page.waitFor('!!document.querySelector(".settings-panel label")', { timeoutMs: 20_000 })
  // The model selectors fetch a live catalog first and only then render; wait for both.
  await page.waitFor('document.querySelectorAll(".settings-panel .model-select-control").length >= 2', { timeoutMs: 20_000 })
  await sleep(600)
}

function judge(measured, width) {
  const assertions = []
  const add = (name, pass, actual) => assertions.push({ name, pass: Boolean(pass), actual })
  const narrow = width <= NARROW_MAX

  add('两行模型配置同时存在', measured.chat !== null && measured.text !== null,
    { chat: measured.chat?.text, text: measured.text?.text })

  for (const [key, rowLabel] of [['chat', '对话模型'], ['text', '文本生成模型']]) {
    const row = measured[key]
    add(`${rowLabel} 标签单行显示（不逐字竖排）`, row !== null && row.labelLines === 1, { labelLines: row?.labelLines })
    add(`${rowLabel} 标签未被裁切`, row !== null && row.labelClipped === false, { labelClipped: row?.labelClipped })
    // The chat row holds the model selector and the effort selector side by side; together
    // with their gap they must fill the control row instead of leaving dead space.
    add(`${rowLabel} 控件铺满整行（无剩余空白）`,
      row !== null && row.controlWidth + row.effortWidth >= row.controlRowWidth - 12,
      { controlWidth: row?.controlWidth, effortWidth: row?.effortWidth, controlRowWidth: row?.controlRowWidth })
    add(narrow ? `${rowLabel} 说明句落到标签下方` : `${rowLabel} 说明句与标签同排且未压窄标签`,
      row !== null && (narrow
        ? row.smallTop >= row.labelTop + row.labelHeight - 1
        : row.smallTop < row.labelTop + row.labelHeight && row.labelLines === 1),
      { narrow, labelTop: row?.labelTop, labelHeight: row?.labelHeight, smallTop: row?.smallTop })
    add(`${rowLabel} 说明句不压住控件`, row !== null && row.controlTop >= row.smallBottom - 1,
      { smallBottom: row?.smallBottom, controlTop: row?.controlTop })
  }

  add('页面无横向溢出', measured.docOverflow <= 0, { docOverflow: measured.docOverflow })
  const broken = measured.otherRows.filter((row) => row.labelLines > 1 || row.labelClipped)
  add('其它设置行标签同样单行未裁切', broken.length === 0, { broken })

  return assertions
}

async function main() {
  const widthArg = process.argv.indexOf('--width')
  const width = Number(widthArg === -1 ? 420 : process.argv[widthArg + 1])
  if (!Number.isFinite(width) || width < 280) throw new Error('--width 需要一个 >=280 的像素宽度')

  mkdirSync(OUT, { recursive: true })
  const report = { issue: 3796, width, extensionDir: EXTENSION_DIR, chromePath: null, chromePid: null, extensionId: null, runs: [], pass: false, cleanup: null }

  const browser = await launchExtensionBrowser({
    extensionDir: EXTENSION_DIR,
    width,
    height: 820,
  })
  try {
    report.chromePath = browser.chromePath
    report.chromePid = browser.pid
    let worker = null
    for (let attempt = 0; attempt < 80 && worker === null; attempt += 1) {
      worker = await browser.extensionServiceWorker()
      if (worker === null) await sleep(100)
    }
    if (worker === null) {
      throw new Error('扩展 service worker 未加载：需要 Chrome for Testing（品牌版 Chrome 137+ 忽略 --load-extension），或设置 CHROME_PATH')
    }
    report.extensionId = worker.extensionId

    const page = await browser.newPage(`chrome-extension://${worker.extensionId}/panel/index.html`)
    try {
      await openSettings(page)
      const measured = await page.evaluate(MEASURE)
      const shot = join(OUT, `settings-${width}px.png`)
      await page.screenshot(shot)
      report.runs.push({ width, measured, assertions: judge(measured, width), screenshot: shot })
    } finally {
      await page.close()
    }
    report.pass = report.runs.every((run) => run.assertions.every((item) => item.pass))
  } finally {
    await browser.close()
    report.cleanup = { profileDir: browser.profileDir, closed: true }
  }

  writeFileSync(join(OUT, `settings-label-layout-${width}.json`), JSON.stringify(report, null, 2))
  for (const run of report.runs) {
    const failed = run.assertions.filter((item) => !item.pass)
    console.log(`${run.width}px: ${run.assertions.length - failed.length}/${run.assertions.length} pass`)
    for (const item of failed) console.log(`  FAIL ${item.name} ${JSON.stringify(item.actual)}`)
  }
  if (!report.pass) process.exitCode = 1
}

await main()
