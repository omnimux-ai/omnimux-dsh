import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { beforeEach } from 'node:test';

import {
  CREATIVE_TEMPLATES_SNAPSHOT_PATH,
  getFeaturedAppsList,
  loadCreativeTemplates,
  resetCreativeTemplates,
} from '../../../../omnimux/src/client/session-guide/templates/creative-templates-client.js';
import {
  FEATURED_APPS_LIST,
  SHELVES_CONFIG,
  selectShelfItemsFrom,
} from '../../../../omnimux/src/client/session-guide/templates/templates-data.js';
import {
  ALL_CREATIVE_TEMPLATES,
  selectShelfItems,
  selectTemplatesByCategory,
} from '../../../../omnimux/src/templates/data.js';

/**
 * T3/T4 迁移行为验证：以发布包原始 JSON 构造快照信封，
 * 证明浏览器适配器 + 本地 helper 与迁移前 Host 同步选择器逐条等价。
 */

const RAW_BYTES = readFileSync(
  new URL('../../../../omnimux/src/templates/creative-templates.json', import.meta.url)
);
const RAW_ITEMS = JSON.parse(RAW_BYTES.toString('utf8'));
const RAW_VERSION = createHash('sha256').update(RAW_BYTES).digest('hex');

function snapshotFetch(items = RAW_ITEMS) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return { schemaVersion: 1, dataVersion: RAW_VERSION, items };
      },
    };
  };
  return { fetchImpl, calls };
}

beforeEach(() => {
  resetCreativeTemplates();
});

test('适配器合并列表与迁移前 ALL_CREATIVE_TEMPLATES 逐项等价', async () => {
  const { fetchImpl, calls } = snapshotFetch();
  const merged = await loadCreativeTemplates({ fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0], CREATIVE_TEMPLATES_SNAPSHOT_PATH);
  assert.deepEqual(
    merged.map((item) => ({ id: item.id, appId: item.appId ?? null })),
    ALL_CREATIVE_TEMPLATES.map((item) => ({ id: item.id, appId: item.appId ?? null })),
    '合并列表的 id/appId 顺序必须与旧同步数组一致（featured-first、顺序与重复保留）'
  );
  assert.equal(merged.length, ALL_CREATIVE_TEMPLATES.length);
  assert.deepEqual(
    merged.slice(0, FEATURED_APPS_LIST.length),
    ALL_CREATIVE_TEMPLATES.slice(0, FEATURED_APPS_LIST.length),
    'featured 应用记录必须原样置顶'
  );
  // 规范化合同：快照记录补 isApp:false 与 type 默认值
  const firstTemplate = merged[FEATURED_APPS_LIST.length];
  assert.equal(firstTemplate.isApp, false);
  assert.equal(firstTemplate.type, RAW_ITEMS[0].type || 'template');
});

test('探索页 featured-only 路径零请求：featured 货架不需要快照数据', () => {
  // selectShelfItemsFrom('explore-templates') 永远走 FEATURED_APPS_LIST，
  // 与传入列表无关，同步可用、不触发任何 fetch。
  const items = selectShelfItemsFrom([], 'explore-templates', 5);
  assert.deepEqual(items, FEATURED_APPS_LIST.slice(0, 5));
  assert.equal(items.length, 5);
  assert.equal(FEATURED_APPS_LIST.length, 7);
  assert.deepEqual(FEATURED_APPS_LIST, getFeaturedAppsList());

  // 快照未就绪时组件传 FEATURED_APPS_LIST：非 featured 货架只给出 featured 近似项
  for (const shelf of SHELVES_CONFIG) {
    if (shelf.slug === 'explore-templates' || shelf.slug === 'skills') continue;
    const fallback = selectShelfItemsFrom(FEATURED_APPS_LIST, shelf.slug, 5);
    assert.ok(
      fallback.every((item) => item.isApp === true),
      `${shelf.slug} 未就绪回退只允许出现 featured 应用`
    );
  }
});

test('非 featured 货架过滤与旧 selectShelfItems 语义逐货架等价', async () => {
  const { fetchImpl } = snapshotFetch();
  const merged = await loadCreativeTemplates({ fetchImpl });

  for (const shelf of SHELVES_CONFIG) {
    if (shelf.slug === 'explore-templates' || shelf.slug === 'skills') continue;
    for (const limit of [5, 8]) {
      assert.deepEqual(
        selectShelfItemsFrom(merged, shelf.slug, limit),
        selectShelfItems(shelf.slug, limit),
        `${shelf.slug} @ limit=${limit} 必须与旧货架选择等价`
      );
    }
  }
});

test('分类网格过滤与旧 selectTemplatesByCategory 语义等价（首次匹配/顺序/重复保留）', async () => {
  const { fetchImpl } = snapshotFetch();
  const merged = await loadCreativeTemplates({ fetchImpl });

  // 覆盖 9 大分类以外的常见 slug 与 featured 应用自身的 categoryKey
  const slugs = new Set(merged.flatMap((item) => [item.categorySlug, item.categoryKey]).filter(Boolean));
  for (const slug of slugs) {
    const expected = selectTemplatesByCategory(slug);
    const actual = merged.filter(
      (item) => item.categorySlug === slug || item.categoryKey === slug
    );
    assert.deepEqual(actual, expected, `${slug} 分类过滤必须与旧选择器等价`);
  }
});

test('快照失败拒绝 Promise：不产生可见错误状态也不伪装成空列表', async () => {
  resetCreativeTemplates();
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    async json() {
      return { error: 'templates-unavailable' };
    },
  });
  await assert.rejects(
    () => loadCreativeTemplates({ fetchImpl }),
    (err) => err instanceof Error && err.name !== 'AbortError',
    '失败必须显式拒绝（组件 catch 后保持现状，不渲染错误文案）'
  );
});
