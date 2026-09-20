/**
 * E2E 测试：技能市场全量 112 款技能名称与描述 DSH 原生中英文多语言深度适配 (Issue #2402, Issue #2438)
 * 验证：
 *  1. catalog/index.json 中 112 款技能的 titleZh 100% 覆盖有效中文；
 *  2. 严格拦截中文标题中的劣质机翻与连写英文单词，仅允许受控行业缩写白名单（UGC, SaaS, B2B, UI, DTC, App, IP, Vox, 3D）；
 *  3. catalog/index.json 中 112 款技能的 summaryZh 100% 覆盖地道中文业务说明，杜绝机翻模板与英文残留；
 *  4. catalog/index.json 中 112 款技能的 titleEn 与 summaryEn 100% 覆盖有效英文；
 *  5. 消费 DSH 原生 skillTitle / skillDesc 双语解析器，在中文和英文环境下均输出纯净对应的原生语言。
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

const ALLOWED_ENGLISH_TOKENS = new Set([
  'UGC',
  'SaaS',
  'B2B',
  'UI',
  'DTC',
  'App',
  'IP',
  'Vox',
  '3D',
]);

test('E2E-1 字典完整度与质量门禁：全量 112 款技能在 catalog 中具备纯净中英文四元多语言字段且严禁机翻粘连英文', () => {
  const catalog = JSON.parse(catalogSrc);
  const skills = catalog.items.filter((i) => i.kind === 'skill');
  assert.equal(skills.length, 112, '技能总数必须等于 112 款');

  const chineseRegex = /[\u4e00-\u9fa5]/;
  const englishRegex = /[a-zA-Z]/;
  const englishWordRegex = /[a-zA-Z0-9]+/g;

  const missingTitleZh = [];
  const missingSummaryZh = [];
  const missingTitleEn = [];
  const missingSummaryEn = [];
  const illegalEnglishTitles = [];
  const templateContaminatedSummaries = [];

  skills.forEach((s) => {
    // 1. 基础中文覆盖
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

    // 2. 标题严禁未授权的英文粘连或小写单词
    const tokens = (s.titleZh || '').match(englishWordRegex) || [];
    const illegalTokens = tokens.filter((t) => !ALLOWED_ENGLISH_TOKENS.has(t));
    if (illegalTokens.length > 0) {
      illegalEnglishTitles.push({ id: s.id, titleZh: s.titleZh, illegalTokens });
    }

    // 3. 描述杜绝机翻套话与英文模板残留
    if (
      s.summaryZh &&
      ((s.summaryZh.includes('专为') && s.summaryZh.includes('营销场景打造，提供高效的脚本分镜策划')) ||
        s.summaryZh.includes('the user asks for') ||
        s.summaryZh.includes('single-take') ||
        s.summaryZh.includes('视频广告s'))
    ) {
      templateContaminatedSummaries.push({ id: s.id, summaryZh: s.summaryZh });
    }
  });

  assert.deepEqual(missingTitleZh, [], '所有技能的中文标题必须包含中文字符，不得留存纯英文');
  assert.deepEqual(missingSummaryZh, [], '所有技能的中文描述必须包含中文字符，不得直接留存英文');
  assert.deepEqual(missingTitleEn, [], '所有技能的英文标题必须有效');
  assert.deepEqual(missingSummaryEn, [], '所有技能的英文描述必须有效');
  assert.deepEqual(
    illegalEnglishTitles,
    [],
    '中文标题严禁包含未授权的小写粘连英文或非标准缩写'
  );
  assert.deepEqual(
    templateContaminatedSummaries,
    [],
    '中文描述必须地道专业，严禁模板机翻套话与英文片段残留'
  );
});

test('E2E-2 解析器中文环境核验：skillTitle 与 skillDesc 在 zh 环境下 100% 返回有效中文', () => {
  const catalog = JSON.parse(catalogSrc);
  const skills = catalog.items.filter((i) => i.kind === 'skill');
  const fakeZhTr = (key) => (key === 'locale' ? 'zh' : key);
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
  const fakeEnTr = (key) => (key === 'locale' ? 'en' : key);
  const englishRegex = /[a-zA-Z]/;

  skills.forEach((s) => {
    const title = skillTitle(s, fakeEnTr);
    const desc = skillDesc(s, fakeEnTr);
    assert.ok(title && englishRegex.test(title), `技能 ${s.id} 在英文环境下标题必须为英文，得到: ${title}`);
    assert.ok(desc && englishRegex.test(desc), `技能 ${s.id} 在英文环境下描述必须包含英文，得到: ${desc}`);
  });
});
