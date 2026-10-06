/**
 * Google Vids 面板（Issue #3186）工作树真实浏览器验收旅程。
 *
 * 由 `pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/journey.mjs` 注入：
 * 运行器已起完整应用（`ui` 模式影子实例、动态端口、自清理）并完成同源登录，
 * 本模块在真实无头 Chrome 里执行真实导航与交互，逐步截图并返回断言。
 *
 * 每一步都独立捕获失败：某步不可用只让该步 `pass:false`，绝不静默当成通过，
 * 也不会让后续步骤失去证据。
 */

import fs from 'node:fs'
import path from 'node:path'

/** @param {any} send */
async function evaluate(send, expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  })
  if (result?.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.text || 'unknown'}`)
  }
  return result?.result?.value
}

/** @param {any} send */
async function shot(send, evidenceDir, name) {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  const bytes = Buffer.from(captured.data, 'base64')
  const file = path.join(evidenceDir, name)
  fs.writeFileSync(file, bytes)
  return { path: file, bytes: bytes.length }
}

/** 轮询一个页面谓词。 */
async function waitFor(send, expression, { timeoutMs = 12000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await evaluate(send, expression)
    if (last) return last
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return last
}

/** 面板四模式的 DOM 事实（不依赖 React 内部状态）。 */
const PANEL_FACTS = `(() => {
  const tabs = [...document.querySelectorAll('[data-vids-mode]')].map((el) => ({
    mode: el.getAttribute('data-vids-mode'),
    label: (el.textContent || '').trim(),
    active: el.getAttribute('data-active') === 'true',
    width: Math.round(el.getBoundingClientRect().width),
    height: Math.round(el.getBoundingClientRect().height),
  }));
  const attaches = [...document.querySelectorAll('[data-vids-attach]')].map((el) => el.getAttribute('data-vids-attach'));
  const params = [...document.querySelectorAll('[data-vids-param]')].map((el) => ({
    key: el.getAttribute('data-vids-param'),
    value: el.value,
    options: [...el.options].map((o) => o.value),
  }));
  const chip = document.querySelector('[data-vids-asset-state]');
  const thumb = document.querySelector('img.gvids-chip-thumb');
  return {
    stage: Boolean(document.querySelector('[data-vids-mode]')),
    ready: document.querySelector('.gvids-stage')?.getAttribute('data-ready')
      ?? document.querySelector('[data-ready]')?.getAttribute('data-ready')
      ?? null,
    tabs,
    attaches,
    params,
    summary: document.querySelector('[data-vids-param-summary]')?.textContent?.trim() || '',
    chip: chip ? {
      kind: chip.getAttribute('data-vids-asset'),
      state: chip.getAttribute('data-vids-asset-state'),
      text: (chip.textContent || '').trim(),
    } : null,
    thumb: thumb ? { src: thumb.getAttribute('src') || '', naturalWidth: thumb.naturalWidth } : null,
    submitDisabled: document.querySelector('[data-vids-submit]')?.disabled ?? null,
    submitReason: document.querySelector('[data-vids-submit-reason]')?.textContent?.trim() || '',
    feedText: (document.querySelector('.gvids-feed')?.innerText || '').trim(),
  };
})()`

/**
 * @param {{ send: Function, sleep: Function, evidenceDir: string, origin: string, io: any }} ctx
 */
export default async function journey({ send, sleep, evidenceDir, origin, io }) {
  const assertions = []
  const steps = []

  const record = (step, pass, detail) => {
    steps.push({ step, pass: pass === true, detail: detail ?? null })
    assertions.push({ name: step, pass: pass === true, detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null) })
  }

  // 一个真实可上传的本地 PNG（浏览器文件选择器要读真实文件）。
  const pngPath = path.join(evidenceDir, 'journey-local-image.png')
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOUlEQVR42u3OMQEAAAgDoJnc6BpjDyQgd1WKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqK6g8GxQABkLcV9wAAAABJRU5ErkJggg==',
    'base64',
  )
  fs.writeFileSync(pngPath, pngBytes)

  // ---- 步骤 1：打开 Google Vids 面板（真实点击侧栏入口） ----
  try {
    const entry = await waitFor(send, `(() => {
      const el = document.querySelector('[data-omnimux-google-vids-entry]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { label: (el.textContent || '').trim(), width: Math.round(r.width), height: Math.round(r.height) };
    })()`, { timeoutMs: 20000 })

    if (!entry) {
      record('j1-panel-entry-present', false, '侧栏未渲染 [data-omnimux-google-vids-entry]：omnimux-video 客户端未装载')
    } else {
      record('j1-panel-entry-present', entry.width > 0 && entry.height > 0, entry)
      await evaluate(send, `(() => { document.querySelector('[data-omnimux-google-vids-entry]').click(); return true })()`)
      const opened = await waitFor(send, `Boolean(document.querySelector('[data-vids-mode]'))`, { timeoutMs: 20000 })
      record('j1-panel-opened', opened === true, opened === true ? '面板舞台已渲染' : '点击侧栏入口后未出现 [data-vids-mode]')
    }
  } catch (error) {
    record('j1-panel-opened', false, `打开面板抛错：${error?.message ?? String(error)}`)
  }

  await sleep(600)
  try {
    const s = await shot(send, evidenceDir, 'journey-01-panel-create.png')
    record('j1-screenshot', s.bytes > 1000, s)
  } catch (error) {
    record('j1-screenshot', false, String(error?.message ?? error))
  }

  let facts = null
  try {
    facts = await evaluate(send, PANEL_FACTS)
  } catch (error) {
    record('j2-panel-facts', false, String(error?.message ?? error))
  }

  // ---- 步骤 2：四模式标签与参数控件 ----
  if (facts) {
    const modes = (facts.tabs || []).map((t) => t.mode)
    record('j2-four-mode-tabs', JSON.stringify(modes) === JSON.stringify(['create', 'animate', 'modify', 'extend']), { modes, tabs: facts.tabs })
    record('j2-mode-labels', JSON.stringify((facts.tabs || []).map((t) => t.label)) === JSON.stringify(['创建', '动画', '修改', '延续']),
      (facts.tabs || []).map((t) => t.label))
    record('j2-default-active-create', (facts.tabs || []).some((t) => t.mode === 'create' && t.active === true), facts.tabs)
    record('j2-param-controls', JSON.stringify((facts.params || []).map((p) => p.key)) === JSON.stringify(['seconds', 'resolution', 'aspectRatio']),
      facts.params)
    record('j2-param-summary', /720p · 16:9 · 10s/.test(facts.summary || ''), facts.summary)
    record('j2-stage-editor-ready', facts.ready === 'true', { ready: facts.ready })
  } else {
    record('j2-four-mode-tabs', false, '面板未渲染，无法读取模式标签')
  }

  // ---- 步骤 3：逐模式附件行与参数控件 ----
  const perMode = {}
  for (const [mode, expected] of [
    ['create', { attaches: [], screenshot: 'journey-02-mode-create.png' }],
    ['animate', { attaches: ['image'], screenshot: 'journey-03-mode-animate.png' }],
    ['modify', { attaches: ['video', 'replacement-image'], screenshot: 'journey-04-mode-modify.png' }],
    ['extend', { attaches: ['video'], screenshot: 'journey-05-mode-extend.png' }],
  ]) {
    try {
      const clicked = await evaluate(send, `(() => {
        const el = document.querySelector('[data-vids-mode="${mode}"]');
        if (!el) return false;
        el.click();
        return true;
      })()`)
      if (!clicked) {
        record(`j3-${mode}-attach-row`, false, `未找到模式标签 ${mode}`)
        continue
      }
      await sleep(400)
      const state = await evaluate(send, PANEL_FACTS)
      perMode[mode] = { attaches: state.attaches, active: (state.tabs || []).find((t) => t.mode === mode)?.active === true, params: state.params, summary: state.summary }
      const attachesOk = JSON.stringify(state.attaches) === JSON.stringify(expected.attaches)
      record(`j3-${mode}-attach-row`, attachesOk && perMode[mode].active, perMode[mode])
      record(`j3-${mode}-param-controls`, (state.params || []).length === 3, state.params)
      const s = await shot(send, evidenceDir, expected.screenshot)
      record(`j3-${mode}-screenshot`, s.bytes > 1000, s)
    } catch (error) {
      record(`j3-${mode}-attach-row`, false, String(error?.message ?? error))
    }
  }

  // ---- 步骤 4：选本地图片 → 真实上传到插件自身 HTTP 面 + chip 本地缩略图 ----
  let uploadEvidence = null
  try {
    // 记录页面对上传路由的真实请求/响应（不改业务代码，只在页面上下文挂钩 fetch）。
    await evaluate(send, `(() => {
      if (window.__vidsUploadLog) return true;
      window.__vidsUploadLog = [];
      const orig = window.fetch;
      window.fetch = async function (...args) {
        const res = await orig.apply(this, args);
        try {
          const url = String(args[0] && args[0].url ? args[0].url : args[0]);
          if (url.includes('/omnimux-video/api/veo/uploads')) {
            window.__vidsUploadLog.push({ url, status: res.status, body: await res.clone().json() });
          }
        } catch (err) { /* 记录失败不影响业务请求 */ }
        return res;
      };
      return true;
    })()`)

    await evaluate(send, `(() => { document.querySelector('[data-vids-mode="animate"]').click(); return true })()`)
    await sleep(400)

    await send('DOM.enable')
    const doc = await send('DOM.getDocument', { depth: -1 })
    const found = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: 'label[data-vids-attach="image"] input[type="file"]',
    })
    if (!found?.nodeId) {
      record('j4-file-input-present', false, '动画模式未渲染图片文件选择器')
    } else {
      record('j4-file-input-present', true, { nodeId: found.nodeId })
      await send('DOM.setFileInputFiles', { nodeId: found.nodeId, files: [pngPath] })

      const chipReady = await waitFor(send, `(() => {
        const chip = document.querySelector('[data-vids-asset-state]');
        return chip && chip.getAttribute('data-vids-asset-state') === 'ready' ? true : null;
      })()`, { timeoutMs: 15000 })
      const afterUpload = await evaluate(send, PANEL_FACTS)
      const log = await evaluate(send, `window.__vidsUploadLog || []`)
      uploadEvidence = { chip: afterUpload.chip, thumb: afterUpload.thumb, log }

      record('j4-upload-route-200', Array.isArray(log) && log.length > 0 && log[0].status === 200, log)
      const servedUrl = Array.isArray(log) && log[0]?.body?.url ? String(log[0].body.url) : ''
      record('j4-served-url-absolute-on-plugin-surface',
        servedUrl.startsWith(`${origin}/omnimux-video/api/veo/media/`) && !servedUrl.startsWith('blob:'),
        { servedUrl })
      record('j4-chip-ready-with-local-thumbnail',
        chipReady === true
        && afterUpload.chip?.state === 'ready'
        && Boolean(afterUpload.thumb?.src)
        && String(afterUpload.thumb?.src).startsWith('blob:')
        && afterUpload.thumb?.naturalWidth > 0,
        { chipReady, chip: afterUpload.chip, thumb: afterUpload.thumb })

      // 从 Node 侧直接抓取该服务地址：证明它在本机可被抓取（不是浏览器内的临时地址）。
      if (servedUrl) {
        const res = await fetch(servedUrl)
        const bytes = Buffer.from(await res.arrayBuffer())
        record('j4-served-url-fetchable-from-node', res.status === 200 && bytes.length === pngBytes.length,
          { status: res.status, contentType: res.headers.get('content-type'), bytes: bytes.length })
      }
      const s = await shot(send, evidenceDir, 'journey-06-animate-image-uploaded.png')
      record('j4-screenshot', s.bytes > 1000, s)
    }
  } catch (error) {
    record('j4-upload-route-200', false, String(error?.message ?? error))
  }

  // ---- 步骤 5：本机通道未配置时提交，结果卡给出可读原因 ----
  let submitEvidence = null
  try {
    await evaluate(send, `(() => { document.querySelector('[data-vids-mode="create"]').click(); return true })()`)
    await sleep(400)
    await evaluate(send, `(() => {
      const ta = document.querySelector('textarea.gvids-input-area');
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '一只猫在草地上奔跑，镜头缓慢推近');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await sleep(500)
    const before = await evaluate(send, PANEL_FACTS)
    const clicked = await evaluate(send, `(() => {
      const btn = document.querySelector('[data-vids-submit]');
      if (!btn || btn.disabled) return { clicked: false, disabled: true, reason: document.querySelector('[data-vids-submit-reason]')?.textContent || '' };
      btn.click();
      return { clicked: true, disabled: false };
    })()`)
    record('j5-submit-clicked', clicked?.clicked === true, { before: { submitDisabled: before?.submitDisabled, reason: before?.submitReason }, clicked })

    if (clicked?.clicked) {
      const failed = await waitFor(send, `(() => {
        const feed = document.querySelector('.gvids-feed');
        const text = feed ? feed.innerText : '';
        return /失败/.test(text) ? text : null;
      })()`, { timeoutMs: 30000 })
      const after = await evaluate(send, PANEL_FACTS)
      submitEvidence = { feedText: after?.feedText ?? failed }
      record('j5-unconfigured-reason-on-result-card',
        /本机 Google Vids 通道未配置/.test(String(after?.feedText || failed || '')),
        { feedText: String(after?.feedText || failed || '').slice(0, 400) })
      record('j5-no-silent-success',
        !/成片已就绪/.test(String(after?.feedText || '')),
        { feedText: String(after?.feedText || '').slice(0, 400) })
      const s = await shot(send, evidenceDir, 'journey-07-submit-unconfigured.png')
      record('j5-screenshot', s.bytes > 1000, s)
    } else {
      record('j5-unconfigured-reason-on-result-card', false, `提交键不可用：${JSON.stringify(clicked)}`)
    }
  } catch (error) {
    record('j5-submit-clicked', false, String(error?.message ?? error))
  }

  const report = {
    origin,
    capturedAt: new Date().toISOString(),
    steps,
    perMode,
    uploadEvidence,
    submitEvidence,
  }
  try {
    fs.writeFileSync(path.join(evidenceDir, 'journey-steps.json'), JSON.stringify(report, null, 2) + '\n')
    io?.writeFileSync?.(path.join(evidenceDir, 'journey-steps.json'), JSON.stringify(report, null, 2) + '\n')
  } catch (error) {
    record('journey-report-written', false, String(error?.message ?? error))
  }

  return { assertions }
}
