import React, { useEffect, useMemo, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { ProductPickerCard } from './ProductPickerCard.jsx';
import { collectCategories, filterProducts, createSafeT } from './picker-model.js';
import {
  PICKER_DIALOG_VARIANT_CLASS,
  PICKER_LAYOUTS,
  ensurePickerDialogStyles,
  pickerDialogClassName,
  pickerDialogWidth,
} from '../picker-dialog/pickerDialogContract.js';
import {
  PickerHeaderTabs,
  PickerToolbar,
  PickerFilterPills,
  PickerSearchInput,
  PickerFooter,
} from '../picker-dialog/index.js';
import { ModalCloseButton } from '../ModalCloseButton.jsx';

const STYLE_ID = 'omx-composer-add-product-picker';

const CSS = `
/* 顶部 Tab 单层顶栏：宽度 = 6 列高密度微卡 + 5 个列间距（由契约推导）。
   变量必须挂在弹窗自身的变体类上——挂到 .omx-product-pick（子元素）上，父元素读不到，会退化为兜底列数。 */
.${PICKER_DIALOG_VARIANT_CLASS.product} {
  --omnimux-pick-dialog-width: ${pickerDialogWidth(PICKER_LAYOUTS.product)};
}
.omx-product-pick {
  display: flex; flex-direction: column; width: 100%; height: 480px; min-height: 0;
  max-height: calc(80vh - 190px);
  box-sizing: border-box;
}
.omx-product-pick__header {
  flex: none; display: flex; align-items: center; justify-content: flex-start;
  padding: 16px 24px 0;
}
.omx-product-pick__tabs {
  display: flex; align-items: center; gap: 24px;
}
.omx-product-pick__tab {
  appearance: none; background: transparent; border: none; cursor: pointer;
  font: inherit; font-size: 16px; font-weight: 500; color: var(--dsw-alias-label-tertiary);
  padding: 4px 0 10px; position: relative; transition: color 0.15s ease;
  white-space: nowrap;
}
.omx-product-pick__tab:hover,
.omx-product-pick__tab[data-active="true"] { color: var(--dsw-alias-label-primary); }
.omx-product-pick__tab[data-active="true"] { font-weight: 600; }
.omx-product-pick__tab[data-active="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: var(--dsw-alias-label-primary); border-radius: 2px;
}
.omx-product-pick__toolbar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px 12px; gap: 16px;
}
.omx-product-pick__filter-pills {
  display: flex; align-items: center; gap: 8px; overflow-x: auto;
  scrollbar-width: none;
}
.omx-product-pick__filter-pills::-webkit-scrollbar { display: none; }
.omx-product-pick__pill {
  appearance: none; background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  padding: 4px 12px; font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap;
  transition: all 0.15s ease;
}
.omx-product-pick__pill:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-product-pick__pill[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: transparent;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.omx-product-pick__search-wrap {
  position: relative; display: flex; align-items: center; width: 220px; flex-shrink: 0;
}
.omx-product-pick__search-icon {
  position: absolute; left: 12px; color: var(--dsw-alias-label-tertiary);
  pointer-events: none; display: flex; align-items: center;
}
.omx-product-pick__search-input {
  width: 100%; height: 32px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  padding: 0 30px 0 32px; font-size: 13px; color: var(--dsw-alias-label-primary);
  outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}
.omx-product-pick__search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.omx-product-pick__search-input:focus {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-label-primary);
}
.omx-product-pick__search-clear {
  position: absolute; right: 10px; appearance: none; border: none;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; padding: 2px; border-radius: 4px; display: flex;
}
.omx-product-pick__search-clear:hover { color: var(--dsw-alias-label-primary); }
.omx-product-pick__scroll {
  flex: 1; overflow-y: auto; padding: 0 24px; min-height: 0;
}
.omx-product-pick__grid {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px;
}
.omx-product-pick__empty {
  border: 1px dashed var(--dsw-alias-border-l4); border-radius: 12px; min-height: 200px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; padding: 24px; text-align: center;
}
.omx-product-pick-card {
  display: flex; flex-direction: column; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-product-pick-card__thumb {
  position: relative; width: 100%; aspect-ratio: 1 / 1;
  background: var(--dsw-alias-bg-module-platform); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-product-pick-card:hover .omx-product-pick-card__thumb { transform: translateY(-2px); }
.omx-product-pick-card[data-selected="true"] .omx-product-pick-card__thumb {
  border-color: var(--dsw-alias-button-primary-fill);
}
.omx-product-pick-card__img {
  width: 100%; height: 100%; object-fit: cover;
}
.omx-product-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.omx-product-pick-card__glyph {
  font-size: 18px; font-weight: 600; opacity: 0.6;
}
.omx-product-pick-card__check {
  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2;
  border: 1.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.omx-product-pick-card__check[data-selected="true"] {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-product-pick-card__badge {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  font-size: 11px; line-height: 16px; font-weight: 600; padding: 2px 8px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 0 2px; min-width: 0;
}
.omx-product-pick-card__title {
  font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__meta {
  display: flex; align-items: center; min-width: 0;
}
.omx-product-pick-card__sku {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 页脚恒为「按钮右下对齐」：左侧提示是条件渲染的，用 space-between 时单子项会被推到行首（真机实测按钮挤在左下） */
.omx-product-pick__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 16px; width: 100%;
  box-sizing: border-box; padding: 2px 0;
}
.omx-product-pick__meta {
  margin-right: auto; min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-product-pick__meta-highlight {
  color: var(--dsw-alias-label-primary); font-weight: 600; margin-left: 4px;
}
.omx-product-pick__actions {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.omx-product-pick__error {
  color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 0 24px 8px;
}
`;

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  ensurePickerDialogStyles(doc);
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head?.appendChild(style);
}

