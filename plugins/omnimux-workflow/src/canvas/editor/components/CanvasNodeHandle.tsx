/**
 * W3 visual rework, ported from Gxgen
 * `apps/web/src/pages/CanvasEditor/components/CanvasNodeHandle.tsx`
 * (384 lines). Magnetic pull offsets ported via `handleMagnet.ts`.
 *
 * SPIKE pit #3 / plan pit #1 (red line): the Handle body is a 1px
 * transparent hitbox that stays pointer-interactive AT ALL TIMES — it is
 * the React Flow connection start point. Hover only drives visual classes
 * (plus button spring-in / anchor highlight); gating pointerEvents on
 * hover breaks drag-start (mouseleave fires as the pointer exits the node
 * toward the anchor). Only the plus-hit-area's pointer-events are CSS
 * class-gated (canvas-editor.css:294-306, transcribed to wf-handle*).
 *
 * The plus-click menu (T3.4) is rendered here exactly like Gxgen: options
 * + onSelect come from the node component; the release-menu path in
 * CanvasEditor reuses the same CanvasNodeActionMenu.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useConnection, useReactFlow } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { useT } from '../../i18n';
import CanvasNodeActionMenu, {
  type CanvasNodeActionMenuOption,
} from './CanvasNodeActionMenu';
import { clampHandleMagnetOffset } from './handleMagnet';

export interface CanvasNodeHandleSelectMeta {
  screenPosition: { x: number; y: number };
  flowPosition: { x: number; y: number };
}

export interface CanvasNodeHandleProps {
  side: 'left' | 'right';
  nodeHovered: boolean;
  variant?: 'plus' | 'plain';
  /** 输出动作菜单选项（label/desc 已由调用方经 i18n 解析）。 */
  options?: CanvasNodeActionMenuOption[];
  onSelect?: (key: string, meta?: CanvasNodeHandleSelectMeta) => void;
}

const DRAG_INTENT_THRESHOLD = 4;

interface PointerGestureState {
  pointerId: number | null;
  startX: number;
  startY: number;
  dragIntent: boolean;
  suppressClick: boolean;
}

