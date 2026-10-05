/**
 * R5 placement + wrap measurement: drives the rebuilt demo page in headless
 * Chrome over CDP, reads every card's real rect, and compares against the
 * estimator the layout used (window.__RIVAL_QA__ seam in demo-entry.jsx).
 *
 * Reports, per card: measured height vs est, replay-of-shortest-column with
 * MEASURED heights (decision correctness), and the NEW field the B-1 escape
 * needed: same-column vertical overlap of consecutive cards (an estimated-top
 * model can self-agree while cards overlap).
 *
 * Usage: node measure-placement.mjs [demoUrl] [outJson]
 *   demoUrl default: http://127.0.0.1:8399/demo.html?edge=1&theme=dark&width=1164
 *   outJson default: ../r5-placement-measure.json (pass r4 name to overwrite)
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DEMO = process.argv[2] || 'http://127.0.0.1:8399/demo.html?edge=1&theme=dark&width=1164'
const OUT = process.argv[3] ? resolve(process.argv[3]) : join(here, '..', 'r5-placement-measure.json')
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9345

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'r5m-'))}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws; let seq = 0; const pending = new Map()
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const t = list.find((x) => x.type === 'page')
      if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break }
    } catch { /* starting */ }
    await sleep(200)
  }
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
}
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(`${expr.slice(0, 140)}\n${r.result.exceptionDetails.exception?.description}`)
  return r.result?.result?.value
}

try {
  await connect()
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: DEMO })
  await sleep(1200)
  // Wait until cards are placed.
  for (let i = 0; i < 20; i++) {
    const n = await ev(`document.querySelectorAll('.omnimux-rival-card').length`)
    if (n > 0) break
    await sleep(300)
  }

  const data = await ev(`(() => {
    const qa = window.__RIVAL_QA__ || {}
    const grid = document.querySelector('.omnimux-rival-masonry')
    const colW = Number(grid.getAttribute('data-col-width'))
    const cols = Number(grid.getAttribute('data-columns'))
    const cards = [...document.querySelectorAll('.omnimux-rival-card')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-card-id'),
        type: el.getAttribute('data-card-type'),
        col: Number(el.getAttribute('data-col')),
        top: r.top - grid.getBoundingClientRect().top,
        left: r.left - grid.getBoundingClientRect().left,
        measured: r.height,
        pillRow: Boolean(el.querySelector('.omnimux-rival-pill-row')),
      }
    })
    return { colW, cols, cards,
      feedHeight: grid.getBoundingClientRect().height,
      hasEstimator: typeof qa.rivalCardHeightPx === 'function' }
  })()`)

  if (!data.hasEstimator) throw new Error('demo page missing __RIVAL_QA__ estimator seam')

  // Estimated heights per card: evaluate the estimator in-page for each card
  // by pulling the card object back out of React — the descriptors are not on
  // the DOM, so recompute from the cards the page rendered via __RIVAL_QA__
  // plus a registry the demo now also publishes.
  const estimates = await ev(`(() => {
    const qa = window.__RIVAL_QA__
    const out = {}
    for (const c of (qa.cards || [])) out[c.id] = qa.rivalCardHeightPx(c, ${JSON.stringify(data.colW)})
    return out
  })()`)

  // If the demo didn't publish descriptors, fall back to id -> est via DOM + est fn arg list.
  // (demo-entry publishes cards on __RIVAL_QA__ — added alongside the estimator.)
  const measured = ONLY ? data.cards.filter((c) => ONLY.has(c.id)) : data.cards
  const rows = measured.map((c) => {
    const est = estimates[c.id]
    return {
      id: c.id, type: c.type, col: c.col,
      top: Math.round(c.top * 100) / 100,
      measured: Math.round(c.measured * 100) / 100,
      est: typeof est === 'number' ? Math.round(est * 100) / 100 : null,
      diff: typeof est === 'number' ? Math.round((c.measured - est) * 100) / 100 : null,
      pillRow: c.pillRow,
    }
  })

  // Replay shortest-column with MEASURED heights (decision correctness check).
  const bottoms = new Array(data.cols).fill(0)
  const GAP = 16
  let replayMismatches = 0
  const replay = []
  for (const c of measured) {
    let k = 0
    for (let i = 1; i < data.cols; i += 1) if (bottoms[i] < bottoms[k] - 0.5) k = i
    replay.push({ id: c.id, expectedCol: k, actualCol: c.col })
    if (k !== c.col) replayMismatches += 1
    bottoms[k] += c.measured + GAP
  }

  // NEW: same-column vertical overlap of consecutive placed cards.
  // Cards are absolutely positioned; if the placement top of the next card is
  // above the previous card's real bottom, they physically overlap — the case
  // replayMismatches cannot see (the placement agreed with itself).
  const byCol = new Map()
  for (const c of measured) {
    if (!byCol.has(c.col)) byCol.set(c.col, [])
    byCol.get(c.col).push(c)
  }
  const overlaps = []
  let maxOverlap = 0
  for (const [col, list] of byCol) {
    list.sort((a, b) => a.top - b.top)
    for (let i = 1; i < list.length; i += 1) {
      const gap = list[i].top - (list[i - 1].top + list[i - 1].measured)
      const overlap = gap < 0 ? Math.round(-gap * 100) / 100 : 0
      if (overlap > 0.5) {
        overlaps.push({ col, below: list[i - 1].id, above: list[i].id, overlap })
        if (overlap > maxOverlap) maxOverlap = overlap
      }
    }
  }

  const maxAbsDiff = rows.reduce((m, r) => (r.diff != null ? Math.max(m, Math.abs(r.diff)) : m), 0)
  const report = {
    url: DEMO,
    columns: data.cols,
    columnWidth: data.colW,
    feedHeight: Math.round(data.feedHeight * 100) / 100,
    table: rows,
    maxAbsDiff,
    replayMismatches,
    replay,
    adjacentOverlaps: overlaps,
    maxAdjacentOverlap: maxOverlap,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 1))
  console.log(`cards=${rows.length} maxAbsDiff=${maxAbsDiff} replayMismatches=${replayMismatches} adjacentOverlaps=${overlaps.length} maxOverlap=${maxOverlap}`)
  for (const r of rows) console.log(`  ${r.id.padEnd(10)} ${r.type.padEnd(11)} col${r.col} measured=${r.measured} est=${r.est} diff=${r.diff} pill=${r.pillRow}`)
} finally {
  chrome.kill('SIGKILL')
}
