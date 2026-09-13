import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PromptSlot } from './promptSlotDetector.ts';
import {
  getRecentProductIds,
  saveRecentProductId,
  sortProductsForQuickMenu,
  resolveProductThumbUrl,
} from './productSlotHelper.ts';

export {
  getRecentProductIds,
  saveRecentProductId,
  sortProductsForQuickMenu,
  resolveProductThumbUrl,
};

export interface ProductSlotMenuProps {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  slot: PromptSlot | null;
  onClose: () => void;
  onSelectProduct: (product: any) => void;
  onOpenMoreProducts: () => void;
  onActivateCustomInput: () => void;
  onOpenUrlInput: () => void;
  t?: (key: string, vars?: any) => string;
}

const ProductBoxIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const LibraryIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const TextEditIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const LinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const ProductSlotMenu: React.FC<ProductSlotMenuProps> = ({
  isOpen,
  anchorRect,
  slot,
  onClose,
  onSelectProduct,
  onOpenMoreProducts,
  onActivateCustomInput,
  onOpenUrlInput,
  t = (k) => k,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);
    fetch('/omnimux/products')
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data) => {
        if (mounted) {
          setProducts(Array.isArray(data.products) ? data.products : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setProducts([]);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined' || !document.body || !anchorRect) {
    return null;
  }

  const recentIds = getRecentProductIds();
  const quickProducts = sortProductsForQuickMenu(products, recentIds, 5);

  const menuWidth = 280;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchorRect.left;
  if (left + menuWidth > viewportWidth - 16) {
    left = Math.max(16, viewportWidth - menuWidth - 16);
  }

  let top = anchorRect.bottom + 6;
  if (top + 360 > viewportHeight - 16 && anchorRect.top > 360) {
    top = Math.max(16, anchorRect.top - 360);
  }

  return createPortal(
    <div
      ref={menuRef}
      className="omx-product-slot-menu"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${menuWidth}px`,
        zIndex: 9999,
      }}
      role="menu"
      aria-label="选择产品选项"
    >
      <div className="omx-product-slot-menu__header">
        <span className="omx-product-slot-menu__header-title">
          {slot?.placeholder || '选择产品'}
        </span>
      </div>

      <div className="omx-product-slot-menu__quick-list">
        {loading ? (
          <div className="omx-product-slot-menu__loading">正在加载产品...</div>
        ) : quickProducts.length > 0 ? (
          quickProducts.map((p) => {
            const thumbUrl = resolveProductThumbUrl(p);
            const isRecent = recentIds.includes(p.id);

            return (
              <button /* exempt-ui01: 产品槽位快捷项按钮 */
                key={p.id}
                type="button"
                className="omx-product-slot-menu__product-item"
                onClick={() => {
                  saveRecentProductId(p.id);
                  onSelectProduct(p);
                  onClose();
                }}
                title={p.name || p.title}
              >
                <div className="omx-product-slot-menu__thumb">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt=""
                      className="omx-product-slot-menu__thumb-img"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <ProductBoxIcon size={15} />
                  )}
                </div>
                <div className="omx-product-slot-menu__info">
                  <div className="omx-product-slot-menu__title">{p.name || p.title}</div>
                  <div className="omx-product-slot-menu__meta">
                    {isRecent && (
                      <span className="omx-product-slot-menu__badge-recent">最近选择</span>
                    )}
                    {p.price && (
                      <span className="omx-product-slot-menu__price">
                        {String(p.price).startsWith('¥') || String(p.price).startsWith('$')
                          ? p.price
                          : `¥${p.price}`}
                      </span>
                    )}
                    {p.categories?.[0] && (
                      <span className="omx-product-slot-menu__cat">{p.categories[0]}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="omx-product-slot-menu__empty-hint">
            暂无已有产品，可从下方快捷输入或添加
          </div>
        )}
      </div>

      <div className="omx-product-slot-menu__divider" />

      <div className="omx-product-slot-menu__actions">
        <button /* exempt-ui01: 从产品库导入操作项 */
          type="button"
          className="omx-product-slot-menu__action-btn"
          onClick={() => {
            onClose();
            onOpenMoreProducts();
          }}
        >
          <span className="omx-product-slot-menu__action-icon">
            <LibraryIcon size={14} />
          </span>
          <div className="omx-product-slot-menu__action-label">
            <span>从产品库导入...</span>
            <span className="omx-product-slot-menu__action-sub">全量产品库检索与筛选</span>
          </div>
        </button>

        <button /* exempt-ui01: 自定义输入操作项 */
          type="button"
          className="omx-product-slot-menu__action-btn"
          onClick={() => {
            onClose();
            onActivateCustomInput();
          }}
        >
          <span className="omx-product-slot-menu__action-icon">
            <TextEditIcon size={14} />
          </span>
          <div className="omx-product-slot-menu__action-label">
            <span>自定义输入</span>
            <span className="omx-product-slot-menu__action-sub">直接就地打字填入产品名称</span>
          </div>
        </button>

        <button /* exempt-ui01: 从URL添加操作项 */
          type="button"
          className="omx-product-slot-menu__action-btn"
          onClick={() => {
            onClose();
            onOpenUrlInput();
          }}
        >
          <span className="omx-product-slot-menu__action-icon">
            <LinkIcon size={14} />
          </span>
          <div className="omx-product-slot-menu__action-label">
            <span>从 URL 添加...</span>
            <span className="omx-product-slot-menu__action-sub">输入商品页面网址作为参考源</span>
          </div>
        </button>
      </div>
    </div>,
    document.body,
  );
};
