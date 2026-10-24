import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_NVIDIA_DRIVER_CUDA12,
  MIN_NVIDIA_DRIVER_CUDA13,
  listComfyBackendTargets,
  resolveComfyBackendTarget,
  resolveLocalComfyBackendTarget,
  versionMatches,
} from './plan.ts';
import { checkDriver, compareVersions } from './driver.ts';
import { failureAction, runPreflight } from './preflight.ts';
import { createComfyBackendService } from './service.ts';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSettings } from './settings.ts';

const DARWIN = resolveComfyBackendTarget('darwin', 'arm64').target;
const WIN12 = resolveComfyBackendTarget('win32', 'x64', 'win32-x64-cuda12').target;
const WIN13 = resolveComfyBackendTarget('win32', 'x64', 'win32-x64-cuda13').target;
const WIN_AMD = resolveComfyBackendTarget('win32', 'x64', 'win32-x64-amd-directml').target;

test('矩阵：六个方案都在，支持度与 pin 完整', () => {
  const rows = listComfyBackendTargets();
  assert.equal(rows.length, 6);
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, 6);
  assert.deepEqual(
    rows.filter((row) => row.support === 'supported').map((row) => row.id),
    ['darwin-arm64'],
  );
  assert.deepEqual(
    rows.map((row) => row.variant),
    ['darwin-arm64', 'win32-x64-cuda12', 'win32-x64-cuda13', 'win32-x64-amd-directml', 'win32-x64-intel-xpu', 'linux-x64-cuda12'],
  );
  for (const row of rows) {
    assert.equal(row.estimatedBytes > 0, true, row.id);
    assert.equal(row.notes.length > 0, true, row.id);
  }
  // 每个方案的每个 wheel 都要有 URL 与 sha256（候选方案也不许留空 pin）
  const resolved = [
    resolveComfyBackendTarget('darwin', 'arm64').target,
    WIN12,
    WIN13,
    WIN_AMD,
    resolveComfyBackendTarget('win32', 'x64', 'win32-x64-intel-xpu').target,
    resolveComfyBackendTarget('linux', 'x64').target,
  ];
  for (const target of resolved) {
    assert.match(target.python.sha256, /^[0-9a-f]{64}$/, target.id);
    assert.equal(target.python.url.startsWith('https://'), true, target.id);
    assert.equal(target.torch.wheels.length > 0, true, target.id);
    for (const wheel of target.torch.wheels) {
      assert.match(wheel.sha256, /^[0-9a-f]{64}$/, `${target.id}/${wheel.wheel}`);
      assert.equal(wheel.url.startsWith('https://'), true, `${target.id}/${wheel.wheel}`);
      assert.equal(wheel.bytes > 0, true, `${target.id}/${wheel.wheel}`);
    }
  }
});

test('多候选平台必须显式选方案；单一候选自动选；未知平台拒绝', () => {
  const win = resolveComfyBackendTarget('win32', 'x64');
  assert.equal(win.ok, false);
  assert.equal(win.reason, 'variant-required');
  assert.equal((win.options ?? []).length, 4);

  const chosen = resolveComfyBackendTarget('win32', 'x64', 'win32-x64-cuda13');
  assert.equal(chosen.ok, true);
  assert.equal(chosen.target.id, 'win32-x64-cuda13');

  const bogus = resolveComfyBackendTarget('win32', 'x64', 'win32-x64-vulkan');
  assert.equal(bogus.ok, false);
  assert.equal(bogus.reason, 'unsupported-variant');

  const linux = resolveComfyBackendTarget('linux', 'x64');
  assert.equal(linux.ok, true);
  assert.equal(linux.target.id, 'linux-x64-cuda12');

  const mac = resolveLocalComfyBackendTarget('darwin', 'arm64');
  assert.equal(mac.ok, true);
  assert.equal(mac.target.support, 'supported');

  const unknown = resolveComfyBackendTarget('freebsd', 'x64');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unsupported-platform');
});

test('驱动：mac 明确「不需要」，NVIDIA 版本比对，探测不到就是 unknown', async () => {
  const mac = await checkDriver(DARWIN);
  assert.equal(mac.status, 'not-required');
  assert.equal(mac.detail.length > 0, true);

  const ok = await checkDriver(WIN13, { nvidiaDriverVersion: async () => '581.15' });
  assert.equal(ok.status, 'satisfied');
  assert.equal(ok.required, MIN_NVIDIA_DRIVER_CUDA13);

  const low = await checkDriver(WIN13, { nvidiaDriverVersion: async () => '576.02' });
  assert.equal(low.status, 'unsatisfied');
  assert.match(low.detail, /576\.02/);

  const cuda12 = await checkDriver(WIN12, { nvidiaDriverVersion: async () => '576.02' });
  assert.equal(cuda12.status, 'satisfied');
  assert.equal(cuda12.required, MIN_NVIDIA_DRIVER_CUDA12);

  const unknown = await checkDriver(WIN12, { nvidiaDriverVersion: async () => null });
  assert.equal(unknown.status, 'unknown');

  const noProbe = await checkDriver(WIN12);
  assert.equal(noProbe.status, 'unknown');

  const dml = await checkDriver(WIN_AMD, { directmlAvailable: async () => true });
  assert.equal(dml.status, 'satisfied');
  const dmlMissing = await checkDriver(WIN_AMD, { directmlAvailable: async () => false });
  assert.equal(dmlMissing.status, 'unsatisfied');
  const dmlUnknown = await checkDriver(WIN_AMD);
  assert.equal(dmlUnknown.status, 'unknown');
});

