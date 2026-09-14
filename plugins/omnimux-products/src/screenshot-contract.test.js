import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DESKTOP_VIEWPORT,
  HOST_SLUG_MAX,
  MEDIA_DIR_MODE,
  MEDIA_FILE_MODE,
  MOBILE_VIEWPORT,
  REQUIRED_ORDER,
  SCREENSHOT_BUDGET_MS,
  SCREENSHOT_REASON,
  SCREENSHOT_STATUS,
  SETTLE_MS,
  VIEWPORT_ORDER,
  VIEWPORTS,
  buildScreenshotName,
  hostSlug,
  isCapturedReport,
  outcomeOf,
  randomSuffix,
  reportOf,
  utcStampOf,
} from './screenshot-contract.js'

describe('website screenshots · viewport contract', () => {
  it('pins the two viewports to the numbers the spec measured', () => {
    assert.equal(DESKTOP_VIEWPORT.width, 1440)
    assert.equal(DESKTOP_VIEWPORT.height, 900)
    assert.equal(DESKTOP_VIEWPORT.deviceScaleFactor, 1)
    assert.equal(DESKTOP_VIEWPORT.isMobile, false)
    assert.equal(DESKTOP_VIEWPORT.hasTouch, false)

    assert.equal(MOBILE_VIEWPORT.width, 390)
    assert.equal(MOBILE_VIEWPORT.height, 844)
    assert.equal(MOBILE_VIEWPORT.deviceScaleFactor, 2)
    assert.equal(MOBILE_VIEWPORT.isMobile, true)
    assert.equal(MOBILE_VIEWPORT.hasTouch, true)
  })

  it('keeps the capture order desktop-first, and the alias pointing at the same array', () => {
    assert.deepEqual([...VIEWPORT_ORDER], ['desktop', 'mobile'])
    assert.deepEqual([...REQUIRED_ORDER], ['desktop', 'mobile'])
    assert.equal(REQUIRED_ORDER, VIEWPORT_ORDER)
    assert.equal(VIEWPORTS.desktop, DESKTOP_VIEWPORT)
    assert.equal(VIEWPORTS.mobile, MOBILE_VIEWPORT)
  })

  it('freezes what must not drift', () => {
    assert.ok(Object.isFrozen(DESKTOP_VIEWPORT))
    assert.ok(Object.isFrozen(MOBILE_VIEWPORT))
    assert.ok(Object.isFrozen(VIEWPORTS))
    assert.ok(Object.isFrozen(VIEWPORT_ORDER))
    assert.throws(() => {
      /** @type {Record<string, number>} */ (DESKTOP_VIEWPORT).width = 1
    }, TypeError)
  })

  it('carries the budget, the quiet window and the explicit file modes', () => {
    assert.equal(SCREENSHOT_BUDGET_MS, 25000)
    assert.equal(SETTLE_MS, 600)
    assert.equal(MEDIA_DIR_MODE, 0o700)
    assert.equal(MEDIA_FILE_MODE, 0o600)
  })

  it('enumerates exactly the documented status and reason codes', () => {
    assert.deepEqual(Object.values(SCREENSHOT_STATUS).sort(), ['captured', 'failed', 'skipped'])
    assert.deepEqual(Object.values(SCREENSHOT_REASON).sort(), [
      'budget-exceeded',
      'capture-failed',
      'launch-failed',
      'nav-failed',
      'nav-timeout',
      'no-browser',
      'not-digital',
      'unsafe-url',
    ])
  })
})

describe('website screenshots · file naming', () => {
  it('folds a host name into a bounded slug', () => {
    assert.equal(hostSlug('platform.example.com'), 'platform-example-com')
    assert.equal(hostSlug('EXAMPLE.com'), 'example-com')
    assert.equal(hostSlug('---a---b---'), 'a-b')
    assert.equal(hostSlug(''), 'site')
    assert.equal(hostSlug('中文.example.com'), 'example-com')
    assert.equal(hostSlug('a'.repeat(80)).length, HOST_SLUG_MAX)
  })

  it('stamps UTC at second resolution', () => {
    assert.equal(utcStampOf(new Date('2026-09-14T03:19:32.512Z')), '20260914T031932Z')
  })

  it('draws a four-character hex suffix from an injected roll', () => {
    assert.equal(randomSuffix(() => 0), '0000')
    assert.equal(randomSuffix(() => 0.5), '8000')
    assert.equal(randomSuffix(() => 0.03125), '0800')
    assert.match(randomSuffix(), /^[0-9a-f]{4}$/)
  })

  it('builds `site-<host>-<viewport>-<stamp>-<rand>.png`', () => {
    const name = buildScreenshotName('platform.example.com', 'desktop', '20260914T031932Z', '9f3a')
    assert.equal(name, 'site-platform-example-com-desktop-20260914T031932Z-9f3a.png')
  })

  it('never repeats a name for the same host and viewport', () => {
    const names = new Set()
    for (let i = 0; i < 50; i += 1) names.add(buildScreenshotName('example.com', 'desktop'))
    assert.equal(names.size, 50)
  })

  it('always ends in .png and carries the viewport in the name', () => {
    for (const kind of VIEWPORT_ORDER) {
      const name = buildScreenshotName('example.com', kind, '20260914T031932Z', 'ab12')
      assert.match(name, /\.png$/)
      assert.ok(name.includes(`-${kind}-`))
    }
  })
})

