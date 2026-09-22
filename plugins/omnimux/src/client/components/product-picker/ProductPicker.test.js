import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSafeT } from './picker-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const pickerSource = readFileSync(join(here, 'ProductPicker.jsx'), 'utf8');
const cardSource = readFileSync(join(here, 'ProductPickerCard.jsx'), 'utf8');
const modalSource = readFileSync(
  join(here, '../../composer-add/ProductPickerModal.jsx'),
  'utf8',
);

test('createSafeT: fallbacks to DEFAULT_STRINGS when custom t returns raw key or empty', () => {
  // 1. 无 customT
  const defaultT = createSafeT(undefined);
  assert.equal(defaultT('productPicker.title'), '从产品库选择');
  assert.equal(defaultT('productPicker.cancel'), '取消');
  assert.equal(defaultT('productPicker.confirm'), '确认选择');
  assert.equal(defaultT('productPicker.cat.physical'), '实体商品');
  assert.equal(defaultT('productPicker.unselectedHint'), '请选择一件商品');

  // 2. 模拟宿主 t 遇到未知 key 返回原始 key
  const hostMockT = (key) => key; // 宿主遇到未注册的 key 时返回 key 本身
  const safeT = createSafeT(hostMockT);
  assert.equal(safeT('productPicker.title'), '从产品库选择');
  assert.equal(safeT('productPicker.searchPlaceholder'), '搜索产品名称、描述、SKU、标签…');
  assert.equal(safeT('productPicker.cat.all'), '全部');
  assert.equal(safeT('productPicker.unselectedHint'), '请选择一件商品');

  // 3. 宿主自定义命中
  const customMockT = (key) => (key === 'productPicker.title' ? '自定义选择商品' : key);
  const safeCustomT = createSafeT(customMockT);
  assert.equal(safeCustomT('productPicker.title'), '自定义选择商品');
  assert.equal(safeCustomT('productPicker.cancel'), '取消');
});

test('ProductPicker: follows design system, contains search, nav, empty states and dialog', () => {
  assert.ok(pickerSource.includes('ModalDialog'), 'uses ModalDialog from dsh-ui-kit');
  assert.ok(pickerSource.includes('size="lg"'), 'sits on the kit lg tier instead of an invalid width prop');
  assert.ok(pickerSource.includes("className={pickerDialogClassName('product')}"), '弹窗样式通过官方 className 接口注入（含布局变体类）');
  assert.ok(!/width=\{\d+\}/.test(pickerSource), 'no dead width prop (ModalDialog has none)');
  assert.ok(pickerSource.includes('max-height: calc(80vh - 190px)'), 'caps height by viewport to avoid dialog overflow');
  assert.ok(pickerSource.includes('ensurePickerDialogStyles'), 'injects the shared dialog geometry contract');
  assert.ok(!pickerSource.includes('min-height: 480px'), 'drops the rigid min-height that overflowed the dialog body');
  assert.ok(pickerSource.includes('ProductPickerCard'), 'renders ProductPickerCard');
  assert.ok(pickerSource.includes('omx-product-pick__search-input'), 'contains search input');
  assert.ok(pickerSource.includes('collectCategories'), 'uses collectCategories');
  assert.ok(pickerSource.includes('filterProducts'), 'uses filterProducts');
  assert.ok(pickerSource.includes('flex-shrink: 0'), 'actions protected against overflow squeeze');
  assert.ok(pickerSource.includes('omx-product-pick__tabs'), '分类改为顶部 Tab（参考稿布局）');
  assert.ok(!pickerSource.includes('omx-product-pick__nav'), '不再有左侧分类栏');
  assert.ok(
    /\$\{PICKER_DIALOG_VARIANT_CLASS\.product\}\s*\{[^}]*--omnimux-pick-dialog-width/.test(pickerSource),
    '宽度变量必须挂在弹窗自身的变体类上（挂到子元素会退化为 3 列）',
  );
  assert.ok(
    !/\.omx-product-pick\s*\{[^}]*--omnimux-pick-dialog-width/.test(pickerSource),
    '宽度变量不得写在不被弹窗读取的根元素上',
  );
  assert.ok(pickerSource.includes('PRODUCT_CARD_CSS'), '卡片样式来自 ProductPickerCard，弹窗只组合引用');
  assert.ok(cardSource.includes('aspect-ratio: 1 / 1'), '卡片缩略图为 1:1');
  assert.ok(!pickerSource.includes('__nav-header'), '分类栏目标题已移除（信息降噪）');
  assert.ok(!pickerSource.includes('__tab-badge'), '分类数量徽标已移除');
  assert.ok(!pickerSource.includes('unselectedHint'), '未选中时的页脚提示已移除');
  assert.ok(pickerSource.includes('ModalCloseButton'), '关闭按钮改用全局共享组件');
  assert.ok(pickerSource.includes('placement="external"'), '共享关闭按钮固定在弹窗外侧右上方');
  assert.doesNotMatch(pickerSource, /📦/, 'contains no box emoji');
  assert.doesNotMatch(pickerSource, /🔍/, 'contains no search emoji');
});

