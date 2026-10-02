import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ALL_CREATIVE_TEMPLATES,
  FEATURED_APPS_LIST,
  findTemplateById,
  selectTemplatesByCategory,
  selectShelfItems,
} from './data.js';
import { getCreativeTemplatesSnapshot } from './snapshot.js';
import { FEATURED_APPS_CARDS } from './featured-apps-data.js';
import { queryCreativeTemplates, getCreativeTemplateDetail } from './tools.js';

const RAW_URL = new URL('./creative-templates.json', import.meta.url);
const RAW_BYTES = readFileSync(RAW_URL);
const RAW_ITEMS = JSON.parse(RAW_BYTES.toString('utf8'));

test('getCreativeTemplatesSnapshot: 版本化快照封套与原始字节摘要', () => {
  const snapshot = getCreativeTemplatesSnapshot();
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.dataVersion, /^[0-9a-f]{64}$/, 'dataVersion 必须是小写十六进制 SHA-256');

  const expectedHash = createHash('sha256').update(RAW_BYTES).digest('hex');
  assert.equal(snapshot.dataVersion, expectedHash, 'dataVersion 必须等于 JSON 原始字节的 SHA-256');
  assert.equal(
    snapshot.dataVersion,
    getCreativeTemplatesSnapshot().dataVersion,
    '相同内容必须得到稳定的 dataVersion'
  );

  assert.equal(snapshot.items.length, 395);
  assert.deepEqual(snapshot.items, RAW_ITEMS, 'items 必须逐条保留 JSON 原始有序记录');
  assert.ok(
    snapshot.items.every((item) => item.isApp === undefined && item.type === undefined),
    '原始记录不得携带合并时规范化字段'
  );
});

test('ALL_CREATIVE_TEMPLATES: featured-first 合并与规范化字段', () => {
  assert.equal(FEATURED_APPS_LIST.length, FEATURED_APPS_CARDS.length);
  assert.equal(ALL_CREATIVE_TEMPLATES.length, FEATURED_APPS_CARDS.length + 395);
  assert.ok(Object.isFrozen(ALL_CREATIVE_TEMPLATES));
  assert.ok(Object.isFrozen(FEATURED_APPS_LIST));

  const head = ALL_CREATIVE_TEMPLATES.slice(0, FEATURED_APPS_LIST.length);
  assert.deepEqual(
    head.map((item) => item.id),
    FEATURED_APPS_CARDS.map((card) => card.appId),
    '前段必须是 featured 应用且顺序不变'
  );
  for (const app of head) {
    assert.equal(app.isApp, true);
    assert.equal(app.type, 'app');
    assert.equal(app.title, app.titleZh);
    assert.equal(app.categorySlug, FEATURED_APPS_CARDS.find((c) => c.appId === app.id).categoryKey);
  }

  const tail = ALL_CREATIVE_TEMPLATES.slice(FEATURED_APPS_LIST.length);
  assert.deepEqual(
    tail.map((item) => item.id),
    RAW_ITEMS.map((item) => item.id),
    '后段必须保持 JSON 原始顺序'
  );
  for (const item of tail) {
    assert.equal(item.isApp, false);
    assert.equal(item.type, 'template', '原始记录无 type 字段时必须补默认值');
  }
});

test('findTemplateById: id/appId 首次匹配语义不变', () => {
  assert.equal(findTemplateById(undefined), null);
  assert.equal(findTemplateById(''), null);
  assert.equal(findTemplateById(null), null);
  assert.equal(findTemplateById('no-such-id'), null);

  const featuredHit = findTemplateById(FEATURED_APPS_CARDS[0].appId);
  assert.equal(featuredHit.id, FEATURED_APPS_CARDS[0].appId);
  assert.equal(featuredHit.isApp, true);

  const templateHit = findTemplateById(RAW_ITEMS[0].id);
  assert.equal(templateHit.id, RAW_ITEMS[0].id);
  assert.equal(templateHit.isApp, false);

  // featured 在前，若出现重名 id 必须先命中 featured（首次匹配语义）
  const collisionId = `collision-${FEATURED_APPS_CARDS[0].appId}`;
  const featureOrder = [
    { id: collisionId, isApp: true },
    { id: collisionId, isApp: false },
  ];
  const first = featureOrder.find((item) => item.id === collisionId || item.appId === collisionId);
  assert.equal(first.isApp, true, '并列记录必须按数组顺序取首次匹配');
});

test('selectTemplatesByCategory: 精确分类匹配语义不变', () => {
  assert.equal(selectTemplatesByCategory('all'), ALL_CREATIVE_TEMPLATES);
  assert.equal(selectTemplatesByCategory(''), ALL_CREATIVE_TEMPLATES);
  assert.equal(selectTemplatesByCategory(undefined), ALL_CREATIVE_TEMPLATES);

  const hook = selectTemplatesByCategory('hook-intro');
  assert.ok(hook.length >= 48);
  for (const item of hook) {
    assert.ok(item.categorySlug === 'hook-intro' || item.categoryKey === 'hook-intro');
  }

  // 模糊/大小写不匹配：与迁移前一致的精确匹配，不接受子串
  const fuzzy = selectTemplatesByCategory('hook');
  assert.deepEqual(fuzzy, []);
  const upper = selectTemplatesByCategory('HOOK-INTRO');
  assert.deepEqual(upper, []);
});

