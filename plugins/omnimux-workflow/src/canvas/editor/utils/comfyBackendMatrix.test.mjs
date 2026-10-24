/**
 * 平台矩阵 / 驱动判定 / 目标问题 映射单测（Issue #3726 M4）。
 *
 * 覆盖：
 *  1. 矩阵摘要解析与宿主 `listComfyBackendTargets()` 逐字段对齐，坏行丢弃；
 *  2. 驱动四态（+ M3 遗留 `unsupported`）各有独立文案；`unsatisfied` 说清需要什么，
 *     `unknown` 不声称通过；
 *  3. 失败码清单与宿主 `plan.ts` 一致，且**十一个码的主行动与宿主 `preflight.ts`
 *     的 `failureAction` 逐码相同**（三个新码都走「更换方案」）；
 *  4. 目标解析三态：多候选/方案不可用 → 让用户选，不自动挑；平台不支持 → 不给动作；
 *  5. 方案名称/支持度/驱动要求都有中英双语 key，未知 id 回落宿主 label；
 *  6. 选方案只发 `variant` 一个字段（不会顺手重置目录）。
 *
 * 不 import 宿主 `settings.ts` / `service.ts`（依赖 node:path 等，测试导入门禁不核验）。
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  COMFY_BACKEND_DRIVERS,
  COMFY_BACKEND_FAILURES,
  COMFY_BACKEND_DRIVER_REQUIREMENTS,
  COMFY_BACKEND_SUPPORTS,
  COMFY_BACKEND_TARGET_PROBLEMS,
  comfyBackendDriverDisplay,
  comfyBackendDriverKey,
  comfyBackendDriverRequirementKey,
  comfyBackendProblemKey,
  comfyBackendSupportKey,
  comfyBackendVariantBlocker,
  comfyBackendVariantKey,
  parseComfyBackendDriverVerdict,
  parseComfyBackendSupport,
  parseComfyBackendTargetOptions,
  parseComfyBackendTargetProblem,
  parseComfyBackendVariant,
  parseComfyBackendVariants,
  resolveComfyBackendView,
  resolveFailureAction,
  updateComfyBackendSettings,
} from './comfyBackendClient.ts';
import * as plan from '../../../workflow/comfyBackend/plan.ts';
import { failureAction } from '../../../workflow/comfyBackend/preflight.ts';
import zh from '../../i18n/dict.zh.ts';
import en from '../../i18n/dict.en.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

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

function notInstalled() {
  return {
    state: 'not-installed',
    stage: null,
    percent: 0,
    message: '',
    error: null,
    pid: null,
    updatedAt: 1,
    target: null,
    installRoot: '/tmp/omnimux-comfy',
    failure: null,
  };
}

/** 信封上下文：只给测试关心的字段，其余按空。 */
function context(patch) {
  return {
    targetProblem: patch.targetProblem === undefined ? null : patch.targetProblem,
    targetOptions: patch.targetOptions === undefined ? [] : patch.targetOptions,
    driver: patch.driver === undefined ? { status: 'unknown', detail: '', required: null } : patch.driver,
    variant: patch.variant === undefined ? '' : patch.variant,
    support: patch.support === undefined ? null : patch.support,
    variants: patch.variants === undefined ? [] : patch.variants,
    requiredBytes: patch.requiredBytes === undefined ? 0 : patch.requiredBytes,
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('矩阵摘要解析与宿主 listComfyBackendTargets 对齐，坏行丢弃', () => {
  const hostRows = plan.listComfyBackendTargets();
  const rows = parseComfyBackendVariants(hostRows);
  assert.equal(rows.length, hostRows.length);
  assert.ok(rows.length >= 5, '矩阵至少 5 个变体');
  for (const row of rows) {
    assert.ok(row.variant.length > 0);
    assert.ok(row.label.length > 0);
    assert.ok(COMFY_BACKEND_SUPPORTS.includes(row.support));
    assert.ok(COMFY_BACKEND_DRIVER_REQUIREMENTS.includes(row.driver));
    assert.ok(row.estimatedBytes > 0);
    assert.ok(row.torchVersion.length > 0);
  }
  // mac 那条是真机装过的 supported，其余是候选（规格：只有 darwin-arm64 是支持）。
  const darwin = rows.find((row) => row.variant === 'darwin-arm64');
  assert.equal(darwin.support, 'supported');
  assert.equal(darwin.driver, 'none');
  assert.equal(darwin.minDriver, null);
  // AMD 那条必须带上基座差异的实话，界面才可能显示出来。
  const amd = rows.find((row) => row.variant === 'win32-x64-amd-directml');
  assert.equal(amd.support, 'candidate');
  assert.ok(amd.notes.includes('2.4.1'));
  // NVIDIA 两条各带自己的驱动下限。
  const cuda12 = rows.find((row) => row.variant === 'win32-x64-cuda12');
  const cuda13 = rows.find((row) => row.variant === 'win32-x64-cuda13');
  assert.equal(cuda12.driver, 'nvidia');
  assert.ok(cuda12.minDriver.length > 0);
  assert.ok(cuda13.minDriver.length > 0);

  // 坏行整行丢弃：宁可少一行，也不显示半行假数据。
  const mixed = [
    hostRows[0],
    { variant: 'x' },
    { variant: 'x', label: 'x', support: 'maybe', driver: 'none' },
    { variant: 'x', label: 'x', support: 'candidate', driver: 'gpu' },
    { variant: '', label: 'x', support: 'candidate', driver: 'none' },
    null,
    'nope',
  ];
  const kept = parseComfyBackendVariants(mixed);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].variant, hostRows[0].variant);
  assert.deepEqual(parseComfyBackendVariants(null), []);
  assert.deepEqual(parseComfyBackendVariants({}), []);
});

