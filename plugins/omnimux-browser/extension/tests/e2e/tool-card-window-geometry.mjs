// Run with: node plugins/omnimux-browser/extension/tests/e2e/tool-card-window-geometry.mjs
//
// 「页面操作」进度卡片的进展期几何验收。
//
// 断言的是用户可见症状而不是实现细节：卡片在进展逐条追加时不改变尺寸，且最新的进展
// 始终落在两行窗口的可见范围内。探针直接引用工作树里的生产 styles.css，并用与组件
// 相同的标记结构渲染，因此测的是真实布局而不是模拟值。
//
// 需要本机 ego-browser 可用；失败时以非零码退出并保留现场报告。
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const stylesPath = resolve(root, 'plugins/omnimux-browser/extension/src/panel/styles.css')
const dir = resolve(root, '.workbuddy/evidence/tool-card-window-geometry', String(Date.now()))
await mkdir(dir, { recursive: true })

const PANE_WIDTHS = [360, 320, 400, 280]

const page = `<!doctype html>
<html lang="zh-CN" data-theme="dark"><head><meta charset="UTF-8" />
<link id="prod-style" rel="stylesheet" href="/panel/styles.css" />
<style>html,body{margin:0;background:#0b0b0e}#stage{display:flex;gap:18px;padding:14px;align-items:flex-start}.pane{flex:0 0 auto;border:1px dashed rgba(255,255,255,.15);padding:8px;border-radius:8px}.rows{display:flex;flex-direction:column;gap:8px}</style>
</head><body><div id="stage"></div><script type="module" src="/probe.js"></script></body></html>
`

// 探针：与 ToolActivity 相同的标记与上移逻辑，逐条推进并采集几何
const probe = `const STEPS = ['todo_write','inspiration_search','inspiration_save','read','点击元素 #3','screenshot','inspect_dom']
const PER_LINE = 2
const clip = (s) => (s.length <= 64 ? s : s.slice(0, 64) + '…')

function renderCard(steps, status) {
  const running = status === 'running'
  const trimmed = steps.map(clip)
  const lines = []
  for (let i = 0; i < trimmed.length; i += PER_LINE) lines.push(trimmed.slice(i, i + PER_LINE))
  const rows = lines.map((line) => '<span class="tool-line">' + line.map((step, i) => (i > 0 ? '<span class="tool-step-arrow">→</span>' : '') + '<span class="tool-step-tag">' + step + '</span>').join('') + '</span>').join('')
  const state = running ? '<span class="spinner"></span>' : '<span class="tool-done-badge"><span class="badge-dot"></span><span>完成</span></span>'
  return '<div class="tool-activity ' + (running ? 'running' : 'complete') + '">'
    + '<span class="tool-icon"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M4 12h10M4 17h7"></path></svg></span>'
    + '<span class="tool-copy"><span class="tool-label">' + (running ? '页面操作中' : '页面操作') + '</span>'
    + '<span class="tool-window" data-lines="2"><span class="tool-lines">' + rows + '</span></span></span>'
    + '<span class="tool-state" data-width="fixed">' + state + '</span></div>'
}

function mount(paneWidth) {
  const pane = document.createElement('div')
  pane.className = 'pane'
  pane.style.width = paneWidth + 'px'
  pane.innerHTML = '<div class="rows"></div>'
  document.getElementById('stage').appendChild(pane)
  const holder = document.createElement('div')
  holder.className = 'row tool'
  pane.querySelector('.rows').appendChild(holder)
  return holder
}

function applyAndMeasure(holder, steps, status) {
  holder.innerHTML = renderCard(steps, status)
  const win = holder.querySelector('.tool-window')
  const lines = holder.querySelector('.tool-lines')
  const overflow = Math.max(0, lines.getBoundingClientRect().height - win.getBoundingClientRect().height)
  lines.style.transform = 'translateY(' + (-overflow) + 'px)'
  void holder.offsetWidth
  const card = holder.querySelector('.tool-activity').getBoundingClientRect()
  const state = holder.querySelector('.tool-state').getBoundingClientRect()
  const last = [...holder.querySelectorAll('.tool-line')].at(-1)?.getBoundingClientRect()
  const winRect = win.getBoundingClientRect()
  return {
    cardW: Math.round(card.width * 100) / 100,
    cardH: Math.round(card.height * 100) / 100,
    windowH: Math.round(winRect.height * 100) / 100,
    stateW: Math.round(state.width * 100) / 100,
    contentOffset: Number((-overflow).toFixed(1)),
    latestVisible: last ? last.top >= winRect.top - 0.6 && last.bottom <= winRect.bottom + 0.6 : false,
  }
}

window.__probe = () => {
  const out = []
  for (const width of ${JSON.stringify(PANE_WIDTHS)}) {
    const holder = mount(width)
    const frames = []
    for (let i = 1; i <= STEPS.length; i += 1) {
      frames.push(applyAndMeasure(holder, STEPS.slice(0, i), 'running'))
    }
    frames.push(applyAndMeasure(holder, STEPS, 'complete'))
    out.push({ paneWidth: width, frames })
  }
  return out
}
`

