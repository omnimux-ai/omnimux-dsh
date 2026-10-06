/**
 * 诊断旅程 3（Issue #3186）：omnimux-video 客户端 apply() 的注册被撤销（侧栏样式已注入但行不在 DOM、
 * 舞台槽位未注册）。这里在**新文档注入错误收集器**后整页重载，抓真实的抛出原因。
 */

import fs from 'node:fs'
import path from 'node:path'

async function evaluate(send, expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (result?.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text || 'unknown'}`)
  return result?.result?.value
}

export default async function journey({ send, sleep, evidenceDir }) {
  const assertions = []
  const push = (name, value) => assertions.push({ name, pass: true, detail: JSON.stringify(value ?? null) })

  // 在页面脚本之前注入收集器：控制台错误、未捕获异常、未处理的 Promise 拒绝。
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__dshErrs = [];
      const push = (kind, text) => { try { window.__dshErrs.push(kind + ': ' + String(text).slice(0, 600)); } catch {} };
      const origError = console.error;
      console.error = function (...args) { push('console.error', args.map(String).join(' ')); return origError.apply(this, args); };
      const origWarn = console.warn;
      console.warn = function (...args) { push('console.warn', args.map(String).join(' ')); return origWarn.apply(this, args); };
      window.addEventListener('error', (e) => push('window.error', (e && e.message) || 'unknown'));
      window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', (e && e.reason && (e.reason.stack || e.reason.message)) || String(e && e.reason)));
    })();`,
  })

  await send('Page.reload', { ignoreCache: false })

  // 等应用重新就绪。
  const deadline = Date.now() + 30000
  let ready = false
  while (Date.now() < deadline) {
    await sleep(700)
    const value = await evaluate(send, `(() => {
      const rows = document.querySelectorAll('.omnimux-sidebar-nav-entry').length;
      const body = document.body ? document.body.innerText.trim().length : 0;
      return { rows, body, vids: Boolean(document.querySelector('[data-vids-mode]')) };
    })()`)
    if (value && value.body > 0 && value.rows > 0) { ready = true; push('reload-ready', value); break }
  }
  if (!ready) push('reload-ready', false)

  await sleep(3000)

  push('captured-errors', await evaluate(send, `(window.__dshErrs || []).filter((line) => /omnimux|slots|sidebar|inject|locale|layout/i.test(line)).slice(0, 40)`))
  push('captured-errors-all', await evaluate(send, `(window.__dshErrs || []).slice(0, 60)`))
  push('after-reload-dom', await evaluate(send, `(() => ({
    vidsEntry: Boolean(document.querySelector('[data-omnimux-google-vids-entry]')),
    vidsStyles: Boolean(document.getElementById('omnimux-video-google-vids-styles')),
    rows: [...document.querySelectorAll('.omnimux-sidebar-nav-entry')].map((el) => el.className),
    stage: Boolean(document.querySelector('[data-vids-mode]')),
  }))()`))

  try {
    const captured = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(evidenceDir, 'probe3.png'), Buffer.from(captured.data, 'base64'))
  } catch { /* 截图失败不影响诊断 */ }

  fs.writeFileSync(path.join(evidenceDir, 'probe3.json'), JSON.stringify(assertions, null, 2) + '\n')
  return { assertions }
}
