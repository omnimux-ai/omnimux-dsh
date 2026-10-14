import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')

// This is a browser application, not a generated Node test or a replacement state machine.
// Production React components and the actual shared controls are bundled without mocks.
const application = String.raw`
import React, { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Simulate } from 'react-dom/test-utils'
import { ProviderConfigPanel } from './ProviderConfigPanel.jsx'
import { ScenarioSelection } from './ScenarioSelection.jsx'
import { ModelsSettingsCard } from './ModelsSettingsCard.jsx'

const t = (key) => key
const listeners = new Set()
let config = snapshot(1, 1, 'https://saved.example/v1', 'saved-unknown-model')
let settings = {
  status: 'ready', writable: true, user: {},
  value: { byokProviders: config.providers, scenarioBindings: {} },
}
const requests = []
const unexpectedRequests = []
const settingWrites = []
let holdSave = false
let releaseSave
let holdRead = false
let releaseRead
let readStarted = false
let conflictNext = false
let freezeConfigRead = false
let releaseConfigRead
let readCount = 0
let staleReadBody = null
const subscribers = new Set()
const publicHubEvents = {
  subscribe(type, listener) {
    if (type !== 'omnimux:provider-config:credential-changed') throw new Error('unexpected event subscription')
    subscribers.add(listener)
    return () => subscribers.delete(listener)
  },
  emit(payload) {
    for (const listener of subscribers) listener({ payload })
  },
}
window.__omnimuxHubEvents = publicHubEvents

function snapshot(revision, credentialVersion, endpoint, model) {
  return {
    revision,
    providers: [{ provider: 'custom', revision, credentialVersion, configured: true,
      endpoint, models: { text: model }, capabilities: ['text'], saveState: 'saved' }],
  }
}
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
const scope = {
  getSnapshot: () => settings,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  async set(field, value) {
    settingWrites.push({ method: 'set', field, value })
    const next = Object.assign({}, settings.value)
    if (field === 'scenarioBindings') next.scenarioBindings = value
    else throw new Error('unexpected settings write')
    settings = Object.assign({}, settings, { value: next })
    config = snapshot(config.revision + 1, config.providers[0].credentialVersion,
      config.providers[0].endpoint, config.providers[0].models.text)
    for (const listener of listeners) listener()
  },
  async unset(field) { settingWrites.push({ method: 'unset', field }); throw new Error('unexpected settings unset') },
}
function publishSettings() {
  settings = Object.assign({}, settings, {
    value: Object.assign({}, settings.value, { byokProviders: config.providers }),
  })
  for (const listener of listeners) listener()
}
window.fetch = async (path, init = {}) => {
  const method = init.method || 'GET'
  const attempt = { path, method, body: null }
  requests.push(attempt)
  const permitted = (path === '/omnimux/byok/config' && (method === 'GET' || method === 'PUT'))
    || (path === '/omnimux/byok/test' && method === 'POST')
    || (['/omnimux/model-catalog', '/omnimux/agents', '/omnimux/agents/updates', '/omnimux/auth/status'].includes(path) && method === 'GET')
  if (!permitted) { unexpectedRequests.push(attempt); throw new Error('unexpected synthetic request') }
  let body = null
  try { body = init.body ? JSON.parse(init.body) : null }
  catch (error) { unexpectedRequests.push(attempt); throw error }
  attempt.body = body
  if (path === '/omnimux/byok/config' && method === 'GET') {
    readCount += 1
    if (staleReadBody) {
      const stale = staleReadBody
      staleReadBody = null
      return response(stale)
    }
    if (freezeConfigRead) {
      freezeConfigRead = false
      return new Promise((resolve) => { releaseConfigRead = () => resolve(response(config)) })
    }
    if (holdRead) {
      holdRead = false
      readStarted = true
      return new Promise((resolve) => { releaseRead = () => resolve(response(snapshot(2, 2, 'https://saved.example/v1', 'saved-unknown-model'))) })
    }
    return response(config)
  }
  if (path === '/omnimux/byok/config' && method === 'PUT') {
    const saved = snapshot(2, 2, body.endpoint, body.models.text)
    config = saved
    if (holdSave) return new Promise((resolve) => { releaseSave = () => resolve(response(Object.assign({ saved: true }, saved))) })
    if (holdRead) return response(Object.assign({ saved: true }, saved))
    publishSettings()
    publicHubEvents.emit({ provider: 'custom', credentialVersion: 2 })
    return response(Object.assign({ saved: true }, saved))
  }
  if (path === '/omnimux/byok/test' && method === 'POST') {
    if (conflictNext) { conflictNext = false; return response({ error: 'synthetic-conflict-409' }, 409) }
    return response({ ok: true, checkType: 'offline-config', persisted: false,
      revision: config.revision, credentialVersion: config.providers[0].credentialVersion,
      checkedAt: '2026-10-14T15:00:00Z' })
  }
  if (path === '/omnimux/model-catalog' && method === 'GET') return response({
    text: [{ id: 'known-text', label: 'Known text' }], image: [{ id: 'known-image', label: 'Known image' }],
    video: [{ id: 'known-video', label: 'Known video' }], audio: [{ id: 'known-audio', label: 'Known audio' }],
    models: [{ id: 'known-image', operations: [{ id: 'recommended-image-op', listed: true, output: { type: 'image' } }] },
      { id: 'known-video', operations: [{ id: 'recommended-video-op', listed: true, output: { type: 'video' } }] }],
    defaults: { text: 'known-text', image: 'known-image', video: 'known-video', audio: 'known-audio' },
    defaultOperations: { image: { modelId: 'known-image', operationId: 'recommended-image-op' },
      video: { modelId: 'known-video', operationId: 'recommended-video-op' } }, tools: [],
  })
  if (path === '/omnimux/agents' && method === 'GET') return response({ agents: [] })
  if (path === '/omnimux/agents/updates' && method === 'GET') return response({ updates: {} })
  if (path === '/omnimux/auth/status' && method === 'GET') return response({ logged_in: false })
  unexpectedRequests.push({ method, path })
  throw new Error('unexpected synthetic fetch: ' + method + ' ' + path)
}

function App() {
  const current = useSyncExternalStore(scope.subscribe, scope.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  return <main>
    <ScenarioSelection t={t} scope={scope} value={current.value} busy={busy} setBusy={setBusy} setError={setError} />
    <ProviderConfigPanel t={t} value={current.value} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice} />
    <output id="error">{error}</output><output id="notice">{notice}</output>
  </main>
}
const root = createRoot(document.getElementById('root'))
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
async function until(predicate, label) {
  for (let turn = 0; turn < 100; turn += 1) {
    if (predicate()) return
    await tick()
  }
  throw new Error('timed out: ' + label)
}
function field(label) {
  const input = document.querySelector('input[aria-label="' + label + '"]')
  if (!input) throw new Error('missing field: ' + label)
  return input
}
function edit(label, value) {
  const input = field(label)
  if (input.disabled) throw new Error('disabled field: ' + label)
  flushSync(() => Simulate.change(input, { target: { value } }))
}
function click(label) {
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === label)
  if (!button || button.disabled) throw new Error('missing or disabled action: ' + label)
  flushSync(() => button.click())
}
function checkedText() {
  return document.querySelector('[data-omnimux-provider-draft] [role="status"]').textContent
}
function notice() { return document.getElementById('notice').textContent }
function error() { return document.getElementById('error').textContent }
function idle() {
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === 'runtime.checkConfig')
  return button && !button.disabled
}
async function mount() {
  flushSync(() => root.render(<App />))
  await until(() => idle() && field('runtime.endpoint').value !== '', 'initial confirmed read')
  await tick()
}
async function check() {
  click('runtime.checkConfig')
  await until(() => idle(), 'check completion')
  await tick()
}
function compactProbeDocument() {
  // Executed fixture assets are not evidence: retain the observed result, not megabytes
  // of bundled script/font data in the helper's bounded stdout buffer.
  for (const node of document.querySelectorAll('script, style')) node.remove()
}
async function run() {
  await until(() => document.title.startsWith('RESULT:'), 'probe initial measurement')
  const initialTitle = document.title
  for (const node of document.querySelectorAll('script')) node.remove()
  let observed
  if (caseName === 'unknown' || caseName === 'unknown-models') {
    settings = Object.assign({}, settings, { value: Object.assign({}, settings.value, {
      defaultTextModel: 'retired-text', defaultImageModel: caseName === 'unknown-models' ? 'retired-image' : 'known-image',
      defaultVideoModel: caseName === 'unknown-models' ? 'retired-video' : 'known-video', defaultAudioModel: 'retired-audio',
      defaultImageOperation: 'retired-image-op', defaultVideoOperation: 'retired-video-op',
    }) })
    flushSync(() => root.render(<ModelsSettingsCard t={t} scope={scope} />))
    await until(() => Array.from(document.querySelectorAll('[role="checkbox"]')).some((item) => item.textContent.includes('Known text')), 'loaded catalog renders a known composer model')
    await until(() => document.getElementById('omnimux-defaultImageOperation')?.textContent.includes('retired-image-op'), 'stored operation remains visible after catalog rendering')
    observed = {
      text: document.getElementById('omnimux-defaultTextModel').textContent,
      audio: document.getElementById('omnimux-defaultAudioModel').textContent,
      image: document.getElementById('omnimux-defaultImageModel').textContent,
      video: document.getElementById('omnimux-defaultVideoModel').textContent,
      imageOperation: document.getElementById('omnimux-defaultImageOperation').textContent,
      videoOperation: document.getElementById('omnimux-defaultVideoOperation').textContent,
      writes: requests.filter((item) => item.method !== 'GET').length + settingWrites.length,
    }
  } else {
    await mount()
    if (caseName === 'initial') {
      observed = { endpoint: field('runtime.endpoint').value,
        model: field('runtime.scenario.text runtime.model').value,
        key: field('runtime.keyField').value, placeholder: field('runtime.keyField').placeholder }
    }
    if (caseName === 'credential') {
      await check()
      const before = checkedText()
      freezeConfigRead = true
      config = snapshot(1, 2, 'https://saved.example/v1', 'saved-unknown-model')
      flushSync(() => publicHubEvents.emit({ provider: 'custom', credentialVersion: 2 }))
      const immediate = checkedText()
      const readPending = typeof releaseConfigRead === 'function'
      releaseConfigRead()
      await tick()
      observed = { before, immediate, readPending, after: checkedText() }
    }
    if (caseName === 'own-save') {
      edit('runtime.keyField', 'synthetic-draft-key')
      edit('runtime.endpoint', 'https://draft.example/v1')
      click('runtime.save')
      await until(() => idle(), 'save completion with own notifications')
      observed = { notice: notice(), error: error(), key: field('runtime.keyField').value,
        endpoint: field('runtime.endpoint').value, reads: readCount,
        writes: requests.filter((item) => item.method === 'PUT').length,
        subscriptionCount: subscribers.size }
    }
    if (caseName === 'late-save' || caseName === 'late-read') {
      edit('runtime.keyField', 'synthetic-preserved-draft')
      edit('runtime.endpoint', 'https://draft.example/v1')
      holdSave = caseName === 'late-save'
      holdRead = caseName !== 'late-save'
      click('runtime.save')
      if (caseName === 'late-save') await until(() => typeof releaseSave === 'function', 'delayed save response')
      else await until(() => readStarted, 'delayed save readback')
        config = snapshot(3, 3, 'https://newer.example/v1', 'newer-model')
        flushSync(() => publishSettings())
        flushSync(() => publicHubEvents.emit({ provider: 'custom', credentialVersion: 3 }))
        await until(() => readCount >= 3, 'newer confirmed configuration read')
        await tick()
        if (caseName === 'late-save') releaseSave()
        else releaseRead()
        await until(() => idle(), 'late save settles')
        const afterSave = { notice: notice(), key: field('runtime.keyField').value,
          endpoint: field('runtime.endpoint').value, model: field('runtime.scenario.text runtime.model').value }
        await check()
        const lastCheck = requests.filter((item) => item.path === '/omnimux/byok/test').at(-1)
        observed = Object.assign({}, afterSave, { checked: checkedText(), expectedRevision: lastCheck.body.expectedRevision })
    }
    if (caseName === 'stale-refresh') {
      config = snapshot(3, 3, 'https://newer.example/v1', 'newer-model')
      flushSync(() => publicHubEvents.emit({ provider: 'custom', credentialVersion: 3 }))
      await tick()
      await tick()
      staleReadBody = snapshot(2, 2, 'https://older.example/v1', 'older-model')
      const readsBeforeFocus = readCount
      flushSync(() => window.dispatchEvent(new Event('focus')))
      await until(() => readCount > readsBeforeFocus, 'older refresh resolves')
      await tick()
      await check()
      const sent = requests.filter((item) => item.path === '/omnimux/byok/test').at(-1)
      observed = { expectedRevision: sent.body.expectedRevision, checked: checkedText(),
        endpoint: field('runtime.endpoint').value, model: field('runtime.scenario.text runtime.model').value }
    }
    if (caseName === 'conflict') {
      edit('runtime.keyField', 'synthetic-preserved-draft')
      const trigger = document.getElementById('omnimux-scenario-text')
      flushSync(() => trigger.click())
      await until(() => Array.from(document.querySelectorAll('button')).some((item) => item.textContent === 'custom · saved-unknown-model'), 'scenario menu')
      click('custom · saved-unknown-model')
      await until(() => idle() && document.getElementById('omnimux-scenario-text').textContent.includes('custom'), 'scenario write')
      config = snapshot(3, 1, 'https://saved.example/v1', 'saved-unknown-model')
      conflictNext = true
      await check()
      const conflict = error()
      const afterConflictKey = field('runtime.keyField').value
      await check()
      const checks = requests.filter((item) => item.path === '/omnimux/byok/test')
      observed = { conflict, afterConflictKey, retryError: error(), checked: checkedText(),
        firstRevision: checks[0].body.expectedRevision, retryRevision: checks[1].body.expectedRevision,
        selected: document.getElementById('omnimux-scenario-text').textContent,
        saves: requests.filter((item) => item.method === 'PUT').length }
    }
  }
  flushSync(() => root.unmount())
  compactProbeDocument()
  document.title = 'RESULT:' + JSON.stringify({ done: true, caseName, initialTitle, observed,
    subscriberCountAfterUnmount: subscribers.size, unexpectedRequests })
}
// Wait for the helper's synchronous measurement explicitly before running the application.
// Only completed observable async steps overwrite the sentinel; pending/error cannot pass.
setTimeout(() => {
  run().catch((caught) => {
    root.unmount()
    compactProbeDocument()
    document.title = 'RESULT:' + JSON.stringify({ done: false, caseName, error: caught.message })
  })
}, 0)
`

