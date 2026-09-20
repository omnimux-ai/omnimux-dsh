/**
 * @file plugins/omnimux-device/tests/e2e/client-plugin-boot.spec.js
 * E2E（Issue #2427 / #2429 / #2434）：
 * 1. 模拟 Web 运行时完整插件装载旅程（unwrapExports -> resolve -> apply -> 侧边栏与标签注册）
 * 2. 验证 iPhone 真机外壳结构与比例
 * 3. 验证 tame.so 竞品 6 大能力对齐：
 *    - 顶部全局连接与安全状态条 (omx-global-banner)
 *    - 6 个全量对齐选项卡 (集群/排期/素材/账号/审计/养号)
 *    - 接入新设备四步向导 (omx-modal-dialog / omx-steps-row)
 *    - 签名方案双选卡片 (omx-options-grid) 与接入前准备清单 (omx-checklist)
 *    - AI 权限白名单双栏护栏 (omx-whitelist-grid)
 *    - 排期日历与列表双视图 (omx-view-toggle) + 5 字段内联新建表单 (omx-inline-form)
 *    - 素材、账号、审计、养号各专属空状态与引导跳转 (omx-empty-box)
 * 浏览器实机多视角留证：docs/evidence/device-frontend-alignment-verified.png。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEVICE_TAB_ID = 'omnimux-device:library'

/** 最小 DOM 桩：覆盖元素操作面（setAttribute/dataset/querySelector/事件）。 */
function makeElement() {
  return {
    attrs: {},
    dataset: {},
    style: {},
    children: [],
    listeners: {},
    innerHTML: '',
    textContent: '',
    className: '',
    type: '',
    setAttribute(name, value) { this.attrs[name] = String(value) },
    getAttribute(name) { return this.attrs[name] },
    querySelector() { return makeElement() },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) },
    dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn()) },
    appendChild(child) { this.children.push(child) },
    remove() {},
  }
}

