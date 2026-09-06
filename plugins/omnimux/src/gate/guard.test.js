import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { parseGateConfig } from './config.js'
import {
  assertCapabilityEnabled,
  isGateActive,
  isMediaEnabled,
  isModelEnabled,
  isToolEnabled,
} from './guard.js'

describe('GateGuard logic', () => {
  it('isGateActive returns true by default and false only when explicitly false', () => {
    assert.equal(isGateActive(undefined), true)
    assert.equal(isGateActive({}), true)
    assert.equal(isGateActive({ enabled: true }), true)
    assert.equal(isGateActive({ enabled: false }), false)
  })

  it('isToolEnabled checks tool开关 and media linkage', () => {
    // Default open
    assert.equal(isToolEnabled(undefined, 'omnimux_social_data'), true)
    assert.equal(isToolEnabled({}, 'omnimux_social_data'), true)

    // Explicit false tool
    const gate1 = parseGateConfig({ tools: { omnimux_social_data: false } })
    assert.equal(isToolEnabled(gate1, 'omnimux_social_data'), false)
    assert.equal(isToolEnabled(gate1, 'omnimux_accounts_list'), true)

    // Media linkage with omnimux_<kind>_submit
    const gate2 = parseGateConfig({ media: { video: false } })
    assert.equal(isToolEnabled(gate2, 'omnimux_video_submit'), false)
    assert.equal(isToolEnabled(gate2, 'omnimux_image_submit'), true)

    // Tool false linkage with media
    const gate3 = parseGateConfig({ tools: { omnimux_image_submit: false } })
    assert.equal(isMediaEnabled(gate3, 'image'), false)
    assert.equal(isToolEnabled(gate3, 'omnimux_image_submit'), false)

    // Gate disabled shuts down all tools
    const gateClosed = parseGateConfig({ enabled: false })
    assert.equal(isToolEnabled(gateClosed, 'omnimux_social_data'), false)
    assert.equal(isToolEnabled(gateClosed, 'omnimux_video_submit'), false)
  })

  it('isMediaEnabled checks media开关 and tool linkage', () => {
    assert.equal(isMediaEnabled(undefined, 'video'), true)
    assert.equal(isMediaEnabled({}, 'image'), true)

    const gate1 = parseGateConfig({ media: { audio: false } })
    assert.equal(isMediaEnabled(gate1, 'audio'), false)
    assert.equal(isMediaEnabled(gate1, 'video'), true)

    const gate2 = parseGateConfig({ tools: { omnimux_audio_submit: false } })
    assert.equal(isMediaEnabled(gate2, 'audio'), false)
  })

  it('isModelEnabled checks gate.models.textComplete', () => {
    assert.equal(isModelEnabled(undefined, 'grok-4.6'), true)
    assert.equal(isModelEnabled({}, 'grok-4.6'), true)

    const gate = parseGateConfig({
      models: {
        textComplete: {
          'grok-4.6': false,
          'claude-opus-5': true,
        },
      },
    })
    assert.equal(isModelEnabled(gate, 'grok-4.6'), false)
    assert.equal(isModelEnabled(gate, 'claude-opus-5'), true)
    assert.equal(isModelEnabled(gate, 'gemini-3.7-flash'), true)

    const gateClosed = parseGateConfig({ enabled: false })
    assert.equal(isModelEnabled(gateClosed, 'gemini-3.7-flash'), false)
  })

  it('assertCapabilityEnabled passes when enabled and throws OmnimuxError when disabled', () => {
    const gate = parseGateConfig({
      tools: {
        omnimux_social_data: false,
      },
      media: {
        video: false,
      },
      models: {
        textComplete: {
          'grok-4.6': false,
        },
      },
    })

    // Enabled assertions
    assert.doesNotThrow(() => assertCapabilityEnabled(gate, 'omnimux_page_fetch', 'tool'))
    assert.doesNotThrow(() => assertCapabilityEnabled(gate, 'image', 'media'))
    assert.doesNotThrow(() => assertCapabilityEnabled(gate, 'gemini-3.7-flash', 'model'))

    // Disabled tool assertion
    assert.throws(
      () => assertCapabilityEnabled(gate, 'omnimux_social_data', 'tool'),
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        assert.equal(err.message, "Capability 'omnimux_social_data' is disabled by capability gate")
        return true
      },
    )

    // Disabled media assertion
    assert.throws(
      () => assertCapabilityEnabled(gate, 'video', 'media'),
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        assert.equal(err.message, "Media capability 'video' is disabled by capability gate")
        return true
      },
    )

    // Disabled model assertion
    assert.throws(
      () => assertCapabilityEnabled(gate, 'grok-4.6', 'model'),
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        assert.equal(err.message, "Model 'grok-4.6' on textComplete is disabled by capability gate")
        return true
      },
    )
  })

  it('MVP mode disables accounts, publish, and analytics tools by default', () => {
    const mvpGate = parseGateConfig({ mvp: true })

    // Excluded official tools are disabled
    assert.equal(isToolEnabled(mvpGate, 'omnimux_accounts_list'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_accounts_connect'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_accounts_disconnect'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_publish_create'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_publish_presign'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_analytics_daily_metrics'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_analytics_best_time'), false)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_analytics_posts'), false)

    // Other tools remain enabled
    assert.equal(isToolEnabled(mvpGate, 'omnimux_social_data'), true)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_inspiration_list'), true)
    assert.equal(isToolEnabled(mvpGate, 'omnimux_page_fetch'), true)

    // Explicit override in tools allows re-enabling
    const overrideGate = parseGateConfig({
      mvp: true,
      tools: {
        omnimux_accounts_list: true,
      },
    })
    assert.equal(isToolEnabled(overrideGate, 'omnimux_accounts_list'), true)
    assert.equal(isToolEnabled(overrideGate, 'omnimux_accounts_connect'), false)

    // assertCapabilityEnabled throws for excluded tools in MVP mode
    assert.throws(
      () => assertCapabilityEnabled(mvpGate, 'omnimux_publish_create', 'tool'),
      (err) => {
        assert.ok(err instanceof OmnimuxError)
        assert.equal(err.code, 'capability-disabled')
        assert.equal(err.message, "Capability 'omnimux_publish_create' is disabled by capability gate")
        return true
      },
    )
  })
})
