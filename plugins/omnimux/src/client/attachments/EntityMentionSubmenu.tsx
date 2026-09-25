import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getGlobalAttachmentStore } from './store.ts';
import {
  getRecentProductIds,
  saveRecentProductId,
  sortProductsForQuickMenu,
  resolveProductThumbUrl,
} from './productSlotHelper.ts';
import { insertEntityMentionChip } from './entityMentionChip.ts';
import { resolveCharacterThumbUrl } from './entityMentionSubmenuHelper.ts';

export { resolveCharacterThumbUrl };

export type EntityMentionType = 'character' | 'product';

export interface EntityMentionSubmenuProps {
  isOpen: boolean;
  type: EntityMentionType;
  anchorRect: DOMRect | null;
  sessionId?: string;
  isFlippedUp?: boolean;
  savedRange?: Range | null;
  onClose: () => void;
  onSelect?: (entity: { id: string; name: string; type: EntityMentionType; thumb: string }) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const CharacterFallbackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ProductFallbackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

interface EntityItemRowProps {
  item: any;
  type: EntityMentionType;
  onSelect: (item: any) => void;
}

const EntityItemRow: React.FC<EntityItemRowProps> = ({ item, type, onSelect }) => {
  const [imgError, setImgError] = useState(false);

  const thumbUrl = type === 'product'
    ? resolveProductThumbUrl(item)
    : resolveCharacterThumbUrl(item);

  const name = (item.name || item.title || '').trim() || (type === 'product' ? '未命名商品' : '未命名角色');

  return (
    <div
      className="omx-entity-submenu-item"
      role="menuitem"
      tabIndex={-1}
      data-entity-id={item.id}
      data-entity-type={type}
      data-entity-name={name}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(item);
      }}
    >
      <div className="omx-entity-submenu-thumb">
        {imgError || !thumbUrl ? (
          <div className="omx-entity-submenu-thumb-fallback">
            {type === 'product' ? <ProductFallbackIcon /> : <CharacterFallbackIcon />}
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt=""
            className="omx-entity-submenu-img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <span className="omx-entity-submenu-name">{name}</span>
    </div>
  );
};

export const EntityMentionSubmenu: React.FC<EntityMentionSubmenuProps> = ({
  isOpen,
  type,
  anchorRect,
  sessionId = '',
  isFlippedUp = false,
  savedRange = null,
  onClose,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. 数据获取
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);

    if (type === 'product') {
      fetch('/omnimux/products')
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((data) => {
          if (!mounted) return;
          const raw = Array.isArray(data.products) ? data.products : [];
          const recentIds = getRecentProductIds();
          const sorted = sortProductsForQuickMenu(raw, recentIds, 12);
          setItems(sorted);
          setLoading(false);
        })
        .catch(() => {
          if (mounted) {
            setItems([]);
            setLoading(false);
          }
        });
    } else {
      fetch('/omnimux/assets/library?type=character')
        .then((res) => (res.ok ? res.json() : { assets: [] }))
        .then((data) => {
          if (!mounted) return;
          const raw = Array.isArray(data.assets) ? data.assets : [];
          setItems(raw);
          setLoading(false);
        })
        .catch(() => {
          if (mounted) {
            setItems([]);
            setLoading(false);
          }
        });
    }

    return () => {
      mounted = false;
    };
  }, [isOpen, type]);

  // 2. 双向联动核心逻辑
  const handleSelectItem = useCallback((item: any) => {
    const store = getGlobalAttachmentStore();
    const targetSessionId = sessionId || store.getActiveSessionId() || 'default';

    const entityName = (item.name || item.title || '').trim() || (type === 'product' ? '产品' : '角色');
    let previewUrl = '';
    let relativePath = '';
    let payload: any = null;

    if (type === 'product') {
      saveRecentProductId(item.id);
      previewUrl = resolveProductThumbUrl(item);
      relativePath = item.cover?.real_path || `products/${item.id}.json`;
      payload = {
        sourcePlugin: 'omnimux-products',
        kind: 'product' as const,
        entityId: item.id || String(Date.now()),
        title: entityName,
        extension: 'JSON',
        relativePath,
        previewUrl,
        metadata: {
          product: {
            id: item.id,
            name: item.name,
            price: item.price,
            sku: item.sku,
            brand: item.brand,
            description: item.description,
            selling_points: item.selling_points,
            features: item.features,
            target_audience: item.target_audience,
          },
        },
      };
    } else {
      previewUrl = resolveCharacterThumbUrl(item);
      relativePath = item.cover?.real_path || (item.files && item.files[0]?.real_path) || `assets/characters/${item.id}`;
      payload = {
        sourcePlugin: 'omnimux-assets',
        kind: 'asset' as const,
        entityId: item.id || String(Date.now()),
        title: entityName,
        extension: 'ASSET',
        relativePath,
        previewUrl,
        metadata: {
          character: {
            id: item.id,
            name: item.name,
            type: item.type || 'character',
            description: item.description,
            cite: item.cite,
          },
          files: item.files,
        },
      };
    }

    // 2.1 添加到卡槽 Store（若为重复实体 duplicate，卡槽中已存在对应 attachment，同样视为有效并复用其 id）
    const res = store.addAttachment(targetSessionId, payload);
    const isAttachmentValid = Boolean(res?.attachment && (res.ok || res.reason === 'duplicate'));
    if (!isAttachmentValid || !res?.attachment) {
      console.warn('[omnimux] store.addAttachment failed, aborting entity mention chip insertion:', res);
      onClose();
      return;
    }

    const attachmentId = res.attachment.id;

    // 2.2 插入输入框实体胶囊并清除 @ 字符（显式传入持久化的 savedRange 还原选区）
    const chipInserted = insertEntityMentionChip({
      name: entityName,
      ref: `material:${attachmentId}`,
      type,
      savedRange,
    });
    if (!chipInserted) {
      console.warn('[omnimux] entity mention chip insertion failed for attachment:', attachmentId);
    }

    if (onSelect) {
      onSelect({
        id: item.id,
        name: entityName,
        type,
        thumb: previewUrl,
      });
    }

    // 2.3 关闭浮层
    onClose();
  }, [sessionId, type, savedRange, onClose, onSelect]);

  // 3. 键盘与全局点击监听
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined' || !document.body || !anchorRect) {
    return null;
  }

  // 4. 自适应定位计算
  const submenuWidth = 240;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 横向：右侧不足时自动翻转至左侧
  let left = anchorRect.right + 4;
  if (left + submenuWidth > viewportWidth - 12) {
    left = Math.max(12, anchorRect.left - submenuWidth - 4);
  }

  // 纵向：随输入框翻转与视口高度自适应
  let top = anchorRect.top;
  const maxMenuHeight = 280;

  if (isFlippedUp || top + maxMenuHeight > viewportHeight - 12) {
    top = Math.max(12, anchorRect.bottom - maxMenuHeight);
  }

  return createPortal(
    <div
      ref={menuRef}
      className="omx-entity-mention-submenu"
      data-omnimux-entity-submenu="true"
      data-entity-type={type}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${submenuWidth}px`,
        maxHeight: `${maxMenuHeight}px`,
        zIndex: 99999,
      }}
      role="menu"
      aria-label={`${type === 'product' ? '产品' : '角色'}选项列表`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="omx-entity-submenu-list">
        {loading ? (
          <div className="omx-entity-submenu-loading">加载中...</div>
        ) : items.length === 0 ? (
          <div className="omx-entity-submenu-empty">暂无{type === 'product' ? '产品' : '角色'}</div>
        ) : (
          items.map((item) => (
            <EntityItemRow
              key={item.id}
              item={item}
              type={type}
              onSelect={handleSelectItem}
            />
          ))
        )}
      </div>
    </div>,
    document.body,
  );
};