test('驱动四态各有独立文案；unsatisfied 说需要什么，unknown 不声称通过', () => {
  const keys = COMFY_BACKEND_DRIVERS.map((driver) => comfyBackendDriverKey(driver));
  assert.equal(new Set(keys).size, COMFY_BACKEND_DRIVERS.length);
  for (const key of keys) {
    assert.ok(hasKey(zh, key), `中文缺驱动文案：${key}`);
    assert.ok(hasKey(en, key), `英文缺驱动文案：${key}`);
  }
  const satisfied = copyOf(zh, comfyBackendDriverKey('satisfied'));
  const unsatisfied = copyOf(zh, comfyBackendDriverKey('unsatisfied'));
  const unknown = copyOf(zh, comfyBackendDriverKey('unknown'));
  const notRequired = copyOf(zh, comfyBackendDriverKey('not-required'));
  assert.notEqual(satisfied, unsatisfied);
  assert.ok(notRequired.includes('不需要'));
  // 不满足就说「不满足」，未知就说「查不到」——都不许说成通过。
  assert.ok(!unsatisfied.includes('满足要求'));
  assert.ok(!unknown.includes('满足'));
  assert.ok(!unknown.includes('不需要'));
  assert.ok(hasKey(zh, 'comfyPage.backend.driver.requiredAtLeast'));

  // 从信封解析：结论 + 人话 + 下限。
  const verdict = parseComfyBackendDriverVerdict({
    driver: 'unsatisfied',
    driverDetail: '需要 NVIDIA 驱动不低于 570.0',
    driverRequired: '570.0',
  });
  assert.equal(verdict.status, 'unsatisfied');
  assert.equal(verdict.required, '570.0');
  assert.equal(verdict.detail.length > 0, true);
  // 缺失/非法一律 unknown，且不编下限。
  const missing = parseComfyBackendDriverVerdict({});
  assert.equal(missing.status, 'unknown');
  assert.equal(missing.required, null);
  assert.equal(parseComfyBackendDriverVerdict(null).status, 'unknown');
  assert.equal(parseComfyBackendDriverVerdict({ driver: 'bogus' }).status, 'unknown');
});

test('失败码清单与宿主一致，且十一个码的主行动逐码等于宿主 failureAction', () => {
  assert.deepEqual(COMFY_BACKEND_FAILURES, plan.COMFY_BACKEND_FAILURES);
  assert.equal(COMFY_BACKEND_FAILURES.length, 11);
  for (const failure of plan.COMFY_BACKEND_FAILURES) {
    // 宿主叫 choose-dir，画布叫 change-dir（同一件事，名字对齐画布既有 API）。
    const host = failureAction(failure) === 'choose-dir' ? 'change-dir' : failureAction(failure);
    assert.equal(resolveFailureAction(failure, null), host, `失败码 ${failure} 的主行动与宿主不一致`);
  }
  // 三个新码都走「更换方案」，不是重试（重试只会再失败一次）。
  assert.equal(resolveFailureAction('driver-unsatisfied', null), 'choose-variant');
  assert.equal(resolveFailureAction('variant-required', null), 'choose-variant');
  assert.equal(resolveFailureAction('unsupported-variant', null), 'choose-variant');
  assert.equal(resolveFailureAction(null, 'unsupported-variant'), 'choose-variant');
});