test('版本号比较：数字段比较，缺失段按 0', () => {
  assert.equal(compareVersions('581.15', '580.0'), 1);
  assert.equal(compareVersions('580', '580.0'), 0);
  assert.equal(compareVersions('576.02', '580.0'), -1);
  assert.equal(compareVersions('abc', '0'), 0);
});

test('预检：驱动不满足算失败并给「换方案」，unknown 不阻断', () => {
  const unsatisfied = runPreflight({
    target: WIN13,
    writable: true,
    freeBytes: 50_000_000_000,
    portFree: true,
    driverVerdict: { status: 'unsatisfied', detail: 'NVIDIA 驱动 576.02 低于该方案要求的 580.0', required: MIN_NVIDIA_DRIVER_CUDA13 },
  });
  assert.equal(unsatisfied.ok, false);
  assert.deepEqual(unsatisfied.failures, ['driver-unsatisfied']);
  assert.equal(unsatisfied.driver, 'unsatisfied');
  assert.equal(failureAction('driver-unsatisfied'), 'choose-variant');

  const unknown = runPreflight({
    target: WIN13,
    writable: true,
    freeBytes: 50_000_000_000,
    portFree: true,
    driverVerdict: { status: 'unknown', detail: '查不到 NVIDIA 驱动版本', required: MIN_NVIDIA_DRIVER_CUDA13 },
  });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.driver, 'unknown');
  assert.match(unknown.driverDetail, /查不到/);

  assert.equal(failureAction('variant-required'), 'choose-variant');
});

test('版本绑定：换方案也算不一致（cuda12 → cuda13 要重装）', () => {
  const ready12 = {
    variant: 'win32-x64-cuda12',
    comfyui: { commit: WIN12.comfyui.commit },
    python: WIN12.python.version,
    torch: WIN12.torch.version,
  };
  assert.equal(versionMatches(ready12, WIN12), true);
  assert.equal(versionMatches(ready12, WIN13), false);
  assert.equal(versionMatches({ variant: 'win32-x64-cuda13', comfyui: { commit: WIN13.comfyui.commit } }, WIN13), true);
  assert.equal(versionMatches(null, WIN13), false);
});

test('设置：variant 解析与坏值回落', () => {
  assert.equal(parseSettings('{"variant":"win32-x64-cuda13"}').variant, 'win32-x64-cuda13');
  assert.equal(parseSettings('{"variant":42}').variant, '');
  assert.equal(parseSettings(null).variant, '');
});

test('选了本平台没有的方案：状态如实报 unsupported-variant，不显示成「已装」', async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'comfy-m4-'));
  const root = join(dataRoot, 'comfyui-backend');
  mkdirSync(join(root, 'logs'), { recursive: true });
  // 假装装过（.ready 在，pin 与 darwin 方案一致），但用户选的方案在本平台不存在。
  writeFileSync(
    join(root, '.ready'),
    JSON.stringify({
      variant: 'darwin-arm64',
      comfyui: { commit: DARWIN.comfyui.commit },
      python: DARWIN.python.version,
      torch: DARWIN.torch.version,
    }),
  );
  const service = createComfyBackendService({ dataRoot, platform: 'darwin', arch: 'arm64' });
  const bad = service.updateSettings({ variant: 'win32-x64-cuda13' });
  assert.equal(bad.ok, true);
  assert.equal(bad.settings.variant, 'win32-x64-cuda13');
  const status = await service.status();
  assert.equal(status.state, 'failed');
  assert.equal(status.failure, 'unsupported-variant');
  assert.match(status.message, /不适用/);
  assert.equal(failureAction('unsupported-variant'), 'choose-variant');
  // 换回本机方案后恢复正常判定（.ready 的 variant 与本机方案一致 → 已装未启动）。
  const good = service.updateSettings({ variant: 'darwin-arm64' });
  assert.equal(good.ok, true);
  const back = await service.status();
  assert.equal(back.state, 'installed');
  assert.equal(back.failure, null);
  rmSync(dataRoot, { recursive: true, force: true });
});

test('多候选没选方案：状态报 variant-required（不猜也不显示成可用）', async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'comfy-m4b-'));
  const root = join(dataRoot, 'comfyui-backend');
  mkdirSync(join(root, 'logs'), { recursive: true });
  writeFileSync(join(root, '.ready'), JSON.stringify({ variant: 'win32-x64-cuda12' }));
  // 用 win32 平台构造 service（模拟 Windows 机器上没选方案）。
  const service = createComfyBackendService({ dataRoot, platform: 'win32', arch: 'x64' });
  const status = await service.status();
  assert.equal(status.state, 'failed');
  assert.equal(status.failure, 'variant-required');
  assert.equal(failureAction('variant-required'), 'choose-variant');
  rmSync(dataRoot, { recursive: true, force: true });
});
