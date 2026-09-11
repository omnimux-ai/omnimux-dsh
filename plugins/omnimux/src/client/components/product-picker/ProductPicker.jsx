import React, { useEffect, useMemo, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { ProductPickerCard } from './ProductPickerCard.jsx';
import { collectCategories, filterProducts, createSafeT } from './picker-model.js';

const STYLE_ID = 'omx-composer-add-product-picker';

const CSS = `
div:has(> .omx-product-pick),
div:has(> * > .omx-product-pick),
.dshUk-Dialog-dialog:has(.omx-product-pick) {
  width: 800px !important;
  max-width: 92vw !important;
}
.omx-product-pick {
  display: flex; width: 100%; height: 480px; min-height: 480px; max-height: 480px;
  box-sizing: border-box;
}
.omx-product-pick__nav {
  width: 148px; flex: none; display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px 8px 0; border-right: 1px solid var(--dsw-alias-border-l2);
  overflow-y: auto; box-sizing: border-box;
}
.omx-product-pick__nav-header {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary); padding: 4px 10px 6px;
  letter-spacing: 0.5px;
}
.omx-product-pick__tab {
  appearance: none; font: inherit; text-align: left; cursor: pointer;
  height: 34px; border: none; border-radius: 8px; padding: 0 10px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 13px; font-weight: 500; transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.omx-product-pick__tab-left {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.omx-product-pick__tab-icon {
  display: flex; align-items: center; flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
}
.omx-product-pick__tab:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-product-pick__tab:hover .omx-product-pick__tab-icon {
  color: var(--dsw-alias-label-primary);
}
.omx-product-pick__tab[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.omx-product-pick__tab[data-active="true"] .omx-product-pick__tab-icon {
  color: var(--dsw-alias-label-primary);
}
.omx-product-pick__tab-badge {
  font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-tertiary);
  font-weight: 500;
}
.omx-product-pick__tab[data-active="true"] .omx-product-pick__tab-badge {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-product-pick__main {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  padding: 0 0 0 16px; overflow: hidden;
}
.omx-product-pick__toolbar {
  margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.omx-product-pick__search-wrap {
  position: relative; flex: 1; display: flex; align-items: center;
}
.omx-product-pick__search-icon {
  position: absolute; left: 10px; color: var(--dsw-alias-label-tertiary);
  pointer-events: none; display: flex; align-items: center;
}
.omx-product-pick__search-input {
  width: 100%; height: 32px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
  padding: 0 10px 0 32px; font-size: 13px; color: var(--dsw-alias-label-primary);
  outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}
.omx-product-pick__search-input:focus {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-label-primary);
}
.omx-product-pick__search-clear {
  position: absolute; right: 8px; appearance: none; border: none;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; padding: 2px; border-radius: 4px; display: flex;
}
.omx-product-pick__search-clear:hover { color: var(--dsw-alias-label-primary); }
.omx-product-pick__scroll {
  flex: 1; overflow-y: auto; padding-right: 6px;
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
  width: 100%; max-width: 320px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg)); display: flex; flex-direction: column;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-product-pick-card:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-2px);
}
.omx-product-pick-card[data-selected="true"] {
  border-color: var(--dsw-alias-label-primary) !important;
  box-shadow: 0 0 0 1.5px var(--dsw-alias-label-primary);
}
.omx-product-pick-card__thumb {
  height: 136px; background: var(--dsw-alias-bg-module-platform); position: relative;
  display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
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
  position: absolute; top: 8px; left: 8px; width: 22px; height: 22px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.omx-product-pick-card__check[data-selected="true"] {
  border: none; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground);
}
.omx-product-pick-card__badge {
  position: absolute; top: 8px; right: 8px; font-size: 11px; line-height: 16px; padding: 2px 8px;
  border-radius: 999px; background: var(--dsw-alias-bg-base, var(--dsw-bg)); z-index: 2;
  border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary);
}
.omx-product-pick-card__body {
  padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; min-height: 80px;
}
.omx-product-pick-card__title {
  font-size: 14px; font-weight: 500; line-height: 20px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__meta {
  display: flex; align-items: center; gap: 8px;
}
.omx-product-pick-card__price {
  font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); line-height: 18px;
}
.omx-product-pick-card__sku {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
}
.omx-product-pick-card__desc {
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-product-pick-card__tags {
  display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;
}
.omx-product-pick-card__tag {
  font-size: 10px; line-height: 14px; padding: 1px 6px; border-radius: 4px;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
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

function CategoryIcon({ kind, size = 14 }) {
  if (kind === 'box') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    );
  }
  if (kind === 'file') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
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
      width={760}
      footer={
        <div className="omx-product-pick__footer">
          <div className="omx-product-pick__meta">
            {selectedProduct ? (
              <>
                {safeT('productPicker.selectedMeta')}
                <span className="omx-product-pick__meta-highlight">
                  {selectedProduct.name || selectedProduct.id}
                </span>
              </>
            ) : (
              safeT('productPicker.unselectedHint')
            )}
          </div>
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
        <nav className="omx-product-pick__nav" aria-label={safeT('productPicker.categories')}>
          <div className="omx-product-pick__nav-header">
            {safeT('productPicker.categories')}
          </div>
          {categories.map((cat) => {
            const label = cat.key ? safeT(cat.key) : cat.label;
            return (
              <button /* exempt-ui01: 产品分类切换 tab */
                key={cat.id}
                type="button"
                className="omx-product-pick__tab"
                data-active={activeCategory === cat.id ? 'true' : 'false'}
                onClick={() => setActiveCategory(cat.id)}
                title={label}
              >
                <span className="omx-product-pick__tab-left">
                  <span className="omx-product-pick__tab-icon">
                    <CategoryIcon kind={cat.icon} size={14} />
                  </span>
                  <span>{label}</span>
                </span>
                <span className="omx-product-pick__tab-badge">{cat.count}</span>
              </button>
            );
          })}
        </nav>

        <section className="omx-product-pick__main">
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
        </section>
      </div>
    </ModalDialog>
  );
}
