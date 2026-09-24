import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPLORE_PRIMARY_TABS,
  EXPLORE_SUB_CATEGORIES,
} from './templates-data.js';

const sectionSource = readFileSync(new URL('./ExploreTemplatesSection.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../styles.js', import.meta.url), 'utf8');

test('探索模板架构契约：一级大库、专属图标与真实二级分类映射', () => {
  // 1. 验证 6 大一级核心库命名与顺序
  const expectedPrimary = ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills'];
  assert.deepEqual(
    EXPLORE_PRIMARY_TABS.map((t) => t.id),
    expectedPrimary,
    '一级大库必须严格为精选、资产库、灵感库、商品库、爆款趋势、Skills'
  );

  // 2. 验证每个一级库均有专属官方标准图标
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'featured')?.iconName, 'book-open');
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'assets')?.iconName, 'folder');
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'inspiration')?.iconName, 'lightbulb');
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'products')?.iconName, 'shopping-bag');
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'trending')?.iconName, 'trending-up');
  assert.equal(EXPLORE_PRIMARY_TABS.find((t) => t.id === 'skills')?.iconName, 'zap');

  // 3. 验证真实二级细分分类字典完整性
  assert.ok(EXPLORE_SUB_CATEGORIES.featured.some((s) => s.id === 'hook-intro'), '精选下必须有黄金开场');
  assert.ok(EXPLORE_SUB_CATEGORIES.assets.some((s) => s.id === 'character'), '资产库下必须有角色 IP');
  assert.ok(EXPLORE_SUB_CATEGORIES.trending.some((s) => s.id === 'beauty_skincare'), '爆款趋势下必须有美妆个护');
  assert.ok(EXPLORE_SUB_CATEGORIES.skills.some((s) => s.id === 'ugc-testimonial'), 'Skills 下必须有 UGC 种草');

  // 4. 验证样式契约：一级为非胶囊圆角矩形，二级为极简下划线
  assert.match(stylesSource, /\.omnimux-explore-primary-tab\s*\{[^}]*border-radius:\s*8px/);
  assert.match(stylesSource, /\.omnimux-explore-sub-tab\.active::after\s*\{[^}]*position:\s*absolute/);

  // 5. 验证组件实现已彻底剔除状态提示行
  assert.doesNotMatch(sectionSource, /filter-meta-hint/, '必须彻底剔除当前视图状态提示行');
  assert.match(sectionSource, /loadLibraryCards/, '非精选大库必须支持调用标准素材加载函数');
});
