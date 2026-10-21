/**
 * #3289 3D 导演台验收入口契约。
 *
 * 真实浏览器旅程由 `scripts/director-acceptance-3289.mjs` 执行（fresh task-source
 * 安装 + ego 浏览器 + 独立 ffmpeg 解码）。本用例只锁定入口契约，防止收尾时
 * 把 canvas 级任务从 task-source 装配中移除或把验收脚本改回旧 bootstrap API。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTaskPlugins } from '../../scripts/test-env-bootstrap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = join(root, 'scripts', 'director-acceptance-3289.mjs');

test('director acceptance harness keeps the fresh task-source installation contract', () => {
  const source = readFileSync(runner, 'utf8');
  assert.equal(source.includes("startTestEnvironment"), true, 'runner must start the task-private app');
  assert.equal(source.includes("task-source-installed"), true, 'runner must assert installed-loaded evidence level');
  assert.equal(source.includes("DIRECTOR_FFMPEG"), true, 'runner must decode media with an independent decoder');
  assert.deepEqual(normalizeTaskPlugins(['omnimux-workflow', 'omnimux-automation']), ['omnimux', 'omnimux-automation', 'omnimux-workflow']);
  assert.throws(() => normalizeTaskPlugins(['omnimux-video']), { code: 'TEST_ENV_OPTIONS' });
});
