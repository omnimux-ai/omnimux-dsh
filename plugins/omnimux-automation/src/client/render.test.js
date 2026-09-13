/**
 * 渲染级门禁：用 esbuild 打成客户端产物，在 jsdom 中以真实 React 挂着跑。
 *
 * 覆盖五条关键安全路径：
 * 1. Tab 以正确的 id/order/title 注册，且 disposer 真的注销；
 * 2. 双视图可切换，切换只替换内容区；
 * 3. `visible=false` 时 runtime 停表；
 * 4. 删除必须经过二次确认才会发出 mutate；
 * 5. 分裂创建按钮：主按钮走「手动设置」打开配置弹窗，下拉「使用对话创建」把引导语写进底座 contenteditable。
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

/** 左栏行：真实宿主里由 hub 的侧边栏协调器登记，这里替身记录登记与注销。 */
const sidebarRows = []
/** 工作台全局桥：只保留本门禁需要断言的开 Tab 与订阅语义。 */
const workbench = { activeTabs: new Set(), opened: [], listeners: new Set() }

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

  // 宿主侧边栏协调器与工作台桥：入口行只有拿到它们才能排位与打开 Tab。
  dom.window.__omnimuxSidebar = {
    register(row) {
      const record = { ...row, element: row.create() }
      sidebarRows.push(record)
      return () => {
        const index = sidebarRows.indexOf(record)
        if (index >= 0) sidebarRows.splice(index, 1)
      }
    },
  }
  dom.window.__omnimuxWorkbench = {
    createSidebarStore({ tabId, title }) {
      return {
        getSnapshot: () => workbench.activeTabs.has(tabId),
        subscribe(listener) {
          workbench.listeners.add(listener)
          return () => workbench.listeners.delete(listener)
        },
        open() {
          workbench.activeTabs.add(tabId)
          workbench.opened.push({ tabId, title: title() })
          for (const listener of workbench.listeners) listener()
        },
        close() {
          workbench.activeTabs.delete(tabId)
          for (const listener of workbench.listeners) listener()
        },
        readBox: () => ({ top: 0, left: 0, width: 0, height: 0 }),
      }
    },
  }

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
  // 登记进 harnesses，下一个用例的 resetHarness 才能注销本用例留下的常驻订阅与左栏行。
  const harness = { ctx, tabs, effects, calls }
  harnesses.push(harness)
  return harness
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
  workbench.activeTabs.clear()
  workbench.opened.length = 0
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

test('左栏入口以 rank 9 登记，点击打开工作台 Tab 而不是抢占 overlay', async () => {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)

  assert.equal(sidebarRows.length, 1, 'apply 后左栏应恰好登记一行')
  const row = sidebarRows[0]
  assert.equal(row.id, 'omnimux-automation-entry')
  assert.equal(row.rank, 9)
  const entry = row.element
  assert.equal(entry.tagName, 'BUTTON')
  assert.ok(entry.hasAttribute('data-omnimux-automation-entry'), '入口行必须带产品 marker')
  assert.equal(entry.getAttribute('aria-label'), '自动化')
  assert.match(entry.innerHTML, /width="14" height="14"/, '入口图标必须守 14×14 契约')

  entry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await flush()
  assert.deepEqual(
    workbench.opened.at(-1),
    { tabId: 'omnimux-automation:workbench', title: '自动化' },
    '点击左栏必须打开工作台 Tab',
  )
  assert.equal(entry.dataset.active, 'true', 'Tab 激活时入口行必须高亮')
  assert.equal(dom.window.document.documentElement.dataset.dshProductStage, undefined, '入口行不得抢占产品级 stage')

  const effect = harness.effects.find(item => item.label === 'omnimux-automation: sidebar entry')
  assert.ok(effect !== undefined)
  effect.dispose()
  assert.equal(sidebarRows.length, 0, 'disposer 必须注销协调器登记')
})

/**
 * 挂载工作台并返回分组「创建」按钮的查找器。
 * 下拉浮层走 portal 挂在 body 上，所以按类名取而不是按容器取。
 */
async function mountWorkbenchSplit() {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)
  const tab = harness.tabs[0]
  await React.act(async () => {
    root.render(React.createElement(tab.component, { visible: true }))
  })
  await flush()
  const split = container.querySelector('.dsh-st-split')
  assert.ok(split !== null, '工作台右上角必须有分裂创建按钮')
  return {
    harness,
    split,
    main: () => split.querySelector('.dsh-st-split-main'),
    toggle: () => split.querySelector('.dsh-st-split-toggle'),
    items: () => [...dom.window.document.querySelectorAll('.dsh-st-split-item')],
  }
}

