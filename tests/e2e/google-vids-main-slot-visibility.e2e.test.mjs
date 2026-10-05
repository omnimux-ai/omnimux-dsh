/**
 * tests/e2e/google-vids-main-slot-visibility.e2e.test.mjs
 *
 * Issue #3165 — 「探索 → Google Vids」打开后中栏空白的回归门禁（真实 Chromium）。
 *
 * 为什么需要这个装置：`dsh-plugin-desktop` 的 advanced 桌面框架由 Electron 外壳在窗口创建时
 * 注入 profile，隔离 Web QA 运行器只起服务不起窗口，因此 `.dshDesktopConversationSurface`
 * 在整机应用验收里不存在，缺陷不可见。本用例在同一工作树内用真实 Chromium 渲染
 *   - 真实的 hub 产品舞台 chrome（从 `plugins/omnimux/src/client/conversation-box.js` 打包）
 *   - 真实的 advanced 桌面框架 DOM 形状（官方 renderer `MainPanel` → `renderSlot("main")`）
 *   - 真实的入口模块 `mountSidebarEntry`
 * 驱动真实点击并测量 `.omnimux-vids-stage` 的 computed visibility。
 *
 * 自证灵敏度：点击后额外显式调用一次 `claimProductStage('omnimux-vids')` 作为对照组，
 * 断言此时面板确实被隐藏。若 CSS 规则被改坏、装置失去判别力，对照组会失败而不是静默通过。
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { findChromePath } from '../../scripts/worktree-web-qa.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
mkdirSync(join(root, '.tmp'), { recursive: true })
const scratch = mkdtempSync(join(root, '.tmp', 'issue-3165-'))
const bundlePath = join(scratch, 'vids-visibility-bundle.mjs')

// esbuild 解析文件系统路径，不解析 file:// URL。
const entryModulePath = join(root, 'plugins', 'omnimux-video', 'src', 'client', 'sidebar-entry.js')
const hubModulePath = join(root, 'plugins', 'omnimux', 'src', 'client', 'conversation-box.js')
assert.equal(
  existsSync(entryModulePath) && existsSync(hubModulePath),
  true,
  '回归装置必须解析到真实的入口模块与 hub 产品舞台 chrome 源',
)

const DRIVER = `
import { mountSidebarEntry } from ${JSON.stringify(entryModulePath)}
import { claimProductStage, PRODUCT_STAGE_CHROME } from ${JSON.stringify(hubModulePath)}

const result = { harness: {}, afterClick: null, afterControlClaim: null, error: null }

function publish(payload) {
  const pre = document.createElement('pre')
  pre.id = 'vids-result'
  pre.textContent = JSON.stringify(payload)
  document.body.append(pre)
}

function measure(label) {
  const stageEl = document.querySelector('.omnimux-vids-stage')
  const surface = document.querySelector('.dshDesktopConversationSurface')
  const rect = stageEl ? stageEl.getBoundingClientRect() : null
  let visibleDescendants = 0
  if (stageEl) {
    for (const el of stageEl.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) visibleDescendants += 1
    }
  }
  return {
    label,
    hasStage: Boolean(stageEl),
    stageVisibility: stageEl ? getComputedStyle(stageEl).visibility : null,
    rect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    visibleDescendants,
    productStage: document.documentElement.getAttribute('data-dsh-product-stage'),
    surfaceChildVisibility: surface && surface.firstElementChild
      ? getComputedStyle(surface.firstElementChild).visibility
      : null,
  }
}

try {
  const mainSlot = document.querySelector('[data-slot="main"]')
  const calls = []
  const snapshot = { activePanelId: null }
  const layout = {
    selectPanel(id) {
      calls.push(['selectPanel', id])
      snapshot.activePanelId = id
      mainSlot.innerHTML = id === 'omnimux-vids'
        ? '<div class="omnimux-vids-stage"><header class="gvids-header"><h1>Google Vids</h1></header><div class="gvids-body"><button type="button">生成</button></div></div>'
        : ''
    },
    panelInfo: { getSnapshot: () => snapshot, subscribe: () => () => {} },
  }
  window.__omnimuxWorkbench = { open: async () => true, layout }
  window.__omnimuxStage = {
    claim: claimProductStage,
    release(id) {
      if (document.documentElement.dataset.dshProductStage === id) {
        delete document.documentElement.dataset.dshProductStage
      }
    },
  }

  let entry = null
  window.__omnimuxSidebar = { register(row) { entry = row.create(); return () => {} } }
  mountSidebarEntry((key) => key, { current: 'zh' }, undefined, layout)
  if (!entry) throw new Error('sidebar entry did not register with the coordinator')

  result.harness = {
    hasConversationSurface: Boolean(document.querySelector('.dshDesktopConversationSurface')),
    hideRulePresent: PRODUCT_STAGE_CHROME.includes(
      '.dshDesktopConversationSurface > *:not([data-slot="shell.overlay"])',
    ),
    chromeRuleCount: (PRODUCT_STAGE_CHROME.match(/dshDesktopConversationSurface/g) || []).length,
  }

  entry.click()
  setTimeout(() => {
    try {
      result.afterClick = { ...measure('afterClick'), layoutCalls: calls.slice() }
      claimProductStage('omnimux-vids')
      result.afterControlClaim = measure('afterControlClaim')
    } catch (err) {
      result.error = String(err && err.message ? err.message : err)
    }
    publish(result)
  }, 400)
} catch (err) {
  result.error = String(err && err.message ? err.message : err)
  publish(result)
}
`

// 装置契约：驱动脚本必须打包真实模块路径（file:// URL 会让 esbuild 解析失败）。
assert.equal(
  DRIVER.includes(entryModulePath) && DRIVER.includes(hubModulePath),
  true,
  '驱动脚本必须引用真实模块的绝对路径',
)

const HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>vids main-slot visibility</title></head>
<body>
  <div class="dshDesktopFrame" data-desktop-mode="advanced" data-desktop-platform="darwin">
    <main class="dshDesktopConversationSurface">
      <div data-slot="main" style="display:contents"></div>
    </main>
    <div class="dshDesktopOverlay" data-shell-overlay></div>
  </div>
  <script type="module" src="/bundle.mjs"></script>
</body></html>`

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.mjs') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(readFileSync(bundlePath))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(HTML)
  })
  return new Promise((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

function runChrome(chromePath, url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--virtual-time-budget=6000',
      '--dump-dom',
      url,
    ])
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk.toString() })
    child.stderr.on('data', (chunk) => { err += chunk.toString() })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(new Error(`chrome-dump-dom-timeout: ${err.slice(-400)}`))
    }, 60000)
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error) })
    child.on('close', () => { clearTimeout(timer); resolvePromise(out) })
  })
}

test('Issue #3165: 真实 Chromium 中点击 Google Vids 入口后 main 插槽面板必须可见', async (t) => {
  const chromePath = findChromePath()
  assert.ok(chromePath, '需要本机 Chromium/Chrome 才能运行本回归门禁')

  writeFileSync(join(scratch, 'driver.js'), DRIVER)
  await build({
    entryPoints: [join(scratch, 'driver.js')],
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  })

  const server = await startServer()
  const { port } = server.address()
  t.after(() => {
    server.close()
    rmSync(scratch, { recursive: true, force: true })
  })

  const dom = await runChrome(chromePath, `http://127.0.0.1:${port}/`)
  const match = /<pre id="vids-result">([\s\S]*?)<\/pre>/.exec(dom)
  assert.ok(match, `页面未产出测量结果（DOM 片段: ${dom.slice(0, 600)}）`)
  const result = JSON.parse(match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
  assert.equal(result.error, null, `页面驱动异常: ${result.error}`)

  // 装置身份：真实 hub chrome + 真实 advanced 框架 DOM
  assert.equal(result.harness.hasConversationSurface, true, '必须渲染 advanced 桌面框架的会话列')
  assert.equal(result.harness.hideRulePresent, true, '必须加载真实 PRODUCT_STAGE_CHROME 的会话列隐藏规则')

  // 入口真实路径：点击后必须选中 main 面板，且绝不写产品舞台标记
  assert.deepEqual(
    result.afterClick.layoutCalls,
    [['selectPanel', 'omnimux-vids']],
    '点击入口必须只做一次 selectPanel，不得 claim 产品舞台',
  )
  assert.equal(result.afterClick.productStage, null, 'main 插槽面板不得写 data-dsh-product-stage')
  assert.equal(result.afterClick.hasStage, true, '点击后 main 插槽必须挂载 Google Vids 面板')
  assert.notEqual(result.afterClick.stageVisibility, 'hidden', 'Google Vids 面板不得被产品舞台遮罩隐藏')
  assert.equal(result.afterClick.surfaceChildVisibility, 'visible', '会话列子节点必须可见')
  assert.ok(result.afterClick.rect.w > 100 && result.afterClick.rect.h > 50, '面板必须有正几何')
  assert.ok(result.afterClick.visibleDescendants > 0, '面板必须有可见内容')

  // 对照组：显式 claim（修复前行为）必须隐藏同一面板 —— 证明装置看得见这一类缺陷
  assert.equal(result.afterControlClaim.productStage, 'omnimux-vids')
  assert.equal(result.afterControlClaim.stageVisibility, 'hidden', '对照组必须复现「claim → 面板被隐藏」')
})
