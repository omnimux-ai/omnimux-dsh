import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createImportPoller, decidePollOutcome } from './import-poller.js'
import { IMPORT_POLL_INTERVAL_MS } from './import-status.js'

/**
 * Gate for the background-import completion poll.
 *
 * Every dependency is injected — clock, fetch, document — so the whole state
 * machine is driven from a fake timer instead of a browser. The failure this
 * suite exists to prevent is a poll that stops too early (the row silently stays
 * "resolving" forever) or one that stops too late (it hammers a dead id).
 */

/** Deterministic clock: `setTimeout` is recorded and fired by hand. */
function fakeClock() {
  let nextId = 1
  const scheduled = new Map()
  return {
    setTimeout(fn) {
      const id = nextId
      nextId += 1
      scheduled.set(id, fn)
      return id
    },
    clearTimeout(handle) {
      scheduled.delete(handle)
    },
    /** Run every currently scheduled callback once. */
    async flush() {
      const due = [...scheduled.entries()]
      scheduled.clear()
      for (const [, fn] of due) await fn()
    },
    /** Fire one tick and let its async work settle. */
    async tick() {
      await this.flush()
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))
    },
    pending() {
      return scheduled.size
    },
  }
}

function makeDoc(hidden = false) {
  const listeners = new Map()
  return {
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener(type, fn) {
      listeners.set(type, fn)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
    hide() {
      this.visibilityState = 'hidden'
      listeners.get('visibilitychange')?.()
    },
    show() {
      this.visibilityState = 'visible'
      listeners.get('visibilitychange')?.()
    },
    listenerCount() {
      return listeners.size
    },
  }
}

function makeHarness(options = {}) {
  const clock = fakeClock()
  const doc = makeDoc()
  const calls = []
  const seen = []
  const removed = []
  const failed = []
  const degraded = []
  const settled = []
  /** @type {Map<string, () => any>} */
  const answers = new Map()
  const poller = createImportPoller({
    intervalMs: IMPORT_POLL_INTERVAL_MS,
    deps: {
      setTimeout: (fn) => clock.setTimeout(fn),
      clearTimeout: (handle) => clock.clearTimeout(handle),
      getDocument: () => doc,
      fetchItem: async (id) => {
        calls.push(id)
        const answer = answers.get(id)
        return typeof answer === 'function' ? answer() : answer
      },
      onItem: (item) => seen.push(item),
      onRemove: (id) => removed.push(id),
      onFailed: (item, id) => failed.push({ id, item }),
      onDegraded: (item) => degraded.push(item),
      onSettled: (item) => settled.push(item),
    },
  })
  void options
  return { poller, clock, doc, calls, seen, removed, failed, degraded, settled, answers }
}

function rowFor(id, status, extra = {}) {
  return { id, import_status: status, ...extra }
}

describe('decidePollOutcome — one answer, one verdict', () => {
  it('reads a running row as pending and keeps it watched', () => {
    const outcome = decidePollOutcome({ ok: true, status: 200, body: { data: rowFor('a', 'importing') } }, null)
    assert.equal(outcome.action, 'pending')
    assert.equal(outcome.item.id, 'a')
  })

  it('reads a settled row as settled', () => {
    for (const status of ['ready', 'degraded']) {
      const outcome = decidePollOutcome({ ok: true, status: 200, body: { data: rowFor('a', status) } }, null)
      assert.equal(outcome.action, 'settled', `${status} must settle the poll`)
    }
  })

  it('reads a failed row as failed', () => {
    const outcome = decidePollOutcome({ ok: true, status: 200, body: { data: rowFor('a', 'failed') } }, null)
    assert.equal(outcome.action, 'failed')
  })

  it('reads a deleted row as gone', () => {
    assert.equal(decidePollOutcome({ ok: false, status: 404, body: { error: 'not found' } }, null).action, 'gone')
  })

  it('keeps watching through a transient failure', () => {
    // A 500 or a network blip is not a verdict: dropping the row there would
    // abandon an import that is most likely still running.
    assert.equal(decidePollOutcome({ ok: false, status: 500, body: {} }, null).action, 'keep')
    assert.equal(decidePollOutcome(null, null).action, 'keep')
    assert.equal(decidePollOutcome({ ok: true, status: 200, body: {} }, null).action, 'keep')
  })
})

describe('createImportPoller — completion poll', () => {
  it('polls at the fixed interval and stops once the row settles', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'importing', { import_stage: 'downloading' }) } }))

    harness.poller.start()
    harness.poller.track(['a'])
    assert.equal(harness.clock.pending(), 1, 'tracking a row must arm one timer')

    await harness.clock.tick()
    assert.deepEqual(harness.calls, ['a'])
    assert.equal(harness.seen.length, 1, 'a running row is handed to the list so its stage updates')

    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'ready', { media_urls: ['/omnimux/inspiration/local/media/videos/v.mp4'] }) } }))
    await harness.clock.tick()

    assert.equal(harness.clock.pending(), 0, 'a settled row must stop the poll')
    assert.equal(harness.seen.at(-1).import_status, 'ready')
    assert.deepEqual(harness.failed, [])
  })

  it('never overlaps requests when a response is slower than the interval', async () => {
    const harness = makeHarness()
    let resolveSlow
    const slow = new Promise((resolve) => { resolveSlow = resolve })
    harness.answers.set('a', async () => {
      await slow
      return { ok: true, status: 200, body: { data: rowFor('a', 'importing') } }
    })

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()
    // The interval elapsed while the first request was still open.
    await harness.clock.tick()
    assert.equal(harness.calls.length, 1, 'a slow response must not queue a second request')

    resolveSlow()
    await new Promise((resolve) => setImmediate(resolve))
    await harness.clock.tick()
    assert.equal(harness.calls.length, 2)
  })

  it('stops and removes the row when the server answers 404', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: false, status: 404, body: { error: 'not found' } }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()

    assert.deepEqual(harness.removed, ['a'], 'a deleted row must leave the grid')
    assert.equal(harness.clock.pending(), 0)
    assert.deepEqual(harness.poller.watchedIds(), [])
  })

  it('reports a failure once and stops watching the row', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'failed', { import_error: '导入中断或超时，请重试' }) } }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()
    await harness.clock.tick()

    assert.equal(harness.failed.length, 1)
    assert.equal(harness.failed[0].item.import_error, '导入中断或超时，请重试')
    assert.equal(harness.clock.pending(), 0)
  })

  it('reports a degraded completion as it settles', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'degraded') } }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()

    assert.equal(harness.degraded.length, 1)
    assert.equal(harness.seen.at(-1).import_status, 'degraded')
  })

  it('surfaces a completed import whose AI breakdown failed', async () => {
    // The row settles as `ready` — the video is in the library — and only carries
    // an `import_error`. Without `onSettled` the user would never learn that the
    // breakdown they asked for is missing, because the row is not `failed`.
    const harness = makeHarness()
    harness.answers.set('a', () => ({
      ok: true,
      status: 200,
      body: {
        data: rowFor('a', 'ready', {
          media_urls: ['/omnimux/inspiration/local/media/videos/v.mp4'],
          import_error: 'AI 视频拆解失败',
        }),
      },
    }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()

    assert.equal(harness.settled.length, 1, 'a settled row with a reason must be reported')
    assert.equal(harness.settled[0].import_error, 'AI 视频拆解失败')
    assert.equal(harness.failed.length, 0, 'it is not an import failure')
    assert.equal(harness.seen.at(-1).import_status, 'ready')
  })

  it('stays silent for a clean completion', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'ready') } }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()

    assert.deepEqual(harness.settled, [])
    assert.deepEqual(harness.degraded, [])
  })

  it('keeps polling after a transient failure', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: false, status: 500, body: {} }))

    harness.poller.start()
    harness.poller.track(['a'])
    await harness.clock.tick()

    assert.equal(harness.calls.length, 1)
    assert.equal(harness.clock.pending(), 1, 'a 500 must not stop the poll')
    assert.deepEqual(harness.poller.watchedIds(), ['a'])
  })

  it('polls every watched row in one tick', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'importing') } }))
    harness.answers.set('b', () => ({ ok: true, status: 200, body: { data: rowFor('b', 'importing') } }))

    harness.poller.start()
    harness.poller.track(['a', 'b'])
    await harness.clock.tick()

    assert.deepEqual(harness.calls, ['a', 'b'])
  })

  it('has no client-side deadline: a long-running import stays watched', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'importing', { import_stage: 'analyzing' }) } }))

    harness.poller.start()
    harness.poller.track(['a'])
    for (let round = 0; round < 200; round += 1) {
      await harness.clock.tick()
    }

    // 200 rounds is far past any plausible client timeout; the server's stale
    // sweep is the only thing allowed to declare this import dead.
    assert.deepEqual(harness.poller.watchedIds(), ['a'])
    assert.equal(harness.clock.pending(), 1)
  })

  it('resumes watching a row the page never saw start', () => {
    const harness = makeHarness()
    harness.poller.start()
    // What a reload looks like: the rows come from a feed load, not from the 202.
    harness.poller.sync([
      { id: 'a', import_status: 'importing' },
      { id: 'b', import_status: 'ready' },
      { id: 'c' },
    ])
    assert.deepEqual(harness.poller.watchedIds(), ['a'])
    assert.equal(harness.clock.pending(), 1)
  })

  it('drops rows that settled while the page was away', () => {
    const harness = makeHarness()
    harness.poller.start()
    harness.poller.track(['a', 'b'])
    harness.poller.sync([{ id: 'a', import_status: 'importing' }])
    assert.deepEqual(harness.poller.watchedIds(), ['a'])
  })

  it('pauses while the tab is hidden and polls at once when it returns', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'importing') } }))

    harness.poller.start()
    harness.poller.track(['a'])
    assert.equal(harness.clock.pending(), 1)

    harness.doc.hide()
    assert.equal(harness.clock.pending(), 0, 'a hidden tab must stop polling')

    harness.doc.show()
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(harness.calls.length, 1, 'returning to the foreground polls immediately')
    assert.equal(harness.clock.pending(), 1)
  })

  it('stops scheduling once disposed and detaches its listener', async () => {
    const harness = makeHarness()
    harness.answers.set('a', () => ({ ok: true, status: 200, body: { data: rowFor('a', 'importing') } }))

    harness.poller.start()
    harness.poller.track(['a'])
    assert.equal(harness.doc.listenerCount(), 1)

    harness.poller.dispose()
    assert.equal(harness.clock.pending(), 0)
    assert.equal(harness.doc.listenerCount(), 0)

    const before = harness.calls.length
    await harness.clock.tick()
    assert.equal(harness.calls.length, before, 'a disposed poller must not fetch')
  })
})
