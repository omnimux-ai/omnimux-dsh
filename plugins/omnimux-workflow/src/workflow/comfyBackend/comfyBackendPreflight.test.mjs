import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveComfyBackendTarget, versionMatches } from './plan.ts';
import {
  checkDriver,
  estimateRequiredBytes,
  failureAction,
  failureMessageKey,
  runPreflight,
} from './preflight.ts';
import {
  EMPTY_SETTINGS,
  modelsConfigYaml,
  parseSettings,
  resolveInstallRoot,
  validateDirectory,
} from './settings.ts';

const DARWIN = resolveComfyBackendTarget('darwin', 'arm64').target;

test('预检全通过时 ok，且给出需求体积与驱动结论', () => {
  const result = runPreflight({
    target: DARWIN,
    writable: true,
    freeBytes: 50_000_000_000,
    portFree: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.requiredBytes, estimateRequiredBytes(DARWIN));
  assert.equal(result.driver, 'not-required');
  assert.equal(result.backendAlreadyRunning, false);
});

test('四类失败各自可识别：平台 / 目录 / 磁盘 / 端口', () => {
  const noTarget = runPreflight({ target: null, writable: true, freeBytes: null, portFree: true });
  assert.deepEqual(noTarget.failures, ['unsupported-platform']);

  const readOnly = runPreflight({ target: DARWIN, writable: false, freeBytes: 10_000_000_000, portFree: true });
  assert.deepEqual(readOnly.failures, ['install-dir-not-writable']);

  const noSpace = runPreflight({ target: DARWIN, writable: true, freeBytes: 1024, portFree: true });
  assert.deepEqual(noSpace.failures, ['insufficient-disk']);

  const busyPort = runPreflight({ target: DARWIN, writable: true, freeBytes: 10_000_000_000, portFree: false });
  assert.deepEqual(busyPort.failures, ['port-occupied']);
});

test('端口被我们自己的后端占着不算失败（是「已在跑」）', () => {
  const result = runPreflight({
    target: DARWIN,
    writable: true,
    freeBytes: 10_000_000_000,
    portFree: false,
    portOwnedByBackend: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.backendAlreadyRunning, true);
  assert.deepEqual(result.failures, []);
});

test('可用空间探测不到时不阻断（freeBytes=null）', () => {
  const result = runPreflight({ target: DARWIN, writable: true, freeBytes: null, portFree: true });
  assert.equal(result.ok, true);
});

test('驱动：mac arm64 明确「不需要」，其它平台 unknown 而不是假装通过', () => {
  assert.equal(checkDriver(DARWIN), 'not-required');
  const linux = resolveComfyBackendTarget('linux', 'x64');
  assert.equal(linux.ok, false);
});

test('失败码有文案键与下一步动作，覆盖全部码', () => {
  assert.equal(failureMessageKey('insufficient-disk'), 'comfyPage.failure.insufficient-disk');
  assert.equal(failureAction('insufficient-disk'), 'choose-dir');
  assert.equal(failureAction('install-dir-not-writable'), 'choose-dir');
  assert.equal(failureAction('version-mismatch'), 'update');
  assert.equal(failureAction('start-timeout'), 'retry-start');
  assert.equal(failureAction('install-failed'), 'retry-install');
  assert.equal(failureAction('port-occupied'), 'retry-install');
  assert.equal(failureAction('unsupported-platform'), 'none');
});

test('版本比对：commit/python/torch 任一不符即需更新', () => {
  const good = { comfyui: { commit: DARWIN.comfyui.commit }, python: DARWIN.python.version, torch: DARWIN.torch.version };
  assert.equal(versionMatches(good, DARWIN), true);
  assert.equal(versionMatches({ comfyui: { commit: 'deadbeef' } }, DARWIN), false);
  assert.equal(versionMatches({ comfyui: { commit: DARWIN.comfyui.commit }, python: '3.11.0' }, DARWIN), false);
  assert.equal(versionMatches({ comfyui: { commit: DARWIN.comfyui.commit }, torch: '2.8.0' }, DARWIN), false);
  assert.equal(versionMatches(null, DARWIN), false);
});

test('目录校验：相对路径 / 不存在 / 不是目录 / 不可写 / 与安装根相同都被拒', () => {
  assert.equal(validateDirectory({ path: 'relative/dir', exists: true, isDirectory: true, writable: true }).code, 'not-absolute');
  assert.equal(validateDirectory({ path: '/nope', exists: false, isDirectory: false, writable: false }).code, 'not-found');
  assert.equal(validateDirectory({ path: '/file', exists: true, isDirectory: false, writable: true }).code, 'not-a-directory');
  assert.equal(validateDirectory({ path: '/ro', exists: true, isDirectory: true, writable: false }).code, 'not-writable');
  assert.equal(
    validateDirectory({ path: '/same', exists: true, isDirectory: true, writable: true, installRoot: '/same' }).code,
    'same-as-install-root',
  );
  const ok = validateDirectory({ path: '/models', exists: true, isDirectory: true, writable: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.path, '/models');
});

test('设置解析与安装根：坏文件回落默认值，用户值优先', () => {
  assert.deepEqual(parseSettings(null), EMPTY_SETTINGS);
  assert.deepEqual(parseSettings('not json'), EMPTY_SETTINGS);
  assert.deepEqual(parseSettings('{"installRoot":"/data","modelsPath":"/models"}'), { installRoot: '/data', modelsPath: '/models' });
  assert.deepEqual(parseSettings('{"installRoot":123}'), EMPTY_SETTINGS);
  assert.equal(resolveInstallRoot('/root', EMPTY_SETTINGS), '/root/comfyui-backend');
  assert.equal(resolveInstallRoot('/root', { installRoot: '/custom/backend', modelsPath: '' }), '/custom/backend');
});

test('模型目录 YAML：空目录不给配置，非空只指向用户目录（不复制文件）', () => {
  assert.equal(modelsConfigYaml(''), '');
  const yaml = modelsConfigYaml('/Users/me/models');
  assert.equal(yaml.includes('/Users/me/models'), true);
  assert.equal(yaml.includes('base_path:'), true);
  assert.equal(yaml.includes('cp '), false);
});
