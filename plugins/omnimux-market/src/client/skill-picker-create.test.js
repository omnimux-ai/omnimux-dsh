import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import * as SkillShelf from './skill-picker-logic.js'

const source = readFileSync(new URL('./skill-picker.js', import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of node.children || []) {
    const match = walk(child, predicate)
    if (match) return match
  }
  return null
}
function harness({ api, createSkillSession, document, onCreate = async () => ({ ok: true }), onClose = () => {} } = {}) {
  const writes = [], activations = []
  const slots = new Map()
  let owner, cursor
  function slot(init) {
    const index = cursor++
    const state = slots.get(owner)
    if (!(index in state)) state[index] = init()
    return [state, index]
  }
  function render(name, component, props) {
    owner = name
    cursor = 0
    if (!slots.has(name)) slots.set(name, [])
    return component(props)
  }
  const context = {
    h, SkillShelf, lookup: key => key, api, createSkillSession, I18nProvider: 'I18nProvider',
    skillCreationInputs: new Map(), currentPlazaSessionId: () => 'b', activateSharedToolSkill: value => activations.push(value),
    useState: initial => {
      const [state, index] = slot(() => typeof initial === 'function' ? initial() : initial)
      return [state[index], value => {
        state[index] = typeof value === 'function' ? value(state[index]) : value
        writes.push(state[index])
      }]
    },
    useRef: initial => { const [state, index] = slot(() => ({ current: initial })); return state[index] },
    useEffect: () => {}, useLayoutEffect: () => {},
    useCallback: fn => fn, SearchField: 'SearchField', setTimeout: (fn, ms) => { if (ms !== 8000) return setTimeout(fn, ms) }, clearTimeout,
    document, createPortal: node => node,
  }
  const { SkillPickerButton, SkillPickerPanel } = runInNewContext(source + '\n({SkillPickerButton,SkillPickerPanel})', context)
  const button = render('button', SkillPickerButton, { sessionId: 'a' })
  const panelProps = walk(button, node => node.type === SkillPickerPanel).props
  let panel
  const rerender = () => {
    panel = render('panel', SkillPickerPanel, { open: true, anchorRef: { current: null }, onCreate, onClose, t: key => key })
    return panel
  }
  rerender()
  return {
    writes, activations, rerender,
    get create() { return walk(panel, node => node.props.className === 'sh-picker-btn primary') },
    get notice() { return walk(panel, node => node.props.role === 'status') },
    invoke: panelProps.onCreate, close: panelProps.onClose,
  }
}

test('create delegates installation and attachment to the ready-session helper and only then activates', async () => {
  const run = harness({ api: async () => { throw Error('caller must not install') }, createSkillSession: async options => {
    assert.equal(options.requireReady, true)
    assert.equal(options.slug, 'skill-creator')
    assert.equal(options.isCancelled(), false)
    return { ok: true, prefilled: true, sessionId: 'b' }
  } })
  assert.equal((await run.invoke()).ok, true)
  assert.equal(run.activations.length, 1)
})

test('missing skill rejects without activating a fake selection', async () => {
  const run = harness({ createSkillSession: async () => { throw Error('missing') } })
  await assert.rejects(run.invoke(), /missing/)
  assert.equal(run.activations.length, 0)
})

test('incomplete prefill is not a successful creation', async () => {
  const run = harness({ createSkillSession: async () => ({ ok: true, prefilled: false }) })
  await assert.rejects(run.invoke(), /create-unavailable/)
  assert.equal(run.activations.length, 0)
})

test('failed creation keeps the panel and presents a retryable error; parallel clicks deduplicate across renders', async () => {
  let calls = 0, closes = 0, reject
  const pending = new Promise((_, no) => { reject = no })
  const run = harness({ onCreate: () => { calls++; return calls === 1 ? pending : Promise.resolve({ ok: true }) }, onClose: () => { closes++ } })
  const first = run.create.props.onClick()
  try {
    run.rerender()
    assert.equal(run.create.props.disabled, true)
    assert.equal(run.create.props['aria-busy'], true)
    await run.create.props.onClick()
    assert.equal(calls, 1)
  } finally {
    reject(Error('offline'))
    await first
  }
  run.rerender()
  assert.equal(closes, 0)
  assert.ok(run.notice.children.includes('picker.createFail'))
  assert.equal(run.create.props.disabled, false)
  assert.equal(run.create.props['aria-busy'], false)
  await run.create.props.onClick()
  run.rerender()
  assert.equal(calls, 2)
  assert.equal(closes, 1)
  assert.equal(run.notice, null)
})

test('failure after panel closure is announced outside the panel without activation', async () => {
  let reject, options
  const notices = []
  const document = {
    body: { appendChild: node => notices.push(node) }, getElementById: () => null,
    createElement: () => ({ setAttribute(name, value) { this[name] = value }, addEventListener() {}, remove() {} }),
  }
  const run = harness({ document, createSkillSession: value => { options = value; return new Promise((_, no) => { reject = no }) } })
  const pending = run.invoke()
  run.close()
  assert.equal(options.isCancelled(), true)
  reject(Error('offline'))
  await assert.rejects(pending, /offline/)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].role, 'alert')
  assert.equal(notices[0].textContent, 'picker.createFail')
  assert.equal(run.activations.length, 0)
})

test('cancelled creation neither closes a reopened panel nor reports success', async () => {
  let closes = 0
  const run = harness({ onCreate: async () => ({ ok: false, cancelled: true }), onClose: () => { closes++ } })
  await run.create.props.onClick()
  assert.equal(closes, 0)
  assert.equal(run.writes.includes('picker.createFail'), false)
  assert.equal(run.activations.length, 0)
  const button = harness({ createSkillSession: async () => ({ ok: false, cancelled: true }) })
  assert.equal((await button.invoke()).cancelled, true)
  assert.equal(button.activations.length, 0)
})

test('successful creation closes panel and keyboard activation does not bubble to list selection', async () => {
  let closes = 0, stopped = false
  const run = harness({ onClose: () => { closes++ } })
  run.create.props.onKeyDown({ stopPropagation: () => { stopped = true } })
  await run.create.props.onClick()
  assert.equal(stopped, true)
  assert.equal(closes, 1)
})
