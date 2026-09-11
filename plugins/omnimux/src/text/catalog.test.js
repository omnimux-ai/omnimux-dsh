import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGateConfig } from '../gate/config.js'
import { OmnimuxError } from '../media/errors.js'
import {
  CHAT_MODEL_IDS,
  DEFAULT_TEXT,
  enabledTextModels,
  parseTextConfig,
  resolveTextRoute,
} from './catalog.js'

describe('text whitelist', () => {
  it('defaults to the twelve chat-directory models, all enabled', () => {
    const parsed = parseTextConfig(undefined)
    assert.equal(parsed.defaultProvider, 'omnimux')
    assert.equal(parsed.defaultModel, 'gemini-3.8-flash')
    assert.equal(parsed.maxTokens, 4096)
    assert.deepEqual(parsed.models.map((row) => row.id), [...CHAT_MODEL_IDS])
    assert.equal(enabledTextModels(parsed).length, 12)
    assert.equal(parsed.models.find((row) => row.id === 'deepseek-v4-flash-vision-exp')?.role, 'classic')
    assert.equal(parsed.models.find((row) => row.id === 'grok-4.6')?.brand, 'xai')
    assert.equal(parsed.models.find((row) => row.id === 'gpt-5.5')?.brand, 'openai')
    assert.equal(parsed.models.find((row) => row.id === 'claude-opus-4-6')?.brand, 'anthropic')
    assert.equal(parsed.models.find((row) => row.id === 'gemini-3.1-pro-preview')?.brand, 'google')
  })

  it('rejects an id outside the chat directory', () => {
    assert.throws(
      () => parseTextConfig({ models: [{ id: 'claude-haiku-4-5' }] }),
      /not in the chat directory/,
    )
  })

  it('rejects a repeated id', () => {
    assert.throws(
      () => parseTextConfig({ models: [{ id: 'grok-4.6' }, { id: 'grok-4.6' }] }),
      /repeats id/,
    )
  })

  it('treats enabled false as absent at resolve', () => {
    const text = parseTextConfig({
      models: [
        { id: 'grok-4.6', enabled: false },
        { id: 'deepseek-v4-pro' },
      ],
    })
    assert.equal(enabledTextModels(text).map((row) => row.id).join(','), 'deepseek-v4-pro')
    assert.throws(
      () => resolveTextRoute({ model: 'grok-4.6' }, text),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
  })

  it('merges gate.models.textComplete with text.models[].enabled (AND logic)', () => {
    const text = parseTextConfig({
      models: [
        { id: 'grok-4.6', enabled: true },
        { id: 'claude-opus-5', enabled: false },
        { id: 'gemini-3.7-flash', enabled: true },
      ],
    })
    const gate = parseGateConfig({
      models: {
        textComplete: {
          'grok-4.6': false, // gate disabled
          'claude-opus-5': true, // row disabled, gate enabled => disabled
          'gemini-3.7-flash': true, // both enabled => enabled
        },
      },
    })
    const enabled = enabledTextModels(text, gate)
    assert.deepEqual(enabled.map((r) => r.id), ['gemini-3.7-flash'])

    // resolveTextRoute with gate
    assert.throws(
      () => resolveTextRoute({ model: 'grok-4.6' }, text, undefined, gate),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
    assert.throws(
      () => resolveTextRoute({ model: 'claude-opus-5' }, text, undefined, gate),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
    const route = resolveTextRoute({ model: 'gemini-3.7-flash' }, text, undefined, gate)
    assert.equal(route.modelId, 'gemini-3.7-flash')
  })

  it('defaults a named-less request to the configured model', () => {
    const route = resolveTextRoute({ prompt: 'hi' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.equal(route.providerId, 'omnimux')
    assert.ok(route.input.includes('image'))
  })

  it('defaults an image request to the configured model too', () => {
    const route = resolveTextRoute({ image: '/tmp/a.png' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.ok(route.input.includes('image'))
  })

  it('honors OMNIMUX_TEXT_DEFAULT_MODEL when that id is enabled', () => {
    const text = parseTextConfig({
      models: [{ id: 'grok-4.6' }, { id: 'deepseek-v4-pro' }],
    })
    const route = resolveTextRoute({ prompt: 'hi' }, text, { OMNIMUX_TEXT_DEFAULT_MODEL: 'grok-4.6' })
    assert.equal(route.modelId, 'grok-4.6')
  })

  it('rejects OMNIMUX_TEXT_DEFAULT_MODEL when the model is disabled', () => {
    const text = parseTextConfig({
      models: [{ id: 'grok-4.6', enabled: false }, { id: 'deepseek-v4-pro' }],
    })
    assert.throws(
      () => resolveTextRoute({ prompt: 'hi' }, text, { OMNIMUX_TEXT_DEFAULT_MODEL: 'grok-4.6' }),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
  })

  it('rejects an image on a text-only model', () => {
    assert.throws(
      () => resolveTextRoute({ model: 'deepseek-v4-pro', image: '/tmp/a.png' }, parseTextConfig(undefined)),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-invalid-request'
        && /does not accept image input/.test(error.message),
    )
  })

  it('defaults a video request to gemini and accepts video modality', () => {
    const route = resolveTextRoute({ video: '/tmp/a.mp4' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.ok(route.input.includes('video'))
  })

  it('rejects video on a vision-but-not-video model', () => {
    assert.throws(
      () => resolveTextRoute({ model: 'grok-4.6', video: '/tmp/a.mp4' }, parseTextConfig(undefined)),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-invalid-request'
        && /does not accept video input/.test(error.message),
    )
  })

  it('rejects image and video together at resolve', () => {
    assert.throws(
      () => resolveTextRoute({ image: '/tmp/a.png', video: '/tmp/a.mp4' }, parseTextConfig(undefined)),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-invalid-request'
        && /image or video/.test(error.message),
    )
  })

  it('pins an explicit enabled model', () => {
    const route = resolveTextRoute({ model: 'claude-opus-5' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'claude-opus-5')
    assert.deepEqual(route.input, ['text'])
  })

  it('keeps the default table frozen identity for omitted config', () => {
    assert.equal(DEFAULT_TEXT.models.length, 12)
    assert.equal(DEFAULT_TEXT.models.find((row) => row.id === 'grok-4.6')?.id, 'grok-4.6')
    assert.equal(DEFAULT_TEXT.defaultModel, 'gemini-3.8-flash')
  })

  it('resolves model@group and strategy in text route', () => {
    const route = resolveTextRoute({ model: 'claude-opus-4-6@claude-plus' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'claude-opus-4-6')
    assert.equal(route.group, 'claude-plus')
    assert.equal(route.candidates[0], 'claude-opus-4-6@claude-plus')

    const costRoute = resolveTextRoute({ model: 'claude-opus-4-6', strategy: 'cost_first' }, parseTextConfig(undefined))
    assert.equal(costRoute.strategy, 'cost_first')
    assert.equal(costRoute.candidates[0], 'claude-opus-4-6@standard')

    const stabRoute = resolveTextRoute({ model: 'claude-opus-4-6', strategy: 'stability_first' }, parseTextConfig(undefined))
    assert.equal(stabRoute.strategy, 'stability_first')
    assert.ok(stabRoute.candidates[0].includes('@claude-max-open'))
  })
})

