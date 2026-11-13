/**
 * Issue #4113（F2 / M2）— 模型菜单文案：i18n 接线 + 纯函数行为断言。
 *
 * 不复用 modelCascadeMenu.test.mjs：那片是既有测试文件，按仓库门禁规则「不给既有
 * 测试文件增删用例」（dynamic-test-member-needs-review 不可声明放行），新用例独立成文件。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveModelMenuItemCopy } from './modelPickerCandidates.ts';

const here = new URL('.', import.meta.url);
const cascadeSrc = readFileSync(new URL('./ModelCascadeMenu.tsx', import.meta.url), 'utf8');

const ZH = {
  'modelMenu.unsupportedTitle': '本地暂无该模型的可执行适配，暂不支持新建',
  'modelMenu.unverifiedTitle': '模型服务尚未验证',
  'modelMenu.unsupportedBadge': '暂不支持',
  'modelMenu.unverifiedBadge': '未验证',
};
const EN = {
  'modelMenu.unsupportedTitle': 'This model has no local execution adapter yet, so it cannot be selected',
  'modelMenu.unverifiedTitle': 'This model is not verified yet',
  'modelMenu.unsupportedBadge': 'Unsupported',
  'modelMenu.unverifiedBadge': 'Unverified',
};
const tzh = (key) => ZH[key];
const ten = (key) => EN[key];

test('#4113 F2 菜单徽标/title 走 i18n（接线到纯函数，无硬编码中文）', () => {
  assert.match(cascadeSrc, /useT\(\)/);
  assert.match(cascadeSrc, /resolveModelMenuItemCopy\(item, t\)/);
  assert.doesNotMatch(cascadeSrc, /'暂不支持'|'未验证'/);
  const zhDict = readFileSync(new URL('../../../../i18n/dict.zh.ts', import.meta.url), 'utf8');
  const enDict = readFileSync(new URL('../../../../i18n/dict.en.ts', import.meta.url), 'utf8');
  for (const key of ['unsupportedTitle', 'unverifiedTitle', 'unsupportedBadge', 'unverifiedBadge']) {
    assert.match(zhDict, new RegExp(`'modelMenu\\.${key}'`), `zh 缺 modelMenu.${key}`);
    assert.match(enDict, new RegExp(`'modelMenu\\.${key}'`), `en 缺 modelMenu.${key}`);
  }
});

test('#4113 M2 resolveModelMenuItemCopy 在 zh/en 下返回正确 title/badge（行为断言）', () => {
  assert.deepEqual(resolveModelMenuItemCopy({ executionStatus: 'unsupported' }, tzh), {
    title: ZH['modelMenu.unsupportedTitle'], badge: '暂不支持',
  });
  assert.deepEqual(resolveModelMenuItemCopy({ executionStatus: 'unverified' }, tzh), {
    title: ZH['modelMenu.unverifiedTitle'], badge: '未验证',
  });
  assert.deepEqual(resolveModelMenuItemCopy({ executionStatus: 'ready' }, tzh), {});
  assert.deepEqual(resolveModelMenuItemCopy({ executionStatus: 'unsupported' }, ten), {
    title: EN['modelMenu.unsupportedTitle'], badge: 'Unsupported',
  });
  assert.deepEqual(resolveModelMenuItemCopy({ executionStatus: 'unverified' }, ten), {
    title: EN['modelMenu.unverifiedTitle'], badge: 'Unverified',
  });
});