/**
 * 造一个底座真身结构的 composer 座位：座位 div 包一个 contenteditable 输入框，
 * 用于验证草稿写进的是真实 contenteditable，而不是 textarea。
 *
 * @returns {{ seat: HTMLElement, field: HTMLElement }}
 */
function mountComposerSeat() {
  const seat = dom.window.document.createElement('div')
  seat.setAttribute('data-composer-seat', '')
  const field = dom.window.document.createElement('div')
  field.setAttribute('contenteditable', 'true')
  field.setAttribute('role', 'textbox')
  seat.append(field)
  dom.window.document.body.append(seat)
  return { seat, field }
}

test('创建按钮是分裂胶囊：左半创建、右半展开两项下拉，选中后收起', async () => {
  const { main, toggle, items } = await mountWorkbenchSplit()

  assert.equal(main().textContent, '创建')
  assert.equal(main().disabled, false)
  assert.equal(toggle().disabled, false)
  assert.equal(toggle().getAttribute('aria-haspopup'), 'menu')
  assert.equal(toggle().getAttribute('aria-expanded'), 'false')
  assert.equal(items().length, 0, '未展开时不得渲染浮层')

  await React.act(async () => { toggle().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  assert.equal(toggle().getAttribute('aria-expanded'), 'true')
  assert.deepEqual(
    items().map(node => node.textContent),
    ['使用对话创建', '手动设置'],
    '下拉必须恰好是「使用对话创建」与「手动设置」两项',
  )
  assert.equal(items()[0].getAttribute('role'), 'menuitem')
  assert.match(items()[0].innerHTML, /<svg/, '下拉项必须带图标')

  // Escape 收起浮层并把焦点交还主按钮。
  await React.act(async () => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  await flush()
  assert.equal(items().length, 0, 'Escape 必须收起浮层')
  assert.equal(toggle().getAttribute('aria-expanded'), 'false')
})

test('主按钮点击默认走「手动设置」，直接打开任务配置弹窗且不展开浮层', async () => {
  const { main, items } = await mountWorkbenchSplit()

  await React.act(async () => {
    main().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  await flush()

  assert.equal(items().length, 0, '主按钮不得展开浮层')
  assert.match(dom.window.document.body.textContent, /请写完整、独立的任务说明/, '主按钮必须打开手动配置弹窗')
})

test('「使用对话创建」把引导语写进主对话 contenteditable 并收起浮层，不打开配置弹窗', async () => {
  const { toggle, items } = await mountWorkbenchSplit()
  const { seat, field } = mountComposerSeat()
  const commands = []
  dom.window.document.execCommand = (command, _showUi, value) => {
    commands.push({ command, value })
    field.textContent = value
    return true
  }

  try {
    await React.act(async () => { toggle().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    await flush()

    await React.act(async () => { items()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    await flush()

    assert.deepEqual(
      commands,
      [{ command: 'insertText', value: '我要创建一个定时任务，每【时间间隔】执行【具体任务】' }],
      '底座编辑器的正常输入通道必须优先',
    )
    assert.equal(field.textContent, '我要创建一个定时任务，每【时间间隔】执行【具体任务】')
    assert.equal(items().length, 0, '选中后浮层必须收起')
    assert.equal(dom.window.document.querySelector('.dsh-st-split-main').textContent, '创建')
    assert.doesNotMatch(dom.window.document.body.textContent, /请写完整、独立的任务说明/, '对话创建不得打开手动配置弹窗')
  } finally {
    delete dom.window.document.execCommand
    seat.remove()
  }
})

test('contenteditable 编辑器拒绝 insertText 时，草稿仍要真实落到输入框', async () => {
  const { toggle, items } = await mountWorkbenchSplit()
  const { seat, field } = mountComposerSeat()
  let inputCount = 0
  field.addEventListener('input', () => { inputCount += 1 })

  try {
    await React.act(async () => { toggle().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    await flush()
    await React.act(async () => { items()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    await flush()

    assert.equal(field.textContent, '我要创建一个定时任务，每【时间间隔】执行【具体任务】')
    assert.equal(inputCount, 1, '退回通道必须派发一次 input 事件，React 受控输入才同步')
  } finally {
    seat.remove()
  }
})

test('「手动设置」打开任务配置弹窗', async () => {
  const { toggle, items } = await mountWorkbenchSplit()

  await React.act(async () => { toggle().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()
  await React.act(async () => { items()[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()

  assert.equal(items().length, 0, '选中后浮层必须收起')
  assert.match(dom.window.document.body.textContent, /请写完整、独立的任务说明/, '手动设置必须打开配置弹窗')
})