test('目标问题三态：多候选让用户选，不自动挑方案', () => {
  assert.deepEqual(COMFY_BACKEND_TARGET_PROBLEMS, [
    'variant-required',
    'unsupported-platform',
    'unsupported-variant',
  ]);
  assert.equal(parseComfyBackendTargetProblem('variant-required'), 'variant-required');
  assert.equal(parseComfyBackendTargetProblem('brand-new'), null);
  assert.equal(parseComfyBackendTargetProblem(null), null);
  assert.deepEqual(parseComfyBackendTargetOptions(['a', 'b', '', 3, null]), ['a', 'b']);
  assert.deepEqual(parseComfyBackendTargetOptions(undefined), []);
  assert.equal(comfyBackendProblemKey(null), null);
  for (const problem of COMFY_BACKEND_TARGET_PROBLEMS) {
    const key = comfyBackendProblemKey(problem);
    assert.ok(hasKey(zh, key), `中文缺问题文案：${key}`);
    assert.ok(hasKey(en, key), `英文缺问题文案：${key}`);
  }

  // 多候选：主行动是「选择方案」，**不是** install（绝不自动挑一个）。
  const multi = resolveComfyBackendView(
    notInstalled(),
    context({ targetProblem: 'variant-required', targetOptions: ['win32-x64-cuda12', 'win32-x64-cuda13'] }),
  );
  assert.equal(multi.primaryAction, 'choose-variant');
  assert.equal(multi.problemKey, 'comfyPage.backend.problem.variantRequired');
  // 选到了本机不存在的方案：同样换方案。
  const bad = resolveComfyBackendView(notInstalled(), context({ targetProblem: 'unsupported-variant' }));
  assert.equal(bad.primaryAction, 'choose-variant');
  assert.equal(bad.problemKey, 'comfyPage.backend.problem.unsupportedVariant');
  // 平台真不支持：不给动作，只说明。
  const unsupported = resolveComfyBackendView(notInstalled(), context({ targetProblem: 'unsupported-platform' }));
  assert.equal(unsupported.primaryAction, 'none');
  assert.equal(unsupported.problemKey, 'comfyPage.backend.problem.unsupportedPlatform');
  // 没问题：回到安装（M3 行为不回退）。
  assert.equal(resolveComfyBackendView(notInstalled(), context({})).primaryAction, 'install');
  assert.equal(resolveComfyBackendView(notInstalled()).primaryAction, 'install');
  assert.equal(resolveComfyBackendView(notInstalled()).problemKey, null);
});

test('方案名称 / 支持度 / 驱动要求都有中英双语 key，未知 id 回落宿主 label', () => {
  const hostRows = plan.listComfyBackendTargets();
  for (const row of hostRows) {
    const key = comfyBackendVariantKey(row.variant);
    assert.ok(key, `方案 ${row.variant} 缺名称 key`);
    assert.ok(hasKey(zh, key), `中文缺方案名：${key}`);
    assert.ok(hasKey(en, key), `英文缺方案名：${key}`);
  }
  // 未知 id 不编名字：返回 null，界面回落宿主 label。
  assert.equal(comfyBackendVariantKey('win32-arm64-future'), null);
  assert.equal(comfyBackendVariantKey(''), null);
  for (const support of COMFY_BACKEND_SUPPORTS) {
    const key = comfyBackendSupportKey(support);
    assert.ok(hasKey(zh, key) && hasKey(en, key), `缺支持度文案：${key}`);
  }
  for (const requirement of COMFY_BACKEND_DRIVER_REQUIREMENTS) {
    const key = comfyBackendDriverRequirementKey(requirement);
    assert.ok(hasKey(zh, key) && hasKey(en, key), `缺驱动要求文案：${key}`);
  }
  // 候选 + 驱动不满足 = 不能装（界面据此拦住，别让用户白等一次下载）。
  assert.equal(comfyBackendVariantBlocker('candidate', 'unsatisfied'), 'unsupported-variant');
  assert.equal(comfyBackendVariantBlocker('candidate', 'unknown'), null);
  assert.equal(comfyBackendVariantBlocker('candidate', 'satisfied'), null);
  assert.equal(comfyBackendVariantBlocker('supported', 'unsatisfied'), null);
  assert.equal(comfyBackendVariantBlocker(null, 'unsatisfied'), null);
});

