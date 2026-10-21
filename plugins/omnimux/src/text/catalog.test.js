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
  it('defaults to the single listed chat-directory model, all enabled', () => {
    const parsed = parseTextConfig(undefined)
    assert.equal(parsed.defaultProvider, 'omnimux')
    assert.equal(parsed.defaultModel, 'gemini-3.8-flash')
    assert.equal(parsed.maxTokens, 4096)
    // 2026-10-21 #3527：路由声明只保留网关现役文本型号；契约与证据仍留在目录/处置表。
    assert.deepEqual(Array.from(CHAT_MODEL_IDS), ['gemini-3.8-flash'])
    assert.deepEqual(parsed.models.map((row) => row.id), Array.from(CHAT_MODEL_IDS))
    assert.equal(enabledTextModels(parsed).length, 1)
    assert.equal(parsed.models[0].brand, 'google')
    assert.equal(parsed.models[0].role, 'flagship')
  })

  it('rejects an id outside the chat directory', () => {
    assert.throws(
      () => parseTextConfig({ models: [{ id: 'claude-haiku-4-5' }] }),
      /not in the chat directory/,
    )
  })

  it('rejects a repeated id', () => {
    assert.throws(
      () => parseTextConfig({ models: [{ id: 'gemini-3.8-flash' }, { id: 'gemini-3.8-flash' }] }),
      /repeats id/,
    )
  })

  it('treats enabled false as absent at resolve', () => {
    const text = parseTextConfig({
      models: [{ id: 'gemini-3.8-flash', enabled: false }],
    })
    assert.deepEqual(enabledTextModels(text).map((row) => row.id), [])
    assert.throws(
      () => resolveTextRoute({ model: 'gemini-3.8-flash' }, text),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
  })

  it('merges gate.models.textComplete with text.models[].enabled (AND logic)', () => {
    const text = parseTextConfig({ models: [{ id: 'gemini-3.8-flash', enabled: true }] })
    const disabledByGate = parseGateConfig({
      models: { textComplete: { 'gemini-3.8-flash': false } }, // gate disabled
    })
    assert.deepEqual(enabledTextModels(text, disabledByGate).map((r) => r.id), [])
    assert.throws(
      () => resolveTextRoute({ model: 'gemini-3.8-flash' }, text, undefined, disabledByGate),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )

    // row disabled + gate enabled 仍为 disabled（AND 语义）
    const rowDisabled = parseTextConfig({ models: [{ id: 'gemini-3.8-flash', enabled: false }] })
    const gateEnabled = parseGateConfig({ models: { textComplete: { 'gemini-3.8-flash': true } } })
    assert.deepEqual(enabledTextModels(rowDisabled, gateEnabled).map((r) => r.id), [])

    // both enabled => enabled
    const gate = parseGateConfig({ models: { textComplete: { 'gemini-3.8-flash': true } } })
    assert.deepEqual(enabledTextModels(text, gate).map((r) => r.id), ['gemini-3.8-flash'])
    const route = resolveTextRoute({ model: 'gemini-3.8-flash' }, text, undefined, gate)
    assert.equal(route.modelId, 'gemini-3.8-flash')
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
    const text = parseTextConfig({ models: [{ id: 'gemini-3.8-flash' }] })
    const route = resolveTextRoute({ prompt: 'hi' }, text, { OMNIMUX_TEXT_DEFAULT_MODEL: 'gemini-3.8-flash' })
    assert.equal(route.modelId, 'gemini-3.8-flash')
  })

  it('rejects OMNIMUX_TEXT_DEFAULT_MODEL when the model is disabled', () => {
    const text = parseTextConfig({ models: [{ id: 'gemini-3.8-flash', enabled: false }] })
    assert.throws(
      () => resolveTextRoute({ prompt: 'hi' }, text, { OMNIMUX_TEXT_DEFAULT_MODEL: 'gemini-3.8-flash' }),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
  })

  it('rejects an image request on a text model that is not on the listed whitelist', () => {
    // 2026-10-21 #3527：chat 目录只剩多模态 gemini；旧的「纯文本模型拒绝 image」样本
    // （deepseek-v4-pro 等）已不在路由声明里，改为断言它们在任何模态校验之前就被拒绝。
    assert.throws(
      () => resolveTextRoute({ model: 'deepseek-v4-pro', image: '/tmp/a.png' }, parseTextConfig(undefined)),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
    )
    const listed = resolveTextRoute({ image: '/tmp/a.png' }, parseTextConfig(undefined))
    assert.ok(listed.input.includes('image'))
  })

  it('defaults a video request to gemini and accepts video modality', () => {
    const route = resolveTextRoute({ video: '/tmp/a.mp4' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.ok(route.input.includes('video'))
  })

  it('rejects video on a vision model that left the listed whitelist', () => {
    assert.throws(
      () => resolveTextRoute({ model: 'grok-4.6', video: '/tmp/a.mp4' }, parseTextConfig(undefined)),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-model',
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
    const route = resolveTextRoute({ model: 'gemini-3.8-flash' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.deepEqual(route.input, ['text', 'image', 'video', 'audio', 'document'])
  })

  it('keeps the default table frozen identity for omitted config', () => {
    assert.equal(DEFAULT_TEXT.models.length, 1)
    assert.equal(DEFAULT_TEXT.models[0].id, 'gemini-3.8-flash')
    assert.equal(DEFAULT_TEXT.defaultModel, 'gemini-3.8-flash')
  })

  it('resolves model@group and strategy in text route', () => {
    // 2026-10-21 网关对账 #3516：claude 文本渠道分组已随上游停用整体退场，
    // 现役仅 gemini-3.8-flash 保留 standard 分组（wireGroup default）。
    const route = resolveTextRoute({ model: 'gemini-3.8-flash@standard' }, parseTextConfig(undefined))
    assert.equal(route.modelId, 'gemini-3.8-flash')
    assert.equal(route.group, 'standard')
    assert.equal(route.candidates[0], 'gemini-3.8-flash@default')

    const costRoute = resolveTextRoute({ model: 'gemini-3.8-flash', strategy: 'cost_first' }, parseTextConfig(undefined))
    assert.equal(costRoute.strategy, 'cost_first')
    assert.equal(costRoute.candidates[0], 'gemini-3.8-flash@default')

    const stabRoute = resolveTextRoute({ model: 'gemini-3.8-flash', strategy: 'stability_first' }, parseTextConfig(undefined))
    assert.equal(stabRoute.strategy, 'stability_first')
    assert.equal(stabRoute.candidates[0], 'gemini-3.8-flash@default')

    // 未登记的分组必须 fail-closed，绝不回落到裸模型；未上架型号更早以 unknown-model 拒绝。
    assert.throws(
      () => resolveTextRoute({ model: 'gemini-3.8-flash@cheap' }, parseTextConfig(undefined)),
      { code: 'unknown-group' },
    )
    assert.throws(
      () => resolveTextRoute({ model: 'claude-opus-4-6@claude-plus' }, parseTextConfig(undefined)),
      { code: 'unknown-model' },
    )
  })
})

