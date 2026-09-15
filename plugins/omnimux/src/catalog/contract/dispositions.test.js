/**
 * Dispositions registry tests (H2 + phase-one video): 75-row lock, shape validation, D1-D7
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

test('dispositions.json: exactly 78 rows, unique ids, all kinds valid, reasons present', () => {
  resetDispositionsCache();
  const doc = loadDispositions();
  assert.equal(validateDispositionsShape(doc).length, 0);
  const rows = doc.dispositions;
  assert.equal(rows.length, 78, `expected 78 disposition rows, got ${rows.length}`);
  const ids = new Set(rows.map((r) => r.id));
  assert.equal(ids.size, 78);
  for (const row of rows) {
    assert.ok(DISPOSITION_KINDS.includes(row.disposition), row.id);
    assert.ok(typeof row.reason === 'string' && row.reason.trim(), row.id);
  }
});

test('78 disposition rows mirror the runtime universe exactly (no missing, no ghost)', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  assert.equal(runtimeIds.length, 66);
  const issues = validateDispositions(doc, { index, runtimeIds, strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues, null, 2));
});

test('seedasr-auc is an independent canonical row that neither alias nor id unifies with doubao-asr-bigmodel', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  // #1789: canonical in its own right — #1751 removed the wrong alias, #1789 registers the model.
  assert.equal(resolveDisposition(doc, 'seedasr-auc')?.disposition, 'canonical');
  assert.equal(resolveDisposition(doc, 'seedasr-auc')?.target, undefined);
  assert.equal(resolveDisposition(doc, 'doubao-asr-bigmodel')?.disposition, 'canonical');
  assert.equal(resolveDisposition(doc, 'doubao-asr-bigmodel')?.target, undefined);
  // Neither direction of unification may exist: no alias row, no aliases[] entry either way.
  assert.deepEqual(index.get('seedasr-auc')?.aliases ?? [], []);
  assert.deepEqual(index.get('doubao-asr-bigmodel')?.aliases ?? [], []);
  assert.equal(index.get('seedasr-auc')?.listed, true);
  assert.deepEqual(index.get('seedasr-auc')?.listedOperations, ['seedasr-auc#speech_to_text']);
});

test('locked dispositions: draft-probeable / tombstones / un-quarantined / alias / Batch A canonical', () => {
  const doc = loadDispositions();
  // #538: seams mounted and probeable but unprobed → draft; listed stays empty until #530
  assert.equal(resolveDisposition(doc, 'whisper-1')?.disposition, 'draft');
  // #1751: the removed models keep a tombstone row instead of a shelf entry.
  assert.equal(resolveDisposition(doc, 'kling-avatar')?.disposition, 'unavailable');
  assert.equal(resolveDisposition(doc, 'gpt-image-2')?.disposition, 'unavailable');
  assert.equal(resolveDisposition(doc, 'minimax-h3')?.disposition, 'canonical');
  // #1751: quarantine is fully retired — kling-o3 / kling-v3-motion-control were un-quarantined
  // as canonical (upstream-registered), while omni_flash / kling-o1 were removed outright.
  assert.deepEqual(
    doc.dispositions.filter((r) => r.disposition === 'quarantine'),
    [],
    'no quarantine rows survive the 2026-09-14 reconciliation',
  );
  for (const id of ['omni_flash', 'kling-o1']) {
    assert.equal(resolveDisposition(doc, id)?.disposition, 'unavailable', id);
  }
  for (const id of ['kling-o3', 'kling-v3-motion-control']) {
    assert.equal(resolveDisposition(doc, id)?.disposition, 'canonical', id);
  }
  assert.deepEqual(
    [resolveDisposition(doc, 'nanobanana-2'), resolveDisposition(doc, 'nanobanana-pro')].map((r) => [
      r?.disposition,
      r?.target,
    ]),
    [
      ['alias', 'nano-banana-2'],
      ['alias', 'nano-banana-pro'],
    ],
  );
  // 2026-09-14：gpt-image 高清型号旧写法彻底退出（上游声明旧 ID 不再接受、不是兼容别名），
  // 既没有契约行也没有别名行。
  assert.equal(resolveDisposition(doc, 'gpt-image-2-hd'), undefined);
  assert.equal(resolveDisposition(doc, 'gpt-image2-hd'), undefined);
  assert.equal(resolveDisposition(doc, 'gpt-image-2.5-hd')?.disposition, 'canonical');
  // 2026-09-14（评审次要-2）：`gpt-image-2-5` 拼写与上面两个旧写法同源同口径 —— 上游 2026-09-10
  // 变更日志明写「也不支持 gpt-image-2-5 拼写」，故本仓不再登记为别名行。
  assert.equal(resolveDisposition(doc, 'gpt-image-2-5'), undefined);
  assert.equal(runtimeIdsOf(freshIndex()).includes('gpt-image-2-5'), false, 'gpt-image-2-5 must leave the runtime universe');
  // Batch A canonical rows: #1751 shrank the set — grok-imagine-image-2 became an alias, so the
  // renamed grok contract inherits the slot alongside seedance-2-0-fast.
  assert.deepEqual(
    doc.dispositions
      .filter((r) => r.batch === 'A')
      .map((r) => [r.id, r.disposition])
      .sort(),
    [
      ['grok-imagine-image-2-0', 'canonical'],
      ['seedance-2-0-fast', 'canonical'],
    ],
  );
  const fast = resolveDisposition(doc, 'seedance-2-0-fast');
  assert.ok(Array.isArray(fast?.evidence) && fast.evidence.length > 0, 'seedance-2-0-fast must cite dated evidence');
  // The grok contract deliberately carries no evidence[]: its dated live proof predates three
  // upstream changes, so the row documents the withdrawal in notes instead of re-citing it.
  const grok = resolveDisposition(doc, 'grok-imagine-image-2-0');
  assert.equal(grok?.evidence, undefined);
  assert.match(grok?.notes ?? '', /2026-08-16-omnimux-image\.md/);
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
  assert.ok(index.get('nano-banana-2')?.aliases?.includes('nanobanana-2'));
  assert.ok(index.get('nano-banana-pro')?.aliases?.includes('nanobanana-pro'));
  // #1751 rename: the underscore spelling is no longer a contract id, only an alias of the
  // upstream hyphen canonical.
  assert.equal(index.get('nano_banana_2'), undefined);
  assert.equal(index.get('nano_banana_pro'), undefined);
  assert.ok(index.get('nano-banana-2')?.aliases?.includes('nano_banana_2'));
  assert.ok(index.get('nano-banana-pro')?.aliases?.includes('nano_banana_pro'));
  const doc = loadDispositions();
  for (const alias of ['grok-imagine-image', 'grok-imagine-image-2', 'grok-imagine-image-2.0']) {
    assert.equal(index.get(alias), undefined);
    assert.ok(index.get('grok-imagine-image-2-0')?.aliases?.includes(alias));
    const row = resolveDisposition(doc, alias);
    assert.equal(row?.disposition, 'alias');
    assert.equal(row?.target, 'grok-imagine-image-2-0');
  }
  // #1751: the four upstream MiniMax line names that c8d134c4f demoted to model_mapping
  // targets stay accepted and route to the h3 family, so each is an alias row + YAML alias.
  for (const alias of ['minimax/h3-max', 'h3-max', 'minimax/h3-max-turbo', 'h3-max-turbo']) {
    assert.equal(index.get(alias), undefined, alias);
    assert.ok(index.get('minimax-h3')?.aliases?.includes(alias), `${alias} must be a minimax-h3 alias`);
    const row = resolveDisposition(doc, alias);
    assert.equal(row?.disposition, 'alias', alias);
    assert.equal(row?.target, 'minimax-h3', alias);
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

/**
 * #1751 regression lock for the D5 tombstone exemption: the removed 12 models lost their YAML
 * rows by design, so their `unavailable` disposition rows necessarily sit outside the runtime
 * universe. D5 must skip those, while still catching invented/typo ids for every other kind.
 */