const CanvasNodeHandle: React.FC<CanvasNodeHandleProps> = ({
  side,
  nodeHovered,
  variant = 'plus',
  options,
  onSelect,
}) => {
  const t = useT();
  const [isSurfaceHovered, setIsSurfaceHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const interactionSurfaceRef = useRef<HTMLDivElement>(null);
  const plusShellRef = useRef<HTMLDivElement>(null);
  const pointerGestureRef = useRef<PointerGestureState>({
    pointerId: null,
    startX: 0,
    startY: 0,
    dragIntent: false,
    suppressClick: false,
  });

  const isLeft = side === 'left';
  const hasMenu = variant === 'plus' && !!options && options.length > 0;
  const connectionInProgress = useConnection((connection) => connection.inProgress);
  const { screenToFlowPosition } = useReactFlow();

  const resetShellOffset = useCallback(() => {
    if (!plusShellRef.current) return;
    plusShellRef.current.style.setProperty('--wf-handle-offset-x', '0px');
    plusShellRef.current.style.setProperty('--wf-handle-offset-y', '0px');
  }, []);

  // 磁吸跟随：鼠标在 hit-area 内移动时，加号沿鼠标方向做受限偏移（Gxgen :98-131）
  useEffect(() => {
    if (variant !== 'plus') {
      resetShellOffset();
      return;
    }

    const surface = interactionSurfaceRef.current;
    const shell = plusShellRef.current;
    if (!surface || !shell) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (dropdownOpen) return;

      const rect = surface.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const { x: offsetX, y: offsetY } = clampHandleMagnetOffset(
        side,
        event.clientX - centerX,
        event.clientY - centerY,
      );

      shell.style.setProperty('--wf-handle-offset-x', `${offsetX}px`);
      shell.style.setProperty('--wf-handle-offset-y', `${offsetY}px`);
    };

    surface.addEventListener('pointermove', handlePointerMove);
    return () => {
      surface.removeEventListener('pointermove', handlePointerMove);
    };
  }, [dropdownOpen, resetShellOffset, side, variant]);

  // Menu anchors to the interaction surface; keep it glued on viewport
  // changes while open (Gxgen :133-158).
  useEffect(() => {
    if (!dropdownOpen) {
      resetShellOffset();
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const surface = interactionSurfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      setMenuPosition({
        x: isLeft ? rect.right : rect.left,
        y: rect.bottom,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [dropdownOpen, isLeft, resetShellOffset]);

  const handleSurfaceEnter = useCallback(() => {
    setIsSurfaceHovered(true);
  }, []);

  const handleSurfaceLeave = useCallback(() => {
    setIsSurfaceHovered(false);
    resetShellOffset();
  }, [resetShellOffset]);

  const releasePointerCapture = useCallback((pointerId: number | null) => {
    const surface = interactionSurfaceRef.current;
    if (
      !surface
      || pointerId === null
      || typeof surface.hasPointerCapture !== 'function'
      || typeof surface.releasePointerCapture !== 'function'
      || !surface.hasPointerCapture(pointerId)
    ) {
      return;
    }
    surface.releasePointerCapture(pointerId);
  }, []);

  const resetPointerGesture = useCallback(() => {
    releasePointerCapture(pointerGestureRef.current.pointerId);
    pointerGestureRef.current.pointerId = null;
    pointerGestureRef.current.startX = 0;
    pointerGestureRef.current.startY = 0;
    pointerGestureRef.current.dragIntent = false;
  }, [releasePointerCapture]);

  // Click/drag disambiguation on the plus button: a press that moves past
  // the threshold is a connection drag intent (swallow the click); a
  // stationary press is a menu click (Gxgen :199-248).
  const handlePlusPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Never capture on the hit area: React Flow's Handle must keep the
    // connection gesture so a drop on the opposite side can complete it.
    pointerGestureRef.current.pointerId = event.pointerId;
    pointerGestureRef.current.startX = event.clientX;
    pointerGestureRef.current.startY = event.clientY;
    pointerGestureRef.current.dragIntent = false;
    pointerGestureRef.current.suppressClick = false;
  }, []);

  const handlePlusPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerGestureRef.current.pointerId !== event.pointerId) return;

    const distance = Math.hypot(
      event.clientX - pointerGestureRef.current.startX,
      event.clientY - pointerGestureRef.current.startY,
    );

    if (distance >= DRAG_INTENT_THRESHOLD) {
      pointerGestureRef.current.dragIntent = true;
      pointerGestureRef.current.suppressClick = true;
      if (dropdownOpen) {
        setDropdownOpen(false);
      }
    }
  }, [dropdownOpen]);

  const handlePlusPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerGestureRef.current.pointerId !== event.pointerId) return;
    if (!pointerGestureRef.current.dragIntent) {
      pointerGestureRef.current.suppressClick = false;
    }
    resetPointerGesture();
  }, [resetPointerGesture]);

  const handlePlusPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerGestureRef.current.pointerId !== event.pointerId) return;
    pointerGestureRef.current.suppressClick = false;
    resetPointerGesture();
  }, [resetPointerGesture]);

  const handlePlusClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (pointerGestureRef.current.suppressClick) {
      pointerGestureRef.current.suppressClick = false;
      return;
    }
    if (hasMenu) {
      setDropdownOpen((open) => !open);
    }
  }, [hasMenu]);

  const resolveSelectionPlacement = useCallback((): CanvasNodeHandleSelectMeta | undefined => {
    let screenPosition = menuPosition;
    if (!screenPosition) {
      const surface = interactionSurfaceRef.current;
      if (!surface) return undefined;
      const rect = surface.getBoundingClientRect();
      screenPosition = {
        x: isLeft ? rect.right : rect.left,
        y: rect.bottom,
      };
    }

    return {
      screenPosition,
      flowPosition: screenToFlowPosition(screenPosition),
    };
  }, [isLeft, menuPosition, screenToFlowPosition]);

  const handleMenuSelect = useCallback((key: string) => {
    onSelect?.(key, resolveSelectionPlacement());
    setDropdownOpen(false);
  }, [onSelect, resolveSelectionPlacement]);

  const handleClassName = [
    'wf-handle',
    `wf-handle--${variant}`,
    `wf-handle--${side}`,
    nodeHovered ? 'wf-handle--node-hovered' : '',
    isSurfaceHovered ? 'wf-handle--surface-hovered' : '',
    dropdownOpen ? 'wf-handle--open' : '',
    connectionInProgress ? 'wf-handle--connection-active' : '',
  ].filter(Boolean).join(' ');

  const hitboxStyle = {
    width: 1,
    height: 1,
    minWidth: 1,
    minHeight: 1,
    background: 'transparent',
    border: 'none',
  } satisfies React.CSSProperties;

  return (
    <Handle
      id={isLeft ? 'in' : 'out'}
      type={isLeft ? 'target' : 'source'}
      position={isLeft ? Position.Left : Position.Right}
      isConnectable
      className={handleClassName}
      style={hitboxStyle}
    >
      <div
        className={`wf-handle__anchor-layer wf-handle__anchor-layer--${side}`}
        aria-hidden="true"
      >
        <div className="wf-handle__anchor" data-visible="false">
          <span className="wf-handle__dot" />
        </div>
      </div>

      {variant === 'plus' ? (
        <div
          ref={interactionSurfaceRef}
          className={`wf-handle__plus-hit-area wf-handle__plus-hit-area--${side}`}
          onPointerEnter={handleSurfaceEnter}
          onPointerLeave={handleSurfaceLeave}
          onPointerDown={handlePlusPointerDown}
          onPointerMove={handlePlusPointerMove}
          onPointerUp={handlePlusPointerUp}
          onPointerCancel={handlePlusPointerCancel}
          onClick={handlePlusClick}
        >
          <div ref={plusShellRef} className="wf-handle__plus">
            <div className="wf-handle__plus-button">
              <Plus size={24} strokeWidth={2.5} />
            </div>
          </div>
        </div>
      ) : null}

      {hasMenu && menuPosition ? (
        <CanvasNodeActionMenu
          visible={dropdownOpen}
          x={menuPosition.x}
          y={menuPosition.y}
          align={isLeft ? 'end' : 'start'}
          title={t('menu.generateFromNode')}
          options={options}
          onSelect={handleMenuSelect}
          onClose={() => setDropdownOpen(false)}
        />
      ) : null}
    </Handle>
  );
};

export default memo(CanvasNodeHandle);

// Re-exported for callers building handle menus (MaterialNode) and the
// release menu (CanvasEditor) from the same derivation.
export type { CanvasNodeActionMenuOption };