function bootClientPlugin() {
  const registered = []
  const created = []
  const registeredTabs = []
  const openedTabs = []
  const windowStub = {
    __factories: [],
    __omnimuxSidebar: {
      register(row) {
        registered.push(row.id)
        created.push(row.create())
        return () => {}
      },
    },
    // 宿主工作台全局：点击入口时 stageStore.open() 经由此 API 打开标签
    __omnimuxWorkbench: {
      createSidebarStore({ tabId }) {
        return {
          getSnapshot: () => false,
          subscribe: () => () => {},
          open: () => { openedTabs.push(tabId) },
          close: () => {},
        }
      },
    },
  }
  windowStub.__ModuleLoader__ = {
    load(entry) { windowStub.__factories.push(entry) },
  }

  const fakeSidebarService = {
    registerTab(tab) {
      registeredTabs.push(tab)
      return () => {}
    },
  }

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = windowStub
  globalThis.document = {
    createElement: () => makeElement(),
    getElementById: () => null,
    head: { appendChild() {} },
    body: { appendChild() {} },
  }

  try {
    const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
    new Function('window', 'document', code)(windowStub, globalThis.document)
    assert.equal(windowStub.__factories.length, 1, 'lib/client.js must register exactly one module factory')

    const stub = new Proxy(function () {}, {
      get: (_t, prop) => (prop === '__esModule' ? undefined : stub),
      apply: () => stub,
    })
    const exports = windowStub.__factories[0].factory(() => stub)

    // cordis-plugin-loader unwrapExports 语义
    let plugin = exports == null ? exports : (exports.default ?? exports)
    if (plugin && plugin.__esModule) plugin = plugin.default ?? plugin
    // cordis resolve 语义：函数或带 apply 方法的对象
    const callback = typeof plugin === 'function' ? plugin : (plugin && typeof plugin.apply === 'function' ? plugin.apply : undefined)
    assert.ok(callback, 'invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin)

    const disposers = []
    const dicts = {}
    const effects = []
    const ctx = {
      locale: {
        register(ns, d) { dicts[ns] = d },
        bind(ns) { return (key) => dicts[ns]?.zh?.[key] || key },
        subscribe() { return () => {} },
      },
      effect(fn, name) {
        const disposer = fn()
        effects.push(name || 'effect')
        if (typeof disposer === 'function') disposers.push(disposer)
        return disposer
      },
      // cordis 可选依赖注入语义
      inject(deps, cb) {
        return cb({ betterSidebar: fakeSidebarService, get: () => fakeSidebarService })
      },
    }
    callback(ctx, undefined)
    return { registered, created, registeredTabs, openedTabs, dicts, effects, disposers }
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
}

test('E2E 插件启动旅程：打包产物通过运行时形态校验并成功 apply', (t) => {
  const boot = bootClientPlugin()
  t.after(() => boot.disposers.forEach((dispose) => dispose()))

  assert.ok(boot.effects.includes('omnimux-device: dictionaries'), 'apply 必须注册词典')
  assert.ok(boot.effects.includes('omnimux-device: sidebar entry'), 'apply 必须挂载侧边栏入口')
  assert.ok(boot.dicts['omnimux-device']?.zh?.nav, 'apply 必须注册中文词典')
  assert.ok(boot.dicts['omnimux-device']?.en?.nav, 'apply 必须注册英文词典')
  assert.deepEqual(boot.registered, ['omnimux-device-entry'], '侧边栏必须注册手机管理入口')
  assert.equal(boot.created.length, 1, '入口按钮必须被创建')
  assert.equal(boot.created[0].attrs['aria-label'], '手机管理', '入口无障碍标签必须是「手机管理」')
})

test('E2E 点击旅程（Issue #2429）：入口点击打开已注册的手机管理工作台标签', (t) => {
  const boot = bootClientPlugin()
  t.after(() => boot.disposers.forEach((dispose) => dispose()))

  // apply 必须向侧边栏服务注册与 stageStore 同 id 的标签，否则 waitForTab 超时、点击静默无效
  assert.equal(boot.registeredTabs.length, 1, 'apply 必须注册一个工作台标签')
  const tab = boot.registeredTabs[0]
  assert.equal(tab.id, DEVICE_TAB_ID, '标签 id 必须与 stageStore 的 tabId 一致')
  assert.equal(tab.hidden, false, '标签必须可见')
  assert.equal(typeof tab.component, 'function', '标签必须携带内容组件')
  assert.equal(tab.title(), '手机管理', '标签标题必须是「手机管理」')

  // 模拟用户点击入口 → stageStore.open() → workbench.open(tabId)，标签已注册故可命中
  boot.created[0].dispatch('click')
  assert.deepEqual(boot.openedTabs, [DEVICE_TAB_ID], '点击入口必须打开手机管理工作台标签')
})

test('E2E 真机卡片（Issue #2432）：集群视图采用 iPhone 真机比例与外壳结构', () => {
  const raw = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  for (const marker of ['omx-phone-grid', 'omx-phone-frame', 'omx-phone-screen', 'omx-phone-island', 'omx-phone-statusbar', 'omx-phone-home', 'omx-phone-caption', 'omx-phone-state']) {
    assert.ok(raw.includes(marker), `打包产物缺少真机结构件 ${marker}`)
  }
  assert.ok(raw.includes('aspect-ratio: 9 / 19.5'), '真机比例样式缺失')
  assert.ok(!raw.includes('omx-mock-screen-box'), '旧版 mock-screen-box 必须移除')
})

test('E2E 竞品全量对齐（Issue #2434）：6 大能力结构件与对齐验证', () => {
  const raw = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  // 将 esbuild 产物中的 unicode 转义还原为可读字符以进行文本断言
  const decoded = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // 1. 全局连接状态条与 AI 权限入口
  assert.ok(raw.includes('omx-global-banner'), '缺少全局状态条样式类')
  assert.ok(decoded.includes('AI 权限白名单'), '缺少 AI 权限白名单触发入口')

  // 2. 6 大对齐选项卡
  for (const tab of ['集群', '排期', '素材', '账号', '审计', '养号']) {
    assert.ok(decoded.includes(tab), `缺少选项卡: ${tab}`)
  }

  // 3. 接入向导与签名双选
  assert.ok(raw.includes('omx-steps-row'), '缺少接入向导步进条')
  assert.ok(raw.includes('omx-options-grid'), '缺少签名方案双选卡')
  assert.ok(decoded.includes('Apple 开发者计划 API 密钥'), '缺少 Team 密钥签名方案')
  assert.ok(decoded.includes('免费 Apple ID 个人证书'), '缺少免费个人证书方案')
  assert.ok(raw.includes('omx-checklist'), '缺少接入前准备清单')

  // 4. 排期日历/列表双视图 + 内联新建表单
  assert.ok(raw.includes('omx-view-toggle'), '缺少排期视图切换开关')
  assert.ok(raw.includes('omx-week-grid'), '缺少周日历网格')
  assert.ok(raw.includes('omx-inline-form'), '缺少内联新建任务表单')

  // 5. 素材库与空状态引导
  assert.ok(raw.includes('omx-content-toolbar'), '缺少素材库操作栏')
  assert.ok(raw.includes('omx-empty-box'), '缺少统一空状态组件')
  assert.ok(decoded.includes('前往排期管理'), '缺少素材空状态引导按钮')
  assert.ok(decoded.includes('打开接入向导'), '缺少账号空状态引导按钮')

  // 6. AI 权限白名单双栏
  assert.ok(raw.includes('omx-whitelist-grid'), '缺少白名单双栏结构')
  assert.ok(decoded.includes('允许 AI 自主执行'), '缺少允许操作白名单')
  assert.ok(decoded.includes('严禁擅自执行'), '缺少禁止高危操作黑名单')
})