test('D5 tombstone exemption: unavailable/deprecated ghosts are skipped, other kinds still error', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const runtimeIds = runtimeIdsOf(index);
  const ghost = 'ghost-tombstone-9';
  assert.equal(runtimeIds.includes(ghost), false, 'fixture id must be outside the runtime universe');
  const withRow = (disposition) => ({
    ...doc,
    dispositions: [
      ...doc.dispositions,
      { id: ghost, disposition, reason: `D5 exemption fixture (${disposition})` },
    ],
  });
  const d5Of = (disposition) =>
    validateDispositions(withRow(disposition), { index, runtimeIds, strict: true }).filter(
      (i) => i.code === 'disposition_unknown_id' && i.modelId === ghost,
    );

  // (1) positive: an unavailable tombstone row is exempt from D5.
  assert.deepEqual(d5Of('unavailable'), []);
  // (3) set boundary: deprecated belongs to the same exemption set.
  assert.deepEqual(d5Of('deprecated'), []);

  // (2) negative: the exemption must not swallow the anti-typo purpose of D5.
  for (const disposition of ['canonical', 'draft']) {
    const hits = d5Of(disposition);
    assert.equal(hits.length, 1, `${disposition} ghost row must still trip D5`);
    assert.equal(hits[0].level, 'error');
    assert.equal(hits[0].modelId, ghost);
  }

  // (3) set boundary: quarantine is NOT a tombstone and stays inside the runtime universe.
  const quarantineHits = d5Of('quarantine');
  assert.equal(quarantineHits.length, 1, 'quarantine is not exempt from D5');
  assert.equal(quarantineHits[0].level, 'error');
  assert.equal(quarantineHits[0].modelId, ghost);
});

