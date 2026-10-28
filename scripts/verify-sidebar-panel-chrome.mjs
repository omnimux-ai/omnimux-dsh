#!/usr/bin/env node
/**
 * 真实浏览器验收：侧栏官方 panel 行对齐产品行度量 + 「更多」菜单右侧弹出并去透明（Issue #3802）。
 *
 * 验的是**生产源码**：`plugins/omnimux/src/client/sidebar-panel-chrome.js` 经 esbuild 打成
 * 单文件 ESM，由一个临时静态服务（127.0.0.1:0）提供，页面里用真实 DOM 骨架（官方 panel 行
 * 与产品自定义行的类名/结构）加载它，再经 CDP 量几何与计算样式。
 *
 * 页面骨架镜像官方结构，不复制本模块逻辑：样式、位移、材质全部由被测模块产出。
 *
 * 产物落 `docs/evidence/official-panel-fold-into-more/`：
 *   - sidebar-panel-chrome.png   展开态侧栏 + 已打开的「更多」菜单
 *   - sidebar-panel-chrome.json  runId、Chrome 版本、逐条断言 pass/actual
 *
 * 任一断言失败即非零退出；浏览器起不来时不写任何产物（失败的运行不得留下伪造证据）。
 */

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = path.join(ROOT, 'plugins/omnimux/src/client/sidebar-panel-chrome.js')
const MENU_SOURCE_DIR = path.join(ROOT, 'plugins/omnimux/src/client')
const EVIDENCE_DIR = path.join(ROOT, 'docs/evidence/official-panel-fold-into-more')
const PNG_PATH = path.join(EVIDENCE_DIR, 'sidebar-panel-chrome.png')
const JSON_PATH = path.join(EVIDENCE_DIR, 'sidebar-panel-chrome.json')

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CHROME_PATH = process.env.CHROME_PATH || DEFAULT_CHROME
const VIEWPORT = { width: 1440, height: 900 }
const SIDEBAR_WIDTH = 280

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadEsbuild() {
  try {
    return await import('esbuild')
  } catch {
    const require = createRequire(path.join(ROOT, 'package.json'))
    return require('esbuild')
  }
}

