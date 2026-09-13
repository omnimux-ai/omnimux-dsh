/**
 * 渲染级门禁：用 esbuild 打成客户端产物，在 jsdom 中以真实 React 挂着跑。
 *
 * 覆盖四条关键安全路径：
 * 1. Tab 以正确的 id/order/title 注册，且 disposer 真的注销；
 * 2. 双视图可切换，切换只替换内容区；
 * 3. `visible=false` 时 runtime 停表；
 * 4. 删除必须经过二次确认才会发出 mutate。
 */

import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { JSDOM } from 'jsdom'
import * as esbuild from 'esbuild'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { zh } from './locales.js'

const ROOT = new URL('../../', import.meta.url).pathname
let dom
let clientModule
let root
let container
/** 每个用例的客户端 ctx 效果都要在收尾时注销，否则常驻订阅会挂住进程。 */
const harnesses = []

const uiPrimitivesStub = {
  IconCheckOutline16: () => null,
  IconChevronDownOutline14: () => null,
  RiskConfirmation: () => null,
}

before(async () => {
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: ['src/client/index.js'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
  })
  const code = result.outputFiles[0].text

  dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  installDomGlobals(dom.window)

  const moduleShim = { exports: {} }
  const requireShim = (id) => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom') return ReactDOM
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitivesStub
    throw new Error(`unexpected external require: ${id}`)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(requireShim, moduleShim, moduleShim.exports)
  clientModule = moduleShim.exports

  const { createRoot } = await import('react-dom/client')
  container = dom.window.document.getElementById('app')
  root = createRoot(container)
})

after(async () => {
  await React.act(async () => { root?.unmount?.() })
  for (const harness of harnesses) {
    for (const effect of harness.effects) effect.dispose?.()
  }
  dom?.window?.close()
})

