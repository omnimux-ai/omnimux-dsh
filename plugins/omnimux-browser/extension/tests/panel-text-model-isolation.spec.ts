// @vitest-environment jsdom
// @ts-nocheck
//
// 设置面板「对话模型」/「文本生成模型」的隔离（Issue #3629 · A1）。

import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const LABEL_CHAT = '对话模型'
const LABEL_TEXT = '文本生成模型'
// 行标签简化锚点：把定位常量钉在新文案上，防止旧长标签回归。
assert.equal(LABEL_CHAT, '对话模型')
assert.equal(LABEL_TEXT, '文本生成模型')
const TAB_ID = 7

let panelApi = null
let onStatus = null
let rpc = null
let updateSettings = null
let root = null

vi.mock('../src/panel/api.ts', () => {
  class PanelRpcError extends Error {}
  return {
    connectPanel: () => panelApi,
    PanelRpcError,
  }
})

import { App } from '../src/panel/App.tsx'

/** 设置面板需要的扩展 API 面；settings 读始终回 dshSettings 信封。 */
function stubChrome(storedSettings) {
  const set = vi.fn(async () => undefined)
  const get = vi.fn(async () => ({ dshSettings: storedSettings }))
  globalThis.chrome = {
    // 中文 UI，断言读到的就是用户看到的文案。
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      local: { get, set },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      getURL: (path) => 'chrome-extension://test/' + path,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: { query: vi.fn(async () => [{ id: TAB_ID }]), sendMessage: vi.fn(async () => undefined) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
  }
  return { set, get }
}

function labels() {
  return Array.from(document.querySelectorAll('.settings-panel label > span')).map((span) => span.textContent || '')
}

/** 按行标签取该行自己的模型选择器。 */
function selectIn(labelText) {
  const row = Array.from(document.querySelectorAll('.settings-panel label'))
    .find((label) => (label.querySelector('span')?.textContent || '').includes(labelText))
  assert.ok(row, '找不到设置行：' + labelText)
  const select = row.querySelector('select')
  assert.ok(select, '设置行里没有 select：' + labelText)
  return select
}

async function openSettings() {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => { if (onStatus !== null) onStatus('connected', null) })
  await vi.waitFor(() => { assert.ok(document.querySelector('.settings-trigger')) })
  await act(async () => { document.querySelector('.settings-trigger').click() })
  await vi.waitFor(() => { assert.ok(document.querySelector('.settings-actions')) })
}

async function choose(select, value) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  const storage = globalThis.localStorage
  if (storage !== undefined && typeof storage.clear === 'function') storage.clear()
  document.body.innerHTML = '<div id="root"></div>'
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  HTMLElement.prototype.scrollTo = () => {}
  globalThis.fetch = async () => { throw new Error('offline') }
  stubChrome({})

  rpc = vi.fn(async (method) => {
    if (method === 'session.create') return { sessionId: 'session-current' }
    if (method === 'session.history') return { events: [] }
    if (method === 'settings.describe') return { namespaces: [] }
    if (method === 'credentials.describe') return { credentials: {} }
    throw new Error('unexpected RPC: ' + method)
  })
  updateSettings = vi.fn(async () => undefined)
  const unsubscribe = () => {}
  panelApi = {
    rpc: async (method, payload) => await rpc(method, payload),
    respond: vi.fn(async () => undefined),
    onStatus: vi.fn((callback) => { onStatus = callback; return unsubscribe }),
    onEvent: vi.fn(() => unsubscribe),
    onApprovalRequest: vi.fn(() => unsubscribe),
    onApprovalResolved: vi.fn(() => unsubscribe),
    onTabAffinity: vi.fn(() => unsubscribe),
    onSelection: vi.fn(() => unsubscribe),
    onMediaAttach: vi.fn(() => unsubscribe),
    onSessionResumeHint: vi.fn(() => unsubscribe),
    onTaskLocate: vi.fn(() => unsubscribe),
    respondToApproval: vi.fn(async () => undefined),
    resolveTabAffinity: vi.fn(async () => undefined),
    rebindTabAffinity: vi.fn(async () => undefined),
    clearSelection: vi.fn(async () => undefined),
    registerWindow: vi.fn(async () => undefined),
    setActiveSession: vi.fn(async () => undefined),
    updateSettings,
    requestStatus: vi.fn(async () => undefined),
  }
  root = createRoot(document.querySelector('#root'))
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  delete globalThis.chrome
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

