import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { groupsOfModel, pickAutoGroup } from './lib/catalog.js'

// Bundle the entire production tree, including original hooks and HTTP client.
// React stays external so the renderer and every hook use one React instance.
const require = createRequire(import.meta.url)
const built = await build({
  entryPoints: [fileURLToPath(new URL('./AvatarStage.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/*'], metafile: true,
})
assert.equal(React.version, '18.3.1')
for (const path of ['hooks/use-builder.js', 'hooks/use-avatars.js', 'hooks/use-tasks.js', 'hooks/use-multiview.js', 'api.js']) {
  assert.ok(Object.keys(built.metafile.inputs).some((input) => input.endsWith(path)), `production import missing: ${path}`)
}
assert.ok(!Object.keys(built.metafile.inputs).some((input) => input.includes('/kit/')))

const MODEL = 'gpt-image-2.5'
const off = { id: 'off', label: '停用组', wireGroup: 'disabled-wire', default: true, enabled: false, pricing: { pointsEstimate: 2 }, constraints: { maxImages: 1 } }
const on = { id: 'on', label: '启用组', wireGroup: 'active-wire', enabled: true, pricing: { pointsEstimate: 1 }, constraints: { maxImages: 2 } }
const taxonomy = {
  category_priority: ['appearance'], tier_group: { options: [{ id: 'total', label_en: '全部' }] },
  categories: [{ id: 'appearance', label_en: '外观', kind: 'text', max: 1, options: [{ id: 'natural', label_en: '自然', visibleIn: ['total'] }] }],
}
const preset = { id: 'draft', name: '测试角色', tier: 'total', selection: { appearance: ['natural'] }, brief: '保留角色说明', seed: 42, preview: { path: 'fixture.webp', width: 90, height: 160 } }
const historyMeta = { model: MODEL, group: 'historic-wire', tier: 'total', selection: { appearance: ['natural'] }, brief: '历史说明', seed: 77, image_url: 'https://example.invalid/reference.png', size: '9:16' }
const oldTask = { taskId: 'old-task', taskRef: 'old-provider-ref', status: 'SUCCESS', imageUrl: '/fixture.png', properties: { input: JSON.stringify(historyMeta) } }
let cleanup

afterEach(async () => {
  if (cleanup) await cleanup()
  cleanup = undefined
})

async function mount(groups, { tasks = [], pendingSubmit = false, visible = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
  const keys = ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement', 'Event', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) {
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'requestAnimationFrame' || key === 'cancelAnimationFrame' ? dom.window[key].bind(dom.window) : dom.window[key]
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const row = { id: MODEL, label: '测试图像模型', family: 'openai', ...(groups === undefined ? {} : { channelGroups: structuredClone(groups) }) }
  const catalog = { image: [row], defaults: { image: MODEL }, text: [], video: [] }
  const requests = []
  const releases = []
  const unexpected = []
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url), dom.window.location.origin).pathname
    const method = init.method || 'GET'
    requests.push({ path, method, body: init.body ? JSON.parse(init.body) : null })
    let body
    if (method === 'GET' && path === '/omnimux/model-catalog') body = catalog
    else if (method === 'GET' && path === '/api/omnimux/avatar/taxonomy') body = { success: true, data: taxonomy }
    else if (method === 'GET' && path === '/api/omnimux/avatar/presets') body = { success: true, data: { version: 1, source: 'test-only', items: [preset] } }
    else if (method === 'GET' && path === '/api/omnimux/avatar/avatars') body = { success: true, revision: 1, avatars: [{ id: 'avatar-1', name: '测试角色', sheet: '' }] }
    else if (method === 'GET' && path === '/api/omnimux/avatar/tasks') body = { success: true, tasks }
    else if (method === 'GET' && path === '/api/omnimux/avatar/task') body = { success: true, task: null }
    else if (method === 'POST' && path === '/api/omnimux/avatar/sheet') {
      body = { success: true, task: null, taskRef: '', mode: 'test-only' }
      if (pendingSubmit) await new Promise((resolve) => releases.push(resolve))
    } else {
      unexpected.push(`${method} ${path}`)
      throw new Error(`uncontrolled request: ${method} ${path}`)
    }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  }
  const production = new Module(fileURLToPath(import.meta.url), undefined)
  production.filename = fileURLToPath(import.meta.url)
  production.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)))
  production.require = require
  production._compile(built.outputFiles[0].text, production.filename)
  const { AvatarStage } = production.exports
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  cleanup = async () => {
    try {
      await act(async () => { for (const release of releases.splice(0)) release(); await Promise.resolve() })
      await act(async () => root.unmount())
      assert.deepEqual(unexpected, [], 'all requests must remain controlled and local')
    } finally {
      dom.window.close()
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  }
  const render = async (nextVisible) => act(async () => root.render(React.createElement(AvatarStage, { visible: nextVisible, locale: 'zh' })))
  await render(visible)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.ok(requests.some((request) => request.path === '/api/omnimux/avatar/avatars'), 'original avatar initialization ran')
  assert.ok(requests.some((request) => request.path === '/omnimux/model-catalog'), 'original catalog initialization ran')
  const query = (selector) => { const hit = dom.window.document.querySelector(selector); assert.ok(hit, `DOM control missing: ${selector}`); return hit }
  const click = async (element) => act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const apply = async () => click(query('.omx-avatar-preset-recreate'))
  const posts = () => requests.filter((request) => request.method === 'POST' && request.path === '/api/omnimux/avatar/sheet')
  return { dom, query, click, apply, posts, requests, render, catalog }
}

