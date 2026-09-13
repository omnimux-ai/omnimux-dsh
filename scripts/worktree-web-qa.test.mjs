import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assertPng,
  findChromePath,
  runWorktreeWebQa,
  selectStages,
  STAGE_CONFIG,
} from './worktree-web-qa.mjs';

test('worktree-web-qa: selectStages handles valid and invalid inputs', () => {
  const allStages = selectStages('all');
  assert.deepEqual(allStages, Object.keys(STAGE_CONFIG));

  const single = selectStages('accounts');
  assert.deepEqual(single, ['accounts']);

  assert.throws(() => selectStages('invalid-stage'), /未知 Stage/);
});

test('worktree-web-qa: findChromePath locates an existing browser binary', () => {
  const bin = findChromePath();
  assert.ok(typeof bin === 'string' && bin.length > 0);
  assert.ok(existsSync(bin), `Chrome binary does not exist at ${bin}`);
});

test('worktree-web-qa: assertPng verifies valid and invalid PNG payloads', () => {
  assert.throws(() => assertPng(Buffer.from('short')), /截图 PNG 数据为空/);
  assert.throws(() => assertPng(Buffer.alloc(40)), /截图 PNG 解码失败/);
});

test('worktree-web-qa: end-to-end execution on accounts stage in worktree', async () => {
  const report = await runWorktreeWebQa('accounts');
  assert.equal(report.pass, true, `Expected pass, got errors: ${report.errors.join('; ')}`);
  assert.ok(report.serverPort > 0, 'Server port must be valid dynamic port');
  assert.ok(report.cdpPort > 0, 'CDP port must be valid dynamic port');
  assert.ok(report.screenshot?.path && existsSync(report.screenshot.path), 'Screenshot file must exist');

  const pngBytes = readFileSync(report.screenshot.path);
  const dimensions = assertPng(pngBytes);
  assert.equal(dimensions.width, 1280);
  assert.ok(dimensions.height > 0);

  const stageAssert = report.assertions.find((a) => a.name === 'stage-content-rendered');
  assert.ok(stageAssert && stageAssert.pass, 'Stage content assertion must pass');
});