describe('设置面板的文本生成模型行（#3629 A1）', () => {
  it('两行同时存在、文案已更新，文本行带「跟随对话模型」空值选项', async () => {
    await openSettings()
    const texts = labels()
    assert.ok(texts.some((label) => label.includes(LABEL_CHAT)))
    assert.ok(texts.some((label) => label.includes(LABEL_TEXT)))
    assert.equal(texts.some((label) => label.includes('对话模型与推理等级')), false)
    assert.equal(texts.some((label) => label.includes('文本生成模型与推理等级')), false)

    const textSelect = selectIn(LABEL_TEXT)
    assert.equal(textSelect.value, '')
    const textValues = Array.from(textSelect.options).map((option) => option.value)
    assert.ok(textValues.includes(''))
    assert.ok(textValues.includes('gpt-6-astra'))
    assert.ok(textValues.includes('__custom__'))

    // 对话行不允许「空模型」：空值选项只属于文本生成行。
    const chatValues = Array.from(selectIn(LABEL_CHAT).options).map((option) => option.value)
    assert.equal(chatValues.includes(''), false)
  })

  it('切换文本生成模型只写 textModel 三元组，对话模型键不变（A1）', async () => {
    // 实时目录夹具：组 provider 与组名映射给出的值不同（'grok-subscription' vs
    // 'grok'），所以下面的 provider 断言只能命中目录解析路径，空串或兜底名都算失败。
    globalThis.fetch = async () => new Response(JSON.stringify({
      modelGroups: [
        { group: 'Grok (Subscription)', provider: 'grok-subscription', models: [{ id: 'grok-4.6', name: 'Grok 4.6' }] },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })

    await openSettings()
    const chatValueBefore = selectIn(LABEL_CHAT).value
    const chatStoredBefore = globalThis.localStorage.getItem('omnimux_default_model')

    // 等目录落地：夹具组替换了离线快照组（'gpt-6-astra' 只存在于快照里）。
    await vi.waitFor(() => {
      const values = Array.from(selectIn(LABEL_TEXT).options).map((option) => option.value)
      assert.equal(values.includes('gpt-6-astra'), false)
    })

    await choose(selectIn(LABEL_TEXT), 'grok-4.6')
    await vi.waitFor(() => { assert.ok(updateSettings.mock.calls.length > 0) })

    const patch = updateSettings.mock.calls.at(-1).at(0)
    assert.equal(patch.textModel, 'grok-4.6')
    assert.equal(typeof patch.textEffort, 'string')
    assert.equal(typeof patch.textProvider, 'string')
    assert.equal(patch.textProvider, 'grok-subscription')
    assert.equal(Object.keys(patch).includes('bridgeUrl'), false)
    assert.equal(Object.keys(patch).includes('token'), false)

    assert.equal(selectIn(LABEL_CHAT).value, chatValueBefore)
    assert.equal(globalThis.localStorage.getItem('omnimux_default_model'), chatStoredBefore)
    assert.equal(globalThis.localStorage.getItem('omnimux_default_text_model'), null)
  })

  it('切换对话模型不改文本生成选择，也不写文本设置（A1）', async () => {
    await openSettings()
    await choose(selectIn(LABEL_CHAT), 'grok-4.3')
    await vi.waitFor(() => { assert.equal(globalThis.localStorage.getItem('omnimux_default_model'), 'grok-4.3') })

    assert.equal(selectIn(LABEL_TEXT).value, '')
    assert.equal(updateSettings.mock.calls.length, 0)
    assert.ok(rpc.mock.calls.some((call) => call.at(0) === 'settings.mutate'))
  })

  it('重新打开设置面板时两行各自保持已保存的值（A1）', async () => {
    // 对话选择器按实例端口读键（默认实例 43128），文本行读 dshSettings：
    // 两行各自从自己的来源恢复，互不覆盖。
    globalThis.localStorage.setItem('omnimux_default_model_43128', 'gpt-5.5')
    globalThis.localStorage.setItem('omnimux_default_model', 'gpt-5.5')
    stubChrome({ textModel: 'claude-opus-4-6', textEffort: 'high', textProvider: 'anthropic' })
    await openSettings()

    assert.equal(selectIn(LABEL_CHAT).value, 'gpt-5.5')
    await vi.waitFor(() => { assert.equal(selectIn(LABEL_TEXT).value, 'claude-opus-4-6') })
  })
})
