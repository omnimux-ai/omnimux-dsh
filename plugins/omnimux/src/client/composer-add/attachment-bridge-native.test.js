import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// Bundle the real component and stores together so tests exercise the same singleton.
const output = await build({
  stdin: { contents: `export { AttachmentSubmitBridge } from './AttachmentSubmitBridge.jsx'; export { getCreativePresetsStore } from '../presets/presets-store.js'; export { getComposerModeStore } from '../composer-mode/composer-mode-store.js';`, resolveDir: new URL('.', import.meta.url).pathname, loader: 'js' },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { AttachmentSubmitBridge, getCreativePresetsStore, getComposerModeStore } = module.exports
const URL_VIDEO = 'https://example.com/video'
function nativeInput() {
  const text = `参考视频：${URL_VIDEO}`
  return { draft: `需求 ${text}`, draftRev: 7, phase: 'plain', occurrences: [{ source: 'omnimux-video-link', ref: URL_VIDEO, offset: 3, length: text.length, id: 'native-1', label: '参考视频 · example.com' }] }
}
function deadlineClock() {
  const saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  const callbacks = new Map()
  let id = 0
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms !== 2000) return saved.setTimeout(fn, ms, ...args)
    const token = { id: ++id }; callbacks.set(token, fn); return token
  }
  globalThis.clearTimeout = token => {
    if (!callbacks.delete(token)) saved.clearTimeout(token)
  }
  return {
    get size() { return callbacks.size },
    async expire() { const work = [...callbacks.values()]; callbacks.clear(); await act(async () => work.forEach(fn => fn())) },
    restore() { Object.assign(globalThis, saved) },
  }
}
let sequence = 0
async function mount(options = {}) {
  const { marketing = false, state = nativeInput() } = options
  const receipt = Object.hasOwn(options, 'receipt') ? options.receipt : true
  const dom = new JSDOM('<div data-phase="hero"><div data-composer-card><div id="bridge"></div><div data-composer-input="true"></div><button data-send-button>Send</button></div></div>')
  const saved = Object.fromEntries(['window', 'document', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })
  let sessionId = `bridge-test-${++sequence}`
  let snapshot = state
  const insertions = [], wholeDrafts = [], arms = []
  let sends = 0
  const root = createRoot(document.querySelector('#bridge'))
  const presets = getCreativePresetsStore()
  const mode = getComposerModeStore()
  const hook = { title: 'Demo', titleZh: '演示', prompt: '保留开场冲突' }
  if (marketing) { mode.setMode(sessionId, 'marketing'); presets.setPreset(sessionId, 'hook', hook) }
  const render = async () => act(async () => root.render(React.createElement(AttachmentSubmitBridge, {
    sessionId, useInput: selector => selector(snapshot),
    t: key => `translated:${key}`,
    inputActions: { setDraft: text => { wholeDrafts.push(text) } },
    insertText: options.legacy ? undefined : (text, span) => { insertions.push({ text, span }); return receipt },
    attachmentStore: { getSnapshot: () => [] }, attachmentAdmission: { arm: (...args) => arms.push(args) },
    getCurrentSessionId: () => sessionId,
  })))
  document.querySelector('[data-send-button]').addEventListener('click', () => sends++)
  await render()
  return {
    insertions, wholeDrafts, arms, presets, hook,
    get sessionId() { return sessionId }, get sends() { return sends }, get state() { return snapshot },
    status: () => document.querySelector('[role="status"]')?.textContent || '',
    async send() { await act(async () => document.querySelector('[data-send-button]').click()) },
    async publish(next) { snapshot = next; await render() },
    async switchSession(next) { sessionId = `bridge-test-${++sequence}`; snapshot = next; await render() },
    chip(kind, value) {
      const node = document.createElement('span'); node.setAttribute(`data-omx-${kind}-token`, 'true')
      const input = document.createElement('input'); input.value = value; node.appendChild(input)
      document.querySelector('[data-composer-input]').appendChild(node)
      return node
    },
    async close() { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, saved) },
  }
}

