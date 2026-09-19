/**
 * E2E 测试：技能市场全量 112 款技能名称与描述 DSH 原生中英文多语言深度适配 (Issue #2402)
 * 验证：
 *  1. catalog/index.json 中 112 款技能的 titleZh 100% 覆盖有效中文；
 *  2. catalog/index.json 中 112 款技能的 summaryZh 100% 覆盖有效中文；
 *  3. catalog/index.json 中 112 款技能的 titleEn 与 summaryEn 100% 覆盖有效英文；
 *  4. 消费 DSH 原生 skillTitle / skillDesc 双语解析器，在中文和英文环境下均输出纯净对应的原生语言。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { skillTitle, skillDesc } from '../../src/client/skill-picker-logic.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const catalogSrc = readFileSync(join(root, 'catalog/index.json'), 'utf8');

test('E2E-1 字典完整度：全量 112 款技能在 catalog 中具备纯净中英文四元多语言字段', () => {
  const catalog = JSON.parse(catalogSrc);
  const skills = catalog.items.filter((i) => i.kind === 'skill');
  assert.equal(skills.length, 112, '技能总数必须等于 112 款');

  const chineseRegex = /[\u4e00-\u9fa5]/;
  const englishRegex = /[a-zA-Z]/;

  const missingTitleZh = [];
  const missingSummaryZh = [];
  const missingTitleEn = [];
  const missingSummaryEn = [];

  skills.forEach((s) => {
    if (!s.titleZh || !chineseRegex.test(s.titleZh)) {
      missingTitleZh.push(s.id || s.slug);
    }
    if (!s.summaryZh || !chineseRegex.test(s.summaryZh)) {
      missingSummaryZh.push(s.id || s.slug);
    }
    if (!s.titleEn || !englishRegex.test(s.titleEn)) {
      missingTitleEn.push(s.id || s.slug);
    }
    if (!s.summaryEn || !englishRegex.test(s.summaryEn)) {
      missingSummaryEn.push(s.id || s.slug);
    }
  });

  assert.deepEqual(missingTitleZh, [], '所有技能的中文标题必须包含中文字符，不得留存纯英文');
  assert.deepEqual(missingSummaryZh, [], '所有技能的中文描述必须包含中文字符，不得直接留存英文');
  assert.deepEqual(missingTitleEn, [], '所有技能的英文标题必须有效');
  assert.deepEqual(missingSummaryEn, [], '所有技能的英文描述必须有效');
});

test('E2E-2 解析器中文环境核验：skillTitle 与 skillDesc 在 zh 环境下 100% 返回中文', () => {
  const catalog = JSON.parse(catalogSrc);
  const skills = catalog.items.filter((i) => i.kind === 'skill');
  const fakeZhTr = (key) => key === 'locale' ? 'zh' : key;
  const chineseRegex = /[\u4e00-\u9fa5]/;

  skills.forEach((s) => {
    const title = skillTitle(s, fakeZhTr);
    const desc = skillDesc(s, fakeZhTr);
    assert.ok(title && chineseRegex.test(title), `技能 ${s.id} 在中文环境下标题必须为中文，得到: ${title}`);
    assert.ok(desc && chineseRegex.test(desc), `技能 ${s.id} 在中文环境下描述必须包含中文，得到: ${desc}`);
  });
});

test('E2E-3 解析器英文环境核验：skillTitle 与 skillDesc 在 en 环境下 100% 返回英文', () => {
  const catalog = JSON.parse(catalogSrc);
  const skills = catalog.items.filter((i) => i.kind === 'skill');
  const fakeEnTr = (key) => key === 'locale' ? 'en' : key;
  const englishRegex = /[a-zA-Z]/;

  skills.forEach((s) => {
    const title = skillTitle(s, fakeEnTr);
    const desc = skillDesc(s, fakeEnTr);
    assert.ok(title && englishRegex.test(title), `技能 ${s.id} 在英文环境下标题必须为英文，得到: ${title}`);
    assert.ok(desc && englishRegex.test(desc), `技能 ${s.id} 在英文环境下描述必须包含英文，得到: ${desc}`);
  });
});
