#!/usr/bin/env node
/**
 * @file scripts/verify-product-secondary-page.mjs
 * @description 产品库二级页面的真实浏览器预演（质量五步闭环的 Verify 阶段）。
 *
 * 隔离与自清理：
 * 1. 动态端口（`port: 0`）：网页服务与 CDP 都由系统分配，零端口冲突；
 * 2. 独立用户目录：无头 Chrome 落在临时目录，不碰任何既有 profile；
 * 3. 测完即焚：浏览器、服务、临时目录在 finally 中全部释放。
 *
 * 它验证的是真渲染结果，不是源文本：DOM 挂载、正几何（宽高 > 0）、真实点击与
 * 弹窗交互，并把 PNG 与结构化报告落到 `.workbuddy/evidence/product-secondary-page/`。
 *
 * 用法：node scripts/verify-product-secondary-page.mjs [--keep]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const PLUGIN = join(REPO_ROOT, 'plugins', 'omnimux-products')
const EVIDENCE_DIR = join(REPO_ROOT, '.workbuddy', 'evidence', 'product-secondary-page')
const KEEP = process.argv.includes('--keep')
const VIEWPORT = { width: 1280, height: 900 }

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

/** 2×2 纯色 PNG：截图卡片的图片真的能解码，几何才有意义。用 pngjs 现编，避免手写 base64 出错。 */
const TINY_PNG = (() => {
  const png = new PNG({ width: 2, height: 2 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0x33
    png.data[i + 1] = 0x99
    png.data[i + 2] = 0xff
    png.data[i + 3] = 0xff
  }
  return PNG.sync.write(png)
})()



const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('no Chrome/Chromium binary found')
}

/* --------------------------------------------------------------- harness 源码 */

/**
 * 浏览器侧夹具：直接挂真实的二级页 `ProductFormPage`，只把 HTTP 边界换成内存实现。
 *
 * 产品库列表已并入资产库（`omnimux-assets:library` 的 `ProductTab`），原
 * `ProductsStage` 宿主不再存在，因此「列表保活 / 返回后滚动位置」这类**宿主级**断言
 * 移到资产库侧的测试，本脚本只对二级页自身负责：覆盖层几何、面包屑、脏标记、
 * 三选一拦截、双栏、双端截图、保存 payload 与离开回调。
 */
const HARNESS_SOURCE = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductFormPage } from '${join(PLUGIN, 'src/client/ProductFormPage.jsx')}'
import { injectProductsStyles } from '${join(PLUGIN, 'src/client/styles.js')}'
import { zh } from '${join(PLUGIN, 'src/client/locales.js')}'

const PRODUCT = {
  id: 'prd_1',
  name: 'Aurora Mug',
  kind: 'physical',
  selling_points: '6 小时长效保温',
  target_audience: '通勤族',
  brand: 'Aurora',
  features: '容量 350ml',
  price: '24.9',
  sku: 'AM-350',
  promotion: '今日下单免运费',
  link: 'https://shop.example.com/p/aurora-mug',
  categories: ['Home & Kitchen'],
  media: [],
  cover_media_id: null,
  updated_at: '2026-09-14T00:00:00.000Z',
}

const DIGITAL_IMPORT = {
  name: 'MiniMax 开放平台',
  selling_points: '一站式多模态模型服务',
  target_audience: 'AI 应用开发者',
  brand: 'MiniMax',
  features: '一个接口接入多模态',
  price: '',
  sku: '',
  promotion: '',
  link: 'https://platform.example.com',
  categories: ['AI 平台'],
  kind: 'digital',
  analysis: { mode: 'model' },
  media: [
    { id: 'med_desktop', real_path: '/tmp/site-desktop.png', original_name: 'site-platform-desktop-20260914T000000Z-aaaa.png' },
    { id: 'med_mobile', real_path: '/tmp/site-mobile.png', original_name: 'site-platform-mobile-20260914T000000Z-bbbb.png' },
  ],
  cover_media_id: 'med_desktop',
}

