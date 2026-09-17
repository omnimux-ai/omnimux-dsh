import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { captureSiteScreenshots, isSuspectedBlankFrame } from './site-shots.js'
import { SCREENSHOT_REASON, SCREENSHOT_STATUS } from './screenshot-contract.js'

const PAGE_URL = 'https://platform.example.com/'
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

const noSleep = () => Promise.resolve()

/**
 * A launch double whose `dispose` records that it ran, plus an attach double
 * that answers one page handle per viewport.
 *
 * @param {{ delayMs?: number, failOn?: string[], hangOn?: string[], port?: number }} [over]
 */
function harness(over = {}) {
  const state = { launched: [], disposed: 0, attached: [], captured: [], closed: 0 }
  const failOn = new Set(over.failOn ?? [])
  const hangOn = new Set(over.hangOn ?? [])
  const delayMs = over.delayMs ?? 0

  const launch = async (binPath) => {
    state.launched.push(binPath)
    return {
      child: null,
      port: over.port ?? 9222,
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      userDataDir: '/tmp/omnimux-shots-double',
      async dispose() {
        state.disposed += 1
      },
    }
  }

  const attach = async (_handle, viewport) => {
    state.attached.push(viewport.kind)
    return {
      async navigate() {
        if (hangOn.has(viewport.kind)) return new Promise(() => {})
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (failOn.has(viewport.kind)) {
          const error = new Error('navigation timed out')
          error.reason = SCREENSHOT_REASON.NAV_TIMEOUT
          throw error
        }
      },
      async capture() {
        state.captured.push(viewport.kind)
        return PNG
      },
      async close() {
        state.closed += 1
      },
    }
  }

  return { state, launch, attach }
}

describe('site shots · degraded paths that never reach a browser', () => {
  it('skips a physical listing without probing for a browser', async () => {
    let probed = 0
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'physical',
      locate: () => {
        probed += 1
        return '/bin/chrome'
      },
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.SKIPPED)
    assert.equal(result.report.reason, SCREENSHOT_REASON.NOT_DIGITAL)
    assert.deepEqual(result.outcomes, [])
    assert.equal(probed, 0)
  })

  it('refuses a private host with unsafe-url and opens nothing', async () => {
    const { state, launch, attach } = harness()
    for (const url of ['http://127.0.0.1:8080/', 'https://10.0.0.5/', 'https://169.254.1.1/']) {
      const result = await captureSiteScreenshots({
        url,
        kind: 'digital',
        locate: () => '/bin/chrome',
        launch,
        attach,
        sleep: noSleep,
      })
      assert.equal(result.report.status, SCREENSHOT_STATUS.SKIPPED, url)
      assert.equal(result.report.reason, SCREENSHOT_REASON.UNSAFE_URL, url)
    }
    assert.deepEqual(state.launched, [])
    assert.deepEqual(state.attached, [])
  })

  it('refuses a non-http scheme with unsafe-url', async () => {
    const result = await captureSiteScreenshots({
      url: 'file:///etc/passwd',
      kind: 'digital',
      locate: () => '/bin/chrome',
    })
    assert.equal(result.report.reason, SCREENSHOT_REASON.UNSAFE_URL)
  })

  it('answers no-browser without spawning anything when the host has none', async () => {
    let spawnAttempts = 0
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => null,
      launch: async () => {
        spawnAttempts += 1
        return null
      },
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.SKIPPED)
    assert.equal(result.report.reason, SCREENSHOT_REASON.NO_BROWSER)
    assert.deepEqual(result.outcomes, [])
    assert.equal(spawnAttempts, 0)
  })

  it('answers launch-failed when the browser refuses to start, and still cleans up', async () => {
    const { state } = harness()
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch: async () => {
        const error = new Error('the browser never reported a debugging port')
        error.reason = SCREENSHOT_REASON.LAUNCH_FAILED
        throw error
      },
      sleep: noSleep,
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(result.report.reason, SCREENSHOT_REASON.LAUNCH_FAILED)
    assert.equal(state.disposed, 0)
  })
})