/** 官方侧栏骨架：panel 行（插件 / 自动化任务 / 更多）+ 产品自定义行 + 一个 portal 菜单。 */
function buildIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>侧栏 panel 行度量 + 更多菜单落位 · 浏览器验收</title>
<style>
  /* 官方 token 的最小可用镜像（只放被测规则消费到的那几个）。 */
  :root {
    --dsw-alias-bg-base: #17171a;
    --dsw-alias-bg-layer-2: #232326;
    --dsw-alias-border-l1: rgba(255, 255, 255, 0.08);
    --dsw-alias-border-l2: rgba(255, 255, 255, 0.12);
    --dsw-alias-label-primary: #f2f2f5;
    --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.06);
    --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.10);
    --dsw-radius-md: 12px;
    --dsw-menu-surface-fill: rgba(67, 69, 74, 0.45);
    --dsw-menu-backdrop-filter: blur(40px) saturate(150%);
    --dsw-font-s-14: 14px/22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  }
  html, body { margin: 0; height: 100%; }
  body {
    background: #0e0e10;
    color: var(--dsw-alias-label-primary);
    font: var(--dsw-font-s-14);
    display: flex;
  }

  /* 官方 SidebarRoot 的列（壳层同样带 sidebarCol 类名）。 */
  .AppFrame_sidebarCol__qa {
    width: ${SIDEBAR_WIDTH}px;
    flex: none;
    box-sizing: border-box;
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    background: #1b1b1e;
  }
  .SidebarRoot_newSession__qa {
    height: 38px; margin: 0 2px 12px; border-radius: 12px;
    border: 0.5px solid var(--dsw-alias-border-l2);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; line-height: 22px;
  }

  /* 官方 panelList / panelRow 原值（36px / 7px 8px / 12px 圆角 / 16px 图标）。 */
  .SidebarRoot_panelList__qa { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
  /* 官方 .moreAnchor：包住「更多」按钮的纵向 flex 容器。 */
  .SidebarRoot_moreAnchor__qa { display: flex; flex-direction: column; }
  .SidebarRoot_panelRow__qa {
    box-sizing: border-box; display: flex; align-items: center; gap: 8px;
    margin: 0 2px; min-height: 36px; padding: 7px 8px;
    border: none; border-radius: var(--dsw-radius-md); background: transparent;
    color: var(--dsw-alias-label-primary); font: inherit; line-height: 22px; text-align: left; cursor: pointer;
  }
  .SidebarRoot_panelGlyph__qa { flex: none; display: inline-flex; align-items: center; justify-content: center; }
  .SidebarRoot_panelTitle__qa { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 产品自定义行原值（32px / 0 8px / 8px 圆角 / 14px 图标）。 */
  .omnimux-sidebar-nav-entry {
    box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
    width: calc(100% - 8px); height: 32px; margin: 0 4px; padding: 0 8px;
    border: none; border-radius: 8px; background: transparent;
    color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px;
    cursor: pointer; text-align: left;
  }
  .omnimux-sidebar-nav-entry-icon { flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; }
  .omnimux-sidebar-nav-entry-icon svg { display: block; width: 14px; height: 14px; }
  .omnimux-sidebar-nav-entry-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px; }

  /* 官方 MenuSurface：材质层消费两个自定义属性。 */
  .MenuSurface_surface__qa {
    position: fixed; box-sizing: border-box; padding: 4px;
    border-radius: 16px; isolation: isolate;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  }
  .MenuSurface_material__qa {
    position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    background: var(--dsw-menu-surface-fill);
    backdrop-filter: var(--dsw-menu-backdrop-filter);
    pointer-events: none;
  }
  .SidebarRoot_moreMenu__qa { width: 288px; max-width: calc(100vw - 24px); }
  .SettingsMenu_list__qa { width: 260px; }
  .Menu_item__qa {
    display: flex; align-items: center; gap: 6px; width: 100%; min-height: 34px;
    padding: 6px 8px; border: 0; border-radius: 12px; background: transparent;
    color: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer;
  }
  .Menu_itemIcon__qa { flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; }

  .stage { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding-top: 80px; opacity: 0.6; }
</style>
</head>
<body>
  <div class="AppFrame_sidebarCol__qa" data-pane="sidebar">
    <div class="SidebarRoot_newSession__qa">新会话</div>

    <nav class="SidebarRoot_panelList__qa" aria-label="面板">
      <button type="button" class="SidebarRoot_panelRow__qa" data-qa-row="plugins" aria-label="插件">
        <span class="SidebarRoot_panelGlyph__qa" aria-hidden="true">${ICON}</span>
        <span class="SidebarRoot_panelTitle__qa">插件</span>
      </button>
      <button type="button" class="SidebarRoot_panelRow__qa" data-qa-row="schedules" aria-label="自动化任务">
        <span class="SidebarRoot_panelGlyph__qa" aria-hidden="true">${ICON}</span>
        <span class="SidebarRoot_panelTitle__qa">自动化任务</span>
      </button>
      <span class="SidebarRoot_moreAnchor__qa">
        <button type="button" class="SidebarRoot_panelRow__qa" id="qa-more-anchor" data-qa-row="more"
          aria-label="更多" aria-haspopup="menu" aria-expanded="true">
          <span class="SidebarRoot_panelGlyph__qa" aria-hidden="true">${ICON}</span>
          <span class="SidebarRoot_panelTitle__qa">更多</span>
        </button>
      </span>
    </nav>

    <button type="button" class="omnimux-sidebar-nav-entry" data-qa-row="custom-workflow">
      <span class="omnimux-sidebar-nav-entry-icon">${ICON}</span>
      <span class="omnimux-sidebar-nav-entry-label">项目</span>
    </button>
    <button type="button" class="omnimux-sidebar-nav-entry" data-qa-row="custom-assets">
      <span class="omnimux-sidebar-nav-entry-icon">${ICON}</span>
      <span class="omnimux-sidebar-nav-entry-label">资产库</span>
    </button>
    <button type="button" class="omnimux-sidebar-nav-entry" data-qa-row="custom-inspiration">
      <span class="omnimux-sidebar-nav-entry-icon">${ICON}</span>
      <span class="omnimux-sidebar-nav-entry-label">灵感社区</span>
    </button>
  </div>

  <main class="stage">会话列（骨架，仅用于证明菜单没有压在侧栏上）</main>

  <!-- 官方「更多」菜单：portal 到 body，React 每帧写 inline left/top。
       行内容由生产组件 explore-more-menu.jsx 渲染（见下方 renderMenuRows）。 -->
  <div id="qa-more-menu" data-menu-material="translucent" class="MenuSurface_surface__qa SidebarRoot_moreMenu__qa"
    role="menu" style="left: 8px; top: 210px;">
    <div aria-hidden="true" class="MenuSurface_material__qa"></div>
  </div>

  <!-- 反例：另一个同样使用半透明材质的官方浮层（设置菜单），材质不得被改。 -->
  <div id="qa-settings-menu" data-menu-material="translucent" class="MenuSurface_surface__qa SettingsMenu_list__qa"
    role="menu" style="left: 620px; top: 320px;">
    <div aria-hidden="true" class="MenuSurface_material__qa"></div>
    <button type="button" class="Menu_item__qa" role="menuitem"><span>设置</span></button>
  </div>

<script type="module">
import * as chrome from '/bundle.js'
import * as menu from '/menu.js'

window.__qaErrors = []
window.addEventListener('error', (event) => window.__qaErrors.push(String(event.message || event)))
window.addEventListener('unhandledrejection', (event) => window.__qaErrors.push(String(event.reason || event)))

const box = (el) => {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
}
const styleOf = (el, prop) => window.getComputedStyle(el).getPropertyValue(prop)
const rowMetrics = (el) => {
  const cs = window.getComputedStyle(el)
  return {
    height: box(el).height,
    minHeight: cs.minHeight,
    paddingTop: cs.paddingTop,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    marginLeft: cs.marginLeft,
    marginRight: cs.marginRight,
    gap: cs.gap || cs.columnGap,
    borderRadius: cs.borderRadius,
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    fontWeight: cs.fontWeight,
  }
}

window.__QA = {
  errors: () => window.__qaErrors.slice(),
  install: () => {
    // 先按官方 Menu（portal / side:'bottom' / align:'start' / GAP 4）摆放菜单，再由被测模块接管；
    // 否则骨架里写死的 top 会让纵向对齐断言失去意义。
    const menu = document.getElementById('qa-more-menu')
    const anchor = document.querySelector('[class*="moreAnchor"]')
    const r = anchor.getBoundingClientRect()
    menu.style.left = '8px'
    menu.style.top = Math.round(r.bottom + 4) + 'px'
    chrome.installSidebarPanelChrome(document)
  },
  rowMetrics,
  menuBox: () => box(document.getElementById('qa-more-menu')),
  sidebarBox: () => box(document.querySelector('[data-pane="sidebar"]')),
  anchorBox: () => box(document.querySelector('[class*="moreAnchor"]')),
  glyphMetrics: (row) => {
    const glyph = row.querySelector('[class*="panelGlyph"]')
    const svg = glyph.querySelector('svg')
    return { glyph: { width: box(glyph).width, height: box(glyph).height }, svg: { width: box(svg).width, height: box(svg).height } }
  },
  materialStyle: (menuId) => {
    const menu = document.getElementById(menuId)
    const material = menu.querySelector('[class*="material"]')
    const cs = window.getComputedStyle(material)
    return { background: cs.backgroundColor, backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter }
  },
  shift: () => document.getElementById('qa-more-menu').style.getPropertyValue('--omnimux-more-menu-shift'),
  styleNodeCount: () => document.querySelectorAll('#omnimux-sidebar-panel-chrome').length,
  /** 面板行可见性：官方面板行应被折叠，「更多」行应仍可见（展开态与收起态各测一次）。 */
  panelRowVisibility: () => Array.from(document.querySelectorAll('[class*="panelRow"]')).map((row) => ({
    label: row.getAttribute('aria-label'),
    isMore: row.getAttribute('aria-haspopup') === 'menu',
    display: window.getComputedStyle(row).display,
    height: Math.round(row.getBoundingClientRect().height),
  })),
  /** 模拟侧栏收起（壳层把 data-sidebar-collapsed 写在 AppFrame 上）。 */
  setCollapsed: (collapsed) => {
    const frame = document.querySelector('[data-pane="sidebar"]')
    if (collapsed) frame.setAttribute('data-sidebar-collapsed', '')
    else frame.removeAttribute('data-sidebar-collapsed')
  },
  /**
   * 用生产组件渲染「更多」菜单行。
   * entries / onOpen 是官方 owner props 的最小形状：官方 sidebar.panellist.actions
   * 传入的 SidebarPanelActionEntry[] 加选中委托。
   */
  renderMenuRows: async ({ entries, onOpen }) => {
    const MenuItemButton = ({ children, icon, current, separatorBefore, onSelect }) => menu.React.createElement(
      'div',
      { 'data-qa-item': '', 'data-qa-current': current === true ? '1' : '0', 'data-qa-separator': separatorBefore === true ? '1' : '0' },
      menu.React.createElement('button', { type: 'button', role: 'menuitem', class: 'Menu_item__qa', onClick: onSelect },
        icon === undefined ? null : menu.React.createElement('span', { class: 'Menu_itemIcon__qa' }, icon),
        menu.React.createElement('span', null, children),
      ),
    )
    const Content = menu.createExploreMoreMenuContent({ MenuItemButton })
    const host = document.createElement('div')
    host.id = 'qa-menu-rows'
    document.getElementById('qa-more-menu').append(host)
    const root = menu.ReactDOMClient.createRoot(host)
    await menu.React.act(async () => {
      root.render(menu.React.createElement(Content, {
        onDismiss: () => {},
        entries,
        onOpen,
      }))
    })
    return Array.from(host.querySelectorAll('[data-qa-item]')).map((item) => ({
      label: item.textContent.trim(),
      current: item.getAttribute('data-qa-current') === '1',
      separatorBefore: item.getAttribute('data-qa-separator') === '1',
    }))
  },
  /** 点击菜单里第 index 行（触发生产组件的 onSelect）。 */
  clickMenuRow: (index) => {
    const rows = document.querySelectorAll('#qa-menu-rows [data-qa-item] button')
    rows[index].click()
  },
}
</script>
</body>
</html>`
}

const ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>'

function startStaticServer(html, bundle, menuBundle) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (url.pathname === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(bundle)
      return
    }
    if (url.pathname === '/menu.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(menuBundle)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })
    })
  })
}

async function launchChrome(profileDir) {
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ]
  const child = spawn(CHROME_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome 未在 30s 内报告 DevTools 端点：${stderr.slice(-600)}`)), 30_000)
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome 提前退出（code=${code}）：${stderr.slice(-600)}`))
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 Chrome：${error.message}`))
    })
  })
  return { child, endpoint, stderrTail: () => stderr.slice(-600) }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws), { once: true })
    ws.addEventListener('error', () => reject(new Error(`CDP 连接失败：${url}`)), { once: true })
  })
}