describe('website screenshots · per-viewport outcome', () => {
  it('records geometry and bytes on success, and drops the failure fields', () => {
    const ok = outcomeOf('desktop', true, { width: 1440, height: 900 }, 18485, null, Buffer.from('x'))
    assert.deepEqual(
      { kind: ok.kind, ok: ok.ok, width: ok.width, height: ok.height, bytes: ok.bytes, reason: ok.reason },
      { kind: 'desktop', ok: true, width: 1440, height: 900, bytes: 18485, reason: null },
    )
    assert.equal(ok.buffer.length, 1)
  })

  it('zeroes geometry and names a reason on failure, and keeps no buffer', () => {
    const bad = outcomeOf('mobile', false, { width: 390, height: 844 }, 999, SCREENSHOT_REASON.NAV_TIMEOUT)
    assert.deepEqual(
      { ok: bad.ok, width: bad.width, height: bad.height, bytes: bad.bytes, reason: bad.reason },
      { ok: false, width: 0, height: 0, bytes: 0, reason: 'nav-timeout' },
    )
    assert.equal(bad.buffer, null)
  })

  it('falls back to capture-failed when a failure arrives without a reason', () => {
    assert.equal(outcomeOf('desktop', false).reason, SCREENSHOT_REASON.CAPTURE_FAILED)
  })
})

describe('website screenshots · in-band report', () => {
  const ok = (kind) => outcomeOf(kind, true, { width: 1, height: 1 }, 10, null, Buffer.from('x'))
  const bad = (kind, reason) => outcomeOf(kind, false, {}, 0, reason)

  it('answers captured when both viewports landed', () => {
    const report = reportOf([ok('desktop'), ok('mobile')], null)
    assert.equal(report.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(report.reason, null)
    assert.equal(report.viewports.length, 2)
  })

  it('answers captured with the loser’s reason when only one viewport landed', () => {
    const report = reportOf([ok('desktop'), bad('mobile', SCREENSHOT_REASON.NAV_TIMEOUT)], null)
    assert.equal(report.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(report.reason, SCREENSHOT_REASON.NAV_TIMEOUT)
  })

  it('answers failed when both viewports lost', () => {
    const report = reportOf([bad('desktop', SCREENSHOT_REASON.NAV_FAILED), bad('mobile', SCREENSHOT_REASON.NAV_TIMEOUT)], null)
    assert.equal(report.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(report.reason, SCREENSHOT_REASON.NAV_FAILED)
  })

  it('answers skipped for the reasons that mean the chain never started', () => {
    for (const reason of [SCREENSHOT_REASON.NO_BROWSER, SCREENSHOT_REASON.NOT_DIGITAL, SCREENSHOT_REASON.UNSAFE_URL]) {
      const report = reportOf([], reason)
      assert.equal(report.status, SCREENSHOT_STATUS.SKIPPED, reason)
      assert.equal(report.reason, reason)
    }
  })

  it('answers failed for a reason that means the chain ran and lost', () => {
    const report = reportOf([], SCREENSHOT_REASON.BUDGET_EXCEEDED)
    assert.equal(report.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(report.reason, SCREENSHOT_REASON.BUDGET_EXCEEDED)
  })

  it('never leaks the PNG buffer onto the wire shape', () => {
    const report = reportOf([ok('desktop'), ok('mobile')], null)
    for (const row of report.viewports) {
      assert.equal('buffer' in row, false)
      assert.deepEqual(Object.keys(row).sort(), ['bytes', 'height', 'kind', 'ok', 'reason', 'width'])
    }
  })

  it('survives a null report and reports nothing captured', () => {
    assert.equal(isCapturedReport(null), false)
    assert.equal(isCapturedReport(reportOf([], null)), false)
    assert.equal(isCapturedReport(reportOf([ok('desktop')], null)), true)
  })
})
