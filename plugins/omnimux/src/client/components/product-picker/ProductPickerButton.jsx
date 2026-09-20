import React, { useState, useCallback, useEffect } from 'react';
import { ProductPicker } from './ProductPicker.jsx';

export const PRODUCT_BTN_STYLE_ID = 'omnimux-composer-product-btn-style';

export const PRODUCT_BTN_CSS = `
.omnimux-composer-product-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  padding: 0 8px !important;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 24px !important;
  background: transparent !important;
  color: var(--dsw-alias-label-secondary, inherit) !important;
  font: inherit !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  line-height: 20px !important;
  cursor: pointer !important;
  outline: none !important;
  white-space: nowrap !important;
  user-select: none !important;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease !important;
}

.omnimux-composer-product-btn:hover:not(:disabled),
.omnimux-composer-product-btn.is-active,
.omnimux-composer-product-btn[data-state="open"] {
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: var(--dsw-alias-label-primary, inherit) !important;
}

.omnimux-composer-product-btn:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)) !important;
}

.omnimux-composer-product-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3) !important;
  outline: none !important;
}

.omnimux-composer-product-btn svg {
  flex: none !important;
  width: 14px !important;
  height: 14px !important;
  display: block !important;
}
`;

export function ensureProductButtonStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PRODUCT_BTN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRODUCT_BTN_STYLE_ID;
  style.textContent = PRODUCT_BTN_CSS;
  document.head.appendChild(style);
}

/**
 * 纯矢量商品购物袋图标 (遵从 design.md UI04 硬门禁，纯矢量 SVG 零 Emoji)
 */
function ShoppingBagIcon({ size = 14 }) {
  return (
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
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

/**
 * 输入框底栏商品选择入口按钮组件
 * 点击呼出原生产品库模态弹窗，确认后将选中的商品以 Chip 胶囊插入输入框
 * 视觉交互规范严格对标右侧官方模型选择器（透明底色、胶囊微圆角、Hover高亮、Active按压微反馈）
 */
export function ProductPickerButton(props) {
  const [isOpen, setIsOpen] = useState(false);
  const t = props?.t;

  useEffect(() => {
    ensureProductButtonStyles();
  }, []);

  const handleOpen = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleConfirm = useCallback((product) => {
    setIsOpen(false);
    if (!product) return;

    try {
      const editor = document.querySelector('[data-chip-editor], [contenteditable="true"], .dsh-composer-input');
      if (editor) {
        editor.focus();

        const chip = document.createElement('span');
        chip.className = 'omnimux-product-chip';
        chip.contentEditable = 'false';
        chip.dataset.productId = product.id;
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-hover);border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);margin:0 4px 0 1px;user-select:all;vertical-align:baseline;';
        
        const name = (product.name || 'Product').trim();
        const shortName = name.length > 12 ? name.slice(0, 10) + '...' : name;
        chip.innerHTML = `<span style="pointer-events:none;">${shortName}</span><span style="cursor:pointer;margin-left:4px;opacity:0.65;" onclick="this.parentElement.remove();">&times;</span>`;

        const space = document.createTextNode(' ');
        editor.prepend(space);
        editor.prepend(chip);

        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch {}
  }, []);

  const buttonLabel = t ? (t('composer.product') || '产品') : '产品';

  return (
    <>
      <button /* exempt-ui01: Composer工具栏商品库触发入口按键 */
        type="button"
        className={`omnimux-composer-product-btn ${isOpen ? 'is-active' : ''}`}
        onClick={handleOpen}
        title={buttonLabel}
        aria-label={buttonLabel}
        aria-expanded={isOpen}
        data-state={isOpen ? 'open' : 'closed'}
      >
        <ShoppingBagIcon size={14} />
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <ProductPicker
          open={isOpen}
          onClose={handleClose}
          onConfirm={handleConfirm}
          t={t}
        />
      )}
    </>
  );
}
