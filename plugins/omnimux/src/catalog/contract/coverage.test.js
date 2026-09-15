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

test('collectRuntimeModelIds returns the 66-id universe (contracts + wire aliases)', () => {
  resetContractCache();
  const ids = collectRuntimeModelIds();
  assert.equal(ids.length, 66, `expected 66 runtime ids, got ${ids.length}`);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
  assert.ok(ids.includes('whisper-1'));
  assert.ok(ids.includes('gpt-image-2.5-flare'));
  assert.ok(ids.includes('gpt-image-2.5-sunburst'));
  assert.ok(ids.includes('nanobanana-2')); // wire alias of nano-banana-2
  assert.ok(ids.includes('nano_banana_2')); // pre-rename spelling, now an alias
  assert.ok(ids.includes('nano-banana-2')); // 2026-09-14 renamed canonical
  assert.ok(ids.includes('minimax-h3'));
  assert.ok(ids.includes('MiniMax-H3')); // APIMart case-sensitive wire id
  // 2026-09-14 #1751：上游 c8d134c4f 把 minimax/h3-max（及 turbo）移出 models、改列为
  // minimax-h3 的 model_mapping 目标 —— 这 4 个线路名仍被上游接受，故留在 runtime 宇宙内。
  for (const alias of ['minimax/h3-max', 'h3-max', 'minimax/h3-max-turbo', 'h3-max-turbo']) {
    assert.ok(ids.includes(alias), `${alias} must stay in the runtime universe`);
  }
  assert.ok(ids.includes('mj-v7'));
  assert.ok(ids.includes('mj-v8-1'));
  assert.ok(ids.includes('deepseek-v4-flash'));
  assert.ok(ids.includes('deepseek-v4-flash-vision-exp')); // legacy name kept as an alias
  // The 12 removed models and their dependent aliases left the universe entirely.
  for (const gone of [
    'gpt-image-2',
    'minimax-h3-max',
    'minimax-h3-max-turbo',
    'midjourney',
    'midjourney-7',
    'midjourney-8.1',
    'midjourney-niji-7',
    'seedream-4.5',
    'kling-o1',
    'seedance2.5-stable-max-720p',
    'omni_flash',
    'kling-avatar',
    'veo-3.1',
    'veo-3.1-fast',
    'gpt-image-2-hd',
    'gpt-image2-hd',
    // 2026-09-14 评审次要-2：上游声明「也不支持 gpt-image-2-5 拼写」，别名登记随之撤销。
    'gpt-image-2-5',
  ]) {
    assert.equal(ids.includes(gone), false, `${gone} must have left the runtime universe`);
  }
  // #1789：seedasr-auc 以独立 canonical 身份回到 runtime 宇宙（#1751 解除错误别名后曾整体退出）。
  for (const present of ['seedasr-auc', 'doubao-asr-bigmodel']) {
    assert.ok(ids.includes(present), `${present} must be in the runtime universe`);
  }
  assert.equal(ids.filter((id) => id === 'seedasr-auc').length, 1);
});

