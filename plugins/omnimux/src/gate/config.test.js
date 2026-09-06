import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_GATE, parseGateConfig } from './config.js'

describe('parseGateConfig', () => {
  it('returns default gate when input is undefined or null', () => {
    const parsedUndefined = parseGateConfig(undefined)
    assert.equal(parsedUndefined.enabled, true)
    assert.deepEqual(parsedUndefined.tools, {})
    assert.deepEqual(parsedUndefined.media, { video: true, image: true, audio: true })
    assert.deepEqual(parsedUndefined.models, { textComplete: {} })
    assert.deepEqual(parsedUndefined.plugins, {})

    const parsedNull = parseGateConfig(null)
    assert.equal(parsedNull.enabled, true)
    assert.deepEqual(parsedNull.media, { video: true, image: true, audio: true })
  })

  it('rejects non-object values', () => {
    assert.throws(() => parseGateConfig('invalid'), /gate config must be an object/)
    assert.throws(() => parseGateConfig(123), /gate config must be an object/)
    assert.throws(() => parseGateConfig([]), /gate config must be an object/)
    assert.throws(() => parseGateConfig(true), /gate config must be an object/)
  })

  it('parses valid gate config with explicit fields', () => {
    const config = {
      enabled: false,
      tools: {
        omnimux_social_data: false,
        omnimux_page_fetch: true,
      },
      media: {
        video: false,
        image: true,
      },
      models: {
        textComplete: {
          'grok-4.6': false,
          'claude-opus-5': true,
        },
      },
      plugins: {
        workflow: { enabled: true },
      },
    }
    const parsed = parseGateConfig(config)
    assert.equal(parsed.enabled, false)
    assert.deepEqual(parsed.tools, {
      omnimux_social_data: false,
      omnimux_page_fetch: true,
    })
    assert.deepEqual(parsed.media, {
      video: false,
      image: true,
      audio: true,
    })
    assert.deepEqual(parsed.models, {
      textComplete: {
        'grok-4.6': false,
        'claude-opus-5': true,
      },
    })
    assert.deepEqual(parsed.plugins, {
      workflow: { enabled: true },
    })
  })

  it('rejects non-boolean enabled', () => {
    assert.throws(() => parseGateConfig({ enabled: 'false' }), /gate\.enabled must be a boolean/)
    assert.throws(() => parseGateConfig({ enabled: 0 }), /gate\.enabled must be a boolean/)
  })

  it('rejects non-object tools or non-boolean tool values', () => {
    assert.throws(() => parseGateConfig({ tools: 'bad' }), /gate\.tools must be an object/)
    assert.throws(() => parseGateConfig({ tools: { omnimux_video_submit: 'off' } }), /gate\.tools\.omnimux_video_submit must be a boolean/)
  })

  it('rejects non-object media, unknown media kind, or non-boolean media values', () => {
    assert.throws(() => parseGateConfig({ media: 'bad' }), /gate\.media must be an object/)
    assert.throws(() => parseGateConfig({ media: { unknown_kind: true } }), /gate\.media\.unknown_kind is not a recognized media kind/)
    assert.throws(() => parseGateConfig({ media: { video: 'false' } }), /gate\.media\.video must be a boolean/)
  })

  it('rejects non-object models, non-object textComplete, or non-boolean model values', () => {
    assert.throws(() => parseGateConfig({ models: 'bad' }), /gate\.models must be an object/)
    assert.throws(() => parseGateConfig({ models: { textComplete: 'bad' } }), /gate\.models\.textComplete must be an object/)
    assert.throws(() => parseGateConfig({ models: { textComplete: { 'grok-4.6': 0 } } }), /gate\.models\.textComplete\.grok-4.6 must be a boolean/)
  })

  it('rejects non-object plugins', () => {
    assert.throws(() => parseGateConfig({ plugins: 'bad' }), /gate\.plugins must be an object/)
  })
})
