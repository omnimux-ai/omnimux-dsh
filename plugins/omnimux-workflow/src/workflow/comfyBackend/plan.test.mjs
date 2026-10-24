import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMFYUI_COMMIT,
  COMFYUI_TAG,
  COMFY_BACKEND_BASE_URL,
  COMFY_BACKEND_PORT,
  INSTALL_STAGES,
  PYTHON_VERSION,
  TORCH_VERSION,
  formatBytes,
  installPercent,
  nextState,
  resolveComfyBackendTarget,
  stageLabel,
} from './plan.ts';

test('mac arm64 命中固定目标：Python 3.12 + torch 2.9.1 + ComfyUI 固定 commit', () => {
  const result = resolveComfyBackendTarget('darwin', 'arm64');
  assert.equal(result.ok, true);
  assert.equal(result.target.id, 'darwin-arm64');
  assert.equal(result.target.python.version, PYTHON_VERSION);
  assert.equal(result.target.python.sha256.length, 64);
  assert.equal(result.target.torch.version, TORCH_VERSION);
  assert.equal(result.target.torch.wheel.includes('cp312'), true);
  assert.equal(result.target.torch.sha256.length, 64);
  assert.equal(result.target.comfyui.tag, COMFYUI_TAG);
  assert.equal(result.target.comfyui.commit, COMFYUI_COMMIT);
  assert.equal(result.target.comfyui.tarball.includes(COMFYUI_COMMIT), true);
  assert.equal(result.target.port, COMFY_BACKEND_PORT);
  assert.equal(COMFY_BACKEND_BASE_URL, 'http://127.0.0.1:18188');
  assert.equal(result.target.estimatedBytes > 0, true);
});

test('不支持的平台显式拒绝，不回退到别的平台产物', () => {
  const win = resolveComfyBackendTarget('win32', 'x64');
  assert.deepEqual(win, { ok: false, reason: 'unsupported-platform', platform: 'win32', arch: 'x64' });
  const linux = resolveComfyBackendTarget('linux', 'x64');
  assert.equal(linux.ok, false);
  const rosetta = resolveComfyBackendTarget('darwin', 'x64');
  assert.equal(rosetta.ok, false);
});

test('进度：阶段权重单调递增，done 恒为 100，越界被夹住', () => {
  assert.equal(installPercent('done'), 100);
  assert.equal(installPercent('runtime', 0), 0);
  assert.equal(installPercent('runtime', 1) > installPercent('runtime', 0), true);
  assert.equal(installPercent('torch', 1) > installPercent('venv', 1), true);
  assert.equal(installPercent('requirements', 1) <= 99, true);
  assert.equal(installPercent('requirements', 5), 99);
  assert.equal(installPercent('requirements', -3) >= installPercent('requirements', 0), true);
  assert.equal(installPercent('no-such-stage'), 0);
  assert.equal(installPercent(undefined), 0);
  // 权重之和为 1，保证 requirements 结束时能贴近 100 但不越过。
  const sum = INSTALL_STAGES.reduce((total, stage) => total + stage.weight, 0);
  assert.equal(Math.round(sum * 100), 100);
});

test('阶段文案：已知阶段给中文名，未知阶段不抛', () => {
  assert.equal(stageLabel('runtime'), '下载 Python 运行时');
  assert.equal(stageLabel('done'), '安装完成');
  assert.equal(stageLabel('nope'), '准备中');
  assert.equal(stageLabel(undefined), '准备中');
});

test('状态机只允许合法推进', () => {
  assert.equal(nextState('not-installed', 'install'), 'installing');
  assert.equal(nextState('not-installed', 'ready'), 'not-installed');
  assert.equal(nextState('installing', 'installed'), 'installed');
  assert.equal(nextState('installing', 'ready'), 'installing');
  assert.equal(nextState('installed', 'start'), 'starting');
  assert.equal(nextState('starting', 'ready'), 'ready');
  assert.equal(nextState('starting', 'installed'), 'starting');
  assert.equal(nextState('ready', 'installed'), 'installed');
  assert.equal(nextState('failed', 'install'), 'installing');
  assert.equal(nextState('ready', 'not-installed'), 'ready');
});

test('体积文案：GB/MB 两档，非法输入不抛', () => {
  assert.equal(formatBytes(0), '0 MB');
  assert.equal(formatBytes(Number.NaN), '0 MB');
  assert.equal(formatBytes(12 * 1024 * 1024), '12 MB');
  assert.equal(formatBytes(2.5 * 1024 * 1024 * 1024), '2.5 GB');
});
