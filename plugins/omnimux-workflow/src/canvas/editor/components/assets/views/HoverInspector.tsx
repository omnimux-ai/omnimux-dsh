import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import type { AssetItem, CanvasNodeItem, HoverInspectorAnchorRect } from '../types';
import { MediaThumb } from '../MediaThumb';

export interface HoverInspectorProps {
  isOpen: boolean;
  x?: number;
  y?: number;
  anchorRect?: HoverInspectorAnchorRect | null;
  drawerLeft?: number;
  item: AssetItem | CanvasNodeItem | null;
}

/** 悬停放大预览：只限制最大边，按原素材比例完整呈现。 */
const PREVIEW_MAX_EDGE = 360;
/** 尚未读到自然尺寸时的方形兜底，避免首帧塌缩。 */
const PREVIEW_FALLBACK_EDGE = 220;

function parseResolution(resolution?: string | null): { width: number; height: number } | null {
  if (!resolution) return null;
  const match = String(resolution).trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function fitWithinMaxEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export const HoverInspector: React.FC<HoverInspectorProps> = ({
  isOpen,
  x = 0,
  y = 0,
  anchorRect,
  drawerLeft,
  item,
}) => {
  const inspectorRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const previewKey = item?.previewUrl || item?.id || '';

  useEffect(() => {
    setNaturalSize(null);
  }, [previewKey, isOpen]);

  const node = item && 'nodeKind' in item ? (item as CanvasNodeItem) : null;
  const asset = item && !node ? (item as AssetItem) : null;

  const assetResolution = useMemo(() => {
    if (!asset) return null;
    return parseResolution(asset.resolution);
  }, [asset]);

  if (!isOpen || !item) return null;

  const sourceSize = naturalSize || assetResolution || {
    width: PREVIEW_FALLBACK_EDGE,
    height: PREVIEW_FALLBACK_EDGE,
  };
  const fitted = fitWithinMaxEdge(sourceSize.width, sourceSize.height, PREVIEW_MAX_EDGE);
  const cardWidth = fitted.width;
  // 首帧测量前用拟合高度；测量后优先真实 DOM 高度（含 2px 边框）。
  const cardHeight = inspectorRef.current?.offsetHeight || fitted.height + 2;

  // 定位计算：始终固定在侧边栏外侧左侧，垂直方向对齐素材条目
  let left: number;
  let top: number;

  if (anchorRect) {
    // 侧边栏外侧左侧：使用侧边栏左边缘（或条目左边缘）减去卡片宽度与间隙
    const sidebarLeft = drawerLeft ?? anchorRect.left;
    left = sidebarLeft - cardWidth - 8;
    top = anchorRect.top;
  } else {
    // 降级兜底：基于鼠标位置
    left = x - cardWidth - 15;
    top = y - 20;
  }

  // 边界保护：确保不超出视口
  if (left < 10) {
    left = 10;
  }

  const maxTop = window.innerHeight - cardHeight - 12;
  if (top > maxTop) {
    top = maxTop;
  }
  if (top < 12) {
    top = 12;
  }

  return createPortal(
    <div
      ref={inspectorRef}
      className="wf-hover-inspector-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
        zIndex: 10001,
        pointerEvents: 'none',
      }}
    >
      {/* 缩略图大图展示：尺寸跟随原素材比例，最大边 360 */}
      <div
        className="wf-hover-inspector-preview"
        style={{ width: `${fitted.width}px`, height: `${fitted.height}px` }}
      >
        <MediaThumb
          kind={node ? node.type : asset?.type}
          url={item.previewUrl}
          alt={item.name}
          className="wf-hover-inspector-img"
          onNaturalSize={(width, height) => {
            if (width > 0 && height > 0) setNaturalSize({ width, height });
          }}
          fallback={
            <div className="wf-hover-inspector-placeholder">
              <Sparkles size={28} className="wf-hover-inspector-placeholder-icon" />
            </div>
          }
        />
        {asset?.duration && (
          <span className="wf-hover-inspector-duration">{asset.duration}</span>
        )}
      </div>
    </div>,
    document.body
  );
};
