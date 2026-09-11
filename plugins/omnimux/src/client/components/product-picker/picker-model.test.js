import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_CATEGORIES,
  collectCategories,
  computeCategoryCounts,
  filterProducts,
  formatPrice,
} from './picker-model.js';

test('formatPrice: formats various price values correctly', () => {
  assert.equal(formatPrice(299), '¥299');
  assert.equal(formatPrice('399'), '¥399');
  assert.equal(formatPrice('¥99'), '¥99');
  assert.equal(formatPrice('$49.99'), '$49.99');
  assert.equal(formatPrice(null), '');
  assert.equal(formatPrice(undefined), '');
  assert.equal(formatPrice(''), '');
});

test('collectCategories: strictly locks to all, physical, and digital with accurate counts', () => {
  const products = [
    { id: 'p1', name: '降噪耳机', kind: 'physical', categories: ['数码', '音频'] },
    { id: 'p2', name: 'UI 设计模板', kind: 'digital', categories: ['设计', '数码'] },
    { id: 'p3', name: '极简背包', kind: 'physical', categories: ['儿童服饰', '万圣节'] },
  ];

  const categories = collectCategories(products);

  // 严格只有 3 项分类，杜绝业务 tags 污染左侧一级导航
  assert.equal(categories.length, 3);
  assert.equal(categories[0].id, 'all');
  assert.equal(categories[0].count, 3);

  assert.equal(categories[1].id, 'physical');
  assert.equal(categories[1].count, 2);

  assert.equal(categories[2].id, 'digital');
  assert.equal(categories[2].count, 1);
});

test('filterProducts: filters by kind, custom tags, and search query', () => {
  const products = [
    {
      id: 'p1',
      name: 'Sony WH-1000XM5 无线降噪耳机',
      kind: 'physical',
      description: '旗舰级双芯降噪科技',
      sku: 'SONY-WH-05',
      categories: ['数码', '音频'],
    },
    {
      id: 'p2',
      name: 'Bose QuietComfort Ultra',
      kind: 'physical',
      description: '沉浸空间音频消噪耳机',
      sku: 'BOSE-QC-U',
      categories: ['音频'],
    },
    {
      id: 'p3',
      name: '短剧剧本策划案与分镜表',
      kind: 'digital',
      description: '爆款短剧全套结构模版',
      sku: 'DIGITAL-SCRIPT-01',
      categories: ['内容创作'],
    },
  ];

  // 全部
  assert.equal(filterProducts(products, { category: 'all' }).length, 3);

  // 按实体类型过滤
  const physicals = filterProducts(products, { category: 'physical' });
  assert.equal(physicals.length, 2);
  assert.equal(physicals[0].id, 'p1');
  assert.equal(physicals[1].id, 'p2');

  // 按数字类型过滤
  const digitals = filterProducts(products, { category: 'digital' });
  assert.equal(digitals.length, 1);
  assert.equal(digitals[0].id, 'p3');

  // 关键词搜索: 支持搜商品标签 categories
  const searchAudio = filterProducts(products, { query: '音频' });
  assert.equal(searchAudio.length, 2);

  // 关键词搜索: 名称
  const searchBose = filterProducts(products, { query: 'bose' });
  assert.equal(searchBose.length, 1);
  assert.equal(searchBose[0].id, 'p2');

  // 关键词搜索: SKU
  const searchSku = filterProducts(products, { query: 'script' });
  assert.equal(searchSku.length, 1);
  assert.equal(searchSku[0].id, 'p3');

  // 分类 + 关键词联合搜索
  const combined = filterProducts(products, { category: 'physical', query: 'sony' });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'p1');

  const emptyMatch = filterProducts(products, { category: 'digital', query: 'sony' });
  assert.equal(emptyMatch.length, 0);
});
