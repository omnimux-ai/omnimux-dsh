/**
 * 渲染级门禁：用 esbuild 打成客户端产物，在 jsdom 中以真实 React 挂着跑。
 *
 * 覆盖的路径：
 * 1. Tab 以正确的 id/order/title 注册，且 disposer 真的注销；
 * 2. 主从两栏：默认列表独居、点行展开右栏、`✕`/`Esc` 关闭；
 * 3. 四状态胶囊与三段固定排序、搜索实时收敛、空态分派；
 * 4. `visible=false` 时 runtime 停表；
 * 5. 删除必须经过二次确认才会发出 mutate；脏态切走要二次确认；
 * 6. 详情栏保存闭环（含服务端版本回锚）；
 * 7. 运行历史行点击直达会话；
 * 8. 跨断点不重挂载：形态只由 CSS 容器查询判定，JS 不量宽度；
 * 9. 分裂创建按钮：主按钮走「手动设置」打开配置弹窗，下拉「使用对话创建」把引导语写进底座 contenteditable。
 */

import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { JSDOM } from 'jsdom'
import * as esbuild from 'esbuild'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { zh } from './locales.js'

const ROOT = new URL('../../', import.meta.url).pathname
let clientModule
let root
let container
/** 每个用例的客户端 ctx 效果都要在收尾时注销，否则常驻订阅会挂住进程。 */
const harnesses = []

/** 左栏行：真实宿主里由 hub 的侧边栏协调器登记，这里替身记录登记与注销。 */
const sidebarRows = []
/** 工作台全局桥：只保留本门禁需要断言的开 Tab 与订阅语义。 */
const workbench = { activeTabs: new Set(), opened: [], listeners: new Set() }

// jsdom 必须先于 react-dom 就位：React 在模块初始化时读 document 判定是否支持原生
// input 事件；若此时还没有 DOM，它会退回 polyfill，受控输入的 onChange 就永远不触发。
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
installDomGlobals(dom.window)
const ReactDOM = await import('react-dom')
const reactDomClient = await import('react-dom/client')

const uiPrimitivesStub = {
  IconCheckOutline16: () => null,
  IconChevronDownOutline14: () => null,
  RiskConfirmation: () => null,
}

/**
 * 假 Host 的快照：2 个已开启、1 个已暂停、1 个一次性且已跑完。
 * 排序与胶囊断言都建立在这份夹具上（AC-2 / AC-3）。
 */
