#!/usr/bin/env node
/**
 * Issue #3528 真实浏览器证据：首页自定义排序客户端写失败留痕。
 *
 * 为什么需要它：`plugins/omnimux-market/src/client/plaza/plazaUtils.js` 是
 * `shell.overlay` 客户端代码，现有 `worktree-web-qa` Stage 清单不覆盖 market；
 * 本脚本按仓库既有证据脚本模式（scripts/capture-media-preview-evidence.mjs），
 * 用 ego lite TaskSpace 在真实 Chrome 中加载「由本 worktree 源码 esbuild 打包的
 * plazaUtils」页面，点击触发两次失败写入，断言：
 *   - console.warn 留痕 2 条（reset / move-to-top），含服务端错误消息
 *   - 无 unhandled rejection
 *   - 本地乐观状态仍更新
 * 并截图 + 写结构化报告，证明渲染真实发生。
 *
 * 源码/bundle 哈希写入报告，证明页面加载的是 worktree 源码而非手写副本。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runEgoSteps } from './lib/ego-browser-steps.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SOURCE = join(ROOT, 'plugins', 'omnimux-market', 'src', 'client', 'plaza', 'plazaUtils.js')
const EVIDENCE_DIR = join(ROOT, 'docs', 'evidence', 'home-order-client-feedback-3528')
const WORK_DIR = join(ROOT, '.workbuddy', 'evidence', 'home-order-feedback-3528')
const HARNESS = join(WORK_DIR, 'harness.html')
const SHOT = join(EVIDENCE_DIR, 'browser-console.png')
const REPORT = join(EVIDENCE_DIR, 'report.json')

const marketRequire = createRequire(join(ROOT, 'plugins', 'omnimux-market', 'package.json'))
const { build } = marketRequire('esbuild')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function bundleSource() {
  const sourceBytes = readFileSync(SOURCE)
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [SOURCE],
    bundle: true,
    format: 'iife',
    globalName: 'PlazaUtils',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  })
  const code = result.outputFiles && result.outputFiles[0] ? result.outputFiles[0].text : ''
  if (!code) throw new Error('esbuild produced no plazaUtils bundle')
  return { sourceSha256: sha256(sourceBytes), bundleSha256: sha256(code), code }
}

function renderHarness(code) {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Issue #3528 home-order client feedback</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { color: #94a3b8; font-size: 13px; margin: 4px 0 16px; }
  button { margin-right: 12px; padding: 8px 14px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; cursor: pointer; }
  #log { margin-top: 16px; padding: 12px; border: 1px solid #334155; border-radius: 8px; min-height: 72px; font-size: 12px; white-space: pre-wrap; color: #fbbf24; background: #111827; }
  #status { font-size: 13px; color: #38bdf8; }
</style></head>
<body>
  <h1>首页自定义排序：写失败客户端留痕（Issue #3528）</h1>
  <p>按钮会调用由本 worktree 源码打包的 plazaUtils，并注入一个 reject 的 apiFn（模拟服务端 500）。</p>
  <button id="reset">重置排序（预期失败）</button>
  <button id="move">置顶排序（预期失败）</button>
  <div id="status">warnings: 0 · unhandled: 0</div>
  <pre id="log">（等待触发）</pre>
  <script>${code}</script>
  <script>
    (() => {
      const warnings = [];
      const unhandled = [];
      const originalWarn = console.warn;
      const render = () => {
        document.getElementById('log').textContent = warnings.length === 0 ? '（没有 warn 留痕）' : warnings.join('\\n');
        document.getElementById('status').textContent = 'warnings: ' + warnings.length + ' · unhandled: ' + unhandled.length;
      };
      console.warn = (message) => {
        warnings.push(String(message));
        originalWarn(String(message));
        render();
      };
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        unhandled.push(reason && reason.message ? reason.message : String(reason));
        render();
      });
      const state = {
        lastOrder: 'unset',
        history: [],
        setCustomOrder(value) { this.lastOrder = value; this.history.push(value); },
      };
      const failingApi = () => Promise.reject(new Error('home custom order not saved: home order state not writable (EACCES)'));
      document.getElementById('reset').addEventListener('click', () => {
        PlazaUtils.handleResetOrder(state, failingApi);
      });
      document.getElementById('move').addEventListener('click', () => {
        PlazaUtils.handleMoveToTop('b', [{ id: 'a' }, { id: 'b' }], state, failingApi);
      });
      window.__evidence = { warnings, unhandled, state, ready: true };
      render();
    })();
  </script>
</body></html>
`
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  mkdirSync(WORK_DIR, { recursive: true })
  const bundled = await bundleSource()
  writeFileSync(HARNESS, renderHarness(bundled.code))

  const run = await runEgoSteps({
    spaceName: `home-order-feedback-3528-${Date.now()}`,
    width: 960,
    height: 640,
    deviceScaleFactor: 2,
    steps: [
      { type: 'goto', url: `file://${HARNESS}`, settleMs: 800 },
      { type: 'evaluate', name: 'harness-ready', expression: 'Boolean(window.__evidence && window.__evidence.ready)' },
      { type: 'evaluate', name: 'click-reset', expression: "(() => { document.getElementById('reset').click(); return true })()" },
      { type: 'wait', ms: 300 },
      { type: 'evaluate', name: 'click-move', expression: "(() => { document.getElementById('move').click(); return true })()" },
      { type: 'wait', ms: 300 },
      {
        type: 'evaluate',
        name: 'observed',
        expression: `(() => ({
          warnings: window.__evidence.warnings,
          unhandled: window.__evidence.unhandled,
          lastOrder: window.__evidence.state.lastOrder,
          history: window.__evidence.state.history,
          statusText: document.getElementById('status').textContent,
          logText: document.getElementById('log').textContent,
        }))()`,
      },
      { type: 'screenshot', path: SHOT },
    ],
  })

  const observed = run.values.find((entry) => entry.name === 'observed')
  const ready = run.values.find((entry) => entry.name === 'harness-ready')
  const values = observed && observed.value ? observed.value : {}
  const warnings = Array.isArray(values.warnings) ? values.warnings : []
  const unhandled = Array.isArray(values.unhandled) ? values.unhandled : []
  const shot = run.shots.find((entry) => entry.path === SHOT)
  const shotBytes = readFileSync(SHOT)

  const assertions = [
    { name: 'harness-ready', pass: ready ? ready.value === true : false },
    { name: 'warning-count', pass: warnings.length === 2, detail: warnings.length },
    { name: 'warning-reset', pass: warnings.some((text) => /home custom order write failed \(reset\)/.test(text)) },
    { name: 'warning-move-to-top', pass: warnings.some((text) => /home custom order write failed \(move-to-top\)/.test(text)) },
    { name: 'warning-has-server-error', pass: warnings.every((text) => /home order state not writable \(EACCES\)/.test(text)) },
    { name: 'no-unhandled-rejection', pass: unhandled.length === 0, detail: unhandled },
    { name: 'optimistic-state-history', pass: JSON.stringify(values.history) === '[null,["b","a"]]', detail: values.history },
    { name: 'rendered-log', pass: typeof values.logText === 'string' && values.logText.includes('home custom order not saved') },
    { name: 'rendered-status', pass: typeof values.statusText === 'string' && values.statusText.includes('warnings: 2') },
    { name: 'screenshot-bytes', pass: shotBytes.length > 20_000, detail: shotBytes.length },
  ]
  const pass = assertions.every((entry) => entry.pass)
  const report = {
    task: '3528',
    generatedAt: new Date().toISOString(),
    script: 'scripts/evidence-home-order-feedback-3528.mjs',
    source: { path: 'plugins/omnimux-market/src/client/plaza/plazaUtils.js', sha256: bundled.sourceSha256 },
    bundleSha256: bundled.bundleSha256,
    engine: { userAgent: run.userAgent, taskSpaceId: run.spaceId, viewport: { width: 960, height: 640, deviceScaleFactor: 2 } },
    observed: {
      warnings,
      unhandled,
      lastOrder: values.lastOrder,
      history: values.history,
      statusText: values.statusText,
      logText: values.logText,
    },
    screenshot: { path: 'docs/evidence/home-order-client-feedback-3528/browser-console.png', bytes: shotBytes.length, sha256: sha256(shotBytes), cdpShot: shot || null },
    assertions,
    pass,
  }
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)

  if (!pass) {
    console.error('❌ FAIL:', assertions.filter((entry) => !entry.pass).map((entry) => entry.name).join(', '))
    process.exit(1)
  }
  console.log(`✅ PASS · TaskSpace ${run.spaceId} · ${run.userAgent}`)
  console.log(`   证据: ${REPORT}`)
  console.log(`   截图: ${SHOT} (${shotBytes.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
