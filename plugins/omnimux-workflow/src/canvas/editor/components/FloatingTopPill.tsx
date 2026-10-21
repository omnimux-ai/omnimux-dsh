/**
 * FloatingTopPill — 节点上方唯一胶囊操作栏。
 *
 * 声明式 actions：主区在左、次区在右，中间一根竖分割线；
 * 超 maxWidth 时次区折进「更多」。空 actions / visible=false 不渲染。
 */

import React, { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis } from 'lucide-react';
import { useViewport } from '@xyflow/react';
import { useT } from '../../i18n';
import { inverseScaleForZoom } from '../utils/nodeVisualMath';
import {
  DEFAULT_PILL_MAX_WIDTH,
  partitionToolbarActions,
  type ToolbarSection,
} from '../utils/nodeToolbarLogic';
import { stopToolbarNativeEvent } from './toolbarPointerGuard';

export interface FloatingPillAction {
  key: string;
  /** 可见短文案；缺省时胶囊只渲染图标，读屏走 title / aria-label。 */
  label?: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }> | React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  section?: ToolbarSection;
  variant?: 'default' | 'primary' | 'success';
  disabled?: boolean;
  title?: string;
  className?: string;
}

export interface FloatingTopPillProps {
  actions?: FloatingPillAction[];
  visible?: boolean;
  /** 折叠预算（不是视觉夹取宽度）：超出预算的次区/尾部主区动作折进「更多」。 */
  maxWidth?: number;
  children?: React.ReactNode;
  inverseScale?: number;
  topOffset?: number;
  className?: string;
  style?: React.CSSProperties;
}

function renderIcon(icon: FloatingPillAction['icon']) {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const IconComp = icon as React.ComponentType<{ size?: number; className?: string }>;
  return <IconComp size={13} className="wf-floating-top-pill__icon" />;
}

function actionClassName(action: Pick<FloatingPillAction, 'variant' | 'className'>): string {
  return [
    'wf-floating-top-pill__btn',
    action.variant === 'primary' ? 'wf-floating-top-pill__btn--primary' : '',
    action.variant === 'success' ? 'wf-floating-top-pill__btn--success' : '',
    action.className || '',
  ]
    .filter(Boolean)
    .join(' ');
}

const PillButton: React.FC<{
  action: FloatingPillAction;
  measureKey?: string;
}> = ({ action, measureKey }) => (
  <button
    type="button"
    className={actionClassName(action)}
    onClick={action.onClick}
    disabled={action.disabled}
    title={action.title}
    aria-label={action.title ? action.title : undefined}
    data-pill-measure-key={measureKey ?? action.key}
  >
    {renderIcon(action.icon)}
    {action.label ? <span>{action.label}</span> : null}
  </button>
);

