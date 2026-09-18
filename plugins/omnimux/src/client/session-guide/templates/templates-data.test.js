import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  ALL_CREATIVE_TEMPLATES,
  FEATURED_APPS_LIST,
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  findTemplateById,
  selectShelfItems,
} from './templates-data.js';

test('全量灵感模板与置顶 AI 应用规模与数据完整性验证', () => {
  assert.equal(FEATURED_APPS_LIST.length, 7, '置顶官方精选 AI 应用应恰好为 7 套');
  assert.ok(
    ALL_CREATIVE_TEMPLATES.length >= 402,
    `全量模板应包含 7 款应用与 395 套模板，当前: ${ALL_CREATIVE_TEMPLATES.length}`
  );

  // 验证前 7 项为官方 AI 应用
  for (const app of ALL_CREATIVE_TEMPLATES.slice(0, 7)) {
    assert.equal(app.isApp, true, '前 7 项必须标记为 isApp: true');
    assert.equal(app.type, 'app', '前 7 项类型必须为 app');
    assert.ok(app.manifest, 'AI 应用必须绑定 manifest');
  }

  // 验证普通模板中包含提示词与工作流元数据
  const creatifyTemplatesWithWorkflow = ALL_CREATIVE_TEMPLATES.filter(
    (item) => item.workflow && item.workflow.nodeCount > 0
  );
  assert.ok(
    creatifyTemplatesWithWorkflow.length >= 160,
    `包含工作流元数据的模板数量应不低于 160，当前: ${creatifyTemplatesWithWorkflow.length}`
  );
});

test('10 大核心分类与货架行配置验证', () => {
  assert.equal(TEMPLATE_CATEGORIES.length, 10, '应恢复完整的 10 大核心分类');
  const expectedSlugs = [
    'all',
    'tiktok',
    'skills',
    'apps-software',
    'hook-intro',
    'ugc-review',
    'cinematic-vfx',
    'fashion-try-on',
    'industry-packs',
    'durability-test',
  ];
  assert.deepEqual(
    TEMPLATE_CATEGORIES.map((c) => c.slug),
    expectedSlugs
  );

  assert.ok(SHELVES_CONFIG.length >= 8, '货架行应包含主要业务分类');
  assert.equal(SHELVES_CONFIG[0].slug, 'explore-templates');
});

test('分类筛选与 ID 检索功能验证', () => {
  const foundApp = findTemplateById('app-creatify-app-demo');
  assert.ok(foundApp, '必须能通过 appId 检索到软件应用');
  assert.equal(foundApp.isApp, true);

  const hookTemplates = selectTemplatesByCategory('hook-intro');
  assert.ok(hookTemplates.length > 20, '黄金开场分类下的模板数量应大于 20');

  const allItems = selectTemplatesByCategory('all');
  assert.equal(allItems.length, ALL_CREATIVE_TEMPLATES.length);
});
