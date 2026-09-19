/**
 * @file plugins/omnimux-device/tests/e2e/client-plugin-boot.spec.js
 * E2E（Issue #2427 / #2429）：模拟 Web 运行时的完整插件启动与点击旅程——
 * 加载打包产物 → unwrapExports 解包 → Cordis resolve 校验插件形态 →
 * apply(ctx) 注册词典、挂载侧边栏入口并注册工作台标签 →
 * 模拟点击入口 → stageStore.open → workbench.open(tabId) 命中已注册标签。
 * 故障版本一（PR #2417 纯再导出入口）在 resolve 步被判 invalid plugin；
 * 故障版本二（#2427 修复后未注册标签）点击时 waitForTab 超时静默放弃。
 * 浏览器实机对照证据：docs/evidence/device-client-plugin-shape-verified.png、
 * docs/evidence/device-sidebar-tab-registration-verified.png。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEVICE_TAB_ID = 'omnimux-device:library'

/** 最小 DOM 桩：覆盖 sidebar-entry.js 的元素操作面（setAttribute/dataset/querySelector/事件）。 */
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
  const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  // 真机外壳结构件必须存在于打包产物
  for (const marker of ['omx-phone-grid', 'omx-phone-frame', 'omx-phone-screen', 'omx-phone-island', 'omx-phone-statusbar', 'omx-phone-home', 'omx-phone-caption', 'omx-phone-state']) {
    assert.ok(bundle.includes(marker), `打包产物缺少真机结构件 ${marker}`)
  }
  // 真机比例样式（9:19.5）必须存在于样式表
  assert.ok(bundle.includes('aspect-ratio: 9 / 19.5'), '真机比例样式缺失')
  // 旧版通用黑色矩形必须彻底移除
  assert.ok(!bundle.includes('omx-mock-screen-box'), '旧版 mock-screen-box 必须移除')
  assert.ok(!bundle.includes('omx-fleet-card'), '旧版 fleet-card 必须移除')
})
