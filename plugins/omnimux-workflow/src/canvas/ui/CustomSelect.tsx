/**
 * CustomSelect — Native Dark-Glass Select Popover.
 * Replaces antd `Select` with a modern, high-performance, dark-glass component.
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T = string | number> {
  value: T;
  label: React.ReactNode;
  triggerLabel?: React.ReactNode;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface CustomSelectProps<T = string | number> {
  value?: T;
  options: Array<SelectOption<T>>;
  onChange?: (value: T) => void;
  className?: string;
  disabled?: boolean;
  popupMatchSelectWidth?: boolean;
  placeholder?: string;
  variant?: 'pill' | 'ghost' | 'standard';
}

export function CustomSelect<T extends string | number = string>({
  value,
  options,
  onChange,
  className = '',
  disabled = false,
  popupMatchSelectWidth = true,
  placeholder,
  variant = 'pill',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width?: number; placement: 'bottom' | 'top' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = Math.min(options.length * 34 + 16, 260);

    const spaceBelow = viewportHeight - rect.bottom;
    const placeTop = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    const top = placeTop
      ? rect.top - 6
      : rect.bottom + 6;

    const width = popupMatchSelectWidth ? rect.width : undefined;

    /**
     * Issue #3058 FE-03：菜单左缘横向钳进视口。trigger 贴右缘（如 390px 窄态
     * 音色筛选）时 minWidth(≥140/180) 曾使菜单越出右边界；统一在定位 seam
     * 钳位 [8px, vw-8-menuWidth]，不改组件 API 与视觉。
     * final-review-closure medium：菜单 CSS 是 width:max-content，实际渲染宽
     * 可能大于 minWidth 估宽（200px 菜单按 140px 钳位仍越界）——菜单已挂载时
     * 按实测量宽钳位，未挂载（首帧前）退回 minWidth 同口径估宽。
     */
    const viewportWidth = window.innerWidth;
    // 与 portal inline minWidth 同口径：matchWidth 时 ≥140，否则 180
    const estimatedMenuWidth = width ? Math.max(width, 140) : 180;
    const measuredMenuWidth = menuRef.current?.getBoundingClientRect().width;
    const menuWidth = measuredMenuWidth && measuredMenuWidth > 0 ? measuredMenuWidth : estimatedMenuWidth;
    const maxLeft = Math.max(8, viewportWidth - 8 - menuWidth);
    const left = Math.max(8, Math.min(rect.left, maxLeft));

    setCoords({
      top,
      left,
      width,
      placement: placeTop ? 'top' : 'bottom',
    });
  }, [options.length, popupMatchSelectWidth]);

  // 菜单挂载后、绘制前按实际渲染宽重算一次 left——width:max-content 的实宽
  // 此刻才读得到（updatePosition 内部测 menuRef）。
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Issue #3058 FE-02：菜单自己吃 Escape——capture 阶段关闭并隔离传播，
      // 宿主弹窗（CustomModal 同级 window 监听已让位）与其他 window 监听
      // 不再收到本次按键；同一 Escape 只关闭菜单这一层。
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    const handleScroll = () => {
      updatePosition();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      setOpen((prev) => !prev);
    },
    [disabled],
  );

  const handleSelect = useCallback(
    (optValue: T, optDisabled?: boolean) => {
      if (optDisabled) return;
      onChange?.(optValue);
      setOpen(false);
    },
    [onChange],
  );

  const triggerClassName = [
    'wf-custom-select-trigger',
    `wf-custom-select-trigger--${variant}`,
    open ? 'wf-custom-select-trigger--open' : '',
    disabled ? 'wf-custom-select-trigger--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        disabled={disabled}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="wf-custom-select-label">
          {selectedOption
            ? (selectedOption.triggerLabel ?? selectedOption.label)
            : placeholder ?? String(value ?? '')}
        </span>
        <ChevronDown size={12} className="wf-custom-select-chevron" />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className={`wf-custom-select-dropdown wf-custom-select-dropdown--${coords.placement}`}
              style={{
                position: 'fixed',
                top: coords.placement === 'top' ? undefined : coords.top,
                bottom: coords.placement === 'top' ? window.innerHeight - coords.top : undefined,
                left: coords.left,
                minWidth: coords.width ? Math.max(coords.width, 140) : 180,
                // Issue #3058 FE-03：极端窄视口兜底，菜单不越右边界（8px 内边距）；
                // 保留既有 CSS 300px 封顶——取两者较小值，不覆盖原上限。
                maxWidth: Math.min(300, window.innerWidth - 16),
                zIndex: 9999,
              }}
              role="listbox"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wf-custom-select-list">
                {options.map((opt) => {
                  const isSelected = opt.value === value;
                  const hasExtra = !!opt.subtitle || !!opt.badge || !!opt.icon;

                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      title={opt.title || (typeof opt.label === 'string' ? opt.label : undefined)}
                      className={`wf-custom-select-option ${
                        hasExtra ? 'wf-custom-select-option--rich' : ''
                      } ${isSelected ? 'wf-custom-select-option--selected' : ''} ${
                        opt.disabled ? 'wf-custom-select-option--disabled' : ''
                      }`}
                      onClick={() => handleSelect(opt.value, opt.disabled)}
                    >
                      {opt.icon ? (
                        <span className="wf-custom-select-option-icon">{opt.icon}</span>
                      ) : null}

                      <div className="wf-custom-select-option-main">
                        <div className="wf-custom-select-option-top">
                          <span className="wf-custom-select-option-text">{opt.label}</span>
                          {opt.badge ? (
                            <span className="wf-custom-select-badge">{opt.badge}</span>
                          ) : null}
                        </div>
                        {opt.subtitle ? (
                          <div className="wf-custom-select-subtitle">{opt.subtitle}</div>
                        ) : null}
                      </div>

                      {isSelected ? (
                        <Check size={14} className="wf-custom-select-option-check" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default CustomSelect;
