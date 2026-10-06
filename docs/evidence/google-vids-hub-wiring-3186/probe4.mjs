/**
 * 诊断旅程 4（Issue #3186）：区分「协调器不工作」与「omnimux-video 的注册被撤销」。
 * 手段：用同一个协调器手动注册一行探针行，看它是否出现在 DOM 里。
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

  push('coordinator-api', await evaluate(send, `(() => {
    const api = window.__omnimuxSidebar;
    return { keys: Object.keys(api || {}), hasPlace: typeof api?.place === 'function' };
  })()`))

  push('manual-probe-row', await evaluate(send, `(async () => {
    const api = window.__omnimuxSidebar;
    const button = document.createElement('button');
    button.className = 'omnimux-sidebar-nav-entry';
    button.setAttribute('data-probe-entry', '');
    button.textContent = '探针行';
    try {
      const ret = api.register({ id: 'probe-row-3186', rank: 7.6, styles: '', styleId: 'probe-3186-styles', create: () => button });
      await new Promise((r) => setTimeout(r, 800));
      const inDom = Boolean(document.querySelector('[data-probe-entry]'));
      const retType = typeof ret;
      try { api.place && api.place(); } catch {}
      await new Promise((r) => setTimeout(r, 800));
      return { retType, inDom, inDomAfterPlace: Boolean(document.querySelector('[data-probe-entry]')) };
    } catch (err) { return { error: String(err && err.message) }; }
  })()`, true))

  push('vids-row-state', await evaluate(send, `(async () => {
    // 再次尝试：直接以插件相同规格注册 vids 行，判断是「协调器放不进去」还是「插件没注册/被撤销」。
    const api = window.__omnimuxSidebar;
    const button = document.createElement('button');
    button.className = 'omnimux-sidebar-nav-entry omnimux-google-vids-entry';
    button.setAttribute('data-omnimux-google-vids-entry', '');
    button.textContent = 'Google Vids 探针';
    try {
      api.register({ id: 'omnimux-video-google-vids-entry', rank: 7.5, styles: '', styleId: 'probe-vids-3186', create: () => button });
      await new Promise((r) => setTimeout(r, 1000));
      return {
        inDom: Boolean(document.querySelector('[data-omnimux-google-vids-entry]')),
        rows: [...document.querySelectorAll('.omnimux-sidebar-nav-entry')].map((el) => (el.textContent || '').trim()),
      };
    } catch (err) { return { error: String(err && err.message) }; }
  })()`, true))

  await sleep(300)
  try {
    const captured = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(evidenceDir, 'probe4.png'), Buffer.from(captured.data, 'base64'))
  } catch { /* 截图失败不影响诊断 */ }

  fs.writeFileSync(path.join(evidenceDir, 'probe4.json'), JSON.stringify(assertions, null, 2) + '\n')
  return { assertions }
}