function realClickCallback(button) {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'))
  assert.ok(key, 'real React DOM props must exist')
  const callback = button[key].onClick
  assert.equal(typeof callback, 'function', 'production GenerateBar callback is mounted')
  const fiberKey = Object.keys(button).find((name) => name.startsWith('__reactFiber$'))
  let fiber = button[fiberKey]
  while (fiber && fiber.type?.name !== 'GenerateBar') fiber = fiber.return
  assert.ok(fiber, 'callback belongs to real production GenerateBar')
  assert.ok(callback === fiber.memoizedProps.onGenerate || callback === fiber.alternate?.memoizedProps.onGenerate, 'DOM onClick is original business callback on the current React fiber, not a test wrapper')
  return callback
}

async function selectGroup(ui, label) {
  await ui.click(ui.query('.omx-avatar-modelbtn'))
  await ui.click(ui.query('.omx-avatar-dropdown[aria-label="渠道"]'))
  const option = [...ui.dom.window.document.querySelectorAll('[role="option"]')].find((node) => node.textContent === label)
  assert.ok(option, `real group option missing: ${label}`)
  await ui.click(option)
}

test('all-disabled marked default produces no automatic group and keeps raw catalog rows intact', () => {
  const rows = [{ id: MODEL, channelGroups: [off, { ...on, enabled: false }] }]
  const before = structuredClone(rows)
  assert.equal(pickAutoGroup(groupsOfModel(rows, MODEL)), '')
  assert.deepEqual(rows, before)
})

test('production Stage skips disabled default and submits enabled wireGroup through original API', async () => {
  const ui = await mount([off, on], { pendingSubmit: true })
  const original = structuredClone(ui.catalog)
  await ui.apply()
  assert.equal(ui.query('.omx-avatar-cta').disabled, false)
  await ui.click(ui.query('.omx-avatar-cta'))
  assert.equal(ui.posts().length, 1)
  assert.equal(ui.posts()[0].body.group, 'active-wire')
  assert.equal(ui.posts()[0].body.brief, '保留角色说明')
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, '测试图像模型 · 启用组')
  assert.deepEqual(ui.catalog, original)
})

test('production Stage preserves enabled default preference and distinct wireGroup', async () => {
  const ui = await mount([{ ...off, enabled: true }, on])
  await ui.apply()
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, '测试图像模型 · 停用组')
  await ui.click(ui.query('.omx-avatar-cta'))
  assert.equal(ui.posts().length, 1)
  assert.equal(ui.posts()[0].body.group, 'disabled-wire')
  assert.equal(ui.posts()[0].body.seed, 42)
})