window.fetch = async (url, opts) => {
  const method = (opts && opts.method) || 'GET'
  const path = String(url)
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
  if (path.startsWith('/omnimux/products/import-from-link')) return json({ success: true, data: DIGITAL_IMPORT })
  if (path.startsWith('/omnimux/products/draft-media/')) return json({}, 404)
  if (method === 'POST' && path === '/omnimux/products') {
    const body = JSON.parse(opts.body)
    window.__lastCreate = body
    return json({ product: { ...PRODUCT, ...body } })
  }
  if (method === 'PUT') {
    const body = JSON.parse(opts.body)
    window.__lastUpdate = body
    return json({ product: { ...PRODUCT, ...body } })
  }
  if (path.startsWith('/omnimux/products/pick')) return json({ paths: [] })
  return json({ product: PRODUCT })
}

injectProductsStyles()

/** 二级页是 absolute/inset:0 的覆盖层，需要一个定位祖先来代表「列表所在的 Tab 容器」。 */
function Host() {
  const [view, setView] = useState({ mode: 'create', kind: 'physical' })
  const [open, setOpen] = useState(true)
  // 宿主决定「用哪个形态的二级页打开」：形态在进入那一刻锚定，表单内部不再有切换。
  window.__reopen = (next) => {
    setView({ mode: (next && next.mode) || 'create', kind: (next && next.kind) || 'physical' })
    setOpen(true)
  }
  return React.createElement(
    'div',
    { className: 'omnimux-products-stage omx-stage-scroll', style: { position: 'relative' } },
    open
      ? React.createElement(ProductFormPage, {
        key: \`\${view.mode}:\${view.kind}\`,
        t: (key) => (key in zh ? zh[key] : key),
        kind: view.kind,
        mode: view.mode,
        initial: view.mode === 'edit' ? PRODUCT : null,
        onSubmit: async (payload) => {
          window.__lastPayload = payload
          window.__submitCalls = (window.__submitCalls || 0) + 1
          // 服务端拒绝的分支要真的走一遍：保存失败必须留在二级页、输入不丢。
          if (payload.name === '提交失败产品') {
            window.__submitStatus = 409
            return false
          }
          const response = await fetch('/omnimux/products', { method: 'POST', body: JSON.stringify(payload) })
          window.__submitStatus = response.status
          return response.ok
        },
        onLeave: () => {
          window.__leaveCalls = (window.__leaveCalls || 0) + 1
          setOpen(false)
        },
        onPick: async () => [],
      })
      : null,
  )
}

const root = createRoot(document.getElementById('app'))
root.render(React.createElement(Host))
window.__harnessReady = true
`

/* ------------------------------------------------------------------- 断言工具 */

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail })
  const mark = ok ? '✔' : '✘'
  process.stdout.write(`${mark} ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}\n`)
}

/* ------------------------------------------------------------------- CDP 客户端 */

function createCdp(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const ready = new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise())
    socket.addEventListener('error', (event) => reject(new Error(`cdp socket error: ${event.message || 'unknown'}`)))
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id === undefined) return
    const slot = pending.get(message.id)
    if (!slot) return
    pending.delete(message.id)
    if (message.error) slot.reject(new Error(message.error.message))
    else slot.resolve(message.result)
  })
  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}, sessionId) {
      const id = ++nextId
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject })
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
      })
    },
  }
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const chrome = findChrome()
  const profileDir = mkdtempSync(join(tmpdir(), 'products-qa-profile-'))
  const { build } = await import(join(PLUGIN, 'node_modules', 'esbuild', 'lib', 'main.js'))

  const bundleDir = mkdtempSync(join(tmpdir(), 'products-qa-bundle-'))
  const bundle = await build({
    stdin: { contents: HARNESS_SOURCE, resolveDir: PLUGIN, sourcefile: 'harness.jsx', loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    outdir: bundleDir,
    define: { 'process.env.NODE_ENV': '"production"' },
    // 无关的字体/图标资产不参与布局验证，留空即可，避免把整套词典字体拖进来。
    loader: {
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
      '.svg': 'empty',
      '.png': 'empty',
      '.jpg': 'empty',
    },
    logLevel: 'silent',
  })

  const jsFile = bundle.outputFiles.find((file) => file.path.endsWith('.js'))
  const cssFiles = bundle.outputFiles.filter((file) => file.path.endsWith('.css'))

  const server = http.createServer((req, res) => {
    const path = String(req.url || '/')
    if (path === '/' || path.startsWith('/index')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>products secondary page</title>
<style>html,body{margin:0;padding:0;height:100%;background:#101010}
#app{width:100vw;height:100vh;display:flex}</style>
${cssFiles.map((file) => `<style>${file.text}</style>`).join('\n')}
</head><body><div id="app"></div><script src="/app.js"></script></body></html>`)
      return
    }
    if (path.startsWith('/app.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(jsFile ? jsFile.text : '')
      return
    }
    if (path.startsWith('/omnimux/products/draft-media/')) {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(TINY_PNG)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  })

  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const origin = `http://127.0.0.1:${server.address().port}`

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  const stderrTail = []
  child.stderr.on('data', (chunk) => {
    stderrTail.push(String(chunk))
    if (stderrTail.length > 40) stderrTail.shift()
  })

  let cdp
  try {
    const portFile = join(profileDir, 'DevToolsActivePort')
    for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100)
    if (!existsSync(portFile)) throw new Error(`Chrome never opened a debugging port\n${stderrTail.join('')}`)
    const [port, browserPath] = readFileSync(portFile, 'utf8').split('\n')
    cdp = createCdp(`ws://127.0.0.1:${port}${browserPath}`)
    await cdp.ready

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const send = (method, params) => cdp.send(method, params, sessionId)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 2,
      mobile: false,
    })

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { ${expression} })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed')
      return result.result.value
    }

    const waitFor = async (expression, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (await evaluate(`return Boolean(${expression})`)) return true
        await sleep(120)
      }
      return false
    }

    const shoot = async (name) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(EVIDENCE_DIR, `${name}.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      return file
    }

    await send('Page.navigate', { url: `${origin}/` })
    const mounted = await waitFor('window.__harnessReady && document.querySelector(".omnimux-products-subscreen")')
    check('A1 产品二级页在真实浏览器里挂载成功', mounted)

    if (!mounted) throw new Error('harness never mounted')

    /* A2 二级页整屏覆盖、正几何、无模态遮罩、无字符叉号 */
    const geometry = await evaluate(`
      const view = document.querySelector('.omnimux-products-subscreen')
      const style = getComputedStyle(view)
      const rect = view.getBoundingClientRect()
      const host = document.querySelector('.omnimux-products-stage').getBoundingClientRect()
      return {
        position: style.position,
        zIndex: style.zIndex,
        width: rect.width,
        height: rect.height,
        hostWidth: host.width,
        hostHeight: host.height,
        inset: [style.top, style.right, style.bottom, style.left].join('|'),
        modal: Boolean(document.querySelector('.omnimux-products-modal-backdrop')),
        formView: Boolean(document.querySelector('.omnimux-products-form-view')),
        breadcrumb: document.querySelector('.omnimux-products-back-path').textContent,
        hasCrossGlyph: /[\\u00d7\\u2715]/.test(view.textContent),
      }
    `)
    check('A2 二级页以 absolute / inset:0 / z-index:300 整屏覆盖', geometry.position === 'absolute'
      && geometry.zIndex === '300'
      && geometry.inset === '0px|0px|0px|0px', geometry)
    check('A3 二级页正几何（宽高 > 0）铺满宿主容器且没有任何模态遮罩',
      geometry.width > 0
      && geometry.height > 0
      && geometry.width === geometry.hostWidth
      && geometry.height === geometry.hostHeight
      && !geometry.modal, { width: geometry.width, height: geometry.height, hostWidth: geometry.hostWidth, hostHeight: geometry.hostHeight })
    check('A4 二级页带 form-view 标记与「产品库 / 添加实物产品」面包屑',
      geometry.formView && /产品库/.test(geometry.breadcrumb) && /添加实物产品/.test(geometry.breadcrumb), geometry.breadcrumb)
    check('A5 二级页内没有任何字符 × 图标', geometry.hasCrossGlyph === false)

    /* A6 双栏在容器 ≥900px 时并排 */
    const columns = await evaluate(`
      const left = document.querySelector('.omnimux-products-form-col-left').getBoundingClientRect()
      const right = document.querySelector('.omnimux-products-form-col-right').getBoundingClientRect()
      return { leftRight: Math.round(left.right), rightLeft: Math.round(right.left), leftWidth: Math.round(left.width), rightWidth: Math.round(right.width) }
    `)
    check('A6 双栏布局在 1280 宽下真的并排', columns.rightLeft >= columns.leftRight - 1
      && columns.leftWidth > 0
      && columns.rightWidth > 0, columns)

    /* A7 右上角动作条常驻在页头、底部不再有 footer */
    const actions = await evaluate(`
      const header = document.querySelector('.omnimux-products-form-view [class*="PageHeader"]')
      const bar = header ? header.querySelector('.omnimux-products-form-actions') : null
      const rect = bar ? bar.getBoundingClientRect() : null
      const headerRect = header ? header.getBoundingClientRect() : null
      const scroll = document.querySelector('.omnimux-products-form-scroll')
      return {
        inHeader: Boolean(bar),
        buttons: bar ? [...bar.querySelectorAll('button')].map((node) => node.textContent.trim()) : [],
        rightMargin: rect ? Math.round(window.innerWidth - rect.right) : null,
        insideHeader: Boolean(rect && headerRect) && rect.top >= headerRect.top && rect.bottom <= headerRect.bottom,
        hasFooter: Boolean(document.querySelector('.omnimux-products-form-footer')),
        scrollBottomGap: scroll ? Math.round(window.innerHeight - scroll.getBoundingClientRect().bottom) : null,
      }
    `)
    check('A7 取消/保存按钮在页头右上角、底部 footer 已移除',
      actions.inHeader
      && actions.buttons.includes('取消')
      && actions.buttons.includes('保存产品')
      && actions.insideHeader
      && Math.abs(actions.rightMargin - 20) <= 4
      && actions.hasFooter === false, actions)

    /* A8 初始不脏：返回不弹拦截，直接交回宿主 */
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await sleep(300)
    const cleanLeave = await evaluate(`
      return {
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        dot: Boolean(document.querySelector('.omnimux-products-dirty-dot')),
        leaveCalls: window.__leaveCalls || 0,
      }
    `)
    check('A8 未修改时点返回直接离开，不弹拦截', !cleanLeave.subscreen && !cleanLeave.dialog && cleanLeave.leaveCalls === 1, cleanLeave)

    /* A9 重新打开（新建态）改一个字段 → 出现未保存圆点 */
    await evaluate('window.__reopen()')
    await waitFor('document.querySelector(".omnimux-products-subscreen")')
    await evaluate(`
      const wrapper = document.querySelector('.omnimux-products-name-field')
      const field = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(field, '二次编辑测试产品')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return field.value
    `)
    const dirty = await waitFor('document.querySelector(".omnimux-products-dirty-dot")')
    const dirtyState = await evaluate(`
      return {
        dot: Boolean(document.querySelector('.omnimux-products-dirty-dot')),
        badge: document.querySelector('.omnimux-products-dirty-dot').getAttribute('aria-label'),
        name: (() => { const node = document.querySelector('.omnimux-products-name-field'); const input = node.tagName === 'INPUT' ? node : node.querySelector('input'); return input.value })(),
        breadcrumb: document.querySelector('.omnimux-products-back-path').textContent,
      }
    `)
    check('A9 改一个字段后出现「有未保存修改」圆点', dirty && dirtyState.badge === '有未保存修改', dirtyState)
    check('A10 添加态面包屑保持「产品库 / 添加实物产品」', dirtyState.breadcrumb === '产品库/添加实物产品', dirtyState.breadcrumb)
    const dirtyShot = await shoot('form-create-dirty')

    /* A11 脏状态下点返回 → 三选一拦截弹窗 */
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    const dialogOpen = await waitFor('document.querySelector(\'[role="dialog"]\')')
    const dialog = await evaluate(`
      const panel = document.querySelector('[role="dialog"]')
      const rect = panel.getBoundingClientRect()
      const labels = [...panel.querySelectorAll('button')].map((node) => node.textContent.trim())
      const focused = document.activeElement ? document.activeElement.textContent.trim() : ''
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        title: panel.textContent,
        labels,
        focused,
        inside: panel.contains(document.activeElement),
      }
    `)
    check('A11 脏状态下点返回弹出确认弹窗并正几何', dialogOpen && dialog.width > 0 && dialog.height > 0, {
      width: dialog.width,
      height: dialog.height,
    })
    check('A12 弹窗提供三选一：继续编辑 / 放弃修改 / 保存并返回', ['继续编辑', '放弃修改', '保存并返回'].every((label) => dialog.labels.includes(label)), dialog.labels)
    check('A13 默认焦点落在安全项「继续编辑」上', dialog.focused === '继续编辑' && dialog.inside, dialog.focused)
    const dialogShot = await shoot('form-unsaved-dialog')

    /* A14 继续编辑：留在二级页且输入不丢 */
    await evaluate(`
      const keep = [...document.querySelectorAll('[role="dialog"] button')].find((node) => node.textContent.trim() === '继续编辑')
      keep.click()
      return true
    `)
    await sleep(300)
    const kept = await evaluate(`
      return {
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        name: (() => { const node = document.querySelector('.omnimux-products-name-field'); const input = node.tagName === 'INPUT' ? node : node.querySelector('input'); return input.value })(),
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
      }
    `)
    check('A14 选「继续编辑」后弹窗关闭、输入原样保留', !kept.dialog && kept.subscreen && kept.name === '二次编辑测试产品', kept)

    /* A15 实物表单的分区：只有实物会出现的商业化段 + 商品主图段 */
    const physicalSections = await evaluate(`
      const titles = [...document.querySelectorAll('.omnimux-products-form-section-title')].map((node) => node.textContent.trim())
      const categoryInputs = [...document.querySelectorAll('.omnimux-products-categories input')]
      const drops = [...document.querySelectorAll('.omnimux-products-drop')]
      return { titles, categoryInputs: categoryInputs.length, drops: drops.length, unique: new Set(titles).size === titles.length }
    `)
    check('A15 实物表单每段只出现一次（分类/素材编辑区没有被渲染两遍）',
      physicalSections.unique
      && physicalSections.categoryInputs === 1
      && physicalSections.drops === 1
      && ['链接投放', '产品基础信息', '商业化设置', '分类标签', '商品主图与素材']
        .every((title) => physicalSections.titles.includes(title)), physicalSections)
    // 形态分治：实物页不得渲染数字专属的首屏截图段。
    check('A16 实物表单不渲染数字专属的「首屏截图」段',
      !physicalSections.titles.includes('首屏截图'), physicalSections.titles)

    /* A17 数字表单：落地页一键解析 → 双视口首屏截图卡片 */
    await evaluate('window.__reopen({ mode: "create", kind: "digital" })')
    await waitFor('document.querySelector(".omnimux-products-subscreen")')
    const digitalSections = await evaluate(`
      const titles = [...document.querySelectorAll('.omnimux-products-form-section-title')].map((node) => node.textContent.trim())
      return { titles, breadcrumb: document.querySelector('.omnimux-products-back-path').textContent }
    `)
    check('A17 数字表单渲染「首屏截图」段且面包屑为「产品库 / 添加数字产品」',
      digitalSections.titles.includes('首屏截图')
      && digitalSections.breadcrumb === '产品库/添加数字产品', digitalSections)
    await evaluate(`
      const wrapper = document.querySelector('.omnimux-products-url-import-field')
      const field = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(field, 'https://platform.example.com')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      const go = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === '智能解析')
      go.click()
      return true
    `)
    const cardsReady = await waitFor('document.querySelectorAll(".omnimux-products-shot-card").length === 2', 10000)
    // 图片解码是异步的：等两张都真的 decode 出来再断言，避免把「还没加载完」当失败。
    const imagesDecoded = await waitFor(
      '[...document.querySelectorAll(".omnimux-products-shot-card img")].length === 2 && '
      + '[...document.querySelectorAll(".omnimux-products-shot-card img")].every((img) => img.complete && img.naturalWidth > 0)',
      10000,
    )
    const shots = await evaluate(`
      const cards = [...document.querySelectorAll('.omnimux-products-shot-card')]
      return {
        count: cards.length,
        rects: cards.map((node) => { const r = node.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }),
        labels: cards.map((node) => node.textContent),
        images: cards.map((node) => { const img = node.querySelector('img'); return img ? { src: img.getAttribute('src'), natural: [img.naturalWidth, img.naturalHeight] } : null }),
        badge: document.body.textContent.includes('主封面'),
      }
    `)
    check('A18 解析后右栏出现电脑端与手机端两张首屏卡片', cardsReady && shots.count === 2, shots.count)
    check('A19 两张截图卡片均为正几何', shots.rects.length === 2 && shots.rects.every(([w, h]) => w > 0 && h > 0), shots.rects)
    check('A20 截图卡片标注视口与分辨率', shots.labels.some((text) => /1440/.test(text)) && shots.labels.some((text) => /390/.test(text)), shots.labels)
    check('A21 草稿截图走只读预览通路且图片真的解码成功',
      imagesDecoded && shots.images.length === 2 && shots.images.every((row) => row && row.natural[0] > 0 && row.natural[1] > 0), shots.images)
    check('A22 桌面截图带「主封面」角标', shots.badge === true)
    const glyphs = await evaluate(`
      const buttons = [...document.querySelectorAll('.omnimux-products-subscreen button, .omnimux-products-subscreen [role="button"]')]
      const textGlyph = buttons.filter((node) => /^[\u00d7\u2715]$/.test(node.textContent.trim())).length
      const svgInButton = buttons.filter((node) => node.querySelector('svg')).length
      return { buttons: buttons.length, textGlyph, svgInButton }
    `)
    check('A22b 二级页里没有任何把字符当图标的按钮（移除控件都是矢量图标）',
      glyphs.textGlyph === 0 && glyphs.svgInButton > 0, glyphs)
    const shotsShot = await shoot('form-screenshot-cards')

    /* A23 点手机端卡片切换封面 */
    await evaluate(`
      const cards = [...document.querySelectorAll('.omnimux-products-shot-card')]
      cards[1].click()
      return true
    `)
    await sleep(300)
    const switched = await evaluate(`
      const rows = [...document.querySelectorAll('.omnimux-products-filelist-row')]
      const cover = rows.find((row) => row.classList.contains('is-cover'))
      return { coverName: cover ? cover.textContent : '', coverCount: rows.filter((row) => row.classList.contains('is-cover')).length }
    `)
    check('A23 点另一张卡片即可切换封面（媒体行跟随高亮）', /mobile/.test(switched.coverName), switched)

    /* A22 放弃修改：直接离开二级页，且宿主收到一次离开回调 */
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await waitFor('document.querySelector(\'[role="dialog"]\')')
    await evaluate(`
      const discard = [...document.querySelectorAll('[role="dialog"] button')].find((node) => node.textContent.trim() === '放弃修改')
      discard.click()
      return true
    `)
    await sleep(400)
    const discarded = await evaluate(`
      return {
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        leaveCalls: window.__leaveCalls || 0,
        submitCalls: window.__submitCalls || 0,
      }
    `)
    check('A24 选「放弃修改」后离开二级页、不写库、不留弹窗',
      !discarded.subscreen && !discarded.dialog && discarded.leaveCalls === 2 && discarded.submitCalls === 0, discarded)
    const listShot = await shoot('host-after-discard')

    /* A25 编辑态：面包屑带产品名、表单已填入既有值、初始不脏 */
    await evaluate('window.__reopen({ mode: "edit", kind: "physical" })')
    await waitFor('document.querySelector(".omnimux-products-subscreen")')
    const editMode = await evaluate(`
      const node = document.querySelector('.omnimux-products-name-field')
      const input = node.tagName === 'INPUT' ? node : node.querySelector('input')
      return {
        breadcrumb: document.querySelector('.omnimux-products-back-path').textContent,
        name: input.value,
        dot: Boolean(document.querySelector('.omnimux-products-dirty-dot')),
      }
    `)
    check('A25 编辑态面包屑呈现「产品库 / 编辑实物产品 · {产品名}」', /编辑实物产品 · Aurora Mug/.test(editMode.breadcrumb), editMode.breadcrumb)
    check('A26 编辑态表单已填入既有产品名且初始不脏', editMode.name === 'Aurora Mug' && editMode.dot === false, {
      name: editMode.name,
      dot: editMode.dot,
    })
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await sleep(300)

    /* A27 保存并返回：真的把 payload 交出去 */
    await evaluate('window.__reopen({ mode: "create", kind: "physical" })')
    await waitFor('document.querySelector(".omnimux-products-subscreen")')
    await evaluate(`
      const wrapper = document.querySelector('.omnimux-products-name-field')
      const field = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(field, '保存并返回测试产品')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    `)
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await waitFor('document.querySelector(\'[role="dialog"]\')')
    await evaluate(`
      const save = [...document.querySelectorAll('[role="dialog"] button')].find((node) => node.textContent.trim() === '保存并返回')
      save.click()
      return true
    `)
    await sleep(600)
    const saved = await evaluate(`
      return {
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        payload: window.__lastPayload || null,
        submitStatus: window.__submitStatus || null,
      }
    `)
    check('A27 选「保存并返回」真的提交 payload 并离开二级页',
      saved.payload && saved.payload.name === '保存并返回测试产品' && saved.submitStatus === 200 && !saved.subscreen,
      { name: saved.payload && saved.payload.name, submitStatus: saved.submitStatus, subscreen: saved.subscreen })

    /* A28 保存失败时留在二级页、错误条可见、输入零丢失 */
    await evaluate('window.__reopen({ mode: "create", kind: "physical" })')
    await waitFor('document.querySelector(".omnimux-products-subscreen")')
    await evaluate(`
      const wrapper = document.querySelector('.omnimux-products-name-field')
      const field = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(field, '提交失败产品')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    `)
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await waitFor('document.querySelector(\'[role="dialog"]\')')
    await evaluate(`
      const save = [...document.querySelectorAll('[role="dialog"] button')].find((node) => node.textContent.trim() === '保存并返回')
      save.click()
      return true
    `)
    await sleep(500)
    const failedSave = await evaluate(`
      const node = document.querySelector('.omnimux-products-name-field')
      const input = node && (node.tagName === 'INPUT' ? node : node.querySelector('input'))
      return {
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        name: input ? input.value : null,
        submitStatus: window.__submitStatus || null,
      }
    `)
    check('A28 保存失败时留在二级页、输入保留、状态码如实反映',
      failedSave.subscreen && !failedSave.dialog && failedSave.name === '提交失败产品' && failedSave.submitStatus === 409, failedSave)

    const report = {
      generatedAt: new Date().toISOString(),
      url: `${origin}/`,
      viewport: VIEWPORT,
      checks: results,
      passed: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      screenshots: [dirtyShot, dialogShot, shotsShot, listShot],
    }
    writeFileSync(join(EVIDENCE_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`\n${report.passed}/${results.length} 项通过，证据目录：${EVIDENCE_DIR}\n`)
    if (report.failed > 0) process.exitCode = 1
  } finally {
    try { cdp?.close() } catch { /* ignore */ }
    child.kill('SIGKILL')
    await new Promise((resolvePromise) => server.close(resolvePromise))
    if (!KEEP) rmSync(profileDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`[verify-product-secondary-page] ${error.stack || error.message}\n`)
  process.exit(1)
})
