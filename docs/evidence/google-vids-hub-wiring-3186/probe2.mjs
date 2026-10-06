/**
 * 诊断旅程 2（Issue #3186）：确认 omnimux-video 的**客户端 bundle** 是否被宿主装载。
 * 侧栏入口与舞台槽位同时缺失 ⇒ 怀疑客户端插件根本没进 boot 清单。
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

  push('boot-entry-ids', await evaluate(send, `(() => {
    const boot = window.__DSH_BOOT__;
    if (!boot || !Array.isArray(boot.entries)) return null;
    return boot.entries.map((e) => e.id);
  })()`))

  push('boot-omnimux-entries', await evaluate(send, `(() => {
    const boot = window.__DSH_BOOT__;
    if (!boot || !Array.isArray(boot.entries)) return null;
    return boot.entries.filter((e) => String(e.id).includes('omnimux'));
  })()`))

  push('bundle-fetch-probe', await evaluate(send, `(async () => {
    const out = {};
    for (const p of ['omnimux-video', 'omnimux-clip', 'omnimux']) {
      try {
        const res = await fetch('/plugins/??' + p + '/client.js', { redirect: 'follow' });
        const text = await res.text();
        out[p] = { status: res.status, bytes: text.length, head: text.slice(0, 80) };
      } catch (err) { out[p] = { error: String(err && err.message) }; }
    }
    return out;
  })()`, true))

  push('client-globals-by-plugin', await evaluate(send, `(() => ({
    sidebarRows: [...document.querySelectorAll('.omnimux-sidebar-nav-entry')].map((el) => el.className),
    productStage: document.documentElement.dataset.dshProductStage || '',
    hasVidsStyles: Boolean(document.getElementById('omnimux-video-google-vids-styles')),
    styleIds: [...document.querySelectorAll('style[id]')].map((s) => s.id).filter((id) => id.includes('omnimux')),
  }))()`))

  push('boot-entry-count', await evaluate(send, `(() => {
    const boot = window.__DSH_BOOT__;
    return { entries: boot?.entries?.length ?? 0, batches: boot?.batches?.length ?? 0, rev: boot?.rev ?? null };
  })()`))

  await sleep(300)
  try {
    const captured = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(evidenceDir, 'probe2.png'), Buffer.from(captured.data, 'base64'))
  } catch { /* 截图失败不影响诊断 */ }

  fs.writeFileSync(path.join(evidenceDir, 'probe2.json'), JSON.stringify(assertions, null, 2) + '\n')
  return { assertions }
}
