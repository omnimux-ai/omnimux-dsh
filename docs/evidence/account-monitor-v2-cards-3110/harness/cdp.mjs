/**
 * QA-R8 独立探针底座：连接本机已启动的 headless Chrome（9333）走 CDP。
 * 每个探针自己 spawn/复用，不依赖被测仓的 harness 脚本。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 启动一个独立 Chrome 实例并返回 {ev, send, close, port}。 */
export async function launch(port, extraArgs = []) {
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), `r8qa-${port}-`))}`,
    ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' })
  let ws = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const t = l.find((x) => x.type === 'page')
      if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break }
    } catch { /* not up yet */ }
    await sleep(200)
  }
  if (!ws) { proc.kill('SIGKILL'); throw new Error(`chrome ${port} never came up`) }
  await new Promise((r) => ws.addEventListener('open', r))
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((r) => {
    const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params }))
  })
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) {
      throw new Error(String(r.result.exceptionDetails.exception?.description).slice(0, 600))
    }
    return r.result?.result?.value
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(350)
  return { ev, send, port, close: () => proc.kill('SIGKILL') }
}

/** 卡片正文/标题的字体栈（与生产 .omnimux-rival-card-text 一致）。 */
export const FONT = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", sans-serif'

/**
 * 在页面里装一个隐藏镜面 div，返回 realLines(text,width,font) 的真机行数。
 * 行数 = Range.getClientRects() 去重后的 top 数（同一行可能有多个 rect）。
 */
export const MIRROR_SETUP = `
window.__mkMirror = (font) => {
  const m = document.createElement('div')
  m.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:normal;word-break:normal;overflow-wrap:normal;line-height:20px'
  m.style.font = font
  document.body.appendChild(m)
  return m
}
window.__lines = (mirror, text, width) => {
  mirror.style.width = width + 'px'
  mirror.textContent = text
  const r = document.createRange(); r.selectNodeContents(mirror)
  const tops = new Set()
  for (const x of r.getClientRects()) { if (x.width > 0 || x.height > 0) tops.add(Math.round(x.top)) }
  return Math.max(1, tops.size)
}
`

export function dump(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 1))
  return path
}
