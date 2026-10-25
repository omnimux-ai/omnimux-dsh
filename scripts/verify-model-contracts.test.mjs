/**
 * scripts/verify-model-contracts.test.mjs
 *
 * Covers the offline gateway-membership reconciliation added to
 * `verify-model-contracts.mjs`. P1b moved "is this model on sale" to the
 * gateway snapshot, so `listedOperations` (the call-contract admission set) and
 * on-sale membership are now two independent truths that must be reconciled.
 *
 * The three falsification experiments below are kept as regression cases: each
 * feeds an in-memory counterexample and asserts the gate really turns red, so
 * it cannot silently degrade into an always-green check.
 *
 * Style note: no spread, no computed member access, no dynamic import — the
 * test-authoring inspection treats those as non-declarable execution risk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGatewayMembership } from './verify-model-contracts.mjs';

/** Contract index stub: two listed models, one of which the snapshot sells. */
function fixtureIndex() {
  return {
    all() {
      return [
        { id: 'sold-contracted', operations: [{ id: 'chat', listed: true }] },
        { id: 'unsold-contracted', operations: [{ id: 'chat', listed: true }] },
      ];
    },
  };
}

/** Bundled-snapshot stub: `sold-contracted` (contracted) + `sold-uncontracted`. */
function fixtureBundled() {
  return {
    snapshot: {
      models: [
        { id: 'sold-contracted', enableGroups: ['auto'] },
        { id: 'sold-uncontracted', enableGroups: ['auto'] },
      ],
    },
    code: 'read',
  };
}

/** Catalog stub exposing only the field this gate reads. */
function fixtureCatalog(missingContract) {
  return { gateway: { missingContract } };
}

/** @param {object} report @returns {string[]} */
function issueCodes(report) {
  return report.issues.map((issue) => issue.code);
}

test('baseline: the correct missingContract summary is green', () => {
  const report = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['sold-uncontracted']),
    exemptions: [],
  });
  assert.equal(report.ok, true);
  assert.equal(report.onSale, 2);
  assert.equal(report.contractListed, 2);
  assert.deepEqual(report.missingContract, ['sold-uncontracted']);
});

test('falsification A: a catalog that under-reports missingContract turns the gate red', () => {
  const broken = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog([]),
    exemptions: [],
  });
  assert.equal(broken.ok, false);
  assert.ok(
    issueCodes(broken).includes('gateway_missing_contract_drift'),
    `expected gateway_missing_contract_drift, got ${issueCodes(broken).join(',')}`,
  );

  // Revert step: the same fixture with the correct summary is green again.
  const reverted = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['sold-uncontracted']),
    exemptions: [],
  });
  assert.equal(reverted.ok, true);
});

test('falsification B: an exemption for a model the snapshot now sells turns the gate red', () => {
  const stale = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['sold-uncontracted']),
    exemptions: [{ modelId: 'sold-contracted', reason: 'fixture waiver' }],
  });
  assert.equal(stale.ok, false);
  assert.ok(
    issueCodes(stale).includes('gateway_exempt_now_sold'),
    `expected gateway_exempt_now_sold, got ${issueCodes(stale).join(',')}`,
  );

  // Revert step: an exemption for a model the snapshot does NOT sell stays green.
  const reverted = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['sold-uncontracted']),
    exemptions: [{ modelId: 'unsold-contracted', reason: 'fixture waiver' }],
  });
  assert.equal(reverted.ok, true);
});

test('falsification C: reporting a contracted id as missing a contract turns the gate red', () => {
  const broken = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['sold-contracted', 'sold-uncontracted']),
    exemptions: [],
  });
  assert.equal(broken.ok, false);
  assert.ok(
    issueCodes(broken).includes('gateway_missing_contract_all_contracted'),
    `expected gateway_missing_contract_all_contracted, got ${issueCodes(broken).join(',')}`,
  );
});

test('reported missing ids must exist in the bundled on-sale set', () => {
  const report = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: fixtureCatalog(['ghost-model']),
    exemptions: [],
  });
  assert.equal(report.ok, false);
  assert.ok(
    issueCodes(report).includes('gateway_missing_contract_not_on_sale'),
    `expected gateway_missing_contract_not_on_sale, got ${issueCodes(report).join(',')}`,
  );
});

test('structural: an empty on-sale set fails instead of passing vacuously', () => {
  const report = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: { snapshot: { models: [{ id: 'listed-but-dead', enableGroups: [] }] }, code: 'read' },
    catalog: fixtureCatalog([]),
    exemptions: [],
  });
  assert.equal(report.ok, false);
  assert.ok(
    issueCodes(report).includes('gateway_snapshot_empty'),
    `expected gateway_snapshot_empty, got ${issueCodes(report).join(',')}`,
  );
});

test('structural: an unreadable bundled snapshot fails instead of passing vacuously', () => {
  const report = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: { snapshot: undefined, code: 'missing' },
    catalog: fixtureCatalog([]),
    exemptions: [],
  });
  assert.equal(report.ok, false);
  assert.ok(
    issueCodes(report).includes('gateway_snapshot_unreadable'),
    `expected gateway_snapshot_unreadable, got ${issueCodes(report).join(',')}`,
  );
});

test('structural: a catalog without gateway.missingContract fails instead of passing vacuously', () => {
  const report = verifyGatewayMembership({
    index: fixtureIndex(),
    bundled: fixtureBundled(),
    catalog: { gateway: {} },
    exemptions: [],
  });
  assert.equal(report.ok, false);
  assert.ok(
    issueCodes(report).includes('gateway_catalog_summary_missing'),
    `expected gateway_catalog_summary_missing, got ${issueCodes(report).join(',')}`,
  );
});

test('real repository data: the shipped snapshot reconciles with the contract index', () => {
  const report = verifyGatewayMembership();
  assert.equal(
    report.ok,
    true,
    report.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; '),
  );
  assert.ok(report.onSale > 0, 'the shipped snapshot must sell at least one model');
  assert.ok(report.contractListed > 0, 'the contract index must list at least one operation');
  assert.ok(report.exempt.includes('whisper-1'), 'the transcription waiver must stay declared');
  assert.ok(
    !report.missingContract.includes('whisper-1'),
    'an exempted model must never be reported as missing a call contract',
  );
});
