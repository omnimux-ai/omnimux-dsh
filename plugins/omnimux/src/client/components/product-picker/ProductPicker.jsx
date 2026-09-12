import React, { useEffect, useMemo, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { ProductPickerCard } from './ProductPickerCard.jsx';
import { collectCategories, filterProducts, createSafeT } from './picker-model.js';
import { PICKER_DIALOG_CLASS, PICKER_LAYOUTS, ensurePickerDialogStyles, pickerDialogWidth } from '../picker-dialog/pickerDialogContract.js';
import { ModalCloseButton } from '../ModalCloseButton.jsx';

const STYLE_ID = 'omx-composer-add-product-picker';

const CSS = `
.omx-product-pick {
  /* 顶部 Tab 布局：宽度 = 4 列卡片 + 3 个列间距（无左侧分类栏），由契约推导 */
  --omnimux-pick-dialog-width: ${pickerDialogWidth(PICKER_LAYOUTS.product)};
  display: flex; flex-direction: column; width: 100%; height: 480px; min-height: 0;
  max-height: calc(80vh - 190px);
  box-sizing: border-box;
}
.omx-product-pick__tabs {
  flex: none; display: flex; align-items: center; gap: 28px;
  padding: 4px 2px 0; border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omx-product-pick__tab {
  appearance: none; background: transparent; border: none; cursor: pointer;
  font: inherit; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-tertiary);
  padding: 10px 2px 12px; position: relative; transition: color 0.15s ease;
  white-space: nowrap;
}
.omx-product-pick__tab:hover,
.omx-product-pick__tab[data-active="true"] { color: var(--dsw-alias-label-primary); }
.omx-product-pick__tab[data-active="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
  background: var(--dsw-alias-label-primary); border-radius: 2px;
}
.omx-product-pick__toolbar {
  flex: none; display: flex; align-items: center; justify-content: flex-end;
  padding: 16px 0 14px;
}
.omx-product-pick__search-wrap {
  position: relative; display: flex; align-items: center; width: 240px;
}
.omx-product-pick__search-icon {
  position: absolute; left: 12px; color: var(--dsw-alias-label-tertiary);
  pointer-events: none; display: flex; align-items: center;
}
.omx-product-pick__search-input {
  width: 100%; height: 36px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  padding: 0 34px 0 34px; font-size: 14px; color: var(--dsw-alias-label-primary);
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
  flex: 1; overflow-y: auto; padding-right: 2px;
}
.omx-product-pick__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;
}
.omx-product-pick__empty {
  border: 1px dashed var(--dsw-alias-border-l4); border-radius: 12px; min-height: 200px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; padding: 24px; text-align: center;
}
.omx-product-pick-card {
  display: flex; flex-direction: column; gap: 10px; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-product-pick-card__thumb {
  position: relative; width: 100%; aspect-ratio: 1 / 1;
  background: var(--dsw-alias-bg-module-platform); border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-product-pick-card:hover .omx-product-pick-card__thumb { transform: translateY(-2px); }
.omx-product-pick-card[data-selected="true"] .omx-product-pick-card__thumb {
  border-color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__img {
  width: 100%; height: 100%; object-fit: cover;
}
.omx-product-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.omx-product-pick-card__glyph {
  font-size: 20px; font-weight: 600; opacity: 0.6;
}
.omx-product-pick-card__check {
  position: absolute; top: 10px; left: 10px; width: 20px; height: 20px; border-radius: 6px;
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
  position: absolute; left: 10px; bottom: 10px; z-index: 2;
  font-size: 12px; line-height: 18px; font-weight: 600; padding: 1px 10px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
}
.omx-product-pick-card__title {
  font-size: 14px; font-weight: 600; line-height: 20px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__meta {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.omx-product-pick-card__price {
  font-size: 13px; color: var(--dsw-alias-label-secondary); line-height: 18px;
}
.omx-product-pick-card__sku {
  font-size: 13px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-product-pick__footer {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;
  box-sizing: border-box; padding: 2px 0;
}
.omx-product-pick__meta {
  flex: 1; min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-product-pick__meta-highlight {
  color: var(--dsw-alias-label-primary); font-weight: 600; margin-left: 4px;
}
.omx-product-pick__actions {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.omx-product-pick__error {
  color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 0 0 8px;
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

  const filteredProducts = useMemo(
    () => filterProducts(products, { category: activeCategory, query: searchQuery }),
    [products, activeCategory, searchQuery],
  );

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
      className={PICKER_DIALOG_CLASS}
      footer={
        <div className="omx-product-pick__footer">
          {selectedProduct ? (
            <div className="omx-product-pick__meta">
              {safeT('productPicker.selectedMeta')}
              <span className="omx-product-pick__meta-highlight">
                {selectedProduct.name || selectedProduct.id}
              </span>
            </div>
          ) : null}
          <div className="omx-product-pick__actions">
            <Button variant="secondary" onClick={onClose}>
              {safeT('productPicker.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!selectedProduct}
              onClick={() => handleConfirm()}
            >
              {safeT('productPicker.confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="omx-product-pick">
        {/* 全局统一：弹窗外侧右上方圆形关闭按钮（ModalCloseButton external） */}
        <ModalCloseButton onClose={onClose} placement="external" ariaLabel={safeT('productPicker.cancel')} />

        <div className="omx-product-pick__tabs" role="tablist" aria-label={safeT('productPicker.categories')}>
          {categories.map((cat) => {
            const label = cat.key ? safeT(cat.key) : cat.label;
            return (
              <button /* exempt-ui01: 产品分类切换 tab */
                key={cat.id}
                type="button"
                role="tab"
                className="omx-product-pick__tab"
                data-active={activeCategory === cat.id ? 'true' : 'false'}
                aria-selected={activeCategory === cat.id ? 'true' : 'false'}
                onClick={() => setActiveCategory(cat.id)}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="omx-product-pick__toolbar">
          <div className="omx-product-pick__search-wrap">
            <span className="omx-product-pick__search-icon" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="omx-product-pick__search-input"
              placeholder={safeT('productPicker.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button /* exempt-ui01: 搜索清空按钮 */
                type="button"
                className="omx-product-pick__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="清空搜索"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {error ? <div className="omx-product-pick__error">{error}</div> : null}

        <div className="omx-product-pick__scroll">
            {loading ? (
              <div className="omx-product-pick__empty">{safeT('productPicker.loading')}</div>
            ) : filteredProducts.length === 0 ? (
              <div className="omx-product-pick__empty">
                <p>
                  {searchQuery
                    ? safeT('productPicker.emptySearch')
                    : safeT('productPicker.empty')}
                </p>
                {!searchQuery ? (
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
