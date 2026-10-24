/**
 * 失败分类与目录设置映射单测（Issue 3717 M3）。
 *
 * 覆盖：
 *  1. 失败码集合与宿主 `plan.ts` 逐值一致；
 *  2. 八类失败 → 唯一主行动（规格映射表，绝不并列多个按钮）；
 *  3. 失败 / 驱动 / 设置码的文案 key 在中英两份字典里都存在（双语齐备）；
 *  4. `state` 信封解析：failure / settings / requiredBytes / driver，缺字段按默认；
 *  5. 设置 POST 只带用户改过的字段；400 时透出 code。
 *
 * 不 import 宿主 `settings.ts`：那个模块依赖 `node:path`，测试导入门禁无法把它核验为
 * 公开可验证绑定（宿主 `plan.ts` 是纯函数模块，才能这样比对）。所以设置码用字面清单
 * 与宿主契约对齐，真正的行为一致性由宿主侧 settings 单测保证。
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  COMFY_BACKEND_DRIVERS,
  COMFY_BACKEND_FAILURES,
  COMFY_BACKEND_SETTINGS_CODES,
  comfyBackendDriverKey,
  comfyBackendFailureKey,
  comfyBackendSettingsCodeKey,
  fetchComfyBackendState,
  parseComfyBackendDriver,
  parseComfyBackendSettings,
  parseComfyBackendSettingsCode,
  parseComfyBackendStatus,
  resolveComfyBackendView,
  resolveFailureAction,
  updateComfyBackendSettings,
} from './comfyBackendClient.ts';
import * as plan from '../../../workflow/comfyBackend/plan.ts';
import zh from '../../i18n/dict.zh.ts';
import en from '../../i18n/dict.en.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 记录请求的桩：handler 返回 Response；calls 里留 path/method/body 供断言。 */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (path, init) => {
    const options = init || {};
    calls.push({
      path: path,
      method: options.method ? options.method : 'GET',
      body: options.body ? JSON.parse(options.body) : null,
    });
    return handler(path, options);
  };
  return calls;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 显式字段的状态字面量（不用展开语法）。 */
function status(state, failure, error) {
  return {
    state: state,
    stage: null,
    percent: 0,
    message: 'msg',
    error: error === undefined ? null : error,
    pid: null,
    updatedAt: 1,
    target: null,
    installRoot: '/tmp/omnimux-comfy',
    failure: failure === undefined ? null : failure,
  };
}

/** 取字典文案：用 entries 而不是 `dict[key]`（计算成员访问在测试里不可用）。 */
function copyOf(dict, key) {
  const pairs = Object.entries(dict);
  for (const pair of pairs) {
    if (pair[0] === key) return pair[1];
  }
  return undefined;
}

function hasKey(dict, key) {
  return copyOf(dict, key) !== undefined;
}

test('失败码集合与宿主 plan.ts 逐值一致', () => {
  assert.deepEqual(COMFY_BACKEND_FAILURES, plan.COMFY_BACKEND_FAILURES);
});

test('设置码覆盖宿主 validateDirectory 会产出的每一个码', () => {
  // 与宿主 `SettingsValidationCode` 契约对齐（见文件头说明为何不 import）。
  const hostCodes = [
    'not-absolute',
    'not-found',
    'not-a-directory',
    'not-writable',
    'same-as-install-root',
  ];
  for (const code of hostCodes) {
    assert.ok(COMFY_BACKEND_SETTINGS_CODES.includes(code), `客户端不认识宿主设置码：${code}`);
  }
  // 落盘失败是路由层新增的码，同样要给文案。
  assert.ok(COMFY_BACKEND_SETTINGS_CODES.includes('settings-write-failed'));
  assert.equal(COMFY_BACKEND_SETTINGS_CODES.length, hostCodes.length + 1);
});

