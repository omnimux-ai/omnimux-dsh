import React from 'react';
import { ProductPicker } from '../components/product-picker/index.js';

/**
 * 产品库选择弹窗适配层（与 AssetPickerModal 风格及规范统一）
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t?: (key: string, vars?: object) => string,
 *   initialProductId?: string,
 *   onConfirm: (product: any) => void,
 * }} props
 */
export function ProductPickerModal({ open, onClose, t, initialProductId, onConfirm }) {
  return (
    <ProductPicker
      open={open}
      onClose={onClose}
      t={t}
      initialProductId={initialProductId}
      onConfirm={onConfirm}
    />
  );
}