test('timeout retains sources; late publication never consumes or sends until explicit recheck', async () => {
  const clock = deadlineClock(), env = await mount({ marketing: true })
  try {
    const chip = env.chip('product', 'prod_42'), before = env.state
    await env.send(); assert.equal(clock.size, 1)
    await clock.expire()
    assert.equal(env.status(), 'translated:attachments.submit.prepare.unconfirmed')
    await env.send(); assert.equal(env.insertions.length, 1); assert.equal(chip.isConnected, true)
    await env.publish({ ...before, draft: before.draft + env.insertions[0].text, draftRev: 8 })
    assert.equal(chip.isConnected, true); assert.equal(env.presets.getSnapshot(env.sessionId).hook, env.hook)
    assert.equal(env.sends, 0)
    await env.send()
    assert.equal(env.sends, 1); assert.equal(env.insertions.length, 1)
    assert.equal(chip.isConnected, false)
  } finally { await env.close(); clock.restore() }
})

test('timeout recheck requires newer revision and plain phase, recomputes from current draft', async () => {
  const clock = deadlineClock(), env = await mount()
  try {
    const chip = env.chip('product', 'prod_42'), before = env.state
    await env.send(); await clock.expire()
    await env.publish({ ...before, draftRev: 8, phase: 'busy' }); await env.send()
    assert.equal(env.insertions.length, 1); assert.equal(chip.isConnected, true)
    await env.publish({ ...before, draft: 'edited', occurrences: [], draftRev: 9 }); await env.send()
    assert.equal(env.insertions.length, 2); assert.equal(env.sends, 0)
    assert.equal(env.insertions[1].text, '\n\n[商品: prod_42]')
    assert.equal(env.insertions[1].span.draftRev, 9)
  } finally { await env.close(); clock.restore() }
})

test('void legacy setter requires publication and cannot retry uncertain timed-out writes', async () => {
  const clock = deadlineClock(), env = await mount({ legacy: true, state: { draft: '', occurrences: [] } })
  try {
    const chip = env.chip('product', 'prod_42')
    await env.send(); assert.equal(env.wholeDrafts.length, 1); assert.equal(chip.isConnected, true)
    await clock.expire()
    assert.equal(env.status(), 'translated:attachments.submit.prepare.legacyUnconfirmed')
    await env.publish({ draft: env.wholeDrafts[0], occurrences: [], draftRev: 99, phase: 'plain' })
    await env.send()
    assert.equal(env.wholeDrafts.length, 1); assert.equal(env.sends, 0); assert.equal(chip.isConnected, true)
  } finally { await env.close(); clock.restore() }
})

test('confirmed void legacy setter consumes only on exact subsequent snapshot', async () => {
  const clock = deadlineClock(), env = await mount({ legacy: true, state: { draft: '', occurrences: [] } })
  try {
    const chip = env.chip('product', 'prod_42')
    await env.send(); assert.equal(chip.isConnected, true)
    await env.publish({ draft: env.wholeDrafts[0], occurrences: [] })
    assert.equal(chip.isConnected, false); assert.equal(clock.size, 0)
    assert.equal(env.status(), 'translated:attachments.submit.prepare.ready')
  } finally { await env.close(); clock.restore() }
})

test('deadline is cancelled on session switch and unmount', async () => {
  const clock = deadlineClock(), env = await mount({ marketing: true })
  try {
    await env.send(); assert.equal(clock.size, 1)
    await env.switchSession(nativeInput()); assert.equal(clock.size, 0)
    env.chip('product', 'prod_42'); await env.send(); assert.equal(clock.size, 1)
  } finally { await env.close(); assert.equal(clock.size, 0); clock.restore() }
})

test('native-only send does not mutate or duplicate references', async () => {
  const env = await mount()
  try {
    const before = structuredClone(env.state)
    window.__omnimuxVideoToken = { url: 'https://foreign.example/video' }
    await env.send()
    assert.equal(env.sends, 1); assert.equal(env.arms.length, 1)
    assert.deepEqual(env.insertions, []); assert.deepEqual(env.wholeDrafts, [])
    assert.deepEqual(env.state, before)
    assert.equal(window.__omnimuxVideoToken.url, 'https://foreign.example/video')
  } finally { await env.close() }
})

