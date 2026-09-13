import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sortProductsForQuickMenu,
  getRecentProductIds,
  saveRecentProductId,
  resolveProductThumbUrl,
} from './productSlotHelper.ts';

const here = dirname(fileURLToPath(import.meta.url));
const menuSource = readFileSync(join(here, 'ProductSlotMenu.tsx'), 'utf8');
const popoverSource = readFileSync(join(here, 'ProductUrlPopover.tsx'), 'utf8');
const chipsSource = readFileSync(join(here, 'PromptSlotChips.tsx'), 'utf8');

test('sortProductsForQuickMenu: prioritizes recent products and orders others by updated_at descending', () => {
  const products = [
    { id: 'p1', name: '老产品 1', updated_at: '2026-09-01T00:00:00Z' },
    { id: 'p2', name: '新产品 2', updated_at: '2026-09-10T00:00:00Z' },
    { id: 'p3', name: '最新产品 3', updated_at: '2026-09-12T00:00:00Z' },
    { id: 'p4', name: '次新产品 4', updated_at: '2026-09-11T00:00:00Z' },
    { id: 'p5', name: '常选老品 5', updated_at: '2026-08-01T00:00:00Z' },
    { id: 'p6', name: '超额产品 6', updated_at: '2026-07-01T00:00:00Z' },
  ];

  // 1. 无最近选择记录时，严格按更新时间倒序
  const defaultSorted = sortProductsForQuickMenu(products, [], 5);
  assert.equal(defaultSorted.length, 5);
  assert.equal(defaultSorted[0].id, 'p3'); // 最新产品 3 (09-12)
  assert.equal(defaultSorted[1].id, 'p4'); // 次新产品 4 (09-11)
  assert.equal(defaultSorted[2].id, 'p2'); // 新产品 2 (09-10)

  // 2. 指定最近选择记录时，选择过的产品默认靠前置顶
  const recentSorted = sortProductsForQuickMenu(products, ['p5', 'p1'], 5);
  assert.equal(recentSorted.length, 5);
  assert.equal(recentSorted[0].id, 'p5'); // 最近常选老品 5 置顶
  assert.equal(recentSorted[1].id, 'p1'); // 最近老产品 1 置顶
  assert.equal(recentSorted[2].id, 'p3'); // 其余按最新倒序
  assert.equal(recentSorted[3].id, 'p4');
  assert.equal(recentSorted[4].id, 'p2');

  // 3. 空边界容错
  assert.deepEqual(sortProductsForQuickMenu([], []), []);
  assert.deepEqual(sortProductsForQuickMenu(null as any, []), []);
});

test('ProductSlotMenu: complies with UI and modular design system', () => {
  assert.ok(menuSource.includes('ProductSlotMenu'), 'exports ProductSlotMenu component');
  assert.ok(menuSource.includes('omx-product-slot-menu'), 'has root menu class');
  assert.ok(menuSource.includes('从产品库导入...'), 'contains browse more products action');
  assert.ok(menuSource.includes('自定义输入'), 'contains custom input action');
  assert.ok(menuSource.includes('从 URL 添加...'), 'contains add from url action');
  assert.ok(menuSource.includes('sortProductsForQuickMenu'), 'calls sortProductsForQuickMenu for ranking');
  assert.doesNotMatch(menuSource, /[\u{1F300}-\u{1FAFF}]/u, 'contains no emoji');
});

test('ProductUrlPopover: provides clean modal for entering product URLs', () => {
  assert.ok(popoverSource.includes('ProductUrlPopover'), 'exports ProductUrlPopover');
  assert.ok(popoverSource.includes('从 URL 添加产品'), 'has localized title');
  assert.ok(popoverSource.includes('placeholder="输入或粘贴产品页面网址'), 'has clear input placeholder');
  assert.ok(popoverSource.includes('omx-video-popover-backdrop'), 'reuses standard backdrop');
  assert.doesNotMatch(popoverSource, /[\u{1F300}-\u{1FAFF}]/u, 'contains no emoji');
});

test('PromptSlotChips: integrates ProductSlotMenu and ProductUrlPopover for product slots', () => {
  assert.ok(chipsSource.includes('ProductSlotMenu'), 'imports ProductSlotMenu');
  assert.ok(chipsSource.includes('ProductUrlPopover'), 'imports ProductUrlPopover');
  assert.ok(chipsSource.includes('onAddProductAttachment'), 'supports onAddProductAttachment callback');
  assert.ok(chipsSource.includes('handleSelectProductFromMenu'), 'handles quick product selection from menu');
  assert.ok(chipsSource.includes('handleOpenUrlInput'), 'handles open URL input');
  assert.ok(chipsSource.includes('handleActivateCustomInput'), 'handles custom text input activation');
});

test('resolveProductThumbUrl: extracts preview url from cover or cover_media_id', () => {
  const pWithCover = {
    id: 'prd_1',
    cover_media_id: 'med_1',
    cover: { id: 'med_1', kind: 'image' },
  };
  assert.equal(
    resolveProductThumbUrl(pWithCover),
    '/omnimux/products/prd_1?preview=med_1',
  );

  const pWithCoverMediaIdOnly = {
    id: 'prd_2',
    cover_media_id: 'med_2',
  };
  assert.equal(
    resolveProductThumbUrl(pWithCoverMediaIdOnly),
    '/omnimux/products/prd_2?preview=med_2',
  );

  const pWithoutCover = {
    id: 'prd_3',
  };
  assert.equal(resolveProductThumbUrl(pWithoutCover), '');
});
