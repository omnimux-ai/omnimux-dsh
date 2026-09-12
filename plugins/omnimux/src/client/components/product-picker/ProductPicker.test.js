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
  assert.ok(pickerSource.includes('aspect-ratio: 1 / 1'), '卡片缩略图为 1:1');
  assert.ok(!pickerSource.includes('__nav-header'), '分类栏目标题已移除（信息降噪）');
  assert.ok(!pickerSource.includes('__tab-badge'), '分类数量徽标已移除');
  assert.ok(!pickerSource.includes('unselectedHint'), '未选中时的页脚提示已移除');
  assert.ok(pickerSource.includes('ModalCloseButton'), '关闭按钮改用全局共享组件');
  assert.ok(pickerSource.includes('placement="external"'), '共享关闭按钮固定在弹窗外侧右上方');
  assert.doesNotMatch(pickerSource, /📦/, 'contains no box emoji');
  assert.doesNotMatch(pickerSource, /🔍/, 'contains no search emoji');
});

test('ProductPickerCard: 参考稿样式（方形缩略图 + 勾选 + 价格胶囊 + 卡下名称）', () => {
  assert.ok(cardSource.includes('omx-product-pick-card'), 'has card class name');
  assert.ok(cardSource.includes('omx-product-pick-card__check'), 'has checkmark container');
  assert.ok(cardSource.includes('omx-product-pick-card__badge'), 'has price badge');
  assert.ok(cardSource.includes('formatPrice'), 'displays formatted price');
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