function makeSnapshot() {
  return {
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
        workspaceId: 'ws_1',
        nextRunAt: '2026-08-17T01:00:00.000Z',
        provider: null,
        model: null,
        reasoningEffort: null,
        createdAt: '2026-08-16T01:00:00.000Z',
        updatedAt: '2026-08-16T01:00:00.000Z',
      },
      {
        id: 'a2',
        revision: 1,
        name: '每十分钟巡检',
        prompt: '巡检依赖并汇报。',
        status: 'active',
        schedule: { kind: 'interval', everyMinutes: 10, anchor: '2026-08-16T00:00:00.000Z', timeZone: 'Asia/Shanghai' },
        timeZone: 'Asia/Shanghai',
        permission: 'read-only',
        maxConcurrentRuns: 1,
        workspaceId: 'ws_1',
        nextRunAt: '2026-08-17T02:00:00.000Z',
        provider: null,
        model: null,
        reasoningEffort: null,
        createdAt: '2026-08-16T02:00:00.000Z',
        updatedAt: '2026-08-16T02:00:00.000Z',
      },
      {
        id: 'a3',
        revision: 1,
        name: '每周依赖巡检',
        prompt: '每周巡检一次依赖。',
        status: 'paused',
        schedule: { kind: 'weekly', time: '09:00', weekdays: [1], timeZone: 'Asia/Shanghai' },
        timeZone: 'Asia/Shanghai',
        permission: 'read-only',
        maxConcurrentRuns: 1,
        workspaceId: 'ws_1',
        provider: null,
        model: null,
        reasoningEffort: null,
        createdAt: '2026-08-16T03:00:00.000Z',
        updatedAt: '2026-08-16T03:00:00.000Z',
      },
      {
        id: 'a4',
        revision: 1,
        name: '一次性发布检查',
        prompt: '发布前跑一次全量检查。',
        status: 'active',
        schedule: { kind: 'once', at: '2026-08-10T01:00:00.000Z', timeZone: 'Asia/Shanghai' },
        timeZone: 'Asia/Shanghai',
        permission: 'read-only',
        maxConcurrentRuns: 1,
        workspaceId: 'ws_1',
        provider: null,
        model: null,
        reasoningEffort: null,
        createdAt: '2026-08-16T04:00:00.000Z',
        updatedAt: '2026-08-16T04:00:00.000Z',
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
      {
        id: 'run_2',
        automationId: 'a1',
        automationName: '每日检查',
        status: 'skipped',
        trigger: 'schedule',
        scheduledFor: '2026-08-16T03:00:00.000Z',
        startedAt: null,
        finishedAt: null,
        sessionId: null,
        summary: null,
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
}

/** 当前假 Host 的快照；每个用例从干净夹具起步。 */
let hostSnapshot = makeSnapshot()

/** 深拷贝：避免用例之间通过快照对象互相污染。 */
function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

  container = dom.window.document.getElementById('app')
  root = reactDomClient.createRoot(container)
})

after(async () => {
  await React.act(async () => { root?.unmount?.() })
  for (const harness of harnesses) {
    for (const effect of harness.effects) effect.dispose?.()
  }
  dom.window.close()
})

/** 把 jsdom 的窗口对象挂成全局，React DOM 才会把节点渲染到它上面。 */
function installDomGlobals(window) {
  const keys = [
    'window', 'document', 'navigator', 'HTMLElement', 'HTMLStyleElement', 'HTMLButtonElement',
    'HTMLInputElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
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

/**
 * 造一个最小的客户端 ctx，并记录 Tab 注册/注销、RPC 调用与会话打开。
 * `rpc.call` 背后是一个有状态的假 Host：写操作会真的改快照并推进 `revision`，
 * 于是刷新回来的新版本才能验证「非破坏式重锚」这条闭环。
 */
function makeClientHarness() {
  const calls = []
  const tabs = []
  const effects = []
  const openedSessions = []
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
          if (endpoint === 'snapshot') return { ok: true, value: clone(hostSnapshot) }
          if (endpoint === 'update') {
            hostSnapshot = {
              ...hostSnapshot,
              automations: hostSnapshot.automations.map(item => (item.id === payload.automationId
                ? { ...item, ...payload.input, revision: item.revision + 1, updatedAt: '2026-08-16T06:00:00.000Z' }
                : item)),
            }
            return { ok: true, value: {} }
          }
          if (endpoint === 'mutate') {
            hostSnapshot = payload.mutation === 'delete'
              ? { ...hostSnapshot, automations: hostSnapshot.automations.filter(item => item.id !== payload.automationId) }
              : {
                ...hostSnapshot,
                automations: hostSnapshot.automations.map(item => (item.id === payload.automationId
                  ? { ...item, status: payload.mutation === 'pause' ? 'paused' : 'active' }
                  : item)),
              }
            return { ok: true, value: {} }
          }
          return { ok: true, value: {} }
        },
      },
    },
    sessions: {
      list: { getSnapshot: () => ({ ids: ['sess_1'], byId: {}, current: null }) },
      refresh: async () => undefined,
      open: (sessionId) => { openedSessions.push(sessionId) },
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
  const harness = { ctx, tabs, effects, calls, openedSessions }
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
  hostSnapshot = makeSnapshot()
  return makeClientHarness()
}

