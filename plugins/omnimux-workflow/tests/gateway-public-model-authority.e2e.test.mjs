import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildModelCatalog } from '../../omnimux/src/catalog/list.js'
import { projectCanvasCatalog } from '../src/shared/generationPolicy.ts'
import { buildFilteredModelOptions } from '../src/shared/validation/operationUi.ts'
import { buildUpstreamFingerprint } from '../src/shared/validation/compatKernel.ts'

test('gateway public rows stay visible and adapter support is an execution status', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }))
  const videoIds = catalog.video.map((row) => row.id)
  assert.equal(videoIds.includes('minimax-h3-video'), true)
  assert.equal(videoIds.includes('wan-3.0'), true)
  assert.equal(catalog.video.find((row) => row.id === 'wan-3.0')?.executionStatus, 'unsupported')
  assert.equal(catalog.video.find((row) => row.id === 'minimax-h3-video')?.executionStatus, 'ready')
})

test('legacy canvasHiddenModels no longer removes a gateway row', () => {
  const hub = buildModelCatalog({ env: {} })
  const base = projectCanvasCatalog(hub)
  hub.canvasHiddenModels = { text: [], image: [], video: ['minimax-h3-video'], audio: [] }
  const after = projectCanvasCatalog(hub)
  assert.deepEqual(after.video.map((row) => row.id), base.video.map((row) => row.id))
})

test('BYOK custom model profiles reach the same catalog and option list', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {}, settingsDefaults: {
    byokProviders: [{ provider: 'custom', endpoint: 'https://fixture.invalid/v1', models: { video: 'my-video-model' }, capabilities: ['video'] }],
  } }))
  const custom = catalog.video.find((row) => row.id === 'custom:my-video-model')
  assert.equal(custom?.source, 'custom')
  assert.equal(custom?.executionStatus, 'ready')
  const result = buildFilteredModelOptions({
    catalog,
    fingerprint: buildUpstreamFingerprint({ prompt: 'make a clip' }),
    outputType: 'video',
  })
  assert.equal(result.options.some((option) => option.id === 'custom:my-video-model'), true)
  const wan = result.options.find((option) => option.id === 'wan-3.0')
  assert.equal(wan?.executable, false)
  assert.equal(wan?.disabledReason, 'adapter_unsupported')
})
