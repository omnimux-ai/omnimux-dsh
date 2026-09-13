import React, { useRef, useState } from 'react';
import type { PromptSlot } from './promptSlotDetector.ts';
import { AssetPickerModal } from '../composer-add/AssetPickerModal.jsx';
import { ProductPickerModal } from '../composer-add/ProductPickerModal.jsx';
import { ProductSlotMenu, saveRecentProductId } from './ProductSlotMenu.tsx';
import { ProductUrlPopover } from './ProductUrlPopover.tsx';

export interface PromptSlotChipsProps {
  readonly slots: readonly PromptSlot[];
  readonly activeSlotIndex?: number | null;
  readonly onSelectSlot: (slot: PromptSlot, index: number) => void;
  readonly onReplaceSlot?: (slot: PromptSlot, newRaw: string) => void;
  readonly onAddFiles?: (files: readonly File[]) => void;
  readonly onAddProductAttachment?: (product: any) => void;
  readonly t?: (key: string, vars?: any) => string;
}

const FileUploadIcon = ({ size = 13 }: { size?: number }) => (
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
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const AssetFolderIcon = ({ size = 13 }: { size?: number }) => (
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
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <polygon points="12 11 12 17 16 14" />
  </svg>
);

const ProductBoxIcon = ({ size = 13 }: { size?: number }) => (
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

const LinkSlotIcon = ({ size = 13 }: { size?: number }) => (
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

const TextEditIcon = ({ size = 13 }: { size?: number }) => (
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

const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function renderSlotIcon(protocol: PromptSlot['protocol'], size = 13) {
  switch (protocol) {
    case 'file':
      return <FileUploadIcon size={size} />;
    case 'assets':
      return <AssetFolderIcon size={size} />;
    case 'product':
      return <ProductBoxIcon size={size} />;
    case 'url':
      return <LinkSlotIcon size={size} />;
    case 'text':
    default:
      return <TextEditIcon size={size} />;
  }
}

export const PromptSlotChips: React.FC<PromptSlotChipsProps> = ({
  slots,
  activeSlotIndex,
  onSelectSlot,
  onReplaceSlot,
  onAddFiles,
  onAddProductAttachment,
  t = (key) => key,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isProductUrlPopoverOpen, setIsProductUrlPopoverOpen] = useState(false);
  const [activeMenuSlot, setActiveMenuSlot] = useState<PromptSlot | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const [pendingAssetSlot, setPendingAssetSlot] = useState<PromptSlot | null>(null);
  const [pendingProductSlot, setPendingProductSlot] = useState<PromptSlot | null>(null);
  const [pendingFileSlot, setPendingFileSlot] = useState<PromptSlot | null>(null);

  if (!slots || slots.length === 0) {
    return null;
  }

  const handleSlotClick = (
    slot: PromptSlot,
    index: number,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (slot.protocol === 'file') {
      setPendingFileSlot(slot);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
      return;
    }

    if (slot.protocol === 'assets') {
      setPendingAssetSlot(slot);
      setIsAssetPickerOpen(true);
      return;
    }

    if (slot.protocol === 'product') {
      setActiveMenuSlot(slot);
      setPendingProductSlot(slot);
      if (event?.currentTarget) {
        setMenuAnchorRect(event.currentTarget.getBoundingClientRect());
      }
      setIsProductMenuOpen(true);
      return;
    }

    onSelectSlot(slot, index);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingFileSlot) {
      if (typeof onAddFiles === 'function') {
        onAddFiles([file]);
      }
      if (typeof onReplaceSlot === 'function') {
        onReplaceSlot(pendingFileSlot, `[${pendingFileSlot.placeholder}: ${file.name}]`);
      }
      setPendingFileSlot(null);
      e.target.value = '';
    }
  };

  const handleAssetConfirm = (selectedAssets: any[]) => {
    const asset = selectedAssets?.[0];
    if (asset && pendingAssetSlot) {
      const assetName = asset.title || asset.name || '已选资产';
      if (typeof onReplaceSlot === 'function') {
        onReplaceSlot(pendingAssetSlot, `[${pendingAssetSlot.placeholder}: ${assetName}]`);
      }
    }
    setIsAssetPickerOpen(false);
    setPendingAssetSlot(null);
  };

  const handleProductConfirm = (product: any) => {
    const targetSlot = pendingProductSlot || activeMenuSlot;
    if (product && targetSlot) {
      const productName = product.name || product.title || '已选产品';
      saveRecentProductId(product.id);
      if (typeof onReplaceSlot === 'function') {
        onReplaceSlot(targetSlot, `[${targetSlot.placeholder}: ${productName}]`);
      }
      if (typeof onAddProductAttachment === 'function') {
        onAddProductAttachment(product);
      }
    }
    setIsProductPickerOpen(false);
    setPendingProductSlot(null);
    setIsProductMenuOpen(false);
    setActiveMenuSlot(null);
  };

  const handleSelectProductFromMenu = (product: any) => {
    handleProductConfirm(product);
  };

  const handleOpenMoreProducts = () => {
    setIsProductMenuOpen(false);
    if (activeMenuSlot) {
      setPendingProductSlot(activeMenuSlot);
    }
    setIsProductPickerOpen(true);
  };

  const handleActivateCustomInput = () => {
    setIsProductMenuOpen(false);
    if (activeMenuSlot) {
      const idx = slots.findIndex((s) => s.id === activeMenuSlot.id);
      if (idx !== -1) {
        onSelectSlot(activeMenuSlot, idx);
      }
    }
  };

  const handleOpenUrlInput = () => {
    setIsProductMenuOpen(false);
    setIsProductUrlPopoverOpen(true);
  };

  const handleUrlConfirm = (url: string) => {
    const targetSlot = activeMenuSlot || pendingProductSlot;
    if (url && targetSlot) {
      if (typeof onReplaceSlot === 'function') {
        onReplaceSlot(targetSlot, `[${targetSlot.placeholder}: ${url}]`);
      }
    }
    setIsProductUrlPopoverOpen(false);
    setActiveMenuSlot(null);
    setPendingProductSlot(null);
  };

  return (
    <>
      <div className="omx-prompt-slots-dock" role="status" aria-label="Prompt 变量槽位选项">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-hidden="true"
        />
        {slots.map((slot, index) => {
          const isActive = activeSlotIndex === index;
          const isFilled = Boolean(slot.selectedValue);
          const displayText = isFilled
            ? `${slot.placeholder}: ${slot.selectedValue}`
            : slot.placeholder || '输入内容';

          let actionTitle = `点击在输入框中定位并修改: ${displayText}`;
          if (slot.protocol === 'file') {
            actionTitle = isFilled
              ? `已选择文件: ${slot.selectedValue}，点击可重新选择替换`
              : `点击选择本地文件上传: ${displayText}`;
          } else if (slot.protocol === 'assets') {
            actionTitle = isFilled
              ? `已关联资产: ${slot.selectedValue}，点击可重新选择替换`
              : `点击从资产库导入: ${displayText}`;
          } else if (slot.protocol === 'product') {
            actionTitle = isFilled
              ? `已关联产品: ${slot.selectedValue}，点击可重新选择替换`
              : `点击从产品库选择: ${displayText}`;
          }

          return (
            <button /* exempt-ui01: prompt 变量槽位胶囊按钮 */
              key={slot.id}
              type="button"
              className={`omx-prompt-slot-chip ${isActive ? 'is-active' : ''} ${isFilled ? 'has-value' : ''}`}
              onClick={(e) => handleSlotClick(slot, index, e)}
              title={actionTitle}
            >
              {renderSlotIcon(slot.protocol, 13)}
              <span className="omx-prompt-slot-chip-text">{displayText}</span>
              {isFilled && (
                <span className="omx-prompt-slot-check" aria-hidden="true">
                  <CheckIcon size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isAssetPickerOpen && (
        <AssetPickerModal
          open={isAssetPickerOpen}
          onClose={() => {
            setIsAssetPickerOpen(false);
            setPendingAssetSlot(null);
          }}
          t={t}
          occupied={0}
          alreadyIds={[]}
          onConfirm={handleAssetConfirm}
        />
      )}

      {isProductPickerOpen && (
        <ProductPickerModal
          open={isProductPickerOpen}
          onClose={() => {
            setIsProductPickerOpen(false);
            setPendingProductSlot(null);
          }}
          t={t}
          onConfirm={handleProductConfirm}
        />
      )}

      <ProductSlotMenu
        isOpen={isProductMenuOpen}
        anchorRect={menuAnchorRect}
        slot={activeMenuSlot}
        onClose={() => {
          setIsProductMenuOpen(false);
          setActiveMenuSlot(null);
        }}
        onSelectProduct={handleSelectProductFromMenu}
        onOpenMoreProducts={handleOpenMoreProducts}
        onActivateCustomInput={handleActivateCustomInput}
        onOpenUrlInput={handleOpenUrlInput}
        t={t}
      />

      <ProductUrlPopover
        isOpen={isProductUrlPopoverOpen}
        onClose={() => setIsProductUrlPopoverOpen(false)}
        onConfirm={handleUrlConfirm}
        t={t}
      />
    </>
  );
};
