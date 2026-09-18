/**
 * E2E: 灵感模板全量恢复、智能体上下文参考工具与附件挂载闭环全链路验证
 * 对应 Issue #2278 / #2279 / #2283 / #2362
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_CREATIVE_TEMPLATES,
  FEATURED_APPS_LIST,
  SHELVES_CONFIG,
  TEMPLATE_CATEGORIES,
  selectShelfItems,
  selectTemplatesByCategory,
} from '../../src/client/session-guide/templates/templates-data.js';
import {
  queryCreativeTemplates,
  getCreativeTemplateDetail,
} from '../../src/templates/tools.js';

test('E2E: 7 大王牌爆款工作流工程与应用清单完整性', () => {
  const builtinAppsPath = path.resolve('plugins/omnimux-apps/catalog/builtin-apps.json');
  assert.ok(fs.existsSync(builtinAppsPath), '必须存在 builtin-apps.json');

  const builtinApps = JSON.parse(fs.readFileSync(builtinAppsPath, 'utf8'));
  assert.equal(builtinApps.length, 7, '必须恰好包含 7 个官方精选 AI 应用');

  const expectedAppIds = [
    'app-creatify-app-demo',
    'app-creatify-chasing-product',
    'app-creatify-ugc-selfie',
    'app-creatify-3d-cute-vfx',
    'app-creatify-apparel-tryon',
    'app-creatify-product-spotlight',
    'app-creatify-fall-down-durability',
  ];

  for (const appId of expectedAppIds) {
    const app = builtinApps.find((a) => a.appId === appId);
    assert.ok(app, `缺少预期的 AI 应用: ${appId}`);
    assert.equal(app.metadata.category, 'video', '应用分类必须严格为 video');
    assert.ok(app.metadata.name, '必须包含中文显示名');
    assert.ok(app.formSchema, '必须定义表单 Schema');
    assert.ok(app.formSchema.properties.product_image, '必须暴露商品图插槽');
    assert.ok(app.formSchema.properties.copywriting, '必须暴露核心文案插槽');
    assert.ok(app.showcase?.items?.[0]?.mediaUrl, '必须包含成片演示视频');

    // 验证对应的标准工作流工程快照文件存在
    const wsFile = path.resolve(`plugins/omnimux-apps/catalog/presets/${appId}.workflow.json`);
    assert.ok(fs.existsSync(wsFile), `必须生成对应的工程快照文件: ${wsFile}`);
    const ws = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
    assert.equal(ws.schemaVersion, 3);
    assert.ok(ws.nodes.length >= 3, '工作流必须包含足够的业务插槽与生成节点');
  }
});

test('E2E: 首页「探索模板」包含置顶王牌应用货架与全量 395 套灵感模板', () => {
  // 1. 验证核心业务分类齐全（排除已下架的 tiktok）
  assert.equal(TEMPLATE_CATEGORIES.length, 9, '首页必须包含 9 大核心分类');
  assert.ok(
    !TEMPLATE_CATEGORIES.some((c) => c.slug === 'tiktok'),
    '分类绝对不得包含已下架的 tiktok'
  );

  // 2. 验证货架行配置
  assert.ok(SHELVES_CONFIG.length >= 7, '首页货架行必须包含各大业务分类');
  assert.equal(SHELVES_CONFIG[0].slug, 'explore-templates');
  assert.equal(SHELVES_CONFIG[0].type, 'app');
  assert.ok(
    !SHELVES_CONFIG.some((s) => s.slug === 'tiktok'),
    '货架行绝对不得包含已下架的 tiktok'
  );

  // 3. 验证王牌应用置顶且数量为 7
  const featuredApps = selectShelfItems('explore-templates', 10);
  assert.equal(featuredApps.length, 7, '王牌应用货架行必须展示 7 款王牌大卡片');

  // 4. 验证全量模板规模（402 = 7 款官方应用 + 395 套全量灵感模板）
  assert.ok(ALL_CREATIVE_TEMPLATES.length >= 402, '全量模板数应包含全部 395 套模板与置顶应用');

  // 5. 验证分类过滤可用性
  const hookTemplates = selectTemplatesByCategory('hook-intro');
  assert.ok(hookTemplates.length > 20, '黄金开场分类应包含丰富的模板');
});

test('E2E: 智能体（Agent）只读工具查询与提示词工作流上下文感知', async () => {
  // 1. 模糊搜索工具验证
  const searchResult = queryCreativeTemplates({
    category: 'hook-intro',
    limit: 5,
  });
  assert.ok(searchResult.total > 0, '搜索应返回结果');
  assert.equal(searchResult.items.length, 5);
  for (const item of searchResult.items) {
    assert.ok(item.id, '每项必须有 ID');
    assert.ok(item.title, '每项必须有标题');
    assert.ok(item.promptSummary !== undefined, '每项必须有提示词摘要');
  }

  // 2. 详情工具调阅验证（获取完整 prompt 与 workflow）
  const detail = getCreativeTemplateDetail(searchResult.items[0].id);
  assert.ok(detail, '必须成功获取模板详情');
  assert.ok(detail.prompt && detail.prompt.length > 0, '必须包含完整分镜提示词');

  // 3. 平台来源检索测试
  const pippitRes = queryCreativeTemplates({ platform: 'pippit', limit: 10 });
  assert.ok(pippitRes.items.length > 0);
  assert.equal(pippitRes.items[0].sourcePlatform, 'pippit');
});

test('E2E: 跨包解耦验证：FEATURED_APPS_LIST 包含内联自包含 Manifest 且无外部文件依赖', () => {
  assert.equal(FEATURED_APPS_LIST.length, 7);
  for (const app of FEATURED_APPS_LIST) {
    assert.ok(app.manifest, `应用 [${app.id}] 必须自包含 manifest`);
    assert.equal(app.manifest.appId, app.appId);
    assert.ok(app.manifest.formSchema);
  }
});