/**
 * 排空 in-flight 的异步链（写操作 → 乐观更新 → 刷新 → 服务端版本回锚）。
 * 用定时器而不是固定次数的微任务，才不会随实现里 await 的层数变化而失效。
 */
async function flush() {
  await React.act(async () => {
    for (let round = 0; round < 4; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  })
}

/** 挂载工作台并返回它所在的容器与 harness。 */
async function mountWorkbench() {
  const harness = await resetHarness()
  clientModule.apply(harness.ctx)
  const tab = harness.tabs[0]
  await React.act(async () => {
    root.render(React.createElement(tab.component, { visible: true }))
  })
  await flush()
  return { harness, tab }
}

/** 按可见文案找按钮。 */
function buttonByText(text, scope = container) {
  return [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text)
}

/** 按文案片段找按钮。 */
function buttonContaining(text, scope = container) {
  return [...scope.querySelectorAll('button')].find(node => node.textContent.includes(text))
}

/** 点击并等待副作用排空。 */
async function click(node) {
  assert.ok(node !== undefined && node !== null, '待点击的节点必须存在')
  await React.act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await flush()
}

/** 推理等级档位文案沿用既有词条 `form.effort.*`（中文词条为 Default/Low/Medium/High）。 */
const EFFORT_HIGH = translate('form.effort.high')

/**
 * 受控输入的标准输入姿势：走原型上的原生 value setter，React 的 value tracker
 * 才会认为值变了并触发 onChange。
 */
async function setInputValue(node, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  valueSetter.call(node, value)
  await React.act(async () => {
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await flush()
}

/** 左栏列表行的任务名（顺序即渲染顺序）。 */
function rowNames() {
  return [...container.querySelectorAll('.dsh-st-md-row-name')].map(node => node.textContent)
}

/** 详情栏（右栏）根节点。 */
function detailRegion() {
  return container.querySelector('[role="region"]')
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

test('AC-1/AC-2：默认列表独居，无顶层视图切换，按开启 → 开启 → 暂停 → 已完成排序', async () => {
  await mountWorkbench()

  // 双 Tab 形态彻底退役：连词条都不再出现在界面上。
  assert.doesNotMatch(container.textContent, /执行记录/)
  assert.doesNotMatch(container.textContent, /任务总览/)
  assert.equal(detailRegion(), null, '未选中时右栏不得存在于树中')
  assert.equal(container.querySelector('.dsh-st-md-scrim'), null, '未选中时不得有遮罩')

  assert.match(container.textContent, /定时任务/)
  assert.match(container.textContent, /让 Agent 安排任务、设置提醒或监测更新/)
  assert.deepEqual(rowNames(), ['每日检查', '每十分钟巡检', '每周依赖巡检', '一次性发布检查'])
})

test('AC-3：四状态胶囊带计数，「已完成」只命中一次性且已跑完的任务', async () => {
  await mountWorkbench()

  const capsules = [...container.querySelectorAll('.dsh-st-md-capsules [role="tab"]')]
  assert.deepEqual(
    capsules.map(node => node.textContent),
    ['全部4', '已开启2', '已暂停1', '已完成1'],
  )
  assert.equal(capsules[0].getAttribute('aria-selected'), 'true')

  await click(capsules[3])
  assert.deepEqual(rowNames(), ['一次性发布检查'])

  await click(capsules[2])
  assert.deepEqual(rowNames(), ['每周依赖巡检'])

  await click(capsules[1])
  assert.deepEqual(rowNames(), ['每日检查', '每十分钟巡检'])
})

test('AC-4：搜索实时收敛到任务名，清空即恢复，无匹配走「清除筛选」空态', async () => {
  await mountWorkbench()

  const input = container.querySelector('.dsh-st-md-search-input')
  assert.ok(input !== null)
  assert.equal(input.getAttribute('placeholder'), '搜索已安排任务')

  const type = value => setInputValue(input, value)

  await type('每日')
  assert.deepEqual(rowNames(), ['每日检查'])

  await type('巡检')
  assert.deepEqual(rowNames(), ['每十分钟巡检', '每周依赖巡检'])

  await type('查无此任务')
  assert.deepEqual(rowNames(), [])
  assert.match(container.textContent, /没有匹配的任务/)
  assert.doesNotMatch(container.textContent, /暂无定时任务/)

  await click(buttonByText('清除筛选'))
  assert.deepEqual(rowNames(), ['每日检查', '每十分钟巡检', '每周依赖巡检', '一次性发布检查'])
  assert.equal(container.querySelector('.dsh-st-md-search-input').value, '')
})

test('AC-5：点行展开右栏并保持选中态，Esc / 关闭按钮回到列表独居', async () => {
  await mountWorkbench()

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  const region = detailRegion()
  assert.ok(region !== null, '点行必须展开右栏')
  assert.equal(region.getAttribute('aria-label'), '任务详情')
  assert.match(region.textContent, /每次运行新建聊天/)
  assert.match(region.textContent, /运行历史记录/)

  const first = container.querySelectorAll('.dsh-st-md-row')[0]
  assert.equal(first.className.includes('is-selected'), true)
  assert.equal(container.querySelectorAll('.dsh-st-md-row-open')[0].getAttribute('aria-pressed'), 'true')

  // 遮罩与右栏同时存在于树中，形态（并排 / 覆层）交给容器查询判定。
  assert.ok(container.querySelector('.dsh-st-md-scrim') !== null)

  await React.act(async () => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  await flush()
  assert.equal(detailRegion(), null, 'Esc 必须关闭右栏')

  await click(container.querySelectorAll('.dsh-st-md-row-open')[2])
  await click(container.querySelector('[aria-label="关闭详情"]'))
  assert.equal(detailRegion(), null, '✕ 必须关闭右栏')
  assert.match(container.textContent, /每周依赖巡检/)
})

test('AC-6：改推理等级 → 保存可点 → 发出 update 并持久化 → 回到干净态', async () => {
  const { harness } = await mountWorkbench()

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  const save = () => buttonByText('保存', container.querySelector('.dsh-st-md-foot-actions'))
  assert.equal(save().disabled, true, '未变更时保存必须 disabled')

  await click(buttonByText(EFFORT_HIGH, container.querySelector('.dsh-st-md-segments')))
  assert.match(container.textContent, /有未保存的修改/)
  assert.equal(save().disabled, false)

  await click(save())
  const update = harness.calls.filter(item => item.endpoint === 'update').at(-1)
  assert.ok(update !== undefined, '保存必须发出 update')
  assert.equal(update.payload.automationId, 'a1')
  assert.equal(update.payload.input.reasoningEffort, 'high')
  assert.equal(update.payload.input.schedule.time, '09:00')

  // 服务端版本推进后草稿自动重锚，脏标记归零。
  assert.equal(save().disabled, true, '保存成功后必须回到干净态')
  assert.doesNotMatch(container.textContent, /有未保存的修改/)

  // 重新打开该任务，值已持久。
  await click(container.querySelector('[aria-label="关闭详情"]'))
  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  const high = buttonByText(EFFORT_HIGH, container.querySelector('.dsh-st-md-segments'))
  assert.equal(high.className.includes('is-on'), true)
})

test('脏态保护：Esc 与切换任务都要先二次确认，取消则保留草稿', async () => {
  await mountWorkbench()

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  await click(buttonByText(EFFORT_HIGH, container.querySelector('.dsh-st-md-segments')))

  // 脏态下点另一行：先确认，取消则原样保留。
  await click(container.querySelectorAll('.dsh-st-md-row-open')[2])
  let dialog = container.querySelector('[role="alertdialog"]')
  assert.ok(dialog !== null, '脏态切换任务必须先二次确认')
  assert.match(dialog.textContent, /放弃未保存的修改？/)
  await click(buttonByText('继续编辑', dialog))
  assert.equal(container.querySelector('[role="alertdialog"]'), null)
  assert.equal(container.querySelectorAll('.dsh-st-md-row-name')[0].textContent, '每日检查')
  assert.equal(buttonByText(EFFORT_HIGH, container.querySelector('.dsh-st-md-segments')).className.includes('is-on'), true)

  // 脏态下按 Esc：确认后关闭。
  await React.act(async () => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  await flush()
  dialog = container.querySelector('[role="alertdialog"]')
  assert.ok(dialog !== null, '脏态关闭必须先二次确认')
  await click(buttonByText('放弃修改', dialog))
  assert.equal(detailRegion(), null, '确认放弃后右栏关闭')

  // 取消本次修改：草稿回到服务端值，脏标记消失。
  await click(container.querySelectorAll('.dsh-st-md-row-open')[1])
  await click(buttonByText(EFFORT_HIGH, container.querySelector('.dsh-st-md-segments')))
  assert.equal(buttonByText('保存', container.querySelector('.dsh-st-md-foot-actions')).disabled, false)
  await click(buttonByText('取消', container.querySelector('.dsh-st-md-foot-actions')))
  assert.equal(buttonByText('保存', container.querySelector('.dsh-st-md-foot-actions')).disabled, true)
})

test('AC-7：点运行历史行直达会话，无会话的行不可点', async () => {
  const { harness } = await mountWorkbench()

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  const rows = [...container.querySelectorAll('.dsh-st-md-history-row')]
  assert.equal(rows.length, 2)
  assert.match(rows[0].textContent, /2026-08-16 11:00/)
  assert.match(rows[0].textContent, /演示工作区/)
  assert.match(rows[0].textContent, /定时触发/)
  assert.equal(rows[0].disabled, true, '没有会话 id 的行必须是灰态不可点')

  await click(rows[1])
  assert.deepEqual(harness.openedSessions, ['sess_1'])
  assert.ok(harness.calls.some(item => item.endpoint === 'adopt-session'))
})

test('删除走行内 `...` 菜单，且必须先经二次确认才发出 mutate', async () => {
  const { harness } = await mountWorkbench()

  assert.equal(container.querySelectorAll('.dsh-st-md-row-name').length, 4)
  await click(container.querySelectorAll('.dsh-st-md-row .dsh-st-md-more-btn')[0])

  const menu = container.querySelector('[role="menu"]')
  assert.ok(menu !== null, '行 hover 的 `...` 必须能展开菜单')
  const items = [...menu.querySelectorAll('button')].map(node => node.textContent)
  assert.deepEqual(items, ['执行任务', '编辑任务', '暂停', '删除任务'])

  await click(buttonContaining('删除任务', menu))
  assert.equal(harness.calls.some(item => item.endpoint === 'mutate'), false, '未确认前绝不能发出 delete')
  const dialog = container.querySelector('[role="alertdialog"]')
  assert.ok(dialog !== null, '删除必须先弹出二次确认')
  assert.match(dialog.textContent, /每日检查/)

  await click(buttonByText('取消', dialog))
  assert.equal(harness.calls.some(item => item.endpoint === 'mutate'), false)

  await click(container.querySelectorAll('.dsh-st-md-row .dsh-st-md-more-btn')[0])
  await click(buttonContaining('删除任务', container.querySelector('[role="menu"]')))
  await click(buttonByText('确认删除', container.querySelector('[role="alertdialog"]')))

  const mutate = harness.calls.find(item => item.endpoint === 'mutate')
  assert.ok(mutate !== undefined, '确认后必须发出 mutate')
  assert.equal(mutate.payload.mutation, 'delete')
  assert.equal(mutate.payload.automationId, 'a1')
  assert.deepEqual(rowNames(), ['每十分钟巡检', '每周依赖巡检', '一次性发布检查'])
})

test('选中项被删除后右栏自动收起，不留悬空详情', async () => {
  await mountWorkbench()

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  assert.ok(detailRegion() !== null)

  await click(container.querySelectorAll('.dsh-st-md-row .dsh-st-md-more-btn')[0])
  await click(buttonContaining('删除任务', container.querySelector('[role="menu"]')))
  await click(buttonByText('确认删除', container.querySelector('[role="alertdialog"]')))

  assert.equal(detailRegion(), null, '选中项消失后右栏必须收起')
  assert.deepEqual(rowNames(), ['每十分钟巡检', '每周依赖巡检', '一次性发布检查'])
})

test('AC-8：响应式只由 CSS 容器查询判定，跨断点不重挂载、不丢编辑态', async () => {
  await mountWorkbench()

  const styleNode = dom.window.document.getElementById('omnimux-automation-styles')
  assert.ok(styleNode !== null, '样式必须注入到宿主文档')
  const css = styleNode.textContent
  assert.match(css, /container-type:inline-size/, 'container-type 必须落在真实存在的容器节点上')
  assert.match(css, /\.dsh-st-md-root\{[^}]*container-type:inline-size/, 'container-type 必须落在两栏骨架根节点')
  assert.match(css, /\.dsh-st-md-root\{[^}]*height:100%[^}]*min-height:0/, 'container-type 必须配确定的高度契约')
  assert.match(css, /@container \(min-width:760px\)/, '并排 / 覆层必须由容器查询判定')
  assert.match(css, /clamp\(320px,34%,400px\)/, '宽屏左栏宽度契约')
  assert.match(css, /width:min\(440px,100%\)/, '窄屏覆层宽度契约')
  assert.doesNotMatch(css, /\.dsh-st-shell\{/)
  assert.doesNotMatch(container.innerHTML, /[×✕↑↓↗↘▶⏸⏹✓✔]/, '界面不得用 Unicode 字符充当图标')
  assert.equal(container.querySelectorAll('select').length, 0, '禁止原生 select')

  await click(container.querySelectorAll('.dsh-st-md-row-open')[0])
  const region = detailRegion()
  await setInputValue(container.querySelector('.dsh-st-md-title-input'), '改到一半的名字')

  // 模拟容器从宽变窄再变回：形态切换只换 CSS，JS 不参与，React 树与输入值都不动。
  for (const width of [520, 900, 640, 1200]) {
    dom.window.innerWidth = width
    // eslint-disable-next-line no-await-in-loop
    await React.act(async () => {
      dom.window.dispatchEvent(new dom.window.Event('resize'))
    })
    // eslint-disable-next-line no-await-in-loop
    await flush()
  }

  assert.equal(detailRegion(), region, '跨断点不得重挂载右栏')
  assert.equal(region.isConnected, true)
  assert.equal(container.querySelector('.dsh-st-md-title-input').value, '改到一半的名字', '跨断点不得丢编辑态')
  assert.match(container.textContent, /有未保存的修改/)
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
  await mountWorkbench()
  const split = container.querySelector('.dsh-st-split')
  assert.ok(split !== null, '工作台右上角必须有分裂创建按钮')
  return {
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

  await click(toggle())

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

  await click(main())

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
    await click(toggle())
    await click(items()[0])

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
    await click(toggle())
    await click(items()[0])

    assert.equal(field.textContent, '我要创建一个定时任务，每【时间间隔】执行【具体任务】')
    assert.equal(inputCount, 1, '退回通道必须派发一次 input 事件，React 受控输入才同步')
  } finally {
    seat.remove()
  }
})

test('「手动设置」打开任务配置弹窗', async () => {
  const { toggle, items } = await mountWorkbenchSplit()

  await click(toggle())
  await click(items()[1])

  assert.equal(items().length, 0, '选中后浮层必须收起')
  assert.match(dom.window.document.body.textContent, /请写完整、独立的任务说明/, '手动设置必须打开配置弹窗')
})
