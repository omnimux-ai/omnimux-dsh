import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildModelCatalog } from './list.js'
import { resolveReadOnlySnapshot } from './cloud/current.js'
import { ANONYMOUS_VIEW, cloudCatalogRoot, viewDirectoryName } from './cloud/store.js'
import { findSnapshotModel, usableSnapshotModels } from './cloud/view.js'
import { diffGatewayAgainstHub } from './cloud/diff.js'
import { estimatePointsFromGateway, gatewayBillingMode } from './pricing-calculator.js'
import { guardSubmit } from './contract/submit-guard/index.js'

/**
 * P1b acceptance: the gateway snapshot - not a local table - owns membership,
 * lines and prices. Everything here runs offline against the bundled snapshot,
 * so it is the floor a brand-new machine gets before any refresh.
 */

const bundledDir = fileURLToPath(new URL('./cloud/bundled/', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'p1b-bundled-'))
const bundled = resolveReadOnlySnapshot({ bundledDir, home: scratch })

/** @param {object} catalog @param {string} id */
function listedEverywhere(catalog, id) {
  return ['text', 'image', 'video', 'audio'].some((kind) => catalog[kind].some((row) => row.id === id))
}

test('① every gateway-sold model with a contract is visible; a gateway model with no line is invisible', () => {
  const catalog = buildModelCatalog({ env: {}, snapshot: bundled.snapshot })
  const sold = usableSnapshotModels(bundled.snapshot)
  assert.ok(sold.size > 0, 'the bundled snapshot must sell something')

  // Every model the gateway sells AND the hub has a callable contract for is offered.
  const offered = new Set(
    ['text', 'image', 'video', 'audio'].flatMap((kind) => catalog[kind].map((row) => row.id)),
  )
  for (const id of sold.keys()) {
    const contracted = catalog.models.find((row) => row.id === id && row.operations.some((op) => op.listed))
    if (!contracted) continue
    assert.equal(offered.has(id), true, `${id} is sold and contracted, so it must be listed`)
  }

  // Membership is the snapshot's call: strip a model's lines and it leaves every list.
  const stripped = structuredClone(bundled.snapshot)
  findSnapshotModel(stripped, 'seedance-2-5').enableGroups = []
  const afterStrip = buildModelCatalog({ env: {}, snapshot: stripped })
  assert.equal(listedEverywhere(afterStrip, 'seedance-2-5'), false, 'a model with no gateway line must be invisible')
  assert.equal(listedEverywhere(catalog, 'seedance-2-5'), true, 'the same model is listed while the gateway sells it')

  // A model absent from the snapshot cannot be offered even though its contract lists ops.
  const without = structuredClone(bundled.snapshot)
  without.models = without.models.filter((row) => row.id !== 'gpt-image-2.5')
  const afterDrop = buildModelCatalog({ env: {}, snapshot: without })
  assert.equal(listedEverywhere(afterDrop, 'gpt-image-2.5'), false, 'a delisted model must leave every list')
  assert.equal(afterDrop.models.some((row) => row.id === 'gpt-image-2.5'), true, 'its contract row stays')
  assert.equal(afterDrop.models.find((row) => row.id === 'gpt-image-2.5').gatewayListed, false)
})

test('② every listed line and price equals the snapshot item by item', () => {
  const catalog = buildModelCatalog({ env: {}, snapshot: bundled.snapshot })
  const ratios = bundled.snapshot.groups.ratio
  let lines = 0

  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const row of catalog[kind]) {
      const model = findSnapshotModel(bundled.snapshot, row.id)
      assert.ok(model, `${row.id} must exist in the snapshot`)
      assert.equal(row.channelGroups.length > 0, true, `${row.id} must expose its gateway lines`)

      for (const group of row.channelGroups) {
        lines += 1
        assert.equal(model.enableGroups.includes(group.wireGroup), true, `${row.id}@${group.wireGroup} must be an enabled gateway group`)
        assert.equal(group.enabled, true)
        assert.equal(group.pricing.groupRatio, ratios[group.wireGroup], `${row.id}@${group.wireGroup} ratio`)
        assert.equal(group.pricing.unitPriceUsd, model.billing.modelPrice, `${row.id} unit price`)
        assert.equal(
          group.pricing.pointsEstimate ?? null,
          estimatePointsFromGateway({
            billing: model.billing,
            billingMode: gatewayBillingMode(model),
            groupRatio: ratios[group.wireGroup],
          }) ?? null,
          `${row.id}@${group.wireGroup} points`,
        )
        if (group.pricing.pointsEstimate === null) {
          assert.equal(typeof group.pricing.pointsNote, 'string', `${row.id}@${group.wireGroup} must explain the gap`)
        }
      }
    }
  }
  assert.ok(lines > 0, 'the catalog must project at least one line')
})