test('marketing appends only directives, then waits for advanced matching metadata before consumption', async () => {
  const env = await mount({ marketing: true })
  try {
    const before = structuredClone(env.state)
    await env.send()
    assert.equal(env.sends, 0); assert.equal(env.arms.length, 0)
    assert.equal(env.insertions.length, 1); assert.deepEqual(env.wholeDrafts, [])
    const { text, span } = env.insertions[0]
    assert.deepEqual(span, { start: 4, end: 4, draftRev: 7 })
    assert.ok(text.includes('保留开场冲突')); assert.ok(!text.includes(URL_VIDEO))
    assert.equal(env.presets.getSnapshot(env.sessionId).hook, env.hook)
    assert.equal(env.status(), 'translated:attachments.submit.prepare.waiting')
    await env.publish({ ...before })
    await env.send()
    assert.equal(env.insertions.length, 1, 'receipt and stale publication do not authorize a second mutation')
    assert.equal(env.sends, 0)
    await env.publish({ ...before, draft: before.draft + text, draftRev: 8 })
    assert.deepEqual(env.state.occurrences, before.occurrences)
    assert.equal(env.presets.getSnapshot(env.sessionId).hook, null)
    await env.send()
    assert.equal(env.sends, 1); assert.equal(env.arms.length, 1)
    assert.equal(env.insertions.length, 1)
  } finally { await env.close() }
})

for (const receipt of [false, undefined, { accepted: true }]) {
  test(`non-true insertion receipt blocks and preserves chip/presets (${JSON.stringify(receipt)})`, async () => {
    const env = await mount({ receipt, marketing: true })
    try {
      const chip = env.chip('product', 'prod_42')
      const before = structuredClone(env.state)
      await env.send()
      assert.equal(env.sends, 0); assert.equal(env.arms.length, 0)
      assert.equal(chip.isConnected, true)
      assert.equal(env.presets.getSnapshot(env.sessionId).hook, env.hook)
      assert.deepEqual(env.state, before); assert.deepEqual(env.wholeDrafts, [])
      assert.equal(env.status(), 'translated:attachments.submit.prepare.unavailable')
    } finally { await env.close() }
  })
}

test('product library ID keeps its marker and chip is consumed only after publication', async () => {
  const env = await mount()
  try {
    const chip = env.chip('product', 'prod_42')
    const before = env.state
    await env.send()
    assert.equal(env.insertions[0].text, '\n\n[商品: prod_42]')
    assert.equal(chip.isConnected, true)
    assert.equal(env.sends, 0)
    await env.publish({ ...before, draft: before.draft + env.insertions[0].text, draftRev: 8 })
    assert.equal(chip.isConnected, false)
    await env.send()
    assert.equal(env.sends, 1); assert.equal(env.insertions.length, 1)
  } finally { await env.close() }
})

test('mismatched published metadata retains the unconfirmed chip and presets', async () => {
  const env = await mount({ marketing: true })
  try {
    const chip = env.chip('product', 'prod_42')
    await env.send()
    await env.publish({ ...env.state, draft: env.state.draft + env.insertions[0].text, draftRev: 8, occurrences: [] })
    assert.equal(chip.isConnected, true)
    assert.equal(env.presets.getSnapshot(env.sessionId).hook, env.hook)
    assert.equal(env.status(), 'translated:attachments.submit.prepare.changed')
    assert.equal(env.sends, 0)
  } finally { await env.close() }
})

test('pending session switch does not consume previous presets or block the new native draft', async () => {
  const env = await mount({ marketing: true })
  try {
    const previousId = env.sessionId
    await env.send()
    assert.equal(env.sends, 0)
    await env.switchSession(nativeInput())
    assert.equal(env.presets.getSnapshot(previousId).hook, env.hook)
    await env.send()
    assert.equal(env.sends, 1); assert.equal(env.arms.length, 1)
    assert.equal(env.arms[0][0], env.sessionId)
    assert.equal(env.insertions.length, 1)
  } finally { await env.close() }
})