async function probe(caseName) {
  const bundle = await build({
    absWorkingDir: here,
    stdin: { contents: `const caseName = ${JSON.stringify(caseName)};\n${application}`, resolveDir: here, loader: 'jsx' },
    alias: { 'dsh-ui-kit': resolve(repo, 'packages/dsh-ui-kit/src/index.ts') },
    nodePaths: [resolve(repo, 'plugins/omnimux/node_modules')],
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: 'provider-config-probe.js', write: false,
    loader: { '.css': 'local-css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'silent',
  })
  const js = bundle.outputFiles.find((file) => file.path.endsWith('.js'))
  const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'))
  assert.ok(js, 'real React application must be bundled')
  const result = runStyleDomProbe({
    name: `provider-config-${caseName}`, styles: css?.text || '',
    html: `<div id="root"></div><script>${js.text.replaceAll('</script', '<\\/script')}</script>`,
    measure: () => ({ done: false, phase: 'async-not-finished' }),
  })
  assert.equal(result.done, true, JSON.stringify(result))
  assert.equal(result.caseName, caseName)
  assert.deepEqual(JSON.parse(result.initialTitle.slice('RESULT:'.length)), { done: false, phase: 'async-not-finished' })
  assert.equal(result.subscriberCountAfterUnmount, 0, 'public event subscription is cleaned up')
  assert.deepEqual(result.unexpectedRequests, [], 'a caught unknown request remains a hard failure')
  return result.observed
}

test('F4: first custom read renders the saved endpoint and unknown model without revealing a key', async () => {
  const result = await probe('initial')
  assert.equal(result.endpoint, 'https://saved.example/v1')
  assert.equal(result.model, 'saved-unknown-model')
  assert.equal(result.key, '')
  assert.equal(result.placeholder, 'runtime.keyStored')
})

test('F1: a credential event immediately withdraws a completed check before its refresh resolves', async () => {
  const result = await probe('credential')
  assert.equal(result.before, 'runtime.configChecked')
  assert.equal(result.readPending, true)
  assert.equal(result.immediate, 'runtime.notChecked')
  assert.equal(result.after, 'runtime.notChecked')
})

test('F2: save succeeds despite its own settings notification, credential event and reload', async () => {
  const result = await probe('own-save')
  assert.equal(result.notice, 'runtime.savedNotTested')
  assert.equal(result.error, '')
  assert.equal(result.key, '')
  assert.equal(result.endpoint, 'https://draft.example/v1')
  assert.equal(result.writes, 1)
  assert.ok(result.reads >= 3)
  assert.equal(result.subscriptionCount, 1)
})

test('F2: a delayed save response cannot clear the draft or announce success after a newer config', async () => {
  const result = await probe('late-save')
  assert.equal(result.notice, '')
  assert.equal(result.key, 'synthetic-preserved-draft')
  assert.equal(result.endpoint, 'https://draft.example/v1')
  assert.equal(result.model, 'saved-unknown-model')
  assert.equal(result.expectedRevision, 3)
  assert.equal(result.checked, 'runtime.configChecked')
})

test('F2: a delayed old save readback cannot replace an already confirmed newer configuration', async () => {
  const result = await probe('late-read')
  assert.equal(result.notice, '')
  assert.equal(result.key, 'synthetic-preserved-draft')
  assert.equal(result.endpoint, 'https://draft.example/v1')
  assert.equal(result.expectedRevision, 3)
  assert.equal(result.checked, 'runtime.configChecked')
})

test('F2: an older completed refresh cannot decrease the confirmed revision after a newer event', async () => {
  const result = await probe('stale-refresh')
  assert.equal(result.expectedRevision, 3)
  assert.equal(result.checked, 'runtime.configChecked')
  assert.equal(result.endpoint, 'https://saved.example/v1')
  assert.equal(result.model, 'saved-unknown-model')
})

test('F3: scenario change and a 409 check refresh the revision and allow an explicit retry without saving', async () => {
  const result = await probe('conflict')
  assert.equal(result.selected, 'custom · saved-unknown-model')
  assert.equal(result.firstRevision, 2)
  assert.equal(result.conflict, 'synthetic-conflict-409')
  assert.equal(result.afterConflictKey, 'synthetic-preserved-draft')
  assert.equal(result.retryRevision, 3)
  assert.equal(result.retryError, '')
  assert.equal(result.checked, 'runtime.configChecked')
  assert.equal(result.saves, 0)
})

test('F5: stored unknown defaults and operations remain visible in the actual dropdown controls', async () => {
  const result = await probe('unknown')
  assert.equal(result.text, 'retired-text · runtime.needsConfirmation')
  assert.equal(result.audio, 'retired-audio · runtime.needsConfirmation')
  assert.equal(result.imageOperation, 'retired-image-op · runtime.needsConfirmation')
  assert.equal(result.videoOperation, 'retired-video-op · runtime.needsConfirmation')
  assert.equal(result.writes, 0)
})

test('F5: unknown saved image and video models remain visible without replacing stored preferences', async () => {
  const result = await probe('unknown-models')
  assert.equal(result.image, 'retired-image · runtime.needsConfirmation')
  assert.equal(result.video, 'retired-video · runtime.needsConfirmation')
  assert.equal(result.writes, 0)
})
