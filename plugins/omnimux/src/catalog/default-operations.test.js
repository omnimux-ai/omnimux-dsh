import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildModelCatalog, resolveDefaultOperation } from './list.js'

/** Minimal contract rows: only listed output type and inputs matter to the resolver. */
function model(id, operations) {
  return { id, operations }
}

const videoModels = [
  model('seedance-2-5', [
    { id: 'text_to_video', listed: true, output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt' }] },
    { id: 'video_multi_ref', listed: true, output: { type: 'video' }, inputs: [{ slot: 'reference_images', type: 'image' }] },
  ]),
  model('minimax-h3', [
    { id: 'text_to_video', listed: true, output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt' }] },
    { id: 'video_multi_ref', listed: true, output: { type: 'video' }, inputs: [{ slot: 'reference_images', type: 'image' }] },
  ]),
  // Publishes no media-consuming mode at all.
  model('plain-video', [
    { id: 'text_to_video', listed: true, output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt' }] },
  ]),
]

const ids = new Set(videoModels.map((row) => row.id))

const resolve = (input) => resolveDefaultOperation({ kind: 'video', ids, models: videoModels, ...input })

describe('resolveDefaultOperation (new node generation mode)', () => {
  it('auto keeps the configured default model when it publishes the media-consuming mode', () => {
    assert.deepEqual(resolve({ configured: 'auto', modelId: 'seedance-2-5' }),
      { modelId: 'seedance-2-5', operationId: 'video_multi_ref', rule: 'auto' })
    assert.deepEqual(resolve({ configured: 'auto', modelId: 'minimax-h3' }),
      { modelId: 'minimax-h3', operationId: 'video_multi_ref', rule: 'auto' })
  })

  it('auto walks the preferred chain when the default model cannot consume media', () => {
    assert.deepEqual(resolve({ configured: 'auto', modelId: 'plain-video' }),
      { modelId: 'minimax-h3', operationId: 'video_multi_ref', rule: 'auto_chain' })
  })

  it('auto falls back to the first listed mode when nothing consumes media', () => {
    const onlyPlain = [model('plain-video', videoModels[2].operations)]
    assert.deepEqual(resolveDefaultOperation({
      kind: 'video', configured: 'auto', modelId: 'plain-video',
      ids: new Set(['plain-video']), models: onlyPlain,
    }), { modelId: 'plain-video', operationId: 'text_to_video', rule: 'first_operation' })
  })

  it('an explicit mode wins on the configured model', () => {
    assert.deepEqual(resolve({ configured: 'text_to_video', modelId: 'minimax-h3' }),
      { modelId: 'minimax-h3', operationId: 'text_to_video', rule: 'configured' })
  })

  it('an explicit mode follows the chain when the configured model does not publish it', () => {
    assert.deepEqual(resolve({ configured: 'video_multi_ref', modelId: 'plain-video' }),
      { modelId: 'minimax-h3', operationId: 'video_multi_ref', rule: 'configured_chain' })
  })

  it('an unknown model still resolves without inventing a mode', () => {
    const result = resolve({ configured: 'auto', modelId: 'ghost-model' })
    assert.equal(result.operationId, 'video_multi_ref')
    assert.equal(result.modelId, 'minimax-h3')
  })
})

describe('buildModelCatalog defaultOperations (real contract)', () => {
  const mediaOpsOf = (row) => (row?.operations ?? []).filter((op) => op.listed === true
    && (op.inputs ?? []).some((slot) => ['image', 'video', 'audio'].includes(slot.type)))

  it('video default lands on a listed mode that consumes upstream media', () => {
    const catalog = buildModelCatalog({})
    const entry = catalog.defaultOperations.video
    assert.ok(entry && entry.operationId, 'video must resolve a default mode')
    const row = (catalog.models ?? []).find((candidate) => candidate.id === entry.modelId)
    const op = row?.operations.find((candidate) => candidate.id === entry.operationId)
    assert.ok(op, 'video default mode must belong to the default model')
    assert.equal(op.listed, true, 'video default mode must be listed')
    assert.ok(
      (op.inputs ?? []).some((slot) => ['image', 'video', 'audio'].includes(slot.type)),
      'video default mode must accept media so a new node renders slots',
    )
  })

  it('image prefers a listed media-consuming mode and never invents one', () => {
    const catalog = buildModelCatalog({})
    const entry = catalog.defaultOperations.image
    assert.ok(entry && entry.operationId, 'image must resolve a default mode')
    const row = (catalog.models ?? []).find((candidate) => candidate.id === entry.modelId)
    const op = row?.operations.find((candidate) => candidate.id === entry.operationId)
    assert.ok(op, 'image default mode must belong to the default model')
    assert.equal(op.listed, true, 'the resolver may only pick a listed mode')
    const mediaOps = mediaOpsOf(row)
    if (mediaOps.length > 0) {
      assert.ok(mediaOps.some((candidate) => candidate.id === entry.operationId),
        'a listed media-consuming mode must win over a prompt-only one')
    } else {
      // Today gpt-image-2.5 publishes multi_reference as draft (research not verified),
      // so no image mode consumes media and the model's first listed mode is correct.
      assert.equal(entry.rule, 'first_operation')
    }
  })
})
