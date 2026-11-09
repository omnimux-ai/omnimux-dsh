import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { buildModelCatalog } from './list.js'
import { getGatewayTextRows, getRuntimeContractIndex } from './runtime-index.js'
import { parseTextConfig, resolveTextRoute } from '../text/catalog.js'
import { guardSubmit } from './contract/submit-guard/index.js'

const bundled = JSON.parse(readFileSync(new URL('./cloud/bundled/pricing.json', import.meta.url), 'utf8'))
const snapshot = bundled

test('Gateway Contract v2 fills text and image buckets without local YAML', () => {
  const catalog = buildModelCatalog({ env: {}, snapshot })
  assert.deepEqual(catalog.text.map((row) => row.id).sort(), ['gemini-3.8-flash', 'gemini-4-argon'])
  assert.deepEqual(catalog.image.map((row) => row.id).sort(), ['gemini-3.1-flash-lite-image', 'gpt-image-2.5'])
  assert.equal(catalog.gateway.missingContract.length, 0)
  assert.deepEqual(catalog.gateway.adapterUnsupported, ['suno-sounds', 'wan-3.0'])

  const argon = catalog.models.find((row) => row.id === 'gemini-4-argon')
  assert.equal(argon?.gateway?.schemaVersion, '2.0')
  assert.equal(argon?.gateway?.status, 'partial')
  assert.match(argon?.label ?? '', /^Gemini 4 Argon$/)

  const gpt = catalog.models.find((row) => row.id === 'gpt-image-2.5')
  const reference = gpt?.operations.find((operation) => operation.id === 'multi_reference')?.inputs.find((input) => input.type === 'image')
  assert.equal(reference?.max, 1)
  assert.deepEqual(gpt?.parameters?.quality?.options, [{ value: 'medium' }])
  assert.deepEqual(gpt?.parameters?.resolution?.options, [{ value: '1K' }])

  const geminiImage = catalog.models.find((row) => row.id === 'gemini-3.1-flash-lite-image')
  const geminiRef = geminiImage?.operations.find((operation) => operation.id === 'image_to_image')?.inputs.find((input) => input.type === 'image')
  assert.equal(geminiRef?.max, 14)
})

test('Gateway text rows and SubmitGuard admit gateway-only models', () => {
  const runtime = getRuntimeContractIndex({ snapshot })
  const rows = getGatewayTextRows({ snapshot })
  assert.deepEqual(rows.map((row) => row.id), ['gemini-3.8-flash', 'gemini-4-argon'])

  const text = parseTextConfig({})
  const route = resolveTextRoute({
    model: 'gemini-4-argon',
    references: [{ type: 'image', pathOrUrl: 'https://example.test/cat.png' }],
  }, text, {}, {}, rows)
  assert.equal(route.modelId, 'gemini-4-argon')
  assert.ok(route.input.includes('image'))

  for (const [model, operation, capability] of [
    ['gemini-4-argon', 'chat', 'text'],
    ['gemini-3.1-flash-lite-image', 'text_to_image', 'image'],
  ]) {
    const result = guardSubmit(
      { prompt: 'fixture', model, operation, assets: [] },
      { index: runtime.index, seam: capability === 'text' ? 'textComplete' : 'imageGenerate', capability, outputType: capability },
    )
    assert.equal(result.ok, true, `${model}: ${result.message ?? result.code}`)
  }
})

test('Gateway v1 snapshot falls back to local specs instead of breaking the catalog', () => {
  const legacy = structuredClone(bundled)
  for (const model of legacy.models ?? []) {
    if (model.contract) model.contract = { ...model.contract, schemaVersion: '1.0' }
  }
  const catalog = buildModelCatalog({ env: {}, snapshot: legacy })
  assert.ok(catalog.text.some((row) => row.id === 'gemini-3.8-flash'))
  assert.ok(catalog.image.some((row) => row.id === 'gpt-image-2.5'))
  assert.ok(catalog.gateway.missingContract.length > 0)
})
