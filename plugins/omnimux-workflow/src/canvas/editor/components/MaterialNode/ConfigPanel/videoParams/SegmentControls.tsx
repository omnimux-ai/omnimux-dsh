/**
 * Video Param Segment Controls (Issue 467 / W2, 2026-09-07 UI 收敛 / T03).
 *
 * OperationSegment is driven by Catalog DTO effective operations (open string
 * ids + labels). Unsupported ops are not
 * rendered (Hide, Don't Grey). effectiveOps ≤ 1 → return null (no DOM).
 *
 * 控件选型走 resolveControlKind 矩阵：长标签 / 单行溢出 → 2×N Choice Tile
 * （nowrap 零断词）；短标签 → Segment。有声从通栏 Segment 降级为
 * 160px CompactToggle，与清晰度同行。
 */

import { Check, Volume2, VolumeX, X } from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';
import type { OperationUiOption } from '../../../../../../shared/validation/operationUi.ts';
import { ChoiceTile } from './ChoiceTile.tsx';
import { CompactToggle } from './CompactToggle.tsx';
import { resolveControlKind } from './controlKind.ts';

/** 通用分段选项结构 */
interface SegmentOption<T extends string | number | boolean> {
  value: T;
  label: string;
  /** 可选前置图标（矢量 SVG 组件） */
  icon?: ReactNode;
  /** 禁用态（禁用时点击不触发 onChange） */
  disabled?: boolean;
  /** 禁用态提示文案（title） */
  title?: string;
}

/** 通用横向分段容器：wf-video-seg 包裹，单项 wf-video-seg__item，选中追加 --active */
function Segment<T extends string | number | boolean>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<SegmentOption<T>>;
  value: T | undefined;
  onChange: (v: T) => void;
  ariaLabel?: string;
}): ReactElement {
  return (
    <div className="wf-video-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive ? 'wf-video-seg__item wf-video-seg__item--active' : 'wf-video-seg__item';
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
            <span className="wf-video-seg__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** OperationSegment 属性 */
export interface OperationSegmentProps {
  /** Currently selected canonical operation id. */
  value: string;
  /**
   * Effective operations only (already filtered by the kernel). Unsupported
   * ops must NOT be passed here — they must not enter the DOM.
   */
  operations: OperationUiOption[];
  onChange: (operationId: string) => void;
}

/**
 * Operation mode segment (Catalog-driven).
 *
 * 铁律：
 * 1. 只渲染传入的 effective operations；不支持项不在 DOM。
 * 2. operations.length <= 1 → return null（0/1 无 mode UI）。
 * 3. 未知未来合法 id 以 string 消费，不穷举 17-union。
 * 4. 选型走 resolveControlKind：长标签（>4 汉字）/ 单行溢出 → Choice Tile
 *    2×N（高 36px，nowrap 零断词），否则 Segment 单行 nowrap。
 */
export function OperationSegment({
  value,
  operations,
  onChange,
}: OperationSegmentProps): ReactElement | null {
  const effective = (operations ?? []).filter((op) => op && typeof op.id === 'string' && op.id);
  if (effective.length <= 1) {
    return null;
  }

  const options: Array<SegmentOption<string>> = effective.map((op) => ({
    value: op.id,
    label: op.label || op.id,
  }));

  const kind = resolveControlKind({
    cardinality: options.length,
    labels: options.map((opt) => opt.label),
    containerPx: 328,
  });

  if (kind === 'choice-tile') {
    return (
      <ChoiceTile
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel="生成方式"
      />
    );
  }

  return (
    <Segment
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel="生成方式"
    />
  );
}

/** ResolutionSegment 属性 */
export interface ResolutionSegmentProps {
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

/**
 * 分辨率分段：options 渲染为横向分段
 * - options.length <= 1 时单项仍渲染为只读高亮（disabled + title 提示）
 */
export function ResolutionSegment({
  value,
  options,
  onChange,
}: ResolutionSegmentProps): ReactElement {
  const singleReadOnly = options.length <= 1;
  const segOptions: Array<SegmentOption<string>> = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
    disabled: singleReadOnly,
    title: singleReadOnly ? '当前模型仅支持此分辨率' : undefined,
  }));

  return <Segment options={segOptions} value={value} onChange={onChange} ariaLabel="分辨率" />;
}

/** SoundSwitchSegment 属性 */
export interface SoundSwitchSegmentProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

/** 有声/无声 160px 紧凑开关：有声带 Volume2，无声带 VolumeX（废除通栏 Segment） */
export function SoundSwitchSegment({ value, onChange }: SoundSwitchSegmentProps): ReactElement {
  return (
    <CompactToggle
      value={value}
      onChange={onChange}
      trueLabel="有声"
      falseLabel="无声"
      trueIcon={<Volume2 size={13} />}
      falseIcon={<VolumeX size={13} />}
      ariaLabel="音效"
    />
  );
}

export function BooleanSwitchSegment({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}): ReactElement {
  return (
    <Segment
      options={[
        { value: true, label: '开启', icon: <Check size={13} /> },
        { value: false, label: '关闭', icon: <X size={13} /> },
      ]}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
    />
  );
}
