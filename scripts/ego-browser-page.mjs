import assert from 'node:assert/strict'
import { boundedRead, browserFailure } from './live-browser-utils.mjs'

const MAX_EVENTS = 1000

/** Adapt the documented ego helpers supplied by an ego-browser nodejs heredoc. */
export async function createEgoPage(helpers, { taskSpaceId, tabId } = {}) {
  for (const name of ['currentTab', 'listTabs', 'listTaskSpaces', 'pageInfo', 'gotoAndWait', 'cdp', 'drainEvents', 'click', 'waitForElement']) {
    assert.equal(typeof helpers?.[name], 'function', `Missing ego helper: ${name}`)
  }
  assert.ok(Number.isSafeInteger(taskSpaceId) && taskSpaceId > 0, 'Missing stable ego task space id')
  assert.ok(typeof tabId === 'string' && tabId, 'Missing stable ego tab id')
  let stopped
  const guard = async () => {
    if (stopped) throw stopped
    const tasks = await helpers.listTaskSpaces()
    if (stopped) throw stopped
    const task = tasks.find(item => item.id === taskSpaceId)
    assert.ok(task?.ownership === 'agent', 'ego task ownership/control lost; explicit user confirmation is required')
    const tabs = await helpers.listTabs()
    if (stopped) throw stopped
    assert.ok(tabs.some(item => item.targetId === tabId), 'ego tab left its task space')
    assert.equal((await helpers.currentTab())?.targetId, tabId, 'ego selected tab identity changed')
  }
  const operation = async (run, timeoutMs = 12_000) => {
    try {
      return await boundedRead(async () => { await guard(); if (stopped) throw stopped; return run() }, timeoutMs)
    } catch (error) {
      // Once ownership, policy, or transport fails, cleanup must not issue new browser commands.
      const [kind, detail] = browserFailure(error)
      stopped = new Error(`${kind}: ${detail}`)
      throw stopped
    }
  }
  let sequence = 0
  const drain = async () => {
    const events = []
    for (let batch = 0; batch < 20; batch++) {
      if (stopped) throw stopped
      const next = await helpers.drainEvents()
      if (stopped) throw stopped
      assert.ok(Array.isArray(next), 'ego CDP event queue is incomplete')
      assert.ok(next.length + events.length <= MAX_EVENTS, 'ego CDP event queue exceeds capture limit')
      events.push(...next)
      if (!next.length) return events
    }
    throw new Error('ego CDP event queue did not drain completely')
  }
  const send = (method, params, { timeoutMs = 12_000 } = {}) => operation(() => helpers.cdp(method, params), timeoutMs)
  const readEvents = ({ afterSequence, methods, limit = MAX_EVENTS } = {}) => operation(async () => {
    if (afterSequence !== undefined) assert.equal(afterSequence, sequence, 'ego CDP event cursor changed')
    // CDP command response orders all previously emitted scriptParsed messages before the drain.
    await helpers.cdp('Runtime.evaluate', { expression: 'void 0', returnByValue: true })
    const events = (await drain()).filter(event => !methods || methods.includes(event.method))
    assert.ok(events.length <= limit, 'ego CDP event capture is incomplete')
    sequence += 1
    return { cursor: sequence, events: afterSequence === undefined ? [] : events, truncated: false, hasMore: false }
  })
  const page = {
    tool: 'ego-browser', id: tabId, taskSpaceId,
    cdp: { send, readEvents },
    assertIdentity: () => operation(async () => ({ taskSpaceId, tabId })),
    url: () => operation(async () => (await helpers.pageInfo()).url),
    goto: url => operation(async () => { await helpers.gotoAndWait(url, { timeout: 10, settle: 0.2 }) }),
    click: selector => operation(() => helpers.click(selector)),
    waitForElement: (selector, { timeout = 12 } = {}) => operation(() => helpers.waitForElement(selector, { timeout }), (timeout + 1) * 1000),
  }
  await page.assertIdentity()
  return page
}
