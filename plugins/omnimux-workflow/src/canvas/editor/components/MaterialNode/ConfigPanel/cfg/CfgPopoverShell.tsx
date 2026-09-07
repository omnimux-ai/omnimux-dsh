/**
 * CfgPopoverShell — 全模态通用 Portal 浮层外壳（2026-09-07 全模态收敛 / T02）。
 *
 * 职责：createPortal 挂载 document.body、calculatePopoverPosition 视口定位、
 * 上下翻转与限高、Esc / 外点关闭（忽略 .wf-custom-select-dropdown）、
 * nowheel nodrag 事件隔离、placement 同向入场 class。
 * 非职责：不知道任何材质区块内容（内容由门面以 children 传入）。
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { PopoverPosition } from './types.ts';
import { calculatePopoverPosition } from './viewportPositioner.ts';

/** CfgPopoverShell 属性 */
export interface CfgPopoverShellProps {
  /** 触发条按钮的 ref（用于定位与外部点击判定） */
  triggerRef: RefObject<HTMLElement | null>;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 关闭浮层回调（外部点击 / Escape 触发） */
  onClose: () => void;
  /** role="dialog" 的无障碍名称 */
  ariaLabel: string;
  /** 追加在 wf-cfg-popover 之后的类名（如视频门面的 wf-video-param-popover） */
  className?: string;
  children: ReactNode;
}

/**
 * 基于 React Portal 的上方自适应浮层外壳组件。
 */
export function CfgPopoverShell({
  triggerRef,
  isOpen,
  onClose,
  ariaLabel,
  className,
  children,
}: CfgPopoverShellProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const recompute = (): void => {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPosition(calculatePopoverPosition(rect, viewport));
  };

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    recompute();

    const handleResize = (): void => recompute();
    const handleScroll = (): void => recompute();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) {
        return;
      }
      if (
        panelRef.current?.contains(target)
        || triggerRef.current?.contains(target)
        || (target instanceof Element && target.closest('.wf-custom-select-dropdown'))
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const panelClass = [
    'wf-cfg-popover',
    position?.placement === 'bottom' ? 'wf-cfg-popover--bottom' : 'wf-cfg-popover--top',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const style: CSSProperties = {
    position: 'fixed',
    left: position?.left,
    maxHeight: position?.maxHeight,
    width: position?.width,
    ...(position?.placement === 'bottom'
      ? { top: position?.top }
      : { bottom: position?.bottom }),
  };

  return createPortal(
    <div
      ref={panelRef}
      className={`${panelClass} nowheel nodrag`}
      style={style}
      role="dialog"
      aria-label={ariaLabel}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export default CfgPopoverShell;
