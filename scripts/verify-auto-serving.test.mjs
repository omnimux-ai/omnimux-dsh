import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MANIFEST_URL, readBaselineBundledSnapshot, verifyAutoServing } from './verify-auto-serving.mjs'
import { runVerify } from './verify-model-contracts.mjs'
import { loadDispositions } from '../plugins/omnimux/src/catalog/contract/index.js'
import { defaultBundledDir, readBundledSnapshot } from '../plugins/omnimux/src/catalog/cloud/bundled.js'
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts'

const fixture = () => JSON.parse(readFileSync(MANIFEST_URL, 'utf8'))
const bundled = () => readBundledSnapshot(defaultBundledDir()).snapshot
function checkMutation(mutate, code) {
  const manifest = fixture()
  mutate(manifest)
  const report = verifyAutoServing({ manifest })
  assert.equal(report.exitCode, 1)
  assert.equal(report.ok, false)
  assert.ok(report.issues.some((issue) => issue.code === `auto_serving_${code}`), JSON.stringify(report))
}

test('manifest registers all whitelist IDs without claiming online supply', () => {
  const report = verifyAutoServing()
  assert.equal(report.ok, true, JSON.stringify(report.issues))
  assert.equal(report.exitCode, 0)
  const manifest = fixture()
  // #1751 移除的 3 款不得再作为 canonical 注册
  for (const removed of ['gpt-image-2', 'minimax-h3-max', 'minimax-h3-max-turbo']) {
    assert.ok(!manifest.models.some((row) => row.productId === removed), `${removed} must be deregistered`)
    assert.ok(!report.issues.some((issue) => issue.modelId === removed), `${removed} must not be reported`)
  }
  // 2026-10-21 网关对账 #3516：24 行登记。
  // P1b：本门禁不再统计「必需」数量——在售与否由运行时网关快照决定。
  assert.equal(report.registeredCount, 24)
  assert.equal(report.requiredCount, undefined)
  assert.equal(report.onlineVerified, false)
})

test('every whitelist model must be registered even when not listed', () => {
  // 2026-10-21 #3516 后音频白名单只剩已上架的 suno，真实目录不再有「白名单内但无
  // listed 操作」的型号；用显式策略矩阵还原该形态，门禁仍必须要求它登记。
  const policy = structuredClone(CANVAS_GENERATION_POLICY)
  policy.audio.allowedModelIds.push('seed-audio-1.0')
  const manifest = fixture()
  manifest.models = manifest.models.filter((row) => row.productId !== 'seed-audio-1.0')
  const report = verifyAutoServing({ manifest, policy })
  assert.equal(report.exitCode, 1)
  assert.equal(report.ok, false)
  assert.ok(report.issues.some((issue) => issue.code === 'auto_serving_missing' && issue.modelId === 'seed-audio-1.0'), JSON.stringify(report))
})

test('alias IDs cannot replace canonical product registrations', () => {
  checkMutation((m) => { m.models.find((row) => row.productId === 'grok-imagine-image-2-0').productId = 'grok-imagine-image' }, 'not_canonical')
})

test('every registration requires a canonical disposition, including unlisted audio', () => {
  const dispositions = structuredClone(loadDispositions())
  dispositions.dispositions.find((row) => row.id === 'suno').disposition = 'draft'
  const report = verifyAutoServing({ dispositions })
  assert.equal(report.exitCode, 1)
  assert.ok(report.issues.some((issue) => issue.code === 'auto_serving_not_canonical' && issue.modelId === 'suno'))
})

test('foreign gateway aliases, duplicates and missing canonical IDs are rejected', () => {
  for (const gatewayIds of [['gpt-image-2.5', 'seedance-2.0'], ['gpt-image-2.5', 'gpt-image-2.5'], ['unknown'], [], [null]]) {
    checkMutation((m) => { m.models.find((row) => row.productId === 'gpt-image-2.5').gatewayIds = gatewayIds }, 'gateway_invalid')
  }
})

test('manifest candidate ordering may override the default without crossing models', () => {
  const manifest = fixture()
  manifest.models.find((row) => row.productId === 'grok-imagine-image-2-0').gatewayIds.reverse()
  assert.equal(verifyAutoServing({ manifest }).ok, true)
})

