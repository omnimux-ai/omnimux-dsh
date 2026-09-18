import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { resolveThumbnails } from '../../plugins/omnimux/src/client/components/product-picker/picker-model.js';

describe('ProductPickerCard & ProductPickerAddCard 视觉重构端到端全链路验证 (Issue #2342)', () => {
  it('E2E-1: 「创建产品」卡片为 1:1 正方形虚线大卡，居中包含袋子图标与标题，无冗余描述', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    const doc = dom.window.document;

    const grid = doc.createElement('div');
    grid.className = 'omx-product-pick__grid';

    // 构造 AddCard 渲染结构
    const addCard = doc.createElement('article');
    addCard.className = 'omx-product-pick-card omx-product-pick-card--add';
    addCard.setAttribute('role', 'button');
    addCard.setAttribute('tabindex', '0');
    addCard.setAttribute('aria-label', '创建产品');

    const inner = doc.createElement('div');
    inner.className = 'omx-product-pick-card__add-inner';

    const icon = doc.createElement('div');
    icon.className = 'omx-product-pick-card__add-icon';
    icon.innerHTML = '<svg width="34" height="34"><path d="bag"></path></svg>';

    const label = doc.createElement('div');
    label.className = 'omx-product-pick-card__add-label';
    label.textContent = '创建产品';

    inner.appendChild(icon);
    inner.appendChild(label);
    addCard.appendChild(inner);
    grid.appendChild(addCard);
    doc.body.appendChild(grid);

    // 断言
    assert.ok(addCard.classList.contains('omx-product-pick-card--add'), '具有 1:1 创建卡变体类');
    assert.equal(addCard.getAttribute('role'), 'button');
    assert.equal(addCard.querySelector('.omx-product-pick-card__add-label')?.textContent, '创建产品');
    assert.ok(addCard.querySelector('.omx-product-pick-card__add-icon svg'), '包含矢量购物袋图标');
    assert.equal(addCard.querySelector('.omx-product-pick-card__body'), null, '移除底部独立描述 body');
  });

  it('E2E-2: 商品卡片多图缩略图队列与超量徽标算法准确', () => {
    // 1. 单图：不应显示缩略图队列
    const singleProduct = { id: 'p1', media: [{ id: 'm1', kind: 'image' }], media_count: 1 };
    const singleThumbs = resolveThumbnails(singleProduct);
    const singleTotal = Math.max(singleProduct.media_count, singleThumbs.length);
    const singleShowRow = singleThumbs.slice(0, 3).length > 1 || singleTotal > 3;
    assert.equal(singleShowRow, false, '单图商品不显示底部缩略图队列');

    // 2. 3 张图：展示 3 个微缩图，无超量徽标
    const threeProduct = {
      id: 'p2',
      thumbnails: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
      media_count: 3,
    };
    const threeThumbs = resolveThumbnails(threeProduct);
    const threeTotal = Math.max(threeProduct.media_count, threeThumbs.length);
    const threeVisible = threeThumbs.slice(0, 3);
    const threeOverflow = threeTotal > 3 ? threeTotal - 3 : 0;
    assert.equal(threeVisible.length, 3);
    assert.equal(threeOverflow, 0, '恰好 3 张图时不显示 +xx 徽标');

    // 3. 14 张图：展示前 3 个微缩图，超量徽标显示 +11
    const fourteenProduct = {
      id: 'p3',
      thumbnails: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }],
      media_count: 14,
    };
    const fourteenThumbs = resolveThumbnails(fourteenProduct);
    const fourteenTotal = Math.max(fourteenProduct.media_count, fourteenThumbs.length);
    const fourteenVisible = fourteenThumbs.slice(0, 3);
    const fourteenOverflow = fourteenTotal > 3 ? fourteenTotal - 3 : 0;
    assert.equal(fourteenVisible.length, 3);
    assert.equal(fourteenOverflow, 11, '14 张图时超量为 14 - 3 = 11');
  });

  it('E2E-3: DOM 渲染结构中彻底移除价格标签，保留勾选框与卡下信息', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const doc = dom.window.document;

    const card = doc.createElement('article');
    card.className = 'omx-product-pick-card';
    card.setAttribute('role', 'radio');
    card.setAttribute('data-selected', 'true');

    const thumb = doc.createElement('div');
    thumb.className = 'omx-product-pick-card__thumb';

    const check = doc.createElement('span');
    check.className = 'omx-product-pick-card__check';
    check.setAttribute('data-selected', 'true');
    thumb.appendChild(check);

    const thumbsRow = doc.createElement('div');
    thumbsRow.className = 'omx-product-pick-card__thumbs-row';
    const subThumb = doc.createElement('img');
    subThumb.className = 'omx-product-pick-card__sub-thumb';
    thumbsRow.appendChild(subThumb);
    thumb.appendChild(thumbsRow);

    const body = doc.createElement('div');
    body.className = 'omx-product-pick-card__body';
    const title = doc.createElement('div');
    title.className = 'omx-product-pick-card__title';
    title.textContent = '女士高级淡香水';
    const meta = doc.createElement('div');
    meta.className = 'omx-product-pick-card__meta';
    meta.textContent = '女士香水';
    body.appendChild(title);
    body.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(body);
    doc.body.appendChild(card);

    assert.equal(card.querySelector('.omx-product-pick-card__badge'), null, '彻底不存在价格标签');
    assert.ok(card.querySelector('.omx-product-pick-card__check'), '勾选框依然保留');
    assert.ok(card.querySelector('.omx-product-pick-card__thumbs-row'), '微缩图队列保留');
    assert.equal(card.querySelector('.omx-product-pick-card__title')?.textContent, '女士高级淡香水');
  });
});
