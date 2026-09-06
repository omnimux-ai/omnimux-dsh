import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

  it('production release disables Alpha tools before user gate overrides', async (t) => {
    const userOverride = parseGateConfig({
      tools: {
        omnimux_accounts_list: true,
        omnimux_publish_create: true,
        omnimux_analytics_daily_metrics: true,
      },
    })

    const fixture = mkdtempSync(join(tmpdir(), 'omnimux-production-guard-'))
    t.after(() => rmSync(fixture, { recursive: true, force: true }))
    const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
    mkdirSync(join(fixture, 'src/gate'), { recursive: true })
    mkdirSync(join(fixture, 'src/media'), { recursive: true })
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
    copyFileSync(join(sourceRoot, 'gate/guard.js'), join(fixture, 'src/gate/guard.js'))
    copyFileSync(join(sourceRoot, 'media/errors.js'), join(fixture, 'src/media/errors.js'))
    copyFileSync(join(sourceRoot, 'plugin-lifecycle.json'), join(fixture, 'src/plugin-lifecycle.json'))
    writeFileSync(join(fixture, 'src/release-channel.json'), '{"channel":"production"}\n')
    const productionGuard = await import(pathToFileURL(join(fixture, 'src/gate/guard.js')).href)

    for (const toolName of Object.keys(userOverride.tools)) {
      assert.equal(productionGuard.isToolEnabled(userOverride, toolName), false, toolName)
      assert.equal(isToolEnabled(userOverride, toolName), true, toolName)
    }
    assert.equal(productionGuard.isToolEnabled(userOverride, 'workflow_run'), true)
    assert.equal(productionGuard.isToolEnabled(userOverride, 'canvas_write_table_node'), true)
    assert.equal(productionGuard.isToolEnabled(userOverride, 'omnimux_social_data'), true)
    assert.throws(
      () => productionGuard.assertCapabilityEnabled(userOverride, 'omnimux_publish_create'),
      (err) => err.code === 'capability-disabled',
    )
  })
})
