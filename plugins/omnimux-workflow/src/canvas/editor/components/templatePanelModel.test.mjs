/**
 * 工作流模板面板行为测试（Issue #3625 工作流 5）。
 *
 * 断言的是**数据行为**（分类派生 / 搜索过滤 / 入口卡闸门），不是实现复述：
 * 1. 分类卡只从模板真实 `tags` 派生——没有标签就没有分类，绝不编造；
 * 2. 分类重置项 id 固定，文案层因此不能拼出「全部+维度」；
 * 3. 分类 + 搜索双重过滤保持输入顺序，不重排、不静默丢弃；
 * 4. 无新建回调就不渲染入口卡（禁止点不动的假入口）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CATEGORIES_ID,
  categoryHasMatches,
  collectTemplateCategories,
  deriveCategoryOptions,
  filterTemplates,
  normalizeTemplateQuery,
  shouldRenderCreateEntry,
  templateMatchesCategory,
  templateMatchesQuery,
} from './templatePanelModel.ts';

const sample = [
  { id: 't1', name: '夜景人像精修', nodeCount: 4, description: '低照度人像', tags: ['视频剪辑', '人像'] },
  { id: 't2', name: '分镜批量生成', nodeCount: 7, description: '多模态分镜', tags: ['视频剪辑'] },
  { id: 't3', name: '旁白配音', nodeCount: 2, tags: [] },
];

test('分类重置项 id 固定，文案层不得拼接「全部+维度」', () => {
  assert.equal(ALL_CATEGORIES_ID, 'all');
});

test('分类卡只从模板真实 tags 派生：首项为重置项并带真实总数', () => {
  const options = deriveCategoryOptions(sample);
  assert.equal(options.length, 3);
  assert.equal(options[0].id, 'all');
  assert.equal(options[0].count, 3);
  assert.equal(options[1].id, '视频剪辑');
  assert.equal(options[1].count, 2);
  assert.equal(options[2].id, '人像');
  assert.equal(options[2].count, 1);
});

test('无标签时不编造分类：只返回重置项', () => {
  const options = deriveCategoryOptions([{ id: 'x', name: '无标签', nodeCount: 1 }]);
  assert.equal(options.length, 1);
  assert.equal(options[0].id, ALL_CATEGORIES_ID);
  assert.equal(options[0].count, 1);
  assert.deepEqual(collectTemplateCategories([{ id: 'x', name: '无标签', nodeCount: 1 }]), []);
});

test('分类标签去重保序并剔除空白项', () => {
  const categories = collectTemplateCategories([
    { id: 'a', name: 'A', nodeCount: 0, tags: ['视频剪辑', ' 视频剪辑 ', '', '   ', '人像'] },
    { id: 'b', name: 'B', nodeCount: 0, tags: ['人像', '音频'] },
  ]);
  assert.deepEqual(categories, ['视频剪辑', '人像', '音频']);
});

test('分类过滤：重置项匹配全部，具体分类按标签精确匹配', () => {
  assert.equal(filterTemplates(sample, ALL_CATEGORIES_ID, '').length, 3);
  assert.equal(filterTemplates(sample, undefined, '').length, 3);
  assert.deepEqual(filterTemplates(sample, '人像', '').map((t) => t.id), ['t1']);
  assert.deepEqual(filterTemplates(sample, '视频剪辑', '').map((t) => t.id), ['t1', 't2']);
  assert.equal(templateMatchesCategory(sample[2], '视频剪辑'), false);
});

test('搜索命中名称 / 描述 / 标签，大小写不敏感', () => {
  assert.equal(templateMatchesQuery(sample[0], '夜景'), true);
  assert.equal(templateMatchesQuery(sample[0], '低照度'), true);
  assert.equal(templateMatchesQuery(sample[0], '人像'), true);
  assert.equal(templateMatchesQuery(sample[0], '不存在'), false);
  assert.equal(templateMatchesQuery(sample[0], '   '), true);
  assert.equal(normalizeTemplateQuery('  Night  '), 'night');
  const upper = [{ id: 'u', name: 'Night Portrait', nodeCount: 1 }];
  assert.equal(templateMatchesQuery(upper[0], 'night portrait'), true);
});

test('分类与搜索同时生效，且保持输入顺序', () => {
  assert.deepEqual(filterTemplates(sample, '视频剪辑', '分镜').map((t) => t.id), ['t2']);
  assert.deepEqual(filterTemplates(sample, ALL_CATEGORIES_ID, '生成').map((t) => t.id), ['t2']);
});

test('空分类可被如实判定（用于禁用而不是隐藏卡片）', () => {
  assert.equal(categoryHasMatches(sample, '人像', '分镜'), false);
  assert.equal(categoryHasMatches(sample, '人像', ''), true);
  assert.equal(categoryHasMatches(sample, ALL_CATEGORIES_ID, '旁白'), true);
});

test('无新建回调时不渲染入口卡（禁止假入口）', () => {
  assert.equal(shouldRenderCreateEntry(undefined), false);
  assert.equal(shouldRenderCreateEntry(null), false);
  assert.equal(shouldRenderCreateEntry(() => {}), true);
});

test('空列表输入安全：分类与过滤都返回空结果', () => {
  assert.deepEqual(deriveCategoryOptions([]), [{ id: ALL_CATEGORIES_ID, count: 0 }]);
  assert.deepEqual(filterTemplates(undefined, ALL_CATEGORIES_ID, ''), []);
  assert.deepEqual(filterTemplates([], '视频剪辑', 'x'), []);
});
