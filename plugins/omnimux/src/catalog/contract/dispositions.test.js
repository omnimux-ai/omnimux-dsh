/**
 * Dispositions registry tests (H2 + phase-one video): 67-row lock, shape validation, D1-D7
 * consistency, forbidden-listed discipline, catalog defaults, cordis cross-refs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDispositions,
  loadCatalogDefaults,
  resetDispositionsCache,
  validateDispositionsShape,
  validateDispositions,
  validateCatalogDefaults,
  resolveDisposition,
  forbiddenListedIds,
  collectCordisModelIds,
  validateCordisCrossRefs,
  verifiedEvidenceIssues,
  DISPOSITION_KINDS,
  DEFAULT_DISPOSITIONS_PATH,
} from './dispositions.js';
import { loadAll, resetContractCache, DEFAULT_SPECS_DIR } from './load.js';
import { loadOperationRegistry } from './schema.js';

function freshIndex() {
  resetContractCache();
  return loadAll(DEFAULT_SPECS_DIR, { useCache: false });
}

/** Runtime universe = contract ids + declared wire aliases (H2 dispositions-driven). */
function runtimeIdsOf(index) {
  const ids = new Set();
  for (const m of index.all()) {
    ids.add(m.id);
    for (const a of m.aliases ?? []) ids.add(a);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

test('dispositions.json: exactly 71 rows, unique ids, all kinds valid, reasons present', () => {
  resetDispositionsCache();
  const doc = loadDispositions();
  assert.equal(validateDispositionsShape(doc).length, 0);
  const rows = doc.dispositions;
  assert.equal(rows.length, 71, `expected 71 disposition rows, got ${rows.length}`);
  const ids = new Set(rows.map((r) => r.id));
  assert.equal(ids.size, 71);
  for (const row of rows) {
    assert.ok(DISPOSITION_KINDS.includes(row.disposition), row.id);
    assert.ok(typeof row.reason === 'string' && row.reason.trim(), row.id);
  }
});

test('71 disposition rows mirror the runtime universe exactly (no missing, no ghost)', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  assert.equal(runtimeIds.length, 71);
  const issues = validateDispositions(doc, { index, runtimeIds, strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues, null, 2));
});

test('locked dispositions: draft-probeable / quarantine / alias / Batch A canonical', () => {
  const doc = loadDispositions();
  // #538: seams mounted and probeable but unprobed → draft; listed stays empty until #530
  assert.equal(resolveDisposition(doc, 'whisper-1')?.disposition, 'draft');
  assert.equal(resolveDisposition(doc, 'kling-avatar')?.disposition, 'draft');
  assert.equal(resolveDisposition(doc, 'minimax-h3')?.disposition, 'canonical');
  for (const id of ['omni_flash', 'kling-o1', 'kling-o3', 'kling-v3-motion-control']) {
    assert.equal(resolveDisposition(doc, id)?.disposition, 'quarantine', id);
  }
  assert.deepEqual(
    [resolveDisposition(doc, 'nanobanana-2'), resolveDisposition(doc, 'nanobanana-pro')].map((r) => [
      r?.disposition,
      r?.target,
    ]),
    [
      ['alias', 'nano_banana_2'],
      ['alias', 'nano_banana_pro'],
    ],
  );
  for (const id of ['seedance-2-0-fast', 'gpt-image-2', 'grok-imagine-image-2']) {
    const row = resolveDisposition(doc, id);
    assert.equal(row?.disposition, 'canonical', id);
    assert.equal(row?.batch, 'A', id);
    assert.ok(Array.isArray(row?.evidence) && row.evidence.length > 0, `${id} must cite dated evidence`);
  }
  // extra ghost ids must be deleted, not dispositioned
  for (const ghost of ['deepseek-v3', 'deepseek-r1', 'gpt-4o']) {
    assert.equal(resolveDisposition(doc, ghost), undefined, ghost);
  }
});

test('forbidden-listed set has no listed op in the real index', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const forbidden = forbiddenListedIds(doc);
  for (const model of index.all()) {
    const row = resolveDisposition(doc, model.id);
    if (row && forbidden.has(row.id)) {
      assert.deepEqual(model.listedOperations ?? [], [], `${model.id} must not list`);
    }
  }
  // whisper-1 / kling-avatar concretely unlisted
  assert.deepEqual(index.get('whisper-1')?.listedOperations ?? [], []);
  assert.deepEqual(index.get('kling-avatar')?.listedOperations ?? [], []);
});

test('alias targets exist as canonical contracts declaring the alias', () => {
  const index = freshIndex();
  assert.equal(index.get('nanobanana-2'), undefined);
  assert.equal(index.get('nanobanana-pro'), undefined);
  assert.ok(index.get('nano_banana_2')?.aliases?.includes('nanobanana-2'));
  assert.ok(index.get('nano_banana_pro')?.aliases?.includes('nanobanana-pro'));
  const doc = loadDispositions();
  for (const alias of ['grok-imagine-image', 'grok-imagine-image-2-0', 'grok-imagine-image-2.0']) {
    assert.equal(index.get(alias), undefined);
    assert.ok(index.get('grok-imagine-image-2')?.aliases?.includes(alias));
    const row = resolveDisposition(doc, alias);
    assert.equal(row?.disposition, 'alias');
    assert.equal(row?.target, 'grok-imagine-image-2');
  }
});

