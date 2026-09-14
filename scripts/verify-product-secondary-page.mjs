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
 * 浏览器侧夹具：挂真实的产品库 Stage，只把 HTTP 边界换成内存实现。
 * 组件、样式、状态机、守卫全部是生产代码。
 */
const HARNESS_SOURCE = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ProductsStage } from '${join(PLUGIN, 'src/client/ProductsStage.jsx')}'
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
  if (path.startsWith('/omnimux/products/state')) {
    const rows = Array.from({ length: 40 }, (_, index) => ({ ...PRODUCT, id: 'prd_' + (index + 1), name: 'Aurora Mug ' + (index + 1) }))
    return json({ revision: 1, products: rows })
  }
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
  if (path.includes('?view=edit')) return json({ product: PRODUCT })
  if (path.startsWith('/omnimux/products/pick')) return json({ paths: [] })
  return json({ revision: 1, products: [PRODUCT] })
}

injectProductsStyles()
const root = createRoot(document.getElementById('app'))
root.render(
  React.createElement(ProductsStage, {
    t: (key) => (key in zh ? zh[key] : key),
    visible: true,
    stage: { set: () => {} },
  }),
)
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
    const mounted = await waitFor('window.__harnessReady && document.querySelector(".omnimux-products-stage")')
    check('A1 产品库列表在真实浏览器里挂载成功', mounted)

    if (!mounted) throw new Error('harness never mounted')

    /* A2 列表初始态没有子屏、没有模态遮罩 */
    const initial = await evaluate(`
      const stage = document.querySelector('.omnimux-products-stage')
      const rect = stage.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        modal: Boolean(document.querySelector('.omnimux-products-modal-backdrop')),
        actionRow: getComputedStyle(document.querySelector('.omnimux-products-action-row')).padding,
      }
    `)
    check('A2 列表视图正几何（宽高 > 0）', initial.width > 0 && initial.height > 0, initial)
    check('A3 初始态没有二级子屏，也没有任何模态遮罩', !initial.subscreen && !initial.modal)

    /* 先滚动列表，稍后验证保活 */
    await evaluate(`
      const body = document.querySelector('.omnimux-products-body')
      body.scrollTop = 40
      return body.scrollTop
    `)

    /* A4 点击「添加产品」进入二级页 */
    await evaluate(`
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === '添加产品')
      button.click()
      return true
    `)
    const opened = await waitFor('document.querySelector(".omnimux-products-subscreen")')

    const geometry = await evaluate(`
      const view = document.querySelector('.omnimux-products-subscreen')
      const style = getComputedStyle(view)
      const rect = view.getBoundingClientRect()
      const footer = document.querySelector('.omnimux-products-form-footer')
      const footerRect = footer.getBoundingClientRect()
      return {
        position: style.position,
        zIndex: style.zIndex,
        width: rect.width,
        height: rect.height,
        inset: [style.top, style.right, style.bottom, style.left].join('|'),
        footerBottomGap: Math.round(window.innerHeight - footerRect.bottom),
        footerWidth: Math.round(footerRect.width),
        footerHeight: Math.round(footerRect.height),
        modal: Boolean(document.querySelector('.omnimux-products-modal-backdrop')),
        listStillMounted: Boolean(document.querySelector('.omnimux-products-list-view')),
        listScrollTop: document.querySelector('.omnimux-products-body').scrollTop,
        listScrollable: document.querySelector('.omnimux-products-body').scrollHeight > document.querySelector('.omnimux-products-body').clientHeight,
        breadcrumb: document.querySelector('.omnimux-products-back-path').textContent,
        hasCrossGlyph: /[\\u00d7\\u2715]/.test(document.querySelector('.omnimux-products-subscreen').textContent),
      }
    `)
    check('A4 二级页以 absolute / inset:0 / z-index:300 整屏覆盖', opened
      && geometry.position === 'absolute'
      && geometry.zIndex === '300'
      && geometry.inset === '0px|0px|0px|0px', geometry)
    check('A5 二级页正几何（宽高 > 0）且没有任何模态遮罩', geometry.width > 0 && geometry.height > 0 && !geometry.modal, {
      width: geometry.width,
      height: geometry.height,
    })
    check('A6 底部动作条常驻在视口底部', geometry.footerBottomGap === 0 && geometry.footerHeight > 0, {
      gap: geometry.footerBottomGap,
      height: geometry.footerHeight,
    })
    check('A7 列表子树保活且滚动位置未被重置',
      geometry.listStillMounted && geometry.listScrollable && geometry.listScrollTop === 40,
      { scrollTop: geometry.listScrollTop, scrollable: geometry.listScrollable })
    check('A8 面包屑呈现「产品库 / 添加产品」', /产品库/.test(geometry.breadcrumb) && /添加产品/.test(geometry.breadcrumb), geometry.breadcrumb)
    check('A9 二级页内没有任何字符 × 图标', geometry.hasCrossGlyph === false)

    /* A10 双栏在容器 ≥900px 时并排 */
    const columns = await evaluate(`
      const left = document.querySelector('.omnimux-products-form-col-left').getBoundingClientRect()
      const right = document.querySelector('.omnimux-products-form-col-right').getBoundingClientRect()
      return { leftRight: Math.round(left.right), rightLeft: Math.round(right.left), leftWidth: Math.round(left.width), rightWidth: Math.round(right.width) }
    `)
    check('A10 双栏布局在 1280 宽下真的并排', columns.rightLeft >= columns.leftRight - 1
      && columns.leftWidth > 0
      && columns.rightWidth > 0, columns)

    /* A11 初始不脏：返回不弹拦截 */
    await evaluate(`
      const back = document.querySelector('.omnimux-products-back-button')
      back.click()
      return true
    `)
    await sleep(300)
    const cleanLeave = await evaluate(`
      return {
        subscreen: Boolean(document.querySelector('.omnimux-products-subscreen')),
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        dot: Boolean(document.querySelector('.omnimux-products-dirty-dot')),
      }
    `)
    check('A11 未修改时点返回直接回列表，不弹拦截', !cleanLeave.subscreen && !cleanLeave.dialog, cleanLeave)

    /* A12 改一个字段 → 出现未保存圆点 */
    await evaluate(`
      const openButton = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === '添加产品')
      openButton.click()
      return true
    `)
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
        hint: document.querySelector('.omnimux-products-form-footer-hint').textContent.trim(),
        name: (() => { const node = document.querySelector('.omnimux-products-name-field'); const input = node.tagName === 'INPUT' ? node : node.querySelector('input'); return input.value })(),
        breadcrumb: document.querySelector('.omnimux-products-back-path').textContent,
      }
    `)
    check('A12 改一个字段后出现「有未保存修改」圆点与提示', dirty && dirtyState.hint === '有未保存修改', dirtyState)
    check('A13 添加态面包屑保持「产品库 / 添加产品」', dirtyState.breadcrumb === '产品库/添加产品', dirtyState.breadcrumb)
    const dirtyShot = await shoot('form-create-dirty')

    /* A14 脏状态下点返回 → 三选一拦截弹窗 */
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
    check('A14 脏状态下点返回弹出确认弹窗并正几何', dialogOpen && dialog.width > 0 && dialog.height > 0, {
      width: dialog.width,
      height: dialog.height,
    })
    check('A15 弹窗提供三选一：继续编辑 / 放弃修改 / 保存并返回', ['继续编辑', '放弃修改', '保存并返回'].every((label) => dialog.labels.includes(label)), dialog.labels)
    check('A16 默认焦点落在安全项「继续编辑」上', dialog.focused === '继续编辑' && dialog.inside, dialog.focused)
    const dialogShot = await shoot('form-unsaved-dialog')

    /* A17 继续编辑：留在二级页且输入不丢 */
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
    check('A17 选「继续编辑」后弹窗关闭、输入原样保留', !kept.dialog && kept.subscreen && kept.name === '二次编辑测试产品', kept)

    /* A18 落地页一键解析 → 双视口截图卡片 */
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
    check('A19 两张截图卡片均为正几何', shots.rects.every(([w, h]) => w > 0 && h > 0), shots.rects)
    check('A20 截图卡片标注视口与分辨率', shots.labels.some((text) => /1440/.test(text)) && shots.labels.some((text) => /390/.test(text)), shots.labels)
    check('A21 草稿截图走只读预览通路且图片真的解码成功',
      imagesDecoded && shots.images.every((row) => row && row.natural[0] > 0 && row.natural[1] > 0), shots.images)
    check('A22 桌面截图带「主封面」角标', shots.badge === true)
    const glyphs = await evaluate(`
      const buttons = [...document.querySelectorAll('.omnimux-products-subscreen button, .omnimux-products-subscreen [role="button"]')]
      const textGlyph = buttons.filter((node) => /^[\u00d7\u2715]$/.test(node.textContent.trim())).length
      const svgInButton = buttons.filter((node) => node.querySelector('svg')).length
      return { buttons: buttons.length, textGlyph, svgInButton }
    `)
    check('A22b 二级页里没有任何把字符当图标的按钮（移除控件都是矢量图标）',
      glyphs.textGlyph === 0 && glyphs.svgInButton > 0, glyphs)
    const sections = await evaluate(`
      const titles = [...document.querySelectorAll('.omnimux-products-form-section-title')].map((node) => node.textContent.trim())
      const categoryInputs = [...document.querySelectorAll('.omnimux-products-categories input')]
      const drops = [...document.querySelectorAll('.omnimux-products-drop')]
      return { titles, categoryInputs: categoryInputs.length, drops: drops.length, unique: new Set(titles).size === titles.length }
    `)
    check('A22c 左栏五段 + 右栏两段，每段只出现一次（分类/素材编辑区没有被渲染两遍）',
      sections.unique
      && sections.categoryInputs === 1
      && sections.drops === 1
      && ['链接投放', '产品基础信息', '商业化设置', '首屏截图', '分类标签', '素材列表']
        .every((title) => sections.titles.includes(title)), sections)
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

    /* A24 放弃修改：直接回列表且输入被丢弃 */
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
        grid: Boolean(document.querySelector('.omnimux-products-grid')),
        scrollTop: document.querySelector('.omnimux-products-body').scrollTop,
      }
    `)
    check('A24 选「放弃修改」后回到列表且不再有二级页', !discarded.subscreen && !discarded.dialog && discarded.grid, discarded)
    check('A25 返回列表后滚动位置保持（子树保活）', discarded.scrollTop === 40, discarded.scrollTop)
    const listShot = await shoot('list-after-discard')

    /* A25b 点产品卡片进入编辑态：面包屑带产品名、表单已填入既有值 */
    await evaluate(`
      document.querySelector('.omnimux-products-card').click()
      return true
    `)
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
    check('A25b 编辑态面包屑呈现「产品库 / 编辑 · {产品名}」', /编辑 · Aurora Mug/.test(editMode.breadcrumb), editMode.breadcrumb)
    check('A25c 编辑态表单已填入既有产品名且初始不脏', editMode.name === 'Aurora Mug' && editMode.dot === false, {
      name: editMode.name,
      dot: editMode.dot,
    })
    await evaluate(`
      document.querySelector('.omnimux-products-back-button').click()
      return true
    `)
    await sleep(300)

    /* A26 保存并返回：真的把 payload 交出去 */
    await evaluate(`
      [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === '添加产品').click()
      return true
    `)
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
        payload: window.__lastCreate || null,
      }
    `)
    check('A26 选「保存并返回」真的提交 payload', saved.payload && saved.payload.name === '保存并返回测试产品', saved.payload && saved.payload.name)
    check('A27 保存成功后自动回到列表', !saved.subscreen)

    /* A28 保存失败时留在二级页、错误条可见 */
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