await writeFile(resolve(dir, 'page.html'), page)
await writeFile(resolve(dir, 'probe.js'), probe)

const script = `
const http = await import('node:http');
const fs = await import('node:fs');
const fsp = await import('node:fs/promises');
const path = await import('node:path');
const DIR = ${JSON.stringify(dir)};
const STYLES = ${JSON.stringify(stylesPath)};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const map = { '/': path.join(DIR, 'page.html'), '/page.html': path.join(DIR, 'page.html'), '/probe.js': path.join(DIR, 'probe.js'), '/panel/styles.css': STYLES };
  const file = map[url];
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
  res.writeHead(200, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const task = await taskSpace('progress card window geometry');
const page = task.page('p1');
let closed = false;
let data = [];
try {
  await page.goto(base + '/page.html');
  await page.waitForFunction(() => typeof window.__probe === 'function', undefined, { timeout: 20000 });
  data = await page.evaluate(() => window.__probe());
  await page.screenshot({ path: path.join(DIR, 'geometry.png'), fullPage: true });
} finally {
  server.close();
  try { await task.finish({ keep: [] }); closed = true; } catch {}
  await fsp.writeFile(path.join(DIR, 'raw.json'), JSON.stringify({ closed, data }, null, 2));
}
console.log('RAW=' + JSON.stringify({ closed, sequences: data.length }));
`

await writeFile(resolve(dir, 'ego-script.mjs'), script)
const result = spawnSync('ego-browser', ['nodejs'], { input: script, encoding: 'utf8', timeout: 180000 })
await writeFile(resolve(dir, 'run.log'), `${result.stdout || ''}\n${result.stderr || ''}`)
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
if (result.error) throw result.error
if (result.status !== 0) {
  console.error('ego-browser run failed; see', resolve(dir, 'run.log'))
  process.exit(1)
}

const raw = JSON.parse(await (await import('node:fs/promises')).readFile(resolve(dir, 'raw.json'), 'utf8'))
const failures = []
if (!raw.closed) failures.push('task space 未正常释放')
if (!raw.data || raw.data.length !== PANE_WIDTHS.length) failures.push(`序列数量异常：${raw.data ? raw.data.length : 0}`)

const rows = []
for (const seq of raw.data ?? []) {
  const heights = seq.frames.map((f) => f.cardH)
  const widths = seq.frames.map((f) => f.cardW)
  const windows = seq.frames.map((f) => f.windowH)
  const states = seq.frames.map((f) => f.stateW)
  const uniq = (list) => [...new Set(list)]
  const moved = seq.frames.some((f) => f.contentOffset < 0)
  const alwaysVisible = seq.frames.every((f) => f.latestVisible)
  rows.push({
    paneWidth: seq.paneWidth,
    heights: uniq(heights),
    widths: uniq(widths),
    windowHeights: uniq(windows),
    stateWidths: uniq(states),
    contentOffsets: seq.frames.map((f) => f.contentOffset),
    latestVisibleEveryStep: alwaysVisible,
  })
  if (uniq(heights).length !== 1) failures.push(`${seq.paneWidth}px 卡片高度随进展变化：${heights.join(', ')}`)
  if (uniq(widths).length !== 1) failures.push(`${seq.paneWidth}px 卡片宽度随进展变化：${widths.join(', ')}`)
  if (uniq(windows).length !== 1) failures.push(`${seq.paneWidth}px 窗口高度不稳定：${windows.join(', ')}`)
  if (uniq(states).length !== 1) failures.push(`${seq.paneWidth}px 状态槽位宽度不稳定：${states.join(', ')}`)
  if (!alwaysVisible) failures.push(`${seq.paneWidth}px 存在最新一步被窗口裁掉的帧`)
  if (!moved) failures.push(`${seq.paneWidth}px 内容未产生向上位移`)
}

await writeFile(resolve(dir, 'verdict.json'), JSON.stringify({ passed: failures.length === 0, failures, rows }, null, 2))
console.log(JSON.stringify({ passed: failures.length === 0, failures, rows }, null, 1))
if (failures.length > 0) {
  console.error('progress card geometry regression:', failures.join('; '))
  process.exit(1)
}