test('negative: removing a row triggers disposition_missing under strict', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  const trimmed = {
    ...doc,
    dispositions: doc.dispositions.filter((r) => r.id !== 'suno'),
  };
  const issues = validateDispositions(trimmed, { index, runtimeIds, strict: true });
  assert.ok(issues.some((i) => i.code === 'disposition_missing' && i.modelId === 'suno' && i.level === 'error'));
});

test('negative: alias declared as YAML model.id triggers disposition_alias_inconsistent', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  const fakeIndex = {
    ...index,
    get: (id) => (id === 'nanobanana-2' ? { id } : index.get(id)),
    all: () => index.all(),
  };
  const issues = validateDispositions(doc, { index: fakeIndex, runtimeIds, strict: true });
  assert.ok(issues.some((i) => i.code === 'disposition_alias_inconsistent' && i.modelId === 'nanobanana-2'));
});

test('negative: listed op on forbidden disposition triggers disposition_listed_forbidden', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  const fakeIndex = {
    ...index,
    get: (id) => index.get(id),
    all: () => [
      ...index.all(),
      { id: 'omni_flash', listedOperations: ['omni_flash#text_to_video'], operations: [] },
    ],
  };
  const issues = validateDispositions(doc, { index: fakeIndex, runtimeIds, strict: true });
  assert.ok(issues.some((i) => i.code === 'disposition_listed_forbidden' && i.modelId === 'omni_flash'));
});

test('negative: ghost disposition row triggers disposition_unknown_id', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  const ghosted = {
    ...doc,
    dispositions: [...doc.dispositions, { id: 'gpt-4o', disposition: 'draft', reason: 'ghost' }],
  };
  const issues = validateDispositions(ghosted, { index, runtimeIds, strict: true });
  assert.ok(issues.some((i) => i.code === 'disposition_unknown_id' && i.modelId === 'gpt-4o'));
});

test('catalog-defaults.json: byOperation values are canonical with existing ops (D7)', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const cfg = loadCatalogDefaults();
  const registry = loadOperationRegistry();
  const issues = validateCatalogDefaults(cfg, { index, dispositions: doc, registry, strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues, null, 2));
  assert.equal(cfg.byOperation.text_to_video, 'seedance-2-0-fast');
  assert.equal(cfg.byOperation.text_to_image, 'gpt-image-2');
});

test('negative: catalog defaults pointing at a non-canonical id fails (D7)', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const registry = loadOperationRegistry();
  const bad = { version: '1.0.0', byOperation: { text_to_image: 'whisper-1' } };
  const issues = validateCatalogDefaults(bad, { index, dispositions: doc, registry, strict: true });
  assert.ok(issues.some((i) => i.code === 'defaults_unknown' && i.level === 'error'));
});

test('shape errors are always error-level (audit also fails)', () => {
  const issues = validateDispositionsShape({ version: '1.0.0', dispositions: [{ id: 'x' }] });
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.level === 'error' && i.code === 'disposition_invalid'));
});

test('cordis cross-refs: every composer id resolves to a contract canonical/alias', () => {
  const index = freshIndex();
  const resolveModelId = (idx, id) => {
    if (idx.get(id)) return id;
    for (const m of idx.all()) {
      if ((m.aliases ?? []).includes(id)) return m.id;
    }
    return undefined;
  };
  const cordisIds = collectCordisModelIds();
  assert.ok(cordisIds.length >= 11, `expected cordis composer ids, got ${cordisIds.length}`);
  const issues = validateCordisCrossRefs(cordisIds, index, resolveModelId, { strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues, null, 2));
});

test('negative: cordis ghost id fails cordis_unresolvable_model under strict', () => {
  const index = freshIndex();
  const resolveModelId = (idx, id) => (idx.get(id) ? id : undefined);
  const issues = validateCordisCrossRefs(['ghost-model-9'], index, resolveModelId, { strict: true });
  assert.ok(issues.some((i) => i.code === 'cordis_unresolvable_model' && i.level === 'error'));
});

test('verified ops on real specs carry docUrl + verifiedAt (dated evidence)', () => {
  const index = freshIndex();
  assert.deepEqual(verifiedEvidenceIssues(index, { strict: true }), []);
  const fakeIndex = {
    all: () => [
      {
        id: 'm1',
        operations: [{ id: 'chat', research: { status: 'verified', docUrl: 'docs/evidence/x.md' } }],
      },
    ],
  };
  const issues = verifiedEvidenceIssues(fakeIndex, { strict: true });
  assert.ok(issues.some((i) => i.code === 'evidence_missing_for_verified' && i.level === 'error'));
});

test('dispositions path constant points at the on-disk machine truth', () => {
  assert.ok(DEFAULT_DISPOSITIONS_PATH.endsWith('dispositions.json'));
});
