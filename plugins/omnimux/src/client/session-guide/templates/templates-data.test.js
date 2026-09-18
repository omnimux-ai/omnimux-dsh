import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  ALL_CREATIVE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  findTemplateById,
  selectShelfItems,
} from './templates-data.js';

test('7 大王牌精选应用规模与数据完整性验证', () => {
  assert.equal(ALL_CREATIVE_TEMPLATES.length, 7, `精选应用总数应恰好为 7 套，当前: ${ALL_CREATIVE_TEMPLATES.length}`);

  for (const item of ALL_CREATIVE_TEMPLATES) {
    assert.ok(item.id, '每项应用必须有 id');
    assert.ok(item.title, `应用 [${item.id}] 必须有标题`);
    assert.ok(item.categorySlug, `应用 [${item.id}] 必须有 categorySlug`);
    assert.ok(item.cover, `应用 [${item.id}] 必须有封面图`);
    assert.ok(item.previewVideoUrl, `应用 [${item.id}] 必须有成片预览视频`);
    assert.ok(item.manifest, `应用 [${item.id}] 必须绑定官方 ApplicationManifest`);
    assert.equal(item.manifest?.appId, item.appId, 'manifest.appId 必须严格对齐');
  }
});

test('单分组架构与货架行配置验证', () => {
  assert.equal(SHELVES_CONFIG.length, 1, '货架行收敛为单分组「探索模板」');
  assert.equal(SHELVES_CONFIG[0].slug, 'explore-templates');
  assert.equal(SHELVES_CONFIG[0].titleZh, '探索模板');

  const items = selectShelfItems('explore-templates', 7);
  assert.equal(items.length, 7, '单分组必须包含全部 7 款王牌精选应用');
});

test('分类筛选与 ID 检索功能验证', () => {
  const found = findTemplateById('app-creatify-app-demo');
  assert.ok(found, '必须能通过 appId 检索到软件应用');
  assert.equal(found.categorySlug, 'apps-software');

  const allItems = selectTemplatesByCategory('all');
  assert.equal(allItems.length, 7);
});
