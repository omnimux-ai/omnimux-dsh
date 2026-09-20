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
  max-width: 200px !important;
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

/* 选中态：商品缩略图 + 名称省略 + 悬停移除按钮 */
.omnimux-composer-product-btn__thumb {
  flex: none !important;
  width: 18px !important;
  height: 18px !important;
  border-radius: 5px !important;
  object-fit: cover !important;
  display: block !important;
  background: var(--dsw-alias-bg-layer-2, transparent) !important;
}

.omnimux-composer-product-btn__name {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  min-width: 0 !important;
}

.omnimux-composer-product-btn__remove {
  flex: none !important;
  width: 16px !important;
  height: 16px !important;
  border-radius: 50% !important;
  display: none !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: inherit !important;
  cursor: pointer !important;
}

.omnimux-composer-product-btn:hover .omnimux-composer-product-btn__remove,
.omnimux-composer-product-btn__remove:hover {
  display: inline-flex !important;
}

.omnimux-composer-product-btn__remove:hover {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)) !important;
}

.omnimux-composer-product-btn .omnimux-composer-product-btn__remove svg {
  width: 10px !important;
  height: 10px !important;
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

/** 纯矢量 X 关闭路径（两个组件共用，零 Emoji） */
const CLOSE_PATHS = (
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

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

/** 纯矢量关闭图标（选中态悬停移除按钮用，零 Emoji） */
function CloseIcon({ size = 10 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CLOSE_PATHS}
    </svg>
  );
}

/** 输入框 Chip 内的纯矢量关闭图标（DOM API 场景，与 CloseIcon 同形） */
function createCloseSvg(size = 10) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const [x1, y1, x2, y2] of [[18, 6, 6, 18], [6, 6, 18, 18]]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    svg.appendChild(line);
  }
  return svg;
}

/**
 * 商品缩略图地址（与 ProductPickerCard 取图规则保持一致）：
 * 封面为图床图片时走产品库预览通道，否则兜底直链字段；无图返回空串。
 */
export function resolveProductPreview(product) {
  if (!product) return '';
  const cover = product.cover;
  if (cover?.kind === 'image' && cover.id) {
    return `/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(cover.id)}`;
  }
  return product.cover_url || product.image || '';
}

function queryEditor() {
  return document.querySelector('[data-chip-editor], [contenteditable="true"], .dsh-composer-input');
}

function queryProductChip(productId) {
  if (!productId) return null;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(productId)) : String(productId);
  return document.querySelector(`.omnimux-product-chip[data-product-id="${escaped}"]`);
}

function notifyEditorInput(editor) {
  editor?.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 输入框底栏商品选择入口按钮组件
 * 点击呼出原生产品库模态弹窗，确认后将选中的商品以 Chip 胶囊插入输入框，
 * 同时按钮本身切换为选中态（缩略图 + 商品名），悬停出现移除按钮，点击可重新换选。
 * 视觉交互规范严格对标右侧官方模型选择器（透明底色、胶囊微圆角、Hover高亮、Active按压微反馈）
 */
export function ProductPickerButton(props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
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

  /** 从输入框移除指定商品的 Chip 胶囊 */
  const removeChip = useCallback((productId) => {
    try {
      const chip = queryProductChip(productId);
      if (chip) {
        const editor = chip.closest('[data-chip-editor], [contenteditable="true"], .dsh-composer-input') || queryEditor();
        chip.remove();
        notifyEditorInput(editor);
      }
    } catch {}
  }, []);

  /** 向输入框插入商品 Chip 胶囊（DOM API 写入，拒绝 innerHTML 拼接注入） */
  const insertChip = useCallback((product) => {
    try {
      const editor = queryEditor();
      if (!editor) return;
      editor.focus();

      const chip = document.createElement('span');
      chip.className = 'omnimux-product-chip';
      chip.contentEditable = 'false';
      chip.dataset.productId = product.id;
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-hover);border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);margin:0 4px 0 1px;user-select:all;vertical-align:baseline;';

      const name = String(product.name || 'Product').trim();
      const shortName = name.length > 12 ? name.slice(0, 10) + '...' : name;

      const nameSpan = document.createElement('span');
      nameSpan.style.pointerEvents = 'none';
      nameSpan.textContent = shortName;

      const close = document.createElement('span');
      close.style.cssText = 'cursor:pointer;margin-left:4px;opacity:0.65;display:inline-flex;align-items:center;';
      close.appendChild(createCloseSvg(10));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        chip.remove();
        notifyEditorInput(editor);
        setSelectedProduct((current) => (current && String(current.id) === String(product.id) ? null : current));
      });

      chip.appendChild(nameSpan);
      chip.appendChild(close);

      const space = document.createTextNode(' ');
      editor.prepend(space);
      editor.prepend(chip);

      notifyEditorInput(editor);
    } catch {}
  }, []);

  const handleConfirm = useCallback((product) => {
    setIsOpen(false);
    if (!product) return;

    // 换选：先移除旧商品 Chip，再插入新 Chip
    setSelectedProduct((previous) => {
      if (previous && String(previous.id) !== String(product.id)) {
        removeChip(previous.id);
      }
      return product;
    });
    insertChip(product);
  }, [insertChip, removeChip]);

  /** 悬停移除：清空选中态并移除输入框 Chip，阻止冒泡以免触发弹窗 */
  const handleRemove = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (selectedProduct) {
      removeChip(selectedProduct.id);
    }
    setSelectedProduct(null);
  }, [selectedProduct, removeChip]);

  const buttonLabel = t ? (t('composer.product') || '产品') : '产品';
  const selectedName = selectedProduct ? String(selectedProduct.name || '已选产品') : '';
  const selectedPreview = selectedProduct ? resolveProductPreview(selectedProduct) : '';

  return (
    <>
      <button /* exempt-ui01: Composer工具栏商品库触发入口按键 */
        type="button"
        className={`omnimux-composer-product-btn ${isOpen ? 'is-active' : ''}`}
        onClick={handleOpen}
        title={selectedProduct ? `已选产品：${selectedName}` : buttonLabel}
        aria-label={selectedProduct ? `已选产品：${selectedName}` : buttonLabel}
        aria-expanded={isOpen}
        data-state={isOpen ? 'open' : 'closed'}
      >
        {selectedProduct ? (
          <>
            {selectedPreview ? (
              <img className="omnimux-composer-product-btn__thumb" src={selectedPreview} alt="" />
            ) : (
              <ShoppingBagIcon size={14} />
            )}
            <span className="omnimux-composer-product-btn__name">{selectedName}</span>
            <span
              className="omnimux-composer-product-btn__remove"
              role="button"
              aria-label="移除"
              onClick={handleRemove}
            >
              <CloseIcon size={10} />
            </span>
          </>
        ) : (
          <>
            <ShoppingBagIcon size={14} />
            <span>{buttonLabel}</span>
          </>
        )}
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
