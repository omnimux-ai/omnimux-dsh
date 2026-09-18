/**
 * E2E: 灵感模板 7 大王牌 AI 应用与首页单分组直通出片全链路验证
 * 对应 Issue #2278 / #2279 / #2283
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_CREATIVE_TEMPLATES,
  SHELVES_CONFIG,
  selectShelfItems,
} from '../../src/client/session-guide/templates/templates-data.js';

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

test('E2E: 首页「探索模板」收敛为单分组且完美对齐 7 大应用', () => {
  assert.equal(SHELVES_CONFIG.length, 1, '首页货架必须仅保留 1 个核心分组');
  assert.equal(SHELVES_CONFIG[0].slug, 'explore-templates');
  assert.equal(SHELVES_CONFIG[0].titleZh, '探索模板');

  const items = selectShelfItems('explore-templates', 10);
  assert.equal(items.length, 7, '探索模板货架行必须展示且仅展示 7 款王牌大卡片');

  for (const item of ALL_CREATIVE_TEMPLATES) {
    assert.ok(item.appId, '卡片必须关联 appId');
    assert.ok(item.coverUrl, '卡片必须包含封面');
    assert.ok(item.previewVideoUrl, '卡片必须包含预览视频');
    assert.ok(item.manifest, '卡片必须挂载完整的 ApplicationManifest 供直通出片消费');
  }
});