test('八类失败各有唯一主行动，且不并列', () => {
  const table = [
    ['unsupported-platform', 'none'],
    ['install-dir-not-writable', 'change-dir'],
    ['insufficient-disk', 'change-dir'],
    ['port-occupied', 'retry-install'],
    ['driver-unsupported', 'none'],
    ['version-mismatch', 'update'],
    ['install-failed', 'retry-install'],
    ['start-timeout', 'retry-start'],
    ['driver-unsatisfied', 'choose-variant'],
    ['variant-required', 'choose-variant'],
    ['unsupported-variant', 'choose-variant'],
  ];
  for (const row of table) {
    assert.equal(resolveFailureAction(row[0], null), row[1], `失败码 ${row[0]} 的主行动不对`);
  }
  // 八个码一个都不能漏，且每个都只映射出一个动作（不是数组）。
  assert.equal(table.length, COMFY_BACKEND_FAILURES.length);
  for (const failure of COMFY_BACKEND_FAILURES) {
    assert.equal(typeof resolveFailureAction(failure, null), 'string');
  }
  // 未知码回到安装（最保守的一步）；没有码也一样。
  assert.equal(resolveFailureAction(null, 'brand-new-code'), 'retry-install');
  assert.equal(resolveFailureAction(null, null), 'retry-install');
  // 宿主只写了 error 没写 failure 时，仍按错误码分流（M2c 行为不回退）。
  assert.equal(resolveFailureAction(null, 'start-timeout'), 'retry-start');
  assert.equal(resolveFailureAction(null, 'unsupported-platform'), 'none');
});

test('version-mismatch 说的是「需要更新」，不是「安装失败」', () => {
  const mismatchKey = comfyBackendFailureKey('version-mismatch');
  const mismatchZh = copyOf(zh, mismatchKey);
  const mismatchEn = copyOf(en, mismatchKey);
  assert.notEqual(mismatchKey, comfyBackendFailureKey('install-failed'));
  assert.ok(mismatchZh.includes('更新'));
  assert.ok(!mismatchZh.includes('安装失败'));
  assert.ok(mismatchEn.toLowerCase().includes('update'));
});

test('驱动三态各有文案，unknown 不声称检查过', () => {
  const keys = COMFY_BACKEND_DRIVERS.map((driver) => comfyBackendDriverKey(driver));
  assert.equal(new Set(keys).size, COMFY_BACKEND_DRIVERS.length);
  const notRequired = copyOf(zh, comfyBackendDriverKey('not-required'));
  const unknown = copyOf(zh, comfyBackendDriverKey('unknown'));
  const unsupported = copyOf(zh, comfyBackendDriverKey('unsupported'));
  assert.ok(notRequired.includes('不需要'));
  // unknown / unsupported 都不能说「不需要」，也不能说「已检查通过」。
  assert.ok(!unknown.includes('不需要'));
  assert.ok(!unsupported.includes('不需要'));
  assert.ok(unknown.includes('尚未判定'));
  // 缺失/非法一律按 unknown（不假装检查过）。
  assert.equal(parseComfyBackendDriver(undefined), 'unknown');
  assert.equal(parseComfyBackendDriver('whatever'), 'unknown');
  assert.equal(parseComfyBackendDriver('not-required'), 'not-required');
});

test('失败 / 驱动 / 设置码的文案 key 在中英两份字典里都存在', () => {
  const keys = [];
  for (const failure of COMFY_BACKEND_FAILURES) keys.push(comfyBackendFailureKey(failure));
  for (const driver of COMFY_BACKEND_DRIVERS) keys.push(comfyBackendDriverKey(driver));
  for (const code of COMFY_BACKEND_SETTINGS_CODES) keys.push(comfyBackendSettingsCodeKey(code));
  keys.push(comfyBackendSettingsCodeKey(null));
  keys.push('comfyPage.backend.update');
  keys.push('comfyPage.backend.changeDir');
  keys.push('comfyPage.backend.factRequired');
  keys.push('comfyPage.backend.settings.open');
  keys.push('comfyPage.backend.settings.installRoot');
  keys.push('comfyPage.backend.settings.modelsPath');
  keys.push('comfyPage.backend.settings.pick');
  keys.push('comfyPage.backend.settings.save');
  keys.push('comfyPage.backend.settings.installRootDefault');
  keys.push('comfyPage.backend.settings.modelsPathDefault');
  keys.push('comfyPage.backend.settings.pickFailed');
  keys.push('comfyPage.backend.settings.pickUnsupported');
  for (const key of keys) {
    assert.ok(hasKey(zh, key), `中文缺文案：${key}`);
    assert.ok(hasKey(en, key), `英文缺文案：${key}`);
    assert.ok(copyOf(zh, key).length > 0 && copyOf(en, key).length > 0, `文案为空：${key}`);
  }
});