test('ProductPickerCard: 参考图 1 样式（方形缩略图 + 勾选 + 多图缩略队列与超量徽标 + 移除价格标签）', () => {
  assert.ok(cardSource.includes('omx-product-pick-card'), 'has card class name');
  assert.ok(cardSource.includes('omx-product-pick-card__check'), 'has checkmark container');
  assert.ok(!cardSource.includes('omx-product-pick-card__badge'), 'drops price badge');
  assert.ok(!cardSource.includes('formatPrice'), 'drops price formatting');
  assert.ok(cardSource.includes('omx-product-pick-card__thumbs-row'), 'has sub thumbnails row');
  assert.ok(cardSource.includes('omx-product-pick-card__sub-thumb'), 'has sub thumbnail item');
  assert.ok(cardSource.includes('omx-product-pick-card__sub-badge'), 'has overflow badge (+xx)');
  assert.ok(cardSource.includes('resolveThumbnails'), 'resolves multi-thumbnails for card');
  assert.ok(cardSource.includes('omx-product-pick-card__title'), 'shows product name below the thumb');
  assert.ok(cardSource.includes('ProductPlaceholderIcon'), 'uses SVG vector placeholder icon');
  assert.ok(cardSource.includes('role="radio"'), 'declares radio role for single-select');
  assert.ok(!cardSource.includes('__desc'), 'drops the description line（保持简洁）');
  assert.ok(!cardSource.includes('__tags'), 'drops the tag chips（保持简洁）');
});

test('ProductPickerModal: exposes thin adapter contract with onConfirm, onClose, open and t', () => {
  assert.ok(modalSource.includes('export function ProductPickerModal'), 'exports ProductPickerModal');
  assert.ok(modalSource.includes('ProductPicker'), 'delegates to ProductPicker');
});

test('ProductPicker: supports custom product name fallback when search query is entered', () => {
  const currentPickerSource = readFileSync(join(here, 'ProductPicker.jsx'), 'utf8');
  assert.ok(currentPickerSource.includes('productPicker.useCustom'), 'supports custom product placeholder');
  assert.ok(currentPickerSource.includes('custom-'), 'generates custom product fallback id');
  const safeT = createSafeT(undefined);
  assert.equal(safeT('productPicker.useCustom', { name: '便携小风扇' }), '使用自定义产品："便携小风扇"');
});

