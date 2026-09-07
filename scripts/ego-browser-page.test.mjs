import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEgoPage } from './ego-browser-page.mjs'

function fixture() {
  const state = { ownership: 'agent', id: 'tab-1', events: [], calls: [], taskSpaceId: 77 }
  const helpers = {
    listTaskSpaces: async () => [{ id: state.taskSpaceId, ownership: state.ownership }],
    listTabs: async () => [{ targetId: state.id }], currentTab: async () => ({ targetId: state.id }),
    pageInfo: async () => ({ url: 'http://127.0.0.1:45120/' }),
    gotoAndWait: async (...args) => { state.calls.push(['goto', ...args]) },
    cdp: async (...args) => { state.calls.push(['cdp', ...args]); return { result: { value: true } } },
    drainEvents: async () => state.events.shift() || [],
    click: async (...args) => { state.calls.push(['click', ...args]) },
    waitForElement: async (...args) => { state.calls.push(['wait', ...args]) },
  }
  return { state, helpers, options: { taskSpaceId: 77, tabId: 'tab-1' } }
}

test('adapts documented ego helpers and preserves stable identity and timeout units', async () => {
  const { state, helpers, options } = fixture(); const page = await createEgoPage(helpers, options)
  assert.deepEqual(await page.assertIdentity(), options)
  assert.equal(await page.url(), 'http://127.0.0.1:45120/')
  await page.click('[data-entry]'); await page.waitForElement('[data-entry]', { timeout: 2 }); await page.goto('http://127.0.0.1:45120/')
  assert.deepEqual(state.calls, [['click', '[data-entry]'], ['wait', '[data-entry]', { timeout: 2 }], ['goto', 'http://127.0.0.1:45120/', { timeout: 10, settle: 0.2 }]])
})

test('drains cursor then captures all script events with a CDP ordering barrier', async () => {
  const { state, helpers, options } = fixture(); const page = await createEgoPage(helpers, options)
  state.events = [[{ method: 'Debugger.scriptParsed', params: { scriptId: 'old' } }], []]
  const cursor = await page.cdp.readEvents({ methods: ['Debugger.scriptParsed'] })
  assert.equal(cursor.events.length, 0)
  state.events = [[{ method: 'Debugger.scriptParsed', params: { scriptId: 'a' } }, { method: 'Network.event' }], [{ method: 'Debugger.scriptParsed', params: { scriptId: 'b' } }], []]
  const result = await page.cdp.readEvents({ afterSequence: cursor.cursor, methods: ['Debugger.scriptParsed'], limit: 1000 })
  assert.deepEqual(result.events.map(e => e.params.scriptId), ['a', 'b'])
  assert.equal(result.truncated, false); assert.equal(result.hasMore, false)
  assert.equal(state.calls.filter(c => c[1] === 'Runtime.evaluate').length, 2)
})

test('missing helpers, invalid ids, incomplete queues, and overflow fail closed', async () => {
  const a = fixture(); delete a.helpers.drainEvents
  await assert.rejects(createEgoPage(a.helpers, a.options), /Missing ego helper/)
  const b = fixture(); await assert.rejects(createEgoPage(b.helpers, { ...b.options, taskSpaceId: 0 }), /task space id/)
  for (const events of [[{ events: [], truncated: true }], [Array(1001).fill({ method: 'Debugger.scriptParsed' })]]) {
    const f = fixture(); const page = await createEgoPage(f.helpers, f.options); f.state.events = events
    await assert.rejects(page.cdp.readEvents(), /browser-transport/)
  }
})

test('task/tab change and user control loss latch a hard stop without issuing browser cleanup', async () => {
  for (const change of [s => { s.ownership = 'user' }, s => { s.id = 'other-tab' }, s => { s.taskSpaceId = 55 }]) {
    const { state, helpers, options } = fixture(); const page = await createEgoPage(helpers, options); change(state)
    await assert.rejects(page.click('[data-entry]'), /browser-control-lost|browser-transport/)
    await assert.rejects(page.cdp.send('Debugger.disable'))
    assert.equal(state.calls.length, 0)
  }
})

test('policy failures latch without echoing token URL or fallback commands', async () => {
  const f = fixture(); f.helpers.gotoAndWait = async () => { throw new Error('URL blocked by browser policy ?token=hidden') }
  const page = await createEgoPage(f.helpers, f.options)
  await assert.rejects(page.goto('http://127.0.0.1:45120/?token=hidden'), error => !error.message.includes('hidden') && error.message.includes('browser-policy'))
  await assert.rejects(page.click('button'))
  assert.equal(f.state.calls.length, 0)
})

test('a guard resolving after timeout cannot issue further browser commands', async () => {
  for (const helper of ['listTaskSpaces', 'listTabs']) {
    const f = fixture(); const page = await createEgoPage(f.helpers, f.options)
    let finish
    const original = f.helpers[helper]
    f.helpers[helper] = () => new Promise(resolve => { finish = async () => resolve(await original()) })
    const subsequent = []
    for (const name of helper === 'listTaskSpaces' ? ['listTabs', 'currentTab'] : ['currentTab']) {
      const next = f.helpers[name]
      f.helpers[name] = async () => { subsequent.push(name); return next() }
    }
    await assert.rejects(page.cdp.send('Runtime.evaluate', {}, { timeoutMs: 5 }), /browser-timeout/)
    await finish(); await new Promise(resolve => setImmediate(resolve))
    await assert.rejects(page.click('button'), /browser-timeout/)
    assert.deepEqual(subsequent, []); assert.deepEqual(f.state.calls, [])
  }
})