test('选方案只发 variant 一个字段，目录不会被顺手重置', async () => {
  const calls = [];
  globalThis.fetch = async (path, init) => {
    const options = init || {};
    calls.push({ method: options.method ? options.method : 'GET', body: options.body ? JSON.parse(options.body) : null });
    return jsonResponse({ ok: true, code: null, settings: { installRoot: '/keep', modelsPath: '/models', variant: 'win32-x64-cuda12' } }, 200);
  };
  const result = await updateComfyBackendSettings({ variant: 'win32-x64-cuda12' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { variant: 'win32-x64-cuda12' });
  // 响应里的 variant 能解析出来（界面立刻更新当前方案）。
  assert.equal(parseComfyBackendVariant(result.body.settings), 'win32-x64-cuda12');
  assert.equal(parseComfyBackendVariant({}), '');
  assert.equal(parseComfyBackendVariant(null), '');
  assert.equal(parseComfyBackendVariant({ variant: 7 }), '');
  assert.equal(parseComfyBackendSupport('supported'), 'supported');
  assert.equal(parseComfyBackendSupport('candidate'), 'candidate');
  assert.equal(parseComfyBackendSupport('bogus'), null);
  assert.equal(parseComfyBackendSupport(undefined), null);
});

test('候选方案 + 驱动不满足：不装，直接让用户换方案（省一次必然失败的下载）', () => {
  const blocked = resolveComfyBackendView(
    notInstalled(),
    context({ variant: 'win32-x64-cuda12', support: 'candidate', driver: { status: 'unsatisfied', detail: 'x', required: '570.0' } }),
  );
  assert.equal(blocked.primaryAction, 'choose-variant');
  // 驱动结论照旧显示（说清需要什么），不是靠主行动替代说明。
  assert.equal(blocked.showDriverNote, true);
  // 驱动查不到（unknown）不阻断：宿主也不阻断，别自己加码。
  const unknown = resolveComfyBackendView(
    notInstalled(),
    context({ variant: 'win32-x64-cuda12', support: 'candidate', driver: { status: 'unknown', detail: '', required: null } }),
  );
  assert.equal(unknown.primaryAction, 'install');
  // 真机装过的方案（supported）即使驱动不满足也不走这条：那是宿主的判定，画布不越权。
  const supported = resolveComfyBackendView(
    notInstalled(),
    context({ variant: 'darwin-arm64', support: 'supported', driver: { status: 'unsatisfied', detail: '', required: null } }),
  );
  assert.equal(supported.primaryAction, 'install');
});

test('驱动精确原因行内可见：unknown/unsatisfied 不藏在悬停里，也不重复', () => {
  // 查不到：必须把宿主原话「查不到 NVIDIA 驱动版本」行内显示出来。
  const unknown = comfyBackendDriverDisplay({
    status: 'unknown',
    detail: '查不到 NVIDIA 驱动版本',
    required: null,
  });
  assert.equal(unknown.key, 'comfyPage.backend.driver.unknown');
  assert.equal(unknown.detail, '查不到 NVIDIA 驱动版本');
  assert.equal(unknown.requirement, null);
  // 不满足且宿主给了原因：行内显示原因，不再重复「（需要不低于 X）」。
  const unsatisfied = comfyBackendDriverDisplay({
    status: 'unsatisfied',
    detail: '需要 NVIDIA 驱动不低于 570.0，当前 551.23',
    required: '570.0',
  });
  assert.equal(unsatisfied.key, 'comfyPage.backend.driver.unsatisfied');
  assert.equal(unsatisfied.detail, '需要 NVIDIA 驱动不低于 570.0，当前 551.23');
  assert.equal(unsatisfied.requirement, null);
  // 宿主没给原因：退回结构化下限（版本号与语言无关，英文界面也说得清）。
  const noDetail = comfyBackendDriverDisplay({ status: 'unsatisfied', detail: '   ', required: '570.0' });
  assert.equal(noDetail.detail, '');
  assert.equal(noDetail.requirement, '570.0');
  // 通过/不需要：结论已经说清，不再塞一行原因（避免副标题式废话）。
  const satisfied = comfyBackendDriverDisplay({ status: 'satisfied', detail: '驱动 581.15 满足下限 570.0', required: '570.0' });
  assert.equal(satisfied.detail, '');
  assert.equal(satisfied.requirement, null);
  const notRequired = comfyBackendDriverDisplay({ status: 'not-required', detail: 'macOS 走 MPS', required: null });
  assert.equal(notRequired.detail, '');
  // 空 detail 不留空白行。
  assert.equal(comfyBackendDriverDisplay({ status: 'unknown', detail: '', required: null }).detail, '');
});