test('production Stage disables main generate when nonempty groups are all disabled', async () => {
  const ui = await mount([off, { ...on, enabled: false }])
  await ui.apply()
  assert.equal(ui.query('.omx-avatar-cta').disabled, true)
  assert.equal(ui.posts().length, 0)
})

test('actual main onClick rejects all-disabled groups even with restored nonempty group and preserves draft', async () => {
  const task = structuredClone(oldTask)
  const originalTask = structuredClone(task)
  const ui = await mount([off, { ...on, enabled: false }], { tasks: [task] })
  const historyTab = [...ui.dom.window.document.querySelectorAll('button')].find((node) => node.textContent === '历史记录')
  assert.ok(historyTab, 'production history tab exists')
  await ui.click(historyTab)
  await ui.click(ui.query('.omx-avatar-card.is-clickable'))
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, '测试图像模型 · historic-wire')
  const selected = ui.query('.omx-avatar-builder').innerHTML
  const summary = ui.query('.omx-avatar-modelbtn-val').textContent
  const callback = realClickCallback(ui.query('.omx-avatar-cta'))
  await act(async () => { await callback() })
  assert.equal(ui.posts().length, 0, 'all-disabled callback must not call original submitSheet')
  assert.equal(ui.query('.omx-avatar-builder').innerHTML, selected)
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, summary)
  assert.deepEqual(task, originalTask, 'restored brief, seed, reference, and taskRef metadata stay untouched')
  assert.match(ui.query('[role="status"]').textContent, /当前图像生成渠道均不可用/)
})

for (const [name, groups] of [['absent', undefined], ['empty', []]]) {
  test(`production Stage preserves original allowed submission with ${name} groups`, async () => {
    const ui = await mount(groups)
    await ui.apply()
    assert.equal(ui.query('.omx-avatar-cta').disabled, false)
    await ui.click(ui.query('.omx-avatar-cta'))
    assert.equal(ui.posts().length, 1)
    assert.equal(ui.posts()[0].body.group, '')
  })
}

test('production visible false/true keeps initialized selection and draft without remount', async () => {
  const ui = await mount([{ ...off, enabled: true }, on])
  await ui.apply()
  const page = ui.query('.omx-avatar-page')
  const calls = ui.requests.length
  await ui.render(false)
  assert.equal(page.getAttribute('aria-hidden'), 'true')
  await ui.render(true)
  assert.equal(ui.query('.omx-avatar-page'), page)
  assert.equal(page.getAttribute('data-visible'), 'true')
  assert.equal(ui.requests.length, calls)
  await ui.click(ui.query('.omx-avatar-cta'))
  assert.equal(ui.posts()[0].body.brief, '保留角色说明')
  assert.deepEqual(ui.posts()[0].body.selection, { appearance: ['natural'] })
})

test('manual disabled choice stays unchanged when another enabled group exists', async () => {
  const ui = await mount([{ ...off, default: false }, on])
  await ui.apply()
  await selectGroup(ui, '停用组')
  await ui.render(false)
  await ui.render(true)
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, '测试图像模型 · 停用组')
  assert.equal(ui.query('.omx-avatar-cta').disabled, false)
  await ui.click(ui.query('.omx-avatar-cta'))
  assert.equal(ui.posts()[0].body.group, 'off', 'original manual id semantics are outside wire remapping scope')
})

test('original history view restores metadata without changing task or generating a new request', async () => {
  const task = structuredClone(oldTask)
  const before = structuredClone(task)
  const ui = await mount([off, on], { tasks: [task] })
  const historyTab = [...ui.dom.window.document.querySelectorAll('button')].find((node) => node.textContent === '历史记录')
  assert.ok(historyTab, 'production history tab exists')
  await ui.click(historyTab)
  await ui.click(ui.query('.omx-avatar-card.is-clickable'))
  await ui.render(false)
  await ui.render(true)
  assert.equal(ui.query('.omx-avatar-modelbtn-val').textContent, '测试图像模型 · historic-wire')
  assert.deepEqual(task, before)
  assert.equal(ui.posts().length, 0)
})