test('③ a corrupt disk cache falls back to the bundled snapshot instead of an empty catalog', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'p1b-cache-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const viewDir = join(cloudCatalogRoot(home), viewDirectoryName(ANONYMOUS_VIEW))
  mkdirSync(viewDir, { recursive: true })
  writeFileSync(join(viewDir, 'snapshot.json'), '{"schemaVersion":1,"models":')

  const resolved = resolveReadOnlySnapshot({ home, bundledDir })
  assert.equal(resolved.source, 'bundled', 'a damaged cache must not win over the shipped floor')
  assert.ok(resolved.snapshot, 'the bundled snapshot must still resolve')
  const catalog = buildModelCatalog({ env: {}, snapshot: resolved.snapshot })
  assert.ok(
    catalog.image.length + catalog.video.length + catalog.audio.length + catalog.text.length > 0,
    'the catalog must never come back empty while the shipped floor is readable',
  )

  // With no floor and no usable cache the resolution reports "none" instead of throwing.
  const empty = resolveReadOnlySnapshot({ home, bundledDir: join(home, 'no-bundled') })
  assert.equal(empty.snapshot, undefined)
  assert.equal(empty.source, 'none')
})

test('④ submitting a delisted model is rejected with a clear reason', () => {
  const opts = { seam: 'imageGenerate', outputType: 'image' }
  const request = { model: 'seedream-5-0-pro', operation: 'text_to_image', prompt: 'a cat' }

  const rejected = guardSubmit(request, opts)
  assert.equal(rejected.ok, false)
  assert.equal(rejected.code, 'not_listed')
  assert.match(rejected.message, /该模型已下架/)
  assert.equal(rejected.details.reason, 'gateway-delisted')

  const inSale = guardSubmit({ ...request, model: 'gpt-image-2.5' }, opts)
  assert.equal(inSale.ok, true, JSON.stringify(inSale.diagnostics ?? inSale.message))

  // An explicit contract-only validation still skips the listing check.
  const contractOnly = guardSubmit(request, { ...opts, requireListed: false })
  assert.notEqual(contractOnly.code, 'not_listed')
})

test('⑤ gateway-sold models with no callable contract are counted, never listed', () => {
  const catalog = buildModelCatalog({ env: {}, snapshot: bundled.snapshot })
  assert.ok(catalog.gateway.missingContract.length > 0, 'the gateway sells models the hub cannot call')
  const sold = usableSnapshotModels(bundled.snapshot)
  for (const id of catalog.gateway.missingContract) {
    assert.equal(sold.has(id), true, `${id} must be sold by the gateway`)
    assert.equal(listedEverywhere(catalog, id), false, `${id} has no callable contract, so it must not be listed`)
    const row = catalog.models.find((model) => model.id === id)
    if (row) {
      assert.deepEqual(row.operations.filter((op) => op.listed), [], `${id} must expose no listed operation`)
    }
  }
  // An explicitly passed snapshot is reported as such, and the read-only default
  // resolution reports the shipped floor it actually read.
  // The catalog's own count and the read-only drift report must agree: every
  // gateway-only model is exactly a missing-call-contract model.
  const drift = diffGatewayAgainstHub({ gateway: bundled.snapshot, hub: catalog })
  assert.deepEqual(catalog.gateway.missingContract, drift.gatewayOnly.map((row) => row.id).sort())
  assert.equal(drift.summary.unreachable, 0)
  assert.equal(drift.summary.groupExtra, 0)
  assert.equal(drift.summary.priceChanged, 0)

  assert.equal(catalog.gateway.source, 'injected')
  assert.equal(typeof catalog.gateway.digest, 'string')
  const readOnly = buildModelCatalog({ env: {} })
  assert.equal(readOnly.gateway.source, 'bundled')
  assert.equal(typeof readOnly.gateway.digest, 'string')
})