test('state 信封解析出 failure / settings / requiredBytes / driver', async () => {
  stubFetch(() => jsonResponse({
    status: {
      state: 'failed',
      stage: null,
      percent: 0,
      message: '磁盘不够',
      error: 'insufficient-disk',
      pid: null,
      updatedAt: 1,
      target: null,
      installRoot: '/Users/me/omnimux',
      failure: 'insufficient-disk',
    },
    settings: { installRoot: '/Users/me/omnimux', modelsPath: '/Users/me/models' },
    requiredBytes: 8 * 1024 * 1024 * 1024,
    driver: 'not-required',
  }, 200));

  const result = await fetchComfyBackendState();
  const parsed = parseComfyBackendStatus(result.body.status);
  assert.equal(parsed.failure, 'insufficient-disk');
  assert.deepEqual(parseComfyBackendSettings(result.body.settings), {
    installRoot: '/Users/me/omnimux',
    modelsPath: '/Users/me/models',
  });
  assert.equal(result.body.requiredBytes, 8 * 1024 * 1024 * 1024);
  assert.equal(parseComfyBackendDriver(result.body.driver), 'not-required');

  const view = resolveComfyBackendView(parsed);
  assert.equal(view.primaryAction, 'change-dir');
  assert.equal(view.showDiskRequired, true);
  assert.equal(view.errorKey, 'comfyPage.backend.failure.insufficientDisk');
});

test('缺字段时按默认：无 failure / 空设置 / driver 未知', async () => {
  stubFetch(() => jsonResponse({ status: { state: 'not-installed' } }, 200));
  const result = await fetchComfyBackendState();
  const parsed = parseComfyBackendStatus(result.body.status);
  assert.equal(parsed.failure, null);
  assert.equal(parsed.installRoot, '');
  assert.deepEqual(parseComfyBackendSettings(result.body.settings), { installRoot: '', modelsPath: '' });
  assert.equal(parseComfyBackendDriver(result.body.driver), 'unknown');
  assert.equal(parseComfyBackendSettingsCode(result.body.code), null);
  // 未安装时驱动结论要显示出来（沉默 = 假装检查过）。
  assert.equal(resolveComfyBackendView(parsed).showDriverNote, true);
  // 未知 failure 码不会被当成某类失败。
  assert.equal(parseComfyBackendStatus(status('failed', 'brand-new-code', 'brand-new-code')).failure, null);
  assert.equal(resolveComfyBackendView(status('failed', 'brand-new-code', 'brand-new-code')).primaryAction, 'retry-install');
});

test('设置 POST 只带改过的字段，400 时透出 code', async () => {
  const calls = stubFetch(() => jsonResponse({ ok: true, code: null, settings: { installRoot: '/new', modelsPath: '' } }, 200));
  const ok = await updateComfyBackendSettings({ installRoot: '/new' });
  assert.equal(ok.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { installRoot: '/new' });
  assert.deepEqual(parseComfyBackendSettings(ok.body.settings), { installRoot: '/new', modelsPath: '' });

  stubFetch(() => jsonResponse({ ok: false, code: 'not-writable', settings: { installRoot: '', modelsPath: '' } }, 400));
  const denied = await updateComfyBackendSettings({ installRoot: '/read-only' });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 400);
  assert.equal(parseComfyBackendSettingsCode(denied.body.code), 'not-writable');
  assert.equal(comfyBackendSettingsCodeKey('not-writable'), 'comfyPage.backend.settingsCode.notWritable');
  assert.equal(comfyBackendSettingsCodeKey(null), 'comfyPage.backend.settingsCode.unknown');
  assert.equal(parseComfyBackendSettingsCode('brand-new-code'), null);
});