test('the retired requiredInAuto flag is no longer judged', () => {
  // P1b：成员资格改由网关快照决定，本地 requiredInAuto 判断已删除。
  // 残留字段既不加分也不扣分，登记本身仍然只由 canonical/gatewayIds 校验约束。
  const withFlag = fixture()
  withFlag.models.find((row) => row.productId === 'minimax-h3').requiredInAuto = true
  assert.equal(verifyAutoServing({ manifest: withFlag }).ok, true)
  const withoutFlag = fixture()
  withoutFlag.models.find((row) => row.productId === 'gpt-image-2.5').requiredInAuto = false
  assert.equal(verifyAutoServing({ manifest: withoutFlag }).ok, true)
})

test('wrong modality, duplicate products and wire-model drift fail closed', () => {
  checkMutation((m) => { m.models.find((row) => row.productId === 'gpt-image-2.5').kind = 'video' }, 'not_allowed')
  checkMutation((m) => { m.models.push(m.models[0]) }, 'duplicate')
  checkMutation((m) => { m.models.find((row) => row.productId === 'minimax-h3').upstreamWireId = 'minimax-h3' }, 'wire_mismatch')
})

test('malformed or unreadable manifests fail closed', () => {
  for (const manifest of [{}, [], { version: '1', defaultGroup: 'vip', models: [] }]) {
    assert.equal(verifyAutoServing({ manifest }).exitCode, 1)
  }
  checkMutation((m) => { m.models.push(null) }, 'manifest_invalid')
  checkMutation((m) => { m.models[0].priority = 'P2' }, 'manifest_invalid')
  assert.equal(verifyAutoServing({ manifestPath: new URL('./does-not-exist.json', import.meta.url) }).exitCode, 1)
})

test('the shipped snapshot may not silently drop a model the baseline sold', () => {
  const baseline = bundled()
  assert.ok(baseline.models.some((row) => row.id === 'suno'), 'fixture expectation: suno is on sale today')

  // A model that vanishes from the file, and a model that stays but loses every
  // enabled line, are the same product outcome: the catalog can no longer serve it.
  for (const shrink of [
    (snapshot) => { snapshot.models = snapshot.models.filter((row) => row.id !== 'suno') },
    (snapshot) => { snapshot.models.find((row) => row.id === 'suno').enableGroups = [] },
  ]) {
    const current = structuredClone(baseline)
    shrink(current)
    const report = verifyAutoServing({ baseline, bundled: { snapshot: current } })
    assert.equal(report.exitCode, 1)
    assert.equal(report.ok, false)
    const dropped = report.issues.filter((issue) => issue.code === 'auto_serving_snapshot_model_dropped')
    assert.deepEqual(dropped.map((issue) => issue.modelId), ['suno'], JSON.stringify(report.issues))
    assert.deepEqual(report.gateway.dropped, ['suno'])
    assert.equal(report.gateway.baseline.ref, 'injected')
  }

  // Restoring the model is the same check going green again.
  assert.equal(verifyAutoServing({ baseline, bundled: { snapshot: baseline } }).ok, true)
})

test('a baseline that cannot be read is a warning, never a fake failure', () => {
  const missing = verifyAutoServing({ baseline: null })
  assert.equal(missing.ok, true, JSON.stringify(missing.issues))
  assert.equal(missing.exitCode, 0)
  assert.deepEqual(missing.warnings.map((warning) => warning.code), ['auto_serving_baseline_unavailable'])
  assert.equal(missing.gateway.dropped.length, 0)

  const bogusRef = verifyAutoServing({ baselineRef: 'definitely-not-a-revision' })
  assert.equal(bogusRef.ok, true, JSON.stringify(bogusRef.issues))
  assert.equal(bogusRef.warnings.some((warning) => warning.code === 'auto_serving_baseline_unavailable'), true)
  assert.equal(readBaselineBundledSnapshot({ baselineRef: 'definitely-not-a-revision' }).snapshot, undefined)
})

test('the baseline revision is read from git, offline and without touching the worktree', () => {
  const read = readBaselineBundledSnapshot({ baselineRef: 'HEAD' })
  assert.equal(read.code, 'read')
  assert.equal(read.ref, 'HEAD')
  assert.ok(read.snapshot.models.length > 0)

  const report = verifyAutoServing({ baselineRef: 'HEAD' })
  assert.equal(report.ok, true, JSON.stringify(report.issues))
  assert.deepEqual(report.warnings, [])
  assert.equal(report.gateway.baseline.code, 'read')
  assert.equal(report.gateway.baseline.models, report.gateway.snapshotModels)
  assert.deepEqual(report.gateway.dropped, [])
  assert.equal(report.gateway.baseline.disappearance.ratio, 0)
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
