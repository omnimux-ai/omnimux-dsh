/**
 * CfgSegment — 短标签 2–5 项分段切换器（2026-09-07 全模态收敛 / T02）。
 *
 * 单行 nowrap；溢出时由门面改渲染 ChoiceTile，Segment 自身不降字号、
 * 不允许中文断词。支持禁用项（只读高亮 + title 提示）。
 */

import { type ReactElement, type ReactNode } from 'react';

/** 通用分段选项结构 */
export interface CfgSegmentOption<T extends string | number | boolean> {
  value: T;
  label: string;
  /** 可选前置图标（矢量 SVG 组件） */
  icon?: ReactNode;
  /** 禁用态（禁用时点击不触发 onChange） */
  disabled?: boolean;
  /** 禁用态提示文案（title） */
  title?: string;
}

/** CfgSegment 属性 */
export interface CfgSegmentProps<T extends string | number | boolean> {
  options: Array<CfgSegmentOption<T>>;
  value: T | undefined;
  onChange: (v: T) => void;
  ariaLabel?: string;
  /** 追加在容器上的类名（如视频门面的 wf-video-seg 双锁） */
  className?: string;
}

/** 通用横向分段容器：wf-cfg-seg 包裹，单项 wf-cfg-seg__item，选中追加 --active */
export function CfgSegment<T extends string | number | boolean>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: CfgSegmentProps<T>): ReactElement {
  const containerClass = className ? `wf-cfg-seg ${className}` : 'wf-cfg-seg';
  return (
    <div className={containerClass} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive ? 'wf-cfg-seg__item wf-cfg-seg__item--active' : 'wf-cfg-seg__item';
        const isDisabled = opt.disabled ?? false;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            title={opt.title}
            className={cls}
            data-operation-id={typeof opt.value === 'string' ? opt.value : undefined}
            onClick={() => {
              if (!isDisabled) {
                onChange(opt.value);
              }
            }}
          >
            {opt.icon}
            <span className="wf-cfg-seg__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CfgSegment;
