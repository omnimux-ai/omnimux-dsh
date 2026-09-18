import React, { useState, useCallback } from 'react';
import { ProductPicker } from './ProductPicker.jsx';

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
 */
export function ProductPickerButton(props) {
  const [isOpen, setIsOpen] = useState(false);
  const t = props?.t;

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
        className="omnimux-composer-product-btn"
        onClick={handleOpen}
        title={buttonLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: '28px',
          padding: '0 10px',
          borderRadius: '9999px',
          background: 'var(--dsw-alias-bg-layer-2)',
          border: '1px solid var(--dsw-alias-border)',
          color: 'var(--dsw-alias-label-secondary)',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
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