/** 把 jsdom 的窗口对象挂成全局，React DOM 才会把节点渲染到它上面。 */
function installDomGlobals(window) {
  const keys = [
    'window', 'document', 'navigator', 'HTMLElement', 'HTMLStyleElement', 'HTMLButtonElement',
    'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
    'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'localStorage', 'sessionStorage', 'DOMParser', 'Text', 'SVGElement',
  ]
  for (const key of keys) {
    if (window[key] === undefined) continue
    // Node 25 把 navigator 等全局定义成只读访问器，必须走 defineProperty 覆盖。
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

/** 翻译函数直接读本插件的中文词条，保证断言的是用户可见文案。 */
function translate(key, params) {
  const template = zh[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? ''))
}

const SNAPSHOT = {
  automations: [
    {
      id: 'a1',
      revision: 1,
      name: '每日检查',
      prompt: '检查测试并报告结果。',
      status: 'active',
      schedule: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' },
      scheduleSummary: '每天 09:00',
      timeZone: 'Asia/Shanghai',
      permission: 'read-only',
      maxConcurrentRuns: 1,
      nextRunAt: '2026-08-17T01:00:00.000Z',
      provider: null,
      model: null,
      reasoningEffort: null,
      createdAt: '2026-08-16T01:00:00.000Z',
      updatedAt: '2026-08-16T01:00:00.000Z',
    },
  ],
  runs: [
    {
      id: 'run_1',
      automationId: 'a1',
      automationName: '每日检查',
      status: 'succeeded',
      trigger: 'schedule',
      scheduledFor: '2026-08-16T01:00:00.000Z',
      startedAt: '2026-08-16T01:00:00.000Z',
      finishedAt: '2026-08-16T01:00:20.000Z',
      sessionId: 'sess_1',
      summary: '一切正常',
      error: null,
      unread: false,
    },
  ],
  workspaces: [{ id: 'ws_1', title: '演示工作区', path: '/tmp/demo' }],
  models: [],
  modelFailures: [],
  defaultModel: null,
  skills: [],
  permissions: [
    { value: 'read-only', name: 'Read Only' },
    { value: 'workspace-write', name: 'Workspace Write' },
  ],
  defaultPermission: 'read-only',
  serverNow: '2026-08-16T02:00:00.000Z',
}

/** 造一个最小的客户端 ctx，并记录 Tab 注册/注销与 RPC 调用。 */
function makeClientHarness() {
  const calls = []
  const tabs = []
  const effects = []
  const registerTab = (descriptor) => {
    tabs.push(descriptor)
    return () => {
      const index = tabs.indexOf(descriptor)
      if (index >= 0) tabs.splice(index, 1)
    }
  }
  const ctx = {
    effect: (factory, label) => {
      const dispose = factory()
      effects.push({ label, dispose })
    },
    connection: {
      rpc: {
        call: async (channel, endpoint, payload) => {
          calls.push({ channel, endpoint, payload })
          if (endpoint === 'snapshot') return { ok: true, value: SNAPSHOT }
          return { ok: true, value: {} }
        },
      },
    },
    sessions: {
      list: { getSnapshot: () => ({ ids: ['sess_1'], byId: {}, current: null }) },
      refresh: async () => undefined,
      open: () => undefined,
    },
    locale: {
      register: () => () => undefined,
      bind: () => translate,
    },
    inject: (names, register) => {
      assert.deepEqual(names, ['betterSidebar'])
      register({ betterSidebar: { registerTab } })
    },
  }
  return { ctx, tabs, effects, calls }
}

/**
 * 每个用例都从干净状态起步：先卸掉上一个用例的组件树并注销它的 ctx 效果，
 * 否则常驻订阅留下的快照轮询会污染计时器断言、也会挂住进程。
 */
async function resetHarness() {
  await React.act(async () => { root.render(null) })
  for (const harness of harnesses) {
    for (const effect of harness.effects) effect.dispose?.()
  }
  harnesses.length = 0
  return makeClientHarness()
}

/** React 18 的 act 需要一个可 await 的批次边界。 */
async function flush() {
  await React.act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('Tab 以 omnimux-automation:workbench / order 21 / single 注册，且 disposer 真的注销', async () => {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)

  assert.equal(clientModule.AUTOMATION_TAB_ID, 'omnimux-automation:workbench')
  assert.equal(harness.tabs.length, 1)
  const tab = harness.tabs[0]
  assert.equal(tab.id, 'omnimux-automation:workbench')
  assert.equal(tab.order, 21)
  assert.equal(tab.single, true)
  assert.equal(tab.hidden, false)
  assert.equal(tab.title(), '自动化')
  assert.equal(typeof tab.component, 'function')
  assert.equal(typeof tab.icon, 'function')

  const effect = harness.effects.find(item => item.label === 'omnimux-automation: workbench tab')
  assert.ok(effect !== undefined)
  effect.dispose()
  assert.equal(harness.tabs.length, 0)
})

test('挂载工作台：默认执行记录视图，可切到任务总览再切回', async () => {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)
  const tab = harness.tabs[0]

  await React.act(async () => {
    root.render(React.createElement(tab.component, { visible: true }))
  })
  await flush()

  assert.match(container.textContent, /执行记录/)
  assert.match(container.textContent, /任务总览/)
  assert.match(container.textContent, /每日检查/)
  assert.match(container.textContent, /2026-08-16 09:00/)
  assert.match(container.textContent, /定时触发/)

  const switchTab = [...container.querySelectorAll('[role="tab"]')].find(node => node.textContent === '任务总览')
  assert.ok(switchTab !== undefined)
  await React.act(async () => { switchTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  // 总览卡片：名称 + 周期 + 下次执行时间，右上角开关以 role=switch 承载启停语义。
  assert.match(container.textContent, /每日检查/)
  assert.match(container.textContent, /23 小时后/)
  const toggle = container.querySelector('[role="switch"]')
  assert.ok(toggle !== null, '任务卡片右上角必须有启停开关')
  assert.match(toggle.getAttribute('aria-label'), /暂停/)
  assert.equal(toggle.checked, true)
  assert.match(container.textContent, /执行任务/)
  assert.match(container.textContent, /编辑任务/)
  assert.match(container.textContent, /删除任务/)

  const backToRuns = [...container.querySelectorAll('[role="tab"]')].find(node => node.textContent === '执行记录')
  await React.act(async () => { backToRuns.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()
  assert.match(container.textContent, /2026-08-16 09:00/)
})

test('visible=false 时 runtime 停表，恢复激活后重新挂表', async () => {
  const originalSet = globalThis.setInterval
  const originalClear = globalThis.clearInterval
  /** 当前仍处于挂表状态的快照轮询回调。 */
  const armed = []
  globalThis.setInterval = (fn) => {
    const handle = { fn }
    armed.push(handle)
    return handle
  }
  globalThis.clearInterval = (handle) => {
    const index = armed.indexOf(handle)
    if (index >= 0) armed.splice(index, 1)
  }

  try {
    const harness = await resetHarness()
    // 只观测本用例自己的 runtimes 挂上的轮询：此前用例残留的回调与本次断言无关。
    armed.length = 0
    clientModule.apply(harness.ctx)
    const tab = harness.tabs[0]
    // apply 阶段的常驻会话同步会保留一条低频后台轮询，作为本用例的基线。
    assert.equal(armed.length, 1, '常驻会话同步应保留一条后台轮询')

    await React.act(async () => {
      root.render(React.createElement(tab.component, { visible: true }))
    })
    await flush()
    assert.equal(armed.length, 1, '激活时前台订阅应占用同一条轮询槽位')

    await React.act(async () => {
      root.render(React.createElement(tab.component, { visible: false }))
    })
    await flush()
    assert.equal(armed.length, 0, '面板收起或 Tab 未激活时必须停表')

    await React.act(async () => {
      root.render(React.createElement(tab.component, { visible: true }))
    })
    await flush()
    assert.equal(armed.length, 1, '重新激活后应恢复轮询')
  } finally {
    globalThis.setInterval = originalSet
    globalThis.clearInterval = originalClear
  }
})

test('删除必须先经二次确认，确认后才发出 mutate；取消则不发', async () => {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)
  const tab = harness.tabs[0]

  await React.act(async () => {
    root.render(React.createElement(tab.component, { visible: true }))
  })
  await flush()

  const overviewTab = [...container.querySelectorAll('[role="tab"]')].find(node => node.textContent === '任务总览')
  await React.act(async () => { overviewTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  const deleteButton = [...container.querySelectorAll('button')].find(node => node.textContent.includes('删除任务'))
  assert.ok(deleteButton !== undefined, '任务卡片上应有删除入口')
  await React.act(async () => { deleteButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  // 未确认前，绝不能发出 delete。
  assert.equal(harness.calls.some(item => item.endpoint === 'mutate'), false)
  const dialog = container.querySelector('[role="alertdialog"]')
  assert.ok(dialog !== null, '删除必须先弹出二次确认')
  assert.match(dialog.textContent, /每日检查/)

  const cancel = [...dialog.querySelectorAll('button')].find(node => node.textContent === '取消')
  await React.act(async () => { cancel.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()
  assert.equal(harness.calls.some(item => item.endpoint === 'mutate'), false)

  await React.act(async () => { deleteButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()
  const confirm = [...container.querySelectorAll('[role="alertdialog"] button')].find(node => node.textContent === '确认删除')
  await React.act(async () => { confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  const mutate = harness.calls.find(item => item.endpoint === 'mutate')
  assert.ok(mutate !== undefined, '确认后必须发出 mutate')
  assert.equal(mutate.payload.mutation, 'delete')
  assert.equal(mutate.payload.automationId, 'a1')
})
