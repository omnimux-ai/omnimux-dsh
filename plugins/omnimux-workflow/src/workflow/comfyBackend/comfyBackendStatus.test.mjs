import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createComfyBackendService } from './service.ts';
import { resolveComfyBackendTarget } from './plan.ts';

/**
 * 固定目标：CI 跑在 Linux 上，本机目标解析会失败（target=null），
 * 而本文件断言的是状态机而不是平台探测，所以显式喂一个确定目标。
 */
const FIXED_TARGET = resolveComfyBackendTarget('darwin', 'arm64').target;

/** 造一个临时安装根并写入指定的状态文件，返回 service 与清理函数。 */
function withRoot(state) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'comfy-status-'));
  const root = join(dataRoot, 'comfyui-backend');
  mkdirSync(join(root, 'logs'), { recursive: true });
  if (state) writeFileSync(join(root, 'install-state.json'), JSON.stringify(state));
  const service = createComfyBackendService({ dataRoot, target: FIXED_TARGET });
  return { service, root, dataRoot };
}

test('failed 状态粘住：安装失败的原因不被洗成「未安装」', async () => {
  const { service, root, dataRoot } = withRoot({
    state: 'failed',
    stage: null,
    percent: 0,
    message: '安装失败',
    error: 'install-failed',
    pid: null,
    updatedAt: 1,
  });
  const status = await service.status();
  assert.equal(status.state, 'failed');
  assert.equal(status.error, 'install-failed');
  assert.equal(status.message, '安装失败');
  assert.equal(status.installRoot, root);
  // 再读一次仍应是 failed（不是被下一次读取改写）
  assert.equal((await service.status()).state, 'failed');
  rmSync(dataRoot, { recursive: true, force: true });
});

test('启动超时的 failed 也粘住（.ready 存在与否都不改写）', async () => {
  const { service, root, dataRoot } = withRoot({
    state: 'failed',
    stage: null,
    percent: 100,
    message: '启动超时，请看后端日志',
    error: 'start-timeout',
    pid: 999999,
    updatedAt: 2,
  });
  writeFileSync(join(root, '.ready'), JSON.stringify({ target: 'darwin-arm64' }));
  const status = await service.status();
  assert.equal(status.state, 'failed');
  assert.equal(status.error, 'start-timeout');
  rmSync(dataRoot, { recursive: true, force: true });
});

test('installing 但本进程没在装 → 降级为可重试的未安装', async () => {
  const { service, dataRoot } = withRoot({
    state: 'installing',
    stage: 'requirements',
    percent: 70,
    message: '安装 ComfyUI 依赖',
    error: null,
    pid: null,
    updatedAt: 3,
  });
  const status = await service.status();
  assert.equal(status.state, 'not-installed');
  assert.equal(status.message, '上次安装未完成，可重试');
  assert.equal(status.percent, 0);
  rmSync(dataRoot, { recursive: true, force: true });
});

test('没有状态文件时是干净的 not-installed，且带安装根', async () => {
  const { service, root, dataRoot } = withRoot(null);
  const status = await service.status();
  assert.equal(status.state, 'not-installed');
  assert.equal(status.error, null);
  assert.equal(status.installRoot, root);
  assert.equal(status.target.platform, 'darwin');
  rmSync(dataRoot, { recursive: true, force: true });
});