describe('site shots · capture', () => {
  it('captures both viewports and reports their geometry and byte counts', async () => {
    const { state, launch, attach } = harness()
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
    })

    assert.equal(result.report.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(result.report.reason, null)
    assert.deepEqual(result.outcomes.map((row) => row.kind), ['desktop', 'mobile'])
    assert.equal(result.outcomes[0].width, 1440)
    assert.equal(result.outcomes[0].height, 900)
    assert.equal(result.outcomes[1].width, 390)
    assert.equal(result.outcomes[1].height, 844)
    assert.equal(result.outcomes[0].bytes, PNG.length)
    assert.ok(Buffer.isBuffer(result.outcomes[0].buffer))
    assert.equal(state.disposed, 1)
    assert.equal(state.closed, 2)
  })

  it('runs the two viewports concurrently rather than one after the other', async () => {
    const { launch, attach } = harness({ delayMs: 400 })
    const startedAt = Date.now()
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
    })
    const elapsed = Date.now() - startedAt
    assert.equal(result.report.status, SCREENSHOT_STATUS.CAPTURED)
    // Serial would be >= 800ms; the contract only allows the slower viewport.
    assert.ok(elapsed < 700, `expected overlap, took ${elapsed}ms`)
  })

  it('degrades to the one viewport that landed, and names the loser', async () => {
    const { launch, attach } = harness({ failOn: ['mobile'] })
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(result.report.reason, SCREENSHOT_REASON.NAV_TIMEOUT)
    const landed = result.outcomes.filter((row) => row.ok)
    assert.equal(landed.length, 1)
    assert.equal(landed[0].kind, 'desktop')
  })

  it('answers failed, not a throw, when both viewports lose', async () => {
    const { launch, attach } = harness({ failOn: ['desktop', 'mobile'] })
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(result.report.viewports.length, 2)
    assert.ok(result.outcomes.every((row) => row.ok === false))
  })

  it('falls back to capture-failed for an untagged throw', async () => {
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch: async () => ({
        webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/x',
        async dispose() {},
      }),
      attach: async () => {
        throw new Error('socket exploded')
      },
      sleep: noSleep,
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.FAILED)
    assert.ok(result.outcomes.every((row) => row.reason === SCREENSHOT_REASON.NAV_FAILED))
  })

  it('kills the browser when a hung chain outlives its budget', async () => {
    const { state, launch, attach } = harness({ hangOn: ['desktop', 'mobile'] })
    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
      budgetMs: 150,
    })
    assert.equal(result.report.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(result.report.reason, SCREENSHOT_REASON.BUDGET_EXCEEDED)
    assert.deepEqual(result.outcomes, [])
    assert.equal(state.disposed, 1, 'the hung browser must be disposed on the budget path')
  })

  it('never rejects, whatever the injected seams do', async () => {
    await assert.doesNotReject(() => captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch: async () => {
        throw new Error('boom')
      },
      sleep: noSleep,
    }))
    await assert.doesNotReject(() => captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => {
        throw new Error('locator exploded')
      },
      sleep: noSleep,
    }).then((result) => {
      assert.equal(result.report.status, SCREENSHOT_STATUS.FAILED)
    }))
  })

  it('normalizes bare hostnames into https URL before navigation', async () => {
    let navigatedUrl = null
    const launch = async () => ({
      child: null,
      port: 9222,
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      userDataDir: '/tmp/omnimux-shots-double',
      async dispose() {},
    })
    const attach = async (_handle, _viewport) => ({
      async navigate(url) {
        navigatedUrl = url
      },
      async capture() {
        return PNG
      },
      async close() {},
    })

    const result = await captureSiteScreenshots({
      url: 'www.omnimux.ai',
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: noSleep,
    })

    assert.equal(result.report.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(navigatedUrl, 'https://www.omnimux.ai')
  })

  it('retries capture when initial frame is a suspected blank frame', async () => {
    // 构造一个合法的 1440x900 PNG 头部，总体积小于 15KB，模拟全黑帧
    const blankPng = Buffer.alloc(200)
    blankPng[0] = 0x89
    blankPng[1] = 0x50
    blankPng[2] = 0x4e
    blankPng[3] = 0x47
    blankPng.writeUInt32BE(1440, 16)
    blankPng.writeUInt32BE(900, 20)

    const renderedPng = Buffer.alloc(30000)
    renderedPng[0] = 0x89
    renderedPng[1] = 0x50
    renderedPng[2] = 0x4e
    renderedPng[3] = 0x47
    renderedPng.writeUInt32BE(1440, 16)
    renderedPng.writeUInt32BE(900, 20)

    let captureCount = 0
    let sleptMs = 0
    const launch = async () => ({
      child: null,
      port: 9222,
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      userDataDir: '/tmp/omnimux-shots-double',
      async dispose() {},
    })
    const attach = async (_handle, _viewport) => ({
      async navigate() {},
      async capture() {
        captureCount += 1
        return captureCount === 1 ? blankPng : renderedPng
      },
      async close() {},
    })

    const result = await captureSiteScreenshots({
      url: PAGE_URL,
      kind: 'digital',
      locate: () => '/bin/chrome',
      launch,
      attach,
      sleep: async (ms) => {
        sleptMs += ms
      },
      settleMs: 100,
      retrySettleMs: 200,
    })

    assert.equal(result.report.status, SCREENSHOT_STATUS.CAPTURED)
    // 触发了二次补拍，且采纳了更大的有效帧
    assert.ok(captureCount > 1)
    assert.equal(result.outcomes[0].bytes, renderedPng.length)
    assert.ok(sleptMs >= 300)
  })
})

describe('isSuspectedBlankFrame', () => {
  it('identifies blank small-size large-resolution PNGs correctly', () => {
    // 正常渲染帧：大尺寸且体积大
    const fullPng = Buffer.alloc(40000)
    fullPng[0] = 0x89
    fullPng[1] = 0x50
    fullPng[2] = 0x4e
    fullPng[3] = 0x47
    fullPng.writeUInt32BE(1440, 16)
    fullPng.writeUInt32BE(900, 20)
    assert.equal(isSuspectedBlankFrame(fullPng), false)

    // 纯黑未就绪帧：1440x900 但体积仅 5KB
    const blackPng = Buffer.alloc(5853)
    blackPng[0] = 0x89
    blackPng[1] = 0x50
    blackPng[2] = 0x4e
    blackPng[3] = 0x47
    blackPng.writeUInt32BE(1440, 16)
    blackPng.writeUInt32BE(900, 20)
    assert.equal(isSuspectedBlankFrame(blackPng), true)

    // 单测微小桩（< 24 字节）不误判
    assert.equal(isSuspectedBlankFrame(PNG), false)
    assert.equal(isSuspectedBlankFrame(Buffer.alloc(0)), false)
    assert.equal(isSuspectedBlankFrame(null), false)
  })
})
