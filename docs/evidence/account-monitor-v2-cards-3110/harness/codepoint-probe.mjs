/**
 * Per-codepoint wrap oracle (R6-①): for every whitespace/separator codepoint
 * in the UAX#14 sets the model claims, compare the real Chrome line count of
 * a wrapped probe string against rivalWrapLines() — the exact function the
 * layout estimator uses (imported from the worktree source, no re-implementation).
 *
 * Chrome ground truth comes from a hidden mirror div with the card body's own
 * font stack (R7: aligned with build-demo --font-family), counting distinct Range tops.
 * R7-①/Q1：'?'(003F) 与 EX 同类断后；'!'(0021) 是 Chrome 定制不断行——
 * 与 UAX#14 同名类不同行为，套件内断言已按真机口径钉死。
 *
 * Usage (repo or worktree root):
 *   node docs/evidence/account-monitor-v2-cards-3110/harness/codepoint-probe.mjs [outJson]
 * Exit 0 when model === Chrome for every row; writes a JSON table either way.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rivalWrapLines } from '../../../../plugins/omnimux-inspiration/src/client/rival-masonry.js'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(here, '..', 'r6-codepoint-probe.json')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9355

const CASES = [
  ['space', '0020'], ['tab', '0009'], ['nbsp', '00a0'], ['ogham', '1680'],
  ['en-quad', '2000'], ['em-quad', '2001'], ['en-space', '2002'],
  ['em-space', '2003'], ['three-per-em', '2004'], ['four-per-em', '2005'],
  ['six-per-em', '2006'], ['figure-space', '2007'], ['punct-space', '2008'],
  ['thin-space', '2009'], ['hair-space', '200a'], ['zwsp', '200b'],
  ['line-sep', '2028'], ['para-sep', '2029'],
  ['nnbsp', '202f'], ['mmsp', '205f'],
  ['word-joiner', '2060'], ['ideographic-space', '3000'],
  ['nb-hyphen', '2011'], ['vtab', '000b'],
  ['bom', 'feff'],
  // R7：断后类补样——EX（? 及同类）、HH/HY/B2、BA 非空格成员。
  ['ex-qmark', '003f'], ['ex-arabic-q', '061f'], ['ex-small-q', 'fe56'],
  ['hh-shy', '00ad'], ['hh-armenian', '058a'], ['hh-maqaf', '05be'],
  ['hh-canadian', '1400'], ['hh-double', '2e40'], ['hh-oblique', '2e17'],
  ['b2-emdash', '2014'], ['ba-vline', '007c'], ['ba-ethiopic', '1361'],
  ['ba-figure-dash', '2012'], ['ba-endash', '2013'], ['ba-hyphen-pt', '2027'],
  ['ex-bang', '0021'], ['ff', '000c'],
]

// Equal-length words at a width that admits exactly one per line: the model's
// uniform per-letter width (8.29px) and Chrome's real per-letter widths both
// put one word on each line, so the ONLY variable exercised is whether the
// separator is a break opportunity. Breakable → 5 lines; glued → 1 line.
const WORDS = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yzabcd']
const WIDTH = 60
const UNIT = 14

const strings = CASES.map(([name, hex]) => {
  const sep = String.fromCodePoint(parseInt(hex, 16))
  return { name, hex, text: WORDS.join(sep), alsoShort: `aa${sep}bb` }
})

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'r6cp-'))}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws; let seq = 0; const pending = new Map()
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const t = l.find((x) => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break }
    } catch { }
    await sleep(200)
  }
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
}
const send = (m, p = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description).slice(0, 500))
  return r.result?.result?.value
}

try {
  await connect()
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  const payload = JSON.stringify(strings.map((s) => ({ name: s.name, hex: s.hex, text: s.text, alsoShort: s.alsoShort })))
  const real = await ev(`(() => {
    const cases = ${payload}
    const font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", sans-serif'
    const c = document.createElement('canvas').getContext('2d'); c.font = font
    const mirror = document.createElement('div')
    mirror.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;white-space:normal;word-break:normal;overflow-wrap:normal;line-height:20px'
    mirror.style.font = font
    document.body.appendChild(mirror)
    const realLines = (text, width) => {
      mirror.style.width = width + 'px'; mirror.textContent = text
      const r = document.createRange(); r.selectNodeContents(mirror)
      const tops = new Set(); for (const x of r.getClientRects()) { if (x.width > 0 || x.height > 0) tops.add(Math.round(x.top)) }
      return Math.max(1, tops.size)
    }
    const out = cases.map((s) => {
      const ch = String.fromCodePoint(parseInt(s.hex, 16))
      return {
        name: s.name, hex: s.hex,
        real: realLines(s.text, ${WIDTH}),
        realWide: realLines(s.alsoShort, 400),
        glyphW: Math.round(c.measureText(ch).width * 1000) / 1000,
      }
    })
    mirror.remove()
    return out
  })()`)

  const rows = strings.map((s, i) => ({
    name: s.name,
    codepoint: 'U+' + s.hex.toUpperCase(),
    chromeLines: real[i].real,
    modelLines: rivalWrapLines(s.text, UNIT, WIDTH),
    chromeWideShort: real[i].realWide,
    modelWideShort: rivalWrapLines(s.alsoShort, UNIT, 400),
    glyphWidthPx14: real[i].glyphW,
  }))
  const mismatches = rows.filter((r) => r.chromeLines !== r.modelLines || r.chromeWideShort !== r.modelWideShort)
  const report = { width: WIDTH, unitPx: UNIT, mismatches: mismatches.length, rows }
  writeFileSync(OUT, JSON.stringify(report, null, 1))
  console.log('codepoint   chrome  model   short400 chrome/model   glyphW@14px')
  for (const r of rows) {
    const flag = (r.chromeLines !== r.modelLines || r.chromeWideShort !== r.modelWideShort) ? '  MISMATCH' : ''
    console.log(`${r.codepoint.padEnd(10)} ${String(r.chromeLines).padStart(3)}    ${String(r.modelLines).padStart(3)}        ${r.chromeWideShort}/${r.modelWideShort}              ${r.glyphWidthPx14}${flag}`)
  }
  console.log(`mismatches=${mismatches.length} written ${OUT}`)
  process.exitCode = mismatches.length ? 1 : 0
} finally {
  chrome.kill('SIGKILL')
}