async function defaultFetchProducts() {
  const response = await fetch('/omnimux/products');
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  if (!response.ok) throw new Error(json.message || json.error || `HTTP ${response.status}`);
  return Array.isArray(json.products) ? json.products : [];
}

/**
 * 产品库模态选择器组件
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onConfirm: (product: any) => void,
 *   initialProductId?: string,
 *   fetchProducts?: () => Promise<any[]>,
 *   t?: (key: string, vars?: any) => string,
 * }} props
 */
export function ProductPicker({
  open,
  onClose,
  onConfirm,
  initialProductId,
  fetchProducts = defaultFetchProducts,
  t,
}) {
  const safeT = useMemo(() => createSafeT(t), [t]);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProducts()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        if (initialProductId) {
          const init = list.find((p) => p.id === initialProductId);
          if (init) setSelectedProduct(init);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fetchProducts, initialProductId]);

  const categories = useMemo(() => collectCategories(products), [products]);

  const availableTags = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      if (Array.isArray(p.categories)) {
        for (const c of p.categories) {
          if (typeof c === 'string' && c.trim()) set.add(c.trim());
        }
      }
    }
    return Array.from(set).slice(0, 6);
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = filterProducts(products, { category: activeCategory, query: searchQuery });
    if (activeTag && activeTag !== 'all') {
      list = list.filter((p) => Array.isArray(p.categories) && p.categories.includes(activeTag));
    }
    return list;
  }, [products, activeCategory, searchQuery, activeTag]);

  const handleSelect = (product) => {
    if (selectedProduct?.id === product.id) {
      setSelectedProduct(null);
    } else {
      setSelectedProduct(product);
    }
  };

  const handleConfirm = (productToConfirm) => {
    const target = productToConfirm || selectedProduct;
    if (!target) return;
    onConfirm(target);
    onClose();
  };

  if (!open) return null;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={safeT('productPicker.title')}
      size="lg"
      className={pickerDialogClassName('product')}
      footer={
        <PickerFooter
          className="omx-product-pick__footer"
          metaClassName="omx-product-pick__meta"
          actionsClassName="omx-product-pick__actions"
          meta={
            selectedProduct ? (
              <>
                {safeT('productPicker.selectedMeta')}
                <span className="omx-product-pick__meta-highlight">
                  {selectedProduct.name || selectedProduct.id}
                </span>
              </>
            ) : searchQuery.trim() ? (
              <span>{safeT('productPicker.useCustom', { name: searchQuery.trim() })}</span>
            ) : null
          }
          cancelLabel={safeT('productPicker.cancel')}
          confirmLabel={safeT('productPicker.confirm')}
          onCancel={onClose}
          onConfirm={() => {
            if (selectedProduct) {
              handleConfirm(selectedProduct);
            } else if (searchQuery.trim()) {
              handleConfirm({
                id: `custom-${Date.now()}`,
                name: searchQuery.trim(),
                title: searchQuery.trim(),
              });
            }
          }}
          confirmDisabled={!selectedProduct && !searchQuery.trim()}
        />
      }
    >
      <div className="omx-product-pick">
        {/* 全局统一：弹窗外侧右上方圆形关闭按钮（ModalCloseButton external） */}
        <ModalCloseButton onClose={onClose} placement="external" ariaLabel={safeT('productPicker.cancel')} />

        {/* 单层顶栏：Tab 顶替传统标题栏 */}
        <PickerHeaderTabs
          tabs={categories.map((cat) => ({
            id: cat.id,
            label: cat.key ? safeT(cat.key) : cat.label,
          }))}
          activeTab={activeCategory}
          onTabChange={setActiveCategory}
          ariaLabel={safeT('productPicker.categories')}
          className="omx-product-pick__tabs"
          tabClassName="omx-product-pick__tab"
          headerClassName="omx-product-pick__header"
        />

        {/* 次级工具栏：左侧分类/标签胶囊，右侧紧凑搜索框 */}
        <PickerToolbar className="omx-product-pick__toolbar">
          <PickerFilterPills
            pills={[
              { id: 'all', label: safeT('productPicker.cat.all') || '全部' },
              ...availableTags.map((tag) => ({ id: tag, label: tag })),
            ]}
            activePill={activeTag}
            onPillChange={setActiveTag}
            className="omx-product-pick__filter-pills"
            pillClassName="omx-product-pick__pill"
          />

          <PickerSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim() && !selectedProduct) {
                e.preventDefault();
                handleConfirm({
                  id: `custom-${Date.now()}`,
                  name: searchQuery.trim(),
                  title: searchQuery.trim(),
                });
              }
            }}
            placeholder={safeT('productPicker.searchPlaceholder')}
            className="omx-product-pick__search-wrap"
            inputClassName="omx-product-pick__search-input"
            iconClassName="omx-product-pick__search-icon"
            clearClassName="omx-product-pick__search-clear"
          />
        </PickerToolbar>

        {error ? <div className="omx-product-pick__error">{error}</div> : null}

        <div className="omx-product-pick__scroll">
          {loading ? (
            <div className="omx-product-pick__empty">{safeT('productPicker.loading')}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="omx-product-pick__empty">
              <p>
                {searchQuery || activeTag !== 'all'
                  ? safeT('productPicker.emptySearch')
                  : safeT('productPicker.empty')}
              </p>
              {searchQuery.trim() ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleConfirm({
                      id: `custom-${Date.now()}`,
                      name: searchQuery.trim(),
                      title: searchQuery.trim(),
                    });
                  }}
                >
                  {safeT('productPicker.useCustom', { name: searchQuery.trim() })}
                </Button>
              ) : null}
              {!searchQuery && activeTag === 'all' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    try {
                      window.__omnimuxWorkbench?.open?.({
                        tabId: 'omnimux-products:stage',
                        title: '产品库',
                      });
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {safeT('productPicker.goLibrary')}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="omx-product-pick__grid">
              {filteredProducts.map((product) => {
                const firstCategory = Array.isArray(product.categories) && product.categories[0];
                const typeLabel = firstCategory || (
                  product.kind === 'digital'
                    ? safeT('productPicker.cat.digital')
                    : safeT('productPicker.cat.physical')
                );
                return (
                  <ProductPickerCard
                    key={product.id}
                    product={product}
                    selected={selectedProduct?.id === product.id}
                    typeLabel={typeLabel}
                    onSelect={handleSelect}
                    onConfirmSelect={handleConfirm}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
