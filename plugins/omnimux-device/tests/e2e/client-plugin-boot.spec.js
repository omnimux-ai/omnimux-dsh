/**
 * @file plugins/omnimux-device/tests/e2e/client-plugin-boot.spec.js
 * E2E（Issue #2427）：模拟 Web 运行时的完整插件启动旅程——
 * 加载打包产物 → unwrapExports 解包 → Cordis resolve 校验插件形态 →
 * apply(ctx) 注册词典并挂载侧边栏「手机管理」入口。
 * 故障版本（PR #2417 引入的纯再导出入口）在 resolve 步即被判定为
 * invalid plugin，整机进入插件恢复屏；本用例锁定修复后的完整链路。
 * 浏览器实机对照证据：docs/evidence/device-client-plugin-shape-verified.png。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 最小 DOM 桩：覆盖 sidebar-entry.js 的元素操作面（setAttribute/dataset/querySelector/事件）。 */
function makeElement() {
  return {
    attrs: {},
    dataset: {},
    style: {},
    children: [],
    innerHTML: '',
    textContent: '',
    className: '',
    type: '',
    setAttribute(name, value) { this.attrs[name] = String(value) },
    getAttribute(name) { return this.attrs[name] },
    querySelector() { return makeElement() },
    addEventListener() {},
    appendChild(child) { this.children.push(child) },
    remove() {},
  }
}

function bootClientPlugin() {
  const registered = []
  const created = []
  const windowStub = {
    __factories: [],
    __omnimuxSidebar: {
      register(row) {
        registered.push(row.id)
        created.push(row.create())
        return () => {}
      },
    },
  }
  windowStub.__ModuleLoader__ = {
    load(entry) { windowStub.__factories.push(entry) },
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
    }
    callback(ctx, undefined)
    return { registered, created, dicts, effects, disposers }
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
}

test('E2E 插件启动旅程：打包产物通过运行时形态校验并成功 apply', (t) => {
  const boot = bootClientPlugin()
  t.after(() => boot.disposers.forEach((dispose) => dispose()))

  assert.deepEqual(boot.effects, ['omnimux-device: dictionaries', 'omnimux-device: sidebar entry'])
  assert.ok(boot.dicts['omnimux-device']?.zh?.nav, 'apply 必须注册中文词典')
  assert.ok(boot.dicts['omnimux-device']?.en?.nav, 'apply 必须注册英文词典')
  assert.deepEqual(boot.registered, ['omnimux-device-entry'], '侧边栏必须注册手机管理入口')
  assert.equal(boot.created.length, 1, '入口按钮必须被创建')
  assert.equal(boot.created[0].attrs['aria-label'], '手机管理', '入口无障碍标签必须是「手机管理」')
})