function createCdp(ws) {
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(`${message.error.message} (code ${message.error.code})`))
    else entry.resolve(message.result)
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify(payload))
      })
    },
    close: () => ws.close(),
  }
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId)
  if (result.exceptionDetails) {
    throw new Error(`页面内异常：${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
  }
  return result.result.value
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      last = error
    }
    if (Date.now() > deadline) throw new Error(`等待超时 ${timeoutMs}ms · ${label}${last ? ` · ${last.message}` : ''}`)
    await sleep(100)
  }
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

async function main() {
  const runId = randomUUID()
  const esbuild = await loadEsbuild()
  const bundle = await esbuild.build({
    entryPoints: [SOURCE],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundleText = bundle.outputFiles[0].text
  // 「更多」菜单内容组件同样验生产源码：与 react 一起打进同一 realm，
  // 点击行因此真的走官方 onOpen 委托，而不是被替身糊过去。
  const menuBundle = await esbuild.build({
    absWorkingDir: MENU_SOURCE_DIR,
    stdin: {
      contents: "export * from './explore-more-menu.jsx'\nexport * as React from 'react'\nexport * as ReactDOMClient from 'react-dom/client'\n",
      resolveDir: MENU_SOURCE_DIR,
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    logLevel: 'silent',
  })
  const menuBundleText = menuBundle.outputFiles[0].text
  const { server, origin } = await startStaticServer(buildIndexHtml(), bundleText, menuBundleText)
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-chrome-qa-'))
  let chrome
  let cdp
  try {
    chrome = await launchChrome(profileDir)
    cdp = createCdp(await connectWebSocket(chrome.endpoint))
    const { targetInfos } = await cdp.send('Target.getTargets')
    const page = targetInfos.find((info) => info.type === 'page')
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false,
    }, sessionId)
    await cdp.send('Page.navigate', { url: `${origin}/index.html` }, sessionId)
    await waitFor(async () => evaluate(cdp, sessionId, 'Boolean(window.__QA)'), 20_000, '页面加载')

    const browserVersion = await evaluate(cdp, sessionId, 'navigator.userAgent')

    // 安装生产模块，并等一帧让位移落地。
    await evaluate(cdp, sessionId, 'window.__QA.install()')
    await sleep(300)

    const assertions = []
    const record = (name, pass, actual, expected) => assertions.push({ name, pass, actual, expected })

    const custom = await evaluate(cdp, sessionId, `window.__QA.rowMetrics(document.querySelector('[data-qa-row="custom-workflow"]'))`)
    // 官方面板行已折叠（display:none，量不到几何），因此行度量只在仍然可见的
    // 「更多」行上比对；折叠本身由 AC-10 单独断言。
    const moreRow = await evaluate(cdp, sessionId, `window.__QA.rowMetrics(document.querySelector('[data-qa-row="more"]'))`)

    // AC-1：仍然可见的官方「更多」行与产品行逐项同度量。
    // `minHeight` 不参与逐项比对：产品行用 `height`，官方行用 `min-height`，两者都是
    // 32px 的约束来源，比的是「实际渲染出来的那一组几何」。官方行的 min-height 另条断言。
    const comparable = (metrics) => {
      const { minHeight, ...rest } = metrics
      return rest
    }
    record(
      'AC-1 行度量对齐 more',
      JSON.stringify(comparable(moreRow)) === JSON.stringify(comparable(custom)),
      comparable(moreRow),
      comparable(custom),
    )
    record('AC-1b 官方行约束为 32px more', moreRow.minHeight === '32px', moreRow.minHeight, '32px')

    // AC-10：官方面板行（插件 / 自动化任务）在展开态不显示，「更多」行仍可见。
    const expandedRows = await evaluate(cdp, sessionId, 'window.__QA.panelRowVisibility()')
    const officialRows = expandedRows.filter((row) => !row.isMore)
    record(
      'AC-10 展开态官方面板行已折叠',
      officialRows.length >= 2 && officialRows.every((row) => row.display === 'none' && row.height === 0),
      officialRows,
      '每行 display=none 且高度 0',
    )
    record(
      'AC-10b 展开态「更多」行仍可见',
      expandedRows.filter((row) => row.isMore).every((row) => row.display !== 'none' && row.height > 0),
      expandedRows.filter((row) => row.isMore),
      'display≠none 且高度 > 0',
    )

    // AC-11：收起态同样折叠（轨道上不留面板图标）。
    await evaluate(cdp, sessionId, 'window.__QA.setCollapsed(true)')
    await sleep(120)
    const collapsedRows = await evaluate(cdp, sessionId, 'window.__QA.panelRowVisibility()')
    record(
      'AC-11 收起态官方面板行仍折叠',
      collapsedRows.filter((row) => !row.isMore).every((row) => row.display === 'none'),
      collapsedRows.filter((row) => !row.isMore),
      '每行 display=none',
    )
    await evaluate(cdp, sessionId, 'window.__QA.setCollapsed(false)')
    await sleep(120)

    // AC-12：折叠的官方面板行出现在「更多」菜单里，点击走官方 onOpen(id)。
    // 官方 entries 不含固定面板（plugins）：官方按 `id !== FIXED_PANEL_ID` 过滤，
    // 所以这里按官方真源只传 schedules；插件入口由官方「浏览更多插件」行承担。
    await evaluate(cdp, sessionId, `window.__qaOpened = []; window.__QA.renderMenuRows({
      entries: [
        { id: 'schedules', label: '自动化任务', pinned: false, active: true },
      ],
      onOpen: (id) => window.__qaOpened.push(id),
    })`)
    await sleep(200)
    const menuRows = await evaluate(cdp, sessionId, `Array.from(document.querySelectorAll('#qa-menu-rows [data-qa-item]')).map((item) => ({
      label: item.textContent.trim(),
      current: item.getAttribute('data-qa-current') === '1',
      separatorBefore: item.getAttribute('data-qa-separator') === '1',
    }))`)
    record(
      'AC-12 折叠的官方面板行在菜单首部',
      menuRows[0]?.label === '自动化任务',
      menuRows.slice(0, 2),
      '首行为「自动化任务」',
    )
    record(
      'AC-12b 折叠块与产品入口之间有分隔线',
      menuRows[1]?.separatorBefore === true && menuRows[0]?.separatorBefore === false,
      { row0: menuRows[0]?.separatorBefore, row1: menuRows[1]?.separatorBefore },
      '首行不画线、第二行画线',
    )
    record(
      'AC-12c 当前选中的官方面板带选中态',
      menuRows[0]?.current === true,
      { schedules: menuRows[0]?.current },
      'schedules=true',
    )
    record(
      'AC-12d 产品 10 项仍在折叠块之后',
      menuRows.length === 11,
      { rowCount: menuRows.length, labels: menuRows.map((row) => row.label) },
      '1 个官方面板行 + 10 个产品入口 = 11',
    )

    await evaluate(cdp, sessionId, 'window.__QA.clickMenuRow(0)')
    await sleep(120)
    const opened = await evaluate(cdp, sessionId, 'window.__qaOpened')
    record(
      'AC-12e 点击官方面板行走官方 onOpen',
      JSON.stringify(opened) === JSON.stringify(['schedules']),
      opened,
      "['schedules']",
    )

    // AC-2：图标槽与 svg 都是 14×14。
    const glyph = await evaluate(cdp, sessionId, `window.__QA.glyphMetrics(document.querySelector('[data-qa-row="more"]'))`)
    record('AC-2 图标 14×14', glyph.glyph.width === 14 && glyph.glyph.height === 14 && glyph.svg.width === 14 && glyph.svg.height === 14, glyph, { glyph: { width: 14, height: 14 }, svg: { width: 14, height: 14 } })

    // AC-5：菜单整体在侧栏列右侧。
    const sidebar = await evaluate(cdp, sessionId, 'window.__QA.sidebarBox()')
    const menu = await evaluate(cdp, sessionId, 'window.__QA.menuBox()')
    record('AC-5 菜单在侧栏右侧', menu.left >= sidebar.right, { menuLeft: menu.left, sidebarRight: sidebar.right }, '菜单左边界 ≥ 侧栏右边界')
    record('AC-5b 菜单在视口内', menu.right <= VIEWPORT.width, { menuRight: menu.right, viewport: VIEWPORT.width }, `菜单右边界 ≤ ${VIEWPORT.width}`)

    // AC-9：菜单顶边对齐触发按钮顶边（#3804）。
    const anchor = await evaluate(cdp, sessionId, 'window.__QA.anchorBox()')
    record(
      'AC-9 菜单顶边对齐按钮顶边',
      Math.abs(menu.top - anchor.top) <= 1,
      { menuTop: menu.top, anchorTop: anchor.top, delta: Math.round((menu.top - anchor.top) * 100) / 100 },
      '|menuTop − anchorTop| ≤ 1px',
    )
    record(
      'AC-9b 纵向不越出视口',
      menu.top >= 12 && menu.bottom <= VIEWPORT.height - 12,
      { menuTop: menu.top, menuBottom: menu.bottom, viewportHeight: VIEWPORT.height },
      '12 ≤ menuTop 且 menuBottom ≤ viewportHeight − 12',
    )

    // AC-6：菜单实体底 + 无毛玻璃。
    const material = await evaluate(cdp, sessionId, `window.__QA.materialStyle('qa-more-menu')`)
    const color = parseRgb(material.background)
    record('AC-6 菜单背景不透明', color !== null && color.a === 1, material.background, 'alpha = 1')
    record('AC-6b 无 backdrop-filter', material.backdropFilter === 'none', material.backdropFilter, 'none')

    // AC-7：反例 —— 另一个半透明官方浮层材质不变。
    const settings = await evaluate(cdp, sessionId, `window.__QA.materialStyle('qa-settings-menu')`)
    const settingsColor = parseRgb(settings.background)
    record('AC-7 其它浮层材质不变', settingsColor !== null && settingsColor.a < 1 && settings.backdropFilter !== 'none',
      settings, '半透明 + 保留毛玻璃')

    // AC-8：样式节点幂等。
    await evaluate(cdp, sessionId, 'window.__QA.install()')
    const styleCount = await evaluate(cdp, sessionId, 'window.__QA.styleNodeCount()')
    record('AC-8 样式节点幂等', styleCount === 1, styleCount, 1)

    const errors = await evaluate(cdp, sessionId, 'window.__QA.errors()')
    record('页面无未捕获错误', errors.length === 0, errors, [])

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    const png = Buffer.from(shot.data, 'base64')

    const failed = assertions.filter((item) => !item.pass)
    await fs.mkdir(EVIDENCE_DIR, { recursive: true })
    await fs.writeFile(PNG_PATH, png)
    await fs.writeFile(JSON_PATH, `${JSON.stringify({
      runId,
      issue: 3802,
      capturedAt: new Date().toISOString(),
      browser: browserVersion,
      viewport: VIEWPORT,
      source: 'plugins/omnimux/src/client/sidebar-panel-chrome.js',
      assertions,
      passed: assertions.length - failed.length,
      failed: failed.length,
      screenshot: path.relative(ROOT, PNG_PATH),
    }, null, 2)}\n`)

    console.log(`== 侧栏 panel chrome 浏览器验收 ==`)
    for (const item of assertions) console.log(`${item.pass ? '✔' : '✖'} ${item.name}`)
    console.log(`\n${assertions.length - failed.length}/${assertions.length} 通过`)
    console.log(`证据：${path.relative(ROOT, PNG_PATH)} · ${path.relative(ROOT, JSON_PATH)}`)
    if (failed.length > 0) {
      console.error(`\n失败项：${failed.map((item) => item.name).join('、')}`)
      process.exitCode = 1
    }
  } finally {
    try { cdp?.close() } catch {}
    try { chrome?.child.kill('SIGKILL') } catch {}
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(profileDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`浏览器验收失败（未写产物）：${error.message}`)
  process.exitCode = 1
})