test('coverage report: extra=0; missing only alias ids; listedOperations non-empty with evidence', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const runtimeIds = collectRuntimeModelIds(index);
  const cov = diffCoverage(runtimeIds, index);
  assert.deepEqual(cov.extraInYaml, []);
  // Only alias ids legitimately miss a model.id row
  assert.deepEqual(cov.missingInYaml, [
    'deepseek-v4-flash-vision-exp',
    'doubao-seed-audio-1.0',
    'grok-imagine-image',
    'grok-imagine-image-2',
    'grok-imagine-image-2.0',
    'grok-imagine-video-1.5',
    'h3-max',
    'h3-max-turbo',
    'MiniMax-H3',
    'minimax/h3-max',
    'minimax/h3-max-turbo',
    'nano_banana_2',
    'nano_banana_pro',
    'nanobanana-2',
    'nanobanana-pro',
    'seed-audio',
    'seedance-2.0',
    'seedance-2.0-fast',
    'seedance-2.0-mini',
    'seedance-2.5',
    'seedream-5.0-pro',
    'wan-3.0-prime',
    'wan-3.0-prime-ref',
    'wan-3.0-ref',
    'wan3.0-video',
  ]);
  assert.equal(cov.contractIds.length, 41);
  assert.ok(cov.contractIds.includes('whisper-1'));
  assert.ok(cov.contractIds.includes('gpt-image-2.5-flare'));
  assert.ok(cov.contractIds.includes('gpt-image-2.5-sunburst'));
  assert.ok(cov.contractIds.includes('mj-v7'));
  assert.ok(cov.contractIds.includes('nano-banana-2'));
  assert.ok(cov.contractIds.includes('seedasr-auc'));
  // kling-avatar was removed upstream on 2026-09-14 (#1751) — it is no longer a contract.
  assert.equal(cov.contractIds.includes('kling-avatar'), false);
  assert.equal(cov.listedOperationCount, 58, 'H2 lists evidence-backed ops');
  assert.ok(cov.listedOperations.includes('seedance-2-0-fast#text_to_video'));
  assert.ok(cov.listedOperations.includes('gpt-image-2.5#text_to_image'));
  assert.ok(cov.listedOperations.includes('gpt-image-2.5-flare#text_to_image'));
  assert.ok(cov.listedOperations.includes('gpt-image-2.5-sunburst#text_to_image'));
  // #1789: both ASR models are listed independently; neither aliases the other.
  assert.ok(cov.listedOperations.includes('seedasr-auc#speech_to_text'));
  assert.ok(cov.listedOperations.includes('doubao-asr-bigmodel#speech_to_text'));
  // grok-imagine-image-2-0 was downgraded to "registered, not on shelf": no listed op at all.
  assert.equal(cov.listedOperations.includes('grok-imagine-image-2-0#text_to_image'), false);
  assert.equal(cov.listedOperations.some((key) => key.startsWith('grok-imagine-image-2-0#')), false);
  assert.equal(cov.listedOperations.includes('gpt-image-2#text_to_image'), false);

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

test('verifyContracts: audit ok; strict ok once 78 dispositions resolve', () => {
  const audit = verifyContracts({ strict: false });
  assert.equal(audit.ok, true, JSON.stringify(audit.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.admission.errorCount, 0);

  const strict = verifyContracts({ strict: true });
  assert.equal(strict.ok, true, JSON.stringify(strict.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(strict.exitCode, 0);
  assert.equal(strict.admission.errorCount, 0, 'strict must not invent admission errors');
  assert.equal(strict.dispositions.total, 78);
  assert.deepEqual(strict.dispositions.unresolvedDispositions, []);
  assert.deepEqual(strict.coverage.extraInYaml, []);
  assert.equal(strict.listedOperations.length, 58);
  // forbidden-listed models never expose listed operations
  assert.equal(strict.dispositions.forbiddenListed.length, 12);
  for (const id of strict.dispositions.forbiddenListed) {
    assert.ok(!strict.listedOperations.some((key) => key.startsWith(`${id}#`)), id);
  }
});

test('whisper-1 not listed in real specs; the removed kling-avatar has left the contract universe', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const w = index.get('whisper-1');
  assert.ok(w);
  assert.equal(w.listed, false);
  assert.equal(w.operations[0].listed, false);
  assert.equal(w.operations[0].id, 'speech_to_text');
  assert.equal(w.operations[0].output.type, 'text');
  assert.equal(w.operations[0].execution.status, 'none');

  // #1751: kling-avatar was removed upstream, so it is no longer a contract at all. Its
  // digital_human operation retired with it — no contracted model declares digital_human now.
  assert.equal(index.get('kling-avatar'), undefined);
  assert.deepEqual(
    index
      .all()
      .filter((m) => (m.operations ?? []).some((o) => o.id === 'digital_human'))
      .map((m) => m.id),
    [],
  );
});