export const FloatingTopPill: React.FC<FloatingTopPillProps> = ({
  actions,
  visible = true,
  maxWidth = DEFAULT_PILL_MAX_WIDTH,
  children,
  inverseScale: externalInverseScale,
  topOffset = 30,
  className = '',
  style,
}) => {
  const t = useT();
  const { zoom } = useViewport();
  const calculatedInverseScale = useMemo(() => inverseScaleForZoom(zoom), [zoom]);
  const inverseScale = externalInverseScale ?? calculatedInverseScale;

  const measureRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const [overflowKeys, setOverflowKeys] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const list = actions ?? [];

  useLayoutEffect(() => {
    if (children || list.length === 0) {
      setOverflowKeys([]);
      return;
    }

    const measure = () => {
      const root = measureRef.current;
      if (!root) return;
      const specs = list.map((action) => {
        const el = root.querySelector(`[data-pill-measure-key="${action.key}"]`) as HTMLElement | null;
        return {
          id: action.key,
          section: (action.section ?? 'secondary') as ToolbarSection,
          width: el?.offsetWidth ?? 0,
        };
      });
      const moreEl = root.querySelector('[data-pill-measure-key="__more__"]') as HTMLElement | null;
      const dividerEl = root.querySelector('[data-pill-measure-divider]') as HTMLElement | null;
      const result = partitionToolbarActions(specs, {
        maxWidth,
        moreWidth: moreEl?.offsetWidth ?? 0,
        dividerWidth: dividerEl?.offsetWidth ?? 0,
        gap: 0,
      });
      const nextKeys = result.overflow.map((item) => item.id);
      setOverflowKeys((prev) => (prev.join('|') === nextKeys.join('|') ? prev : nextKeys));
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (measureRef.current && observer) observer.observe(measureRef.current);
    return () => observer?.disconnect();
  }, [children, list, maxWidth]);

  useLayoutEffect(() => {
    if (!moreOpen) {
      setMenuPos(null);
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (moreBtnRef.current?.contains(target)) return;
      const menu = document.querySelector('[data-pill-more-menu="true"]');
      if (menu && menu.contains(target)) return;
      setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  if (!visible) return null;
  if (!children && list.length === 0) return null;

  const overflowSet = new Set(overflowKeys);
  const visibleActions = list.filter((action) => !overflowSet.has(action.key));
  const overflowActions = list.filter((action) => overflowSet.has(action.key));
  const primaryActions = visibleActions.filter((action) => action.section === 'primary');
  const secondaryActions = visibleActions.filter((action) => action.section !== 'primary');
  const showDivider = primaryActions.length > 0 && (secondaryActions.length > 0 || overflowActions.length > 0);

  const openMore = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: rect.left });
    setMoreOpen((open) => !open);
  };

  return (
    <div
      className={`wf-floating-top-pill nodrag nowheel nopan ${className}`.trim()}
      style={{
        top: -(topOffset * inverseScale),
        transform: `translate(-50%, -100%) scale(${inverseScale})`,
        transformOrigin: 'bottom center',
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
    >
      {children ? (
        children
      ) : (
        <>
          <div
            ref={measureRef}
            className="wf-floating-top-pill__measure"
            aria-hidden="true"
          >
            <div className="wf-floating-top-pill__group">
              {list.map((action) => (
                <PillButton key={action.key} action={action} />
              ))}
              <span className="wf-floating-top-pill__divider" data-pill-measure-divider="" />
              <button type="button" className="wf-floating-top-pill__btn" data-pill-measure-key="__more__">
                {renderIcon(Ellipsis)}
                <span>{t('pill.more')}</span>
              </button>
            </div>
          </div>

          <div className="wf-floating-top-pill__group">
            {primaryActions.length > 0 && (
              <div className="wf-floating-top-pill__section">
                {primaryActions.map((action) => (
                  <PillButton key={action.key} action={action} />
                ))}
              </div>
            )}
            {showDivider && <span className="wf-floating-top-pill__divider" />}
            {(secondaryActions.length > 0 || overflowActions.length > 0) && (
              <div className="wf-floating-top-pill__section">
                {secondaryActions.map((action) => (
                  <PillButton key={action.key} action={action} />
                ))}
                {overflowActions.length > 0 && (
                  <button
                    ref={moreBtnRef}
                    type="button"
                    className="wf-floating-top-pill__btn"
                    title={t('pill.more')}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={openMore}
                  >
                    {renderIcon(Ellipsis)}
                    <span>{t('pill.more')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {moreOpen && menuPos && overflowActions.length > 0
        ? createPortal(
            <div
              data-pill-more-menu="true"
              className="wf-floating-top-pill__more-menu nodrag nopan"
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              onMouseDown={stopToolbarNativeEvent}
              onPointerDown={stopToolbarNativeEvent}
              onClick={(e) => e.stopPropagation()}
            >
              {overflowActions.map((action) => {
                const menuLabel = action.label || action.title;
                return (
                  <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    className="wf-floating-top-pill__more-item"
                    disabled={action.disabled}
                    title={action.title}
                    onClick={(event) => {
                      action.onClick?.(event);
                      setMoreOpen(false);
                    }}
                  >
                    {renderIcon(action.icon)}
                    {menuLabel ? <span>{menuLabel}</span> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default memo(FloatingTopPill);
