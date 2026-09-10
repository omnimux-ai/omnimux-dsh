import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRuntimeModelIds,
  diffCoverage,
  coverageIssues,
} from './coverage.js';
import { loadAll, resetContractCache, DEFAULT_SPECS_DIR } from './load.js';
import { verifyContracts } from './index.js';
import { loadDispositions } from './dispositions.js';

test('collectRuntimeModelIds returns the 69-id universe (contracts + wire aliases)', () => {
  resetContractCache();
  const ids = collectRuntimeModelIds();
  assert.equal(ids.length, 69, `expected 69 runtime ids, got ${ids.length}`);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
  assert.ok(ids.includes('whisper-1'));
  assert.ok(ids.includes('kling-avatar'));
  assert.ok(ids.includes('nanobanana-2')); // wire alias of nano_banana_2
  assert.ok(ids.includes('nano_banana_2'));
  assert.ok(ids.includes('omni_flash')); // quarantine placeholder contract
  assert.ok(ids.includes('minimax-h3'));
  assert.ok(ids.includes('MiniMax-H3')); // APIMart case-sensitive wire id
});

test('coverage report: extra=0; missing only alias ids; listedOperations non-empty with evidence', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const runtimeIds = collectRuntimeModelIds(index);
  const cov = diffCoverage(runtimeIds, index);
  assert.deepEqual(cov.extraInYaml, []);
  // Only alias ids legitimately miss a model.id row
  assert.deepEqual(cov.missingInYaml, [
    'doubao-seed-audio-1.0',
    'gpt-image-2-5',
    'grok-imagine-image',
    'grok-imagine-image-2-0',
    'grok-imagine-image-2.0',
    'grok-imagine-video-1.5',
    'h3-max',
    'h3-max-turbo',
    'MiniMax-H3',
    'minimax/h3-max',
    'minimax/h3-max-turbo',
    'nanobanana-2',
    'nanobanana-pro',
    'seed-audio',
    'seedance-2.0',
    'seedance-2.0-fast',
    'seedance-2.0-mini',
    'seedance-2.5',
    'seedasr-auc',
    'wan3.0-video',
  ]);
  assert.ok(cov.contractIds.includes('kling-avatar'));
  assert.ok(cov.contractIds.includes('whisper-1'));
  assert.ok(cov.listedOperationCount > 0, 'H2 lists evidence-backed ops');
  assert.ok(cov.listedOperations.includes('seedance-2-0-fast#text_to_video'));
  assert.ok(cov.listedOperations.includes('gpt-image-2#text_to_image'));
  assert.ok(cov.listedOperations.includes('gpt-image-2.5#text_to_image'));
  assert.ok(cov.listedOperations.includes('grok-imagine-image-2#text_to_image'));

  // alias missing rows produce no issues; strict has zero coverage errors
  const dispositions = loadDispositions();
  const strictIssues = coverageIssues(cov, { strict: true, dispositions });
  assert.deepEqual(strictIssues, []);
  const auditIssues = coverageIssues(cov, { strict: false, dispositions });
  assert.deepEqual(auditIssues, []);
});

test('negative: canonical-disposition missing contract is a strict coverage error', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const cov = diffCoverage([...collectRuntimeModelIds(index), 'ghost-runtime-9'], index);
  const dispositions = loadDispositions();
  const strictIssues = coverageIssues(cov, { strict: true, dispositions });
  assert.ok(
    strictIssues.some(
      (i) => i.code === 'coverage_missing' && i.modelId === 'ghost-runtime-9' && i.level === 'error',
    ),
  );
  const auditIssues = coverageIssues(cov, { strict: false, dispositions });
  assert.ok(auditIssues.some((i) => i.code === 'coverage_missing' && i.level === 'warning'));
});

test('verifyContracts: audit ok; strict ok once 69 dispositions resolve', () => {
  const audit = verifyContracts({ strict: false });
  assert.equal(audit.ok, true, JSON.stringify(audit.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.admission.errorCount, 0);

  const strict = verifyContracts({ strict: true });
  assert.equal(strict.ok, true, JSON.stringify(strict.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(strict.exitCode, 0);
  assert.equal(strict.admission.errorCount, 0, 'strict must not invent admission errors');
  assert.equal(strict.dispositions.total, 69);
  assert.deepEqual(strict.dispositions.unresolvedDispositions, []);
  assert.deepEqual(strict.coverage.extraInYaml, []);
  assert.ok(strict.listedOperations.length > 0);
  // forbidden-listed models never expose listed operations
  for (const id of strict.dispositions.forbiddenListed) {
    assert.ok(!strict.listedOperations.some((key) => key.startsWith(`${id}#`)), id);
  }
});

test('whisper-1 and kling-avatar not listed in real specs', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const w = index.get('whisper-1');
  assert.ok(w);
  assert.equal(w.listed, false);
  assert.equal(w.operations[0].listed, false);
  assert.equal(w.operations[0].id, 'speech_to_text');
  assert.equal(w.operations[0].output.type, 'text');
  assert.equal(w.operations[0].execution.status, 'none');

  const avatar = index.get('kling-avatar');
  assert.ok(avatar);
  assert.equal(avatar.listed, false);
  assert.equal(avatar.operations[0].id, 'digital_human');
  assert.equal(avatar.operations[0].listed, false);
  assert.ok(!avatar.operations.map((o) => o.id).includes('first_last_frame'));
});
