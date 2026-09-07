import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MANIFEST_URL, verifyAutoServing } from './verify-auto-serving.mjs'
import { runVerify } from './verify-model-contracts.mjs'
import { loadDispositions } from '../plugins/omnimux/src/catalog/contract/index.js'

const fixture = () => JSON.parse(readFileSync(MANIFEST_URL, 'utf8'))
function checkMutation(mutate, code) {
  const manifest = fixture()
  mutate(manifest)
  const report = verifyAutoServing({ manifest })
  assert.equal(report.exitCode, 1)
  assert.equal(report.ok, false)
  assert.ok(report.issues.some((issue) => issue.code === `auto_serving_${code}`), JSON.stringify(report))
}

test('manifest registers all 15 whitelist IDs without claiming online supply', () => {
  const report = verifyAutoServing()
  assert.equal(report.ok, true, JSON.stringify(report.issues))
  assert.equal(report.exitCode, 0)
  assert.equal(report.registeredCount, 15)
  assert.equal(report.requiredCount, 13)
  assert.equal(report.onlineVerified, false)
})

test('every whitelist model must be registered even when not listed', () => {
  checkMutation((m) => { m.models = m.models.filter((row) => row.productId !== 'suno') }, 'missing')
})

test('alias IDs cannot replace canonical product registrations', () => {
  checkMutation((m) => { m.models.find((row) => row.productId === 'grok-imagine-image-2').productId = 'grok-imagine-image' }, 'not_canonical')
})

test('every registration requires a canonical disposition, including unlisted audio', () => {
  const dispositions = structuredClone(loadDispositions())
  dispositions.dispositions.find((row) => row.id === 'suno').disposition = 'draft'
  const report = verifyAutoServing({ dispositions })
  assert.equal(report.exitCode, 1)
  assert.ok(report.issues.some((issue) => issue.code === 'auto_serving_not_canonical' && issue.modelId === 'suno'))
})

test('foreign gateway aliases, duplicates and missing canonical IDs are rejected', () => {
  for (const gatewayIds of [['gpt-image-2', 'seedance-2.0'], ['gpt-image-2', 'gpt-image-2'], ['unknown'], [], [null]]) {
    checkMutation((m) => { m.models.find((row) => row.productId === 'gpt-image-2').gatewayIds = gatewayIds }, 'gateway_invalid')
  }
})

test('manifest candidate ordering may override the default without crossing models', () => {
  const manifest = fixture()
  manifest.models.find((row) => row.productId === 'grok-imagine-image-2').gatewayIds.reverse()
  assert.equal(verifyAutoServing({ manifest }).ok, true)
})

test('required supply cannot include an unlisted model or exclude a listed whitelist model', () => {
  checkMutation((m) => { m.models.find((row) => row.productId === 'suno').requiredInAuto = true }, 'not_listed')
  checkMutation((m) => { m.models.find((row) => row.productId === 'gpt-image-2').requiredInAuto = false }, 'required')
})

test('wrong modality, duplicate products and wire-model drift fail closed', () => {
  checkMutation((m) => { m.models[0].kind = 'image' }, 'not_allowed')
  checkMutation((m) => { m.models.push(m.models[0]) }, 'duplicate')
  checkMutation((m) => { m.models.find((row) => row.productId === 'minimax-h3').upstreamWireId = 'minimax-h3' }, 'wire_mismatch')
})

test('malformed or unreadable manifests fail closed', () => {
  for (const manifest of [{}, [], { version: '1', defaultGroup: 'vip', models: [] }]) {
    assert.equal(verifyAutoServing({ manifest }).exitCode, 1)
  }
  checkMutation((m) => { m.models.push(null) }, 'manifest_invalid')
  checkMutation((m) => { delete m.models[0].requiredInAuto }, 'manifest_invalid')
  assert.equal(verifyAutoServing({ manifestPath: new URL('./does-not-exist.json', import.meta.url) }).exitCode, 1)
})

test('strict model-contract CLI combines the serving failure and emits it as pure JSON', async () => {
  const serving = verifyAutoServing({ manifest: { version: '1', defaultGroup: 'auto', models: [] } })
  const chunks = []
  const original = process.stdout.write
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true }
  try {
    const report = await runVerify({ mode: 'strict', strict: true, json: true }, {
      verifyContracts: () => ({ ok: true, exitCode: 0, mode: 'strict', issues: [] }),
      verifyAutoServing: () => serving,
    })
    const output = JSON.parse(chunks.join(''))
    assert.equal(report.exitCode, 1)
    assert.equal(output.ok, false)
    assert.equal(output.exitCode, 1)
    assert.equal(output.autoServing.ok, false)
    assert.ok(output.issues.some((issue) => issue.code === 'auto_serving_missing'))
  } finally {
    process.stdout.write = original
  }
})