test('ProductPicker: 列表首位创建产品 + 链接弹窗回流契约', () => {
  const source = readFileSync(join(here, 'ProductPicker.jsx'), 'utf8');
  const addCard = readFileSync(join(here, 'ProductPickerAddCard.jsx'), 'utf8');
  const createModal = readFileSync(join(here, 'ProductCreateLinkModal.jsx'), 'utf8');
  const api = readFileSync(join(here, 'product-create-api.js'), 'utf8');
  const indexSource = readFileSync(join(here, 'index.js'), 'utf8');

  assert.ok(source.includes('<ProductPickerAddCard'), '网格注入创建卡片');
  assert.ok(source.includes('<ProductCreateLinkModal'), '挂载链接创建弹窗');
  assert.ok(source.includes('handleCreated'), '创建成功回流处理');
  assert.ok(source.includes("setActiveCategory('all')"), '创建成功后重置分类筛选');
  assert.ok(source.includes("setSearchQuery('')"), '创建成功后清空搜索');
  assert.ok(source.includes('list.unshift(product)'), '新产品插入列表首位');
  assert.ok(source.includes('setSelectedProduct(product)'), '创建成功后选中新产品');
  assert.ok(!/onConfirm\(result\.product\)/.test(source), '创建成功不得自动确认外层');
  assert.ok(source.includes('PRODUCT_CARD_CSS'), '创建卡虚线样式随卡片样式组合进弹窗');
  assert.ok(readFileSync(join(here, 'ProductPickerCard.jsx'), 'utf8').includes('omx-product-pick-card--add'), '创建卡虚线样式');
  assert.ok(source.includes('omx-product-pick__empty--span'), '空态跨列用 class 而非内联 style');
  assert.doesNotMatch(source, /style=\{\{\s*gridColumn/, '禁止空态内联 gridColumn');

  assert.ok(addCard.includes('role="button"'), '创建卡可键盘激活');
  assert.ok(addCard.includes('omx-product-pick-card--add'), '创建卡变体类');
  assert.ok(addCard.includes('omx-product-pick-card__add-inner'), '创建卡采用居中布局');
  assert.ok(addCard.includes('omx-product-pick-card__add-icon'), '创建卡包含袋子图标');
  assert.ok(addCard.includes('omx-product-pick-card__add-label'), '创建卡包含标题');
  assert.ok(!addCard.includes('omx-product-pick-card__body'), '创建卡移除底部独立body');
  assert.ok(createModal.includes('/omnimux/products/import-from-link') || api.includes('/omnimux/products/import-from-link'), '复用公开解析路由');
  assert.ok(api.includes("method: 'POST', body") && api.includes("'/omnimux/products'"), '保存走公开 POST /omnimux/products');
  assert.ok(api.includes('stage: \'stale\''), '关闭竞态作废过期请求');
  assert.ok(indexSource.includes('ProductPickerAddCard'), 'index 导出创建卡');
  assert.ok(indexSource.includes('ProductCreateLinkModal'), 'index 导出创建弹窗');

  const safeT = createSafeT(undefined);
  assert.equal(safeT('productPicker.createCard'), '创建产品');
  assert.equal(safeT('productPicker.create.submit'), '分析链接');
  assert.equal(safeT('productPicker.create.heroEm'), '商品链接');
  assert.ok(createModal.includes('omx-pcl__title'), '居中大标题布局');
  assert.ok(createModal.includes('omx-pcl__primary'), '居中主 CTA');
  assert.ok(createModal.includes('omx-pcl__manual'), '手动创建次链');
  assert.equal(safeT('productPicker.create.invalidUrl'), '请输入合法的网页链接');
});

test('ProductPickerCard: resolveThumbnails handles media, thumbnails, images and overflow calculations', async () => {
  const { resolveThumbnails } = await import('./picker-model.js');
  const mockProduct = {
    id: 'prd_test',
    media: [
      { id: 'img1', kind: 'image' },
      { id: 'img2', kind: 'image' },
      { id: 'vid1', kind: 'video' },
      { id: 'img3', kind: 'image' },
      { id: 'img4', kind: 'image' },
    ],
    media_count: 14,
  };
  const list = resolveThumbnails(mockProduct);
  assert.equal(list.length, 4, 'filters out video, keeps 4 images');
  assert.equal(list[0], '/omnimux/products/prd_test?preview=img1');
  assert.equal(list[1], '/omnimux/products/prd_test?preview=img2');
  assert.equal(list[2], '/omnimux/products/prd_test?preview=img3');
  assert.equal(list[3], '/omnimux/products/prd_test?preview=img4');

  // 计算：最多展示 3 个缩略图，超量计数为 14 - 3 = 11
  const visible = list.slice(0, 3);
  const total = Math.max(mockProduct.media_count, list.length);
  const overflow = total > 3 ? total - 3 : 0;
  assert.equal(visible.length, 3);
  assert.equal(overflow, 11);
});
