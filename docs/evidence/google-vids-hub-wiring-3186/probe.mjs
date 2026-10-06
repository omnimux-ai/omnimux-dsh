/**
 * 诊断旅程（Issue #3186 浏览器验收排障）：Google Vids 侧栏入口未出现时，
 * 先确认 omnimux-video 客户端是否真的装载、宿主暴露了哪些全局协调器。
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

  push('probe-url', await evaluate(send, 'location.href'))
  push('probe-globals', await evaluate(send, `(() => {
    const keys = ['__omnimuxSidebar','__omnimuxStage','__omnimuxWorkbench','__omnimuxLayout','__omnimuxClipStatus','__DSH_BOOT__','__omnimuxRuntime'];
    const out = {};
    for (const k of keys) {
      const v = window[k];
      out[k] = v === undefined ? 'undefined'
        : (v === null ? 'null' : (typeof v) + ':' + Object.keys(v).slice(0, 25).join(','));
    }
    return out;
  })()`))

  push('probe-sidebar-entries', await evaluate(send, `(() => {
    const nodes = [...document.querySelectorAll('[data-omnimux-google-vids-entry], .omnimux-sidebar-nav-entry, nav button')];
    return nodes.slice(0, 40).map((el) => ({
      tag: el.tagName,
      cls: el.className,
      text: (el.textContent || '').trim().slice(0, 30),
      w: Math.round(el.getBoundingClientRect().width),
    }));
  })()`))

  push('probe-scripts', await evaluate(send, `[...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).slice(0, 60)`))

  push('probe-boot', await evaluate(send, `(() => {
    const boot = window.__DSH_BOOT__;
    if (!boot) return null;
    const json = JSON.stringify(boot);
    return { length: json.length, sample: json.slice(0, 3000) };
  })()`))

  push('probe-vids-in-dom', await evaluate(send, `(() => ({
    stage: Boolean(document.querySelector('[data-vids-mode]')),
    anyVids: document.documentElement.innerHTML.includes('gvids'),
    stageAttr: document.documentElement.dataset.dshProductStage || '',
  }))()`))

  // 直接尝试产品舞台认领，看槽位是否已注册。
  push('probe-claim-attempt', await evaluate(send, `(async () => {
    const before = Boolean(document.querySelector('[data-vids-mode]'));
    const stage = window.__omnimuxStage;
    if (!stage || typeof stage.claim !== 'function') return { before, claimed: false, reason: 'no __omnimuxStage.claim' };
    try { stage.claim('omnimux-vids'); } catch (err) { return { before, claimed: false, reason: String(err && err.message) }; }
    await new Promise((r) => setTimeout(r, 1200));
    return { before, claimed: true, after: Boolean(document.querySelector('[data-vids-mode]')), attr: document.documentElement.dataset.dshProductStage || '' };
  })()`, true))

  push('probe-open-workbench', await evaluate(send, `(async () => {
    const wb = window.__omnimuxWorkbench;
    if (!wb || typeof wb.open !== 'function') return { opened: false, reason: 'no workbench.open' };
    try {
      const opened = await wb.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' });
      await new Promise((r) => setTimeout(r, 1500));
      return { opened, vids: Boolean(document.querySelector('[data-vids-mode]')), clipReady: Boolean(window.__omnimuxClipStatus) };
    } catch (err) { return { opened: false, reason: String(err && err.message) }; }
  })()`, true))

  await sleep(500)
  try {
    const captured = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(captured.data, 'base64')
    fs.writeFileSync(path.join(evidenceDir, 'probe.png'), bytes)
  } catch { /* 截图失败不影响诊断 */ }

  fs.writeFileSync(path.join(evidenceDir, 'probe.json'), JSON.stringify(assertions, null, 2) + '\n')
  return { assertions }
}