test('catalog-defaults.json: byOperation values are canonical with existing ops (D7)', () => {
  const index = freshIndex();
  const doc = loadDispositions();
  const cfg = loadCatalogDefaults();
  const registry = loadOperationRegistry();
  const issues = validateCatalogDefaults(cfg, { index, dispositions: doc, registry, strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues, null, 2));
  assert.equal(cfg.byOperation.text_to_video, 'seedance-2-0-fast');
  assert.equal(cfg.byOperation.text_to_image, 'gpt-image-2.5');
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

/**
 * #1751 independent-review fix (P1-1): the D5 tombstone exemption lets an `unavailable` id sit
 * outside the runtime universe, so a MISSPELLED or invented tombstone id would pass strict mode
 * unnoticed (the reviewer reproduced this with a synthetic id). Pin the exact tombstone set: any
 * new, renamed, or typo'd `unavailable` row now fails here instead of slipping through D5.
 */
test('tombstone whitelist: exactly the 12 removed models are unavailable, no typos or ghosts', () => {
  const doc = loadDispositions();
  const tombstones = doc.dispositions
    .filter((row) => row.disposition === 'unavailable')
    .map((row) => row.id)
    .sort();
  assert.deepEqual(tombstones, [
    'gpt-image-2',
    'kling-avatar',
    'kling-o1',
    'midjourney',
    'midjourney-niji-7',
    'minimax-h3-max',
    'minimax-h3-max-turbo',
    'omni_flash',
    'seedance2.5-stable-max-720p',
    'seedream-4.5',
    'veo-3.1',
    'veo-3.1-fast',
  ]);
  // 这 12 个 id 必须都不在 runtime 宇宙内（YAML 整行已删），且都被 D4 列为禁止 listed。
  const index = freshIndex();
  const runtimeIds = runtimeIdsOf(index);
  const forbidden = forbiddenListedIds(doc);
  for (const id of tombstones) {
    assert.equal(runtimeIds.includes(id), false, `${id} must not be a runtime id`);
    assert.equal(forbidden.has(id), true, `${id} must be forbidden-listed`);
  }
  // deprecated 与 unavailable 同属豁免集，但仓内不得出现 deprecated 行（防止悄悄换 kind 绕过白名单）。
  assert.deepEqual(doc.dispositions.filter((row) => row.disposition === 'deprecated'), []);
});
