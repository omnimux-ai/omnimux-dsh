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
 *   - settings-<width>px-<theme>.png       (the settings view at that width and theme)
 *   - settings-label-layout-<width>.json   (per-assertion pass/actual)
 *
 * One width per invocation (the runner contract is one browser process per run; the
 * viewport width IS the emulated window size the browser launches with).
 *
 * Usage: node scripts/verify-browser-settings-label-layout.mjs [--width 420] [--theme dark,light] [--tag falsify]
 *
 * `--tag falsify` writes `*-falsify` artifacts: use it when running against the pre-fix CSS
 * so the failing report is retained as proof the assertions bite, without clobbering the pass run.
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

/**
 * Measure every settings row from inside the real panel page.
 *
 * Covers `.settings-panel label` (the model rows and the plain input/select rows) AND
 * `.setting-toggle` rows AND the relay-profile rows, because the narrow-panel media query
 * deliberately excludes toggles — an assertion that filtered them out could not prove the
 * exclusion is harmless. Clipping is measured two ways: the label's own scrollWidth and the
 * row's, so a label overflowing into `.settings-panel { overflow: hidden }` is still caught.
 */
const MEASURE = `(() => {
  const groups = [
    { kind: 'settings', rows: Array.from(document.querySelectorAll('.settings-panel label')) },
    { kind: 'relay', rows: Array.from(document.querySelectorAll('.relay-config label')) },
  ]
  const pick = (label) => groups[0].rows.find((row) => (row.querySelector(':scope > span')?.textContent || '').trim() === label)
  const box = (node) => node?.getBoundingClientRect()
  const overflows = (node) => node ? Math.round(node.scrollWidth - node.clientWidth) : 0
  const describe = (row, kind) => {
    if (!row) return null
    const toggle = row.classList.contains('setting-toggle')
    // Toggle rows carry their text inside .setting-toggle-copy; plain rows use direct children.
    const span = toggle ? row.querySelector('.setting-toggle-copy > strong') : row.querySelector(':scope > span')
    const small = toggle ? row.querySelector('.setting-toggle-copy > small') : row.querySelector(':scope > small')
    const controlRow = row.querySelector('.model-selector-row')
    const control = row.querySelector('.model-select-control')
    const effort = row.querySelector('.effort-select-control')
    const switchControl = row.querySelector('.setting-toggle-control')
    const spanBox = box(span)
    const smallBox = box(small)
    const controlRowBox = box(controlRow)
    const controlBox = box(control)
    const effortBox = box(effort)
    const switchBox = box(switchControl)
    const lineHeight = span ? parseFloat(getComputedStyle(span).lineHeight) : 0
    return {
      kind,
      toggle,
      // Relay profiles lay their own labels out as a flex column, so their switches sit
      // under the copy by design — that is pre-existing, not this media query's doing.
      nestedInRelay: Boolean(row.closest('.relay-profile')),
      text: span?.textContent?.trim() ?? '',
      labelLines: lineHeight > 0 ? Math.round((spanBox?.height ?? 0) / lineHeight) : 0,
      labelWidth: Math.round(spanBox?.width ?? 0),
      labelClipped: span ? overflows(span) > 1 : false,
      labelTop: Math.round(spanBox?.top ?? 0),
      labelHeight: Math.round(spanBox?.height ?? 0),
      smallTop: Math.round(smallBox?.top ?? 0),
      smallBottom: Math.round((smallBox?.top ?? 0) + (smallBox?.height ?? 0)),
      copyRight: Math.round(Math.max(spanBox?.right ?? 0, smallBox?.right ?? 0)),
      controlWidth: Math.round(controlBox?.width ?? 0),
      effortWidth: Math.round(effortBox?.width ?? 0),
      controlRowWidth: Math.round(controlRowBox?.width ?? 0),
      controlTop: Math.round(controlBox?.top ?? 0),
      // The real horizontal-overflow signal: a row wider than its own box, or a label
      // wider than the column it sits in. .settings-panel is overflow:hidden, so a
      // documentElement-level check can never see this.
      rowOverflow: overflows(row),
      switchLeft: Math.round(switchBox?.left ?? 0),
    }
  }
  // Probe the label column's 45% cap with a deliberately long label. Real Chinese labels are
  // 4-7 characters, so without this the cap is never exercised and its spec claim is unproven.
  // The probe mutates one row's text, measures, then restores it.
  const probeRow = pick('文本生成模型')
  const probeSpan = probeRow?.querySelector(':scope > span')
  let longLabel = null
  if (probeSpan) {
    const original = probeSpan.textContent
    // Exactly 90 CJK characters: far wider than 45% of any panel, so the cap must bite.
    const probeText = '文本生成模型与推理等级'.repeat(8) + '文本生成模型与推理等级'.slice(0, 2)
    probeSpan.textContent = probeText
    const rowBox = probeRow.getBoundingClientRect()
    const spanBox = probeSpan.getBoundingClientRect()
    const style = getComputedStyle(probeRow)
    const columns = style.gridTemplateColumns.split(' ').map((value) => parseFloat(value)).filter(Number.isFinite)
    longLabel = {
      // Content width available to the grid, minus the row's own horizontal padding.
      rowContentWidth: Math.round(rowBox.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
      firstTrackWidth: Math.round(columns[0] ?? 0),
      labelWidth: Math.round(spanBox.width),
      labelLines: (() => {
        const lineHeight = parseFloat(getComputedStyle(probeSpan).lineHeight)
        return lineHeight > 0 ? Math.round(spanBox.height / lineHeight) : 0
      })(),
      // Recorded so the README's character count is checkable, not prose.
      probeChars: probeText.length,
      rowOverflow: Math.round(probeRow.scrollWidth - probeRow.clientWidth),
    }
    probeSpan.textContent = original
  }
  const all = groups.flatMap((group) => group.rows.map((row) => describe(row, group.kind))).filter(Boolean)
  return {
    longLabel,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    theme: document.documentElement.getAttribute('data-theme') || 'auto',
    chat: describe(pick('对话模型'), 'settings'),
    text: describe(pick('文本生成模型'), 'settings'),
    rows: all,
    otherRows: all.filter((row) => row.kind === 'settings' && !row.toggle),
    toggleRows: all.filter((row) => row.toggle),
    relayRows: all.filter((row) => row.kind === 'relay'),
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
    // The chat row holds the model selector and the effort selector side by side; with their
    // 8px gap they must fill the control row exactly. `>= width - 12` would pass even with
    // dead space, so compare against the actual gap instead.
    add(`${rowLabel} 控件铺满整行（无剩余空白）`,
      row !== null && Math.abs(row.controlRowWidth - (row.controlWidth + row.effortWidth)) <= 10,
      { controlWidth: row?.controlWidth, effortWidth: row?.effortWidth, controlRowWidth: row?.controlRowWidth })
    add(narrow ? `${rowLabel} 说明句落到标签下方` : `${rowLabel} 说明句与标签同排且未压窄标签`,
      row !== null && (narrow
        ? row.smallTop >= row.labelTop + row.labelHeight - 1
        : row.smallTop < row.labelTop + row.labelHeight && row.labelLines === 1),
      { narrow, labelTop: row?.labelTop, labelHeight: row?.labelHeight, smallTop: row?.smallTop })
    add(`${rowLabel} 说明句不压住控件`, row !== null && row.controlTop >= row.smallBottom - 1,
      { smallBottom: row?.smallBottom, controlTop: row?.controlTop })
  }

  // `.settings` scrolls vertically and `.settings-panel` is overflow:hidden, so a
  // documentElement-level check can never see a row that overflows its own box. Measure
  // each row's own scrollWidth instead — that is what the clipping would actually hide.
  const overflowing = measured.rows.filter((row) => row.rowOverflow > 1)
  add('所有设置行都没有超出自身宽度（未被 overflow:hidden 裁掉）', overflowing.length === 0, { overflowing })

  const broken = measured.otherRows.filter((row) => row.labelLines > 1 || row.labelClipped)
  add('其它设置行标签同样单行未裁切', broken.length === 0, { broken })

  // The narrow-panel rule excludes toggles on purpose; prove the exclusion is harmless
  // rather than merely asserting the rule's own text.
  if (narrow) {
    const brokenToggles = measured.toggleRows.filter((row) => row.labelClipped || row.rowOverflow > 1)
    add('开关行在窄面板下未被压坏（标签未裁切、行未溢出）', brokenToggles.length === 0,
      { brokenToggles: brokenToggles.map((row) => ({ text: row.text.slice(0, 12), labelClipped: row.labelClipped, rowOverflow: row.rowOverflow })) })
    // A toggle must stay BESIDE its text. If the single-column rule had swallowed the row,
    // the switch would wrap under the copy block and start at the row's left edge, so
    // comparing horizontal positions proves the exclusion — vertical centering does not.
    const droppedSwitches = measured.toggleRows
      .filter((row) => !row.nestedInRelay)
      .filter((row) => row.switchLeft < row.copyRight - 1)
    add('开关行的开关仍在文案右侧（未被单列规则挤到下一行）', droppedSwitches.length === 0,
      { checked: measured.toggleRows.filter((row) => !row.nestedInRelay).length,
        droppedSwitches: droppedSwitches.map((row) => ({ text: row.text.slice(0, 12), switchLeft: row.switchLeft, copyRight: row.copyRight })) })
  }

  // The 45% cap only applies where the two-column grid is in use (wide panels); on narrow
  // panels the media query makes the label span the full row, so the cap is intentionally idle.
  if (!narrow && measured.longLabel) {
    const probe = measured.longLabel
    const cap = probe.rowContentWidth * 0.45
    add('超长标签受 45% 上限约束且不撑破行',
      probe.firstTrackWidth <= cap + 2 && probe.rowOverflow <= 1 && probe.labelLines > 1,
      { cap: Math.round(cap), ...probe })
  }

  const brokenRelay = measured.relayRows.filter((row) => row.labelClipped || row.rowOverflow > 1)
  add('中继配置行标签未裁切、行未溢出', brokenRelay.length === 0,
    { relayRows: measured.relayRows.length, brokenRelay: brokenRelay.map((row) => row.text) })

  return assertions
}

async function main() {
  const widthArg = process.argv.indexOf('--width')
  const width = Number(widthArg === -1 ? 420 : process.argv[widthArg + 1])
  if (!Number.isFinite(width) || width < 280) throw new Error('--width 需要一个 >=280 的像素宽度')
  const tagArg = process.argv.indexOf('--tag')
  // A falsification run (pre-fix CSS) must not overwrite the pass evidence, so it writes
  // its own artifact and screenshot suffix instead.
  const tagValue = tagArg === -1 ? '' : String(process.argv[tagArg + 1] ?? '')
  if (tagArg !== -1 && tagValue.trim() === '') throw new Error('--tag 需要一个非空名称')
  const tag = tagValue.trim() === '' ? '' : `-${tagValue.replace(/[^a-z0-9-]/gi, '')}`
  const themeArg = process.argv.indexOf('--theme')
  const themes = (themeArg === -1 ? 'dark,light' : String(process.argv[themeArg + 1] ?? ''))
    .split(',').map((value) => value.trim()).filter((value) => ['auto', 'dark', 'light'].includes(value))
  if (themes.length === 0) throw new Error('--theme 需要 auto / dark / light 之一')

  mkdirSync(OUT, { recursive: true })
  const report = { issue: 3796, width, themes, tag: tagValue.trim() || null, extensionDir: EXTENSION_DIR, chromePath: null, chromePid: null, extensionId: null, runs: [], pass: false, cleanup: null }

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

    for (const theme of themes) {
      const page = await browser.newPage(`chrome-extension://${worker.extensionId}/panel/index.html`)
      try {
        await openSettings(page)
        // The panel persists the theme under `omnimux_theme_mode`; set it and reload so the
        // run measures the palette the user actually gets, not just the default one.
        if (theme !== 'auto') {
          await page.evaluate(`localStorage.setItem('omnimux_theme_mode', ${JSON.stringify(theme)})`)
          await page.goto(`chrome-extension://${worker.extensionId}/panel/index.html`)
          await openSettings(page)
        }
        // Add one relay profile so the relay rows (which have no description column) are
        // part of the measured set instead of being silently absent.
        await page.evaluate(`(() => {
          const add = document.querySelector('.relay-heading button')
          if (add) add.click()
        })()`)
        await sleep(400)
        const measured = await page.evaluate(MEASURE)
        const shot = join(OUT, `settings-${width}px-${theme}${tag}.png`)
        await page.screenshot(shot)
        // Keep the report readable: the two model rows keep full geometry (they are the
        // subject), every other row is stored as the fields the assertions actually read.
        const compact = (row) => ({
          text: row.text, kind: row.kind, toggle: row.toggle,
          labelLines: row.labelLines, labelWidth: row.labelWidth, labelClipped: row.labelClipped,
          rowOverflow: row.rowOverflow,
        })
        report.runs.push({
          width,
          theme,
          measured: {
            viewport: measured.viewport,
            theme: measured.theme,
            chat: measured.chat,
            text: measured.text,
            longLabel: measured.longLabel,
            rowCounts: {
              total: measured.rows.length,
              toggles: measured.toggleRows.length,
              relay: measured.relayRows.length,
              other: measured.otherRows.length,
            },
            rows: measured.rows.map(compact),
            toggleRows: measured.toggleRows.map((row) => ({ ...compact(row), switchLeft: row.switchLeft, copyRight: row.copyRight, nestedInRelay: row.nestedInRelay })),
          },
          assertions: judge(measured, width),
          screenshot: shot,
        })
      } finally {
        await page.close()
      }
    }
    report.pass = report.runs.every((run) => run.assertions.every((item) => item.pass))
  } finally {
    await browser.close()
    report.cleanup = { profileDir: browser.profileDir, closed: true }
  }

  writeFileSync(join(OUT, `settings-label-layout-${width}${tag}.json`), JSON.stringify(report, null, 2))
  for (const run of report.runs) {
    const failed = run.assertions.filter((item) => !item.pass)
    console.log(`${run.width}px ${run.theme}: ${run.assertions.length - failed.length}/${run.assertions.length} pass`)
    for (const item of failed) console.log(`  FAIL ${item.name} ${JSON.stringify(item.actual)}`)
  }
  if (!report.pass) process.exitCode = 1
}

await main()