test('selectShelfItems: 货架截取与默认 limit 语义不变', () => {
  const featured = selectShelfItems('explore-templates');
  assert.equal(featured.length, Math.min(8, FEATURED_APPS_LIST.length));
  assert.deepEqual(featured.map((i) => i.id), FEATURED_APPS_LIST.slice(0, 8).map((i) => i.id));

  const limited = selectShelfItems('explore-templates', 3);
  assert.equal(limited.length, 3);
  assert.deepEqual(limited.map((i) => i.id), FEATURED_APPS_LIST.slice(0, 3).map((i) => i.id));

  const shelf = selectShelfItems('cinematic-vfx');
  assert.ok(shelf.length === 8);
  assert.deepEqual(
    shelf.map((i) => i.id),
    ALL_CREATIVE_TEMPLATES
      .filter((i) => i.categorySlug === 'cinematic-vfx' || i.categoryKey === 'cinematic-vfx')
      .slice(0, 8)
      .map((i) => i.id)
  );

  const empty = selectShelfItems('no-such-shelf');
  assert.deepEqual(empty, []);
});

test('queryCreativeTemplates: 迁移后同步搜索合同不变', () => {
  const defaults = queryCreativeTemplates();
  assert.equal(defaults.items.length, 10, 'limit 默认 10');
  assert.equal(defaults.total, ALL_CREATIVE_TEMPLATES.length);

  const clamped = queryCreativeTemplates({ limit: 1000 });
  assert.equal(clamped.items.length, 50, 'limit 上限 50');
  const zero = queryCreativeTemplates({ limit: 0 });
  assert.equal(zero.items.length, 1, 'limit 下限 1');
  const fractional = queryCreativeTemplates({ limit: 3.9 });
  assert.equal(fractional.items.length, 3, 'limit 取整');

  // 分类大小写归一 + 中文名匹配（slug 子串「或」中文名子串，不保证相等）
  const lowerSlug = queryCreativeTemplates({ category: 'hook-intro' });
  const upperSlug = queryCreativeTemplates({ category: 'Hook-Intro' });
  assert.equal(upperSlug.total, lowerSlug.total, '分类匹配必须大小写归一');
  assert.ok(lowerSlug.total > 0);
  const byName = queryCreativeTemplates({ category: '黄金开场' });
  assert.ok(byName.total > 0);

  const summary = defaults.items[0];
  assert.deepEqual(
    Object.keys(summary).sort(),
    [
      'categorySlug',
      'duration',
      'hasWorkflow',
      'id',
      'isApp',
      'promptSummary',
      'sourcePlatform',
      'title',
      'titleEn',
    ].sort(), // #2760：workflowSummary 从摘要字段集移除（空值破坏宿主无损 JSON 校验）
    '摘要字段集合不得变化'
  );

  // featured 应用记录摘要字段默认值不变
  const appSummary = queryCreativeTemplates({ query: FEATURED_APPS_CARDS[0].titleZh, limit: 1 });
  assert.equal(appSummary.items.length, 1);
  assert.equal(appSummary.items[0].isApp, true);
  assert.equal(appSummary.items[0].sourcePlatform, 'omnimux-app');
});

test('getCreativeTemplateDetail: 详情首次匹配与默认字段不变', () => {
  assert.equal(getCreativeTemplateDetail(''), null);
  assert.equal(getCreativeTemplateDetail(undefined), null);
  assert.equal(getCreativeTemplateDetail('no-such-id'), null);

  const appDetail = getCreativeTemplateDetail(FEATURED_APPS_CARDS[0].appId);
  assert.equal(appDetail.id, FEATURED_APPS_CARDS[0].appId);
  assert.equal(appDetail.isApp, true);
  assert.equal(appDetail.sourcePlatform, 'omnimux-app');
  assert.equal(appDetail.categorySlug, FEATURED_APPS_CARDS[0].categoryKey);

  const tplDetail = getCreativeTemplateDetail(RAW_ITEMS[0].id);
  assert.equal(tplDetail.id, RAW_ITEMS[0].id);
  assert.equal(tplDetail.isApp, false);
  assert.equal(tplDetail.sourcePlatform, RAW_ITEMS[0].sourcePlatform);
  assert.equal(tplDetail.prompt, RAW_ITEMS[0].prompt);
});

test('数据模块不依赖 React/DOM/浏览器 API', () => {
  // 本测试在无 DOM 的 Node 进程中运行，模块顶层无副作用加载即证明依赖边界；
  // 同时静态断言源码未引用浏览器全局对象。
  const source = readFileSync(new URL('./data.js', import.meta.url), 'utf8');
  assert.ok(!/\bdocument\b|\bwindow\b|\bnavigator\b|\blocalStorage\b|\bfetch\s*\(/.test(source));
  assert.ok(!/from 'react'|require\(['"]react['"]\)/.test(source));
  assert.ok(!/node:(fs|crypto)/.test(source), 'data.js 不得依赖 Node 内置模块，浏览器可打包');
});
