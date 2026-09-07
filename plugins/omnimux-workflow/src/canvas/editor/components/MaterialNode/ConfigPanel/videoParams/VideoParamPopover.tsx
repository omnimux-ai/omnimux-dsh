/**
 * Video Param Popover — Portal 浮层 (Issue 467 / W2).
 *
 * Mode section renders only when effectiveOps ≥ 2 (params.showModeUi).
 * Operation ids come from Catalog DTO options (open strings). Writes
 *
 * Styles: only `wf-video-param-popover*` classes / `--dsw-*` tokens via CSS.
 * No raw hex, no `banned token island`, no JS theme branch. light/dark follows host cascade.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { CapabilityModelItem, ModelParameterSchema } from '../../../../../../shared/api.ts';
import { CustomSelect, CustomSlider } from '../../../../../ui/index.ts';
import { AspectCardGrid } from './AspectCardGrid.tsx';
import { DurationGrid } from './DurationGrid.tsx';
import { projectParamControl } from './paramSchemaFilter.ts';
import {
  BooleanSwitchSegment,
  OperationSegment,
  ResolutionSegment,
  SoundSwitchSegment,
} from './SegmentControls.tsx';
import type { EffectiveVideoParams, PopoverPosition, VideoNodeParams } from './types.ts';
import { calculatePopoverPosition } from './viewportPositioner.ts';

/** VideoParamPopover 属性 */
export interface VideoParamPopoverProps {
  /** 触发条按钮的 ref（用于定位与外部点击判定） */
  triggerRef: RefObject<HTMLElement>;
  /** 当前生效的视频参数（已清洗校验） */
  params: EffectiveVideoParams;
  /** 当前选定模型的参数 Schema */
  schema: ModelParameterSchema;
  /** 当前选定模型详情（可选） */
  modelItem?: CapabilityModelItem;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 关闭浮层回调（外部点击 / Escape / 卸载触发） */
  onClose: () => void;
  /** 参数变更回调：key 与 value 强类型关联 */
  onParamChange: <K extends keyof VideoNodeParams>(key: K, value: VideoNodeParams[K]) => void;
}

/**
 * 基于 React Portal 的上方自适应浮层外壳组件。
 */
export function VideoParamPopover({
  triggerRef,
  params,
  schema,
  modelItem: _modelItem,
  isOpen,
  onClose,
  onParamChange,
}: VideoParamPopoverProps): ReactElement | null {
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

  const resolutionOptions = schema.resolution?.options ?? [];
  const durationOptions = schema.duration?.options ?? [];
  const durationRange = schema.duration?.range;
  const showModeUi = Boolean(params.showModeUi) && (params.effectiveOperations?.length ?? 0) >= 2;
  const activeOperation = params.effectiveOperations.find((operation) => operation.id === params.operation);

  // T04 声明式参数过滤：白名单 ∩ schema 支持度 → Popover 常规项 / Advanced 高级项。
  const projected = useMemo(
    () => projectParamControl({
      operationId: params.operation,
      schema,
      operationCount: params.effectiveOperations?.length ?? (showModeUi ? 2 : 1),
    }),
    [params.operation, params.effectiveOperations, schema, showModeUi],
  );
  const popoverKeys = new Set(projected.popover);
  const advancedKeys = new Set(projected.advanced);

  const needsFileUrl = advancedKeys.has('fileUrl')
    && (activeOperation?.slots.some((slot) => slot.slot === 'file_url') ?? false);
  const needsLinkUrl = advancedKeys.has('linkUrl')
    && (activeOperation?.slots.some((slot) => slot.slot === 'link_url') ?? false);
  const booleanControls = ([
    ['watermark', 'AI 水印', schema.watermark, params.watermark],
    ['returnLastFrame', '返回尾帧', schema.returnLastFrame, params.returnLastFrame],
    ['webSearch', '联网搜索', schema.webSearch, params.webSearch],
    ['nsfwCheck', '内容审核', schema.nsfwCheck, params.nsfwCheck],
  ] as const).filter(([field]) => advancedKeys.has(field));
  const enumControls = ([
    ['outputFormat', '输出格式', schema.outputFormat, params.outputFormat],
    ['referenceTaskType', '参考任务类型', schema.referenceTaskType, params.referenceTaskType],
    ['generationType', '生成类型', schema.generationType, params.generationType],
  ] as const).filter(([field]) => advancedKeys.has(field));
  const showAdvanced = Boolean(
    (advancedKeys.has('seed') && schema.seed)
    || booleanControls.some(([, , definition]) => definition?.supported)
    || enumControls.some(([, , definition]) => definition?.options?.length),
  );

  const panelClass = position?.placement === 'bottom'
    ? 'wf-video-param-popover wf-video-param-popover--bottom'
    : 'wf-video-param-popover wf-video-param-popover--top';

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
      aria-label="视频参数配置"
      data-show-mode={showModeUi ? 'true' : 'false'}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="wf-video-param-popover__scrollable">
        {/* effectiveOps ≥ 2 only — 0/1 不渲染 mode DOM；且 operation 须在 popover 白名单内 */}
        {showModeUi && popoverKeys.has('operation') ? (
          <section
            className="wf-video-param-popover__section"
            data-testid="wf-operation-mode-section"
          >
            <h4 className="wf-video-param-popover__section-title">生成方式</h4>
            <OperationSegment
              value={params.operation}
              operations={params.effectiveOperations}
              onChange={(operationId) => onParamChange('operation', operationId)}
            />
          </section>
        ) : null}

        {popoverKeys.has('aspectRatio') && (schema.aspectRatio?.options?.length ?? 0) > 0 ? (
          <section className="wf-video-param-popover__section">
            <h4 className="wf-video-param-popover__section-title">比例</h4>
            <AspectCardGrid
              value={params.aspectRatio}
              options={schema.aspectRatio?.options ?? []}
              onChange={(v) => onParamChange('aspectRatio', v)}
            />
          </section>
        ) : null}

        {popoverKeys.has('resolution') && resolutionOptions.length > 0 && (
          <section className="wf-video-param-popover__section">
            <h4 className="wf-video-param-popover__section-title">清晰度</h4>
            <ResolutionSegment
              value={params.resolution}
              options={resolutionOptions}
              onChange={(v) => onParamChange('resolution', v)}
            />
          </section>
        )}

        {popoverKeys.has('duration') && durationOptions.length > 0 && (
          <section className="wf-video-param-popover__section">
            <h4 className="wf-video-param-popover__section-title">时长</h4>
            <DurationGrid
              value={typeof params.duration === 'number' ? params.duration : Number(params.duration) || 5}
              options={durationOptions}
              onChange={(v) => onParamChange('duration', v)}
            />
          </section>
        )}

        {popoverKeys.has('duration') && durationOptions.length === 0 && durationRange ? (
          <section className="wf-video-param-popover__section">
            <div className="wf-video-param-popover__section-heading">
              <h4 className="wf-video-param-popover__section-title">时长</h4>
              <span className="wf-video-param-popover__value">
                {params.duration === -1 ? '自动' : `${params.duration}s`}
              </span>
            </div>
            <div className="wf-video-param-popover__range-row">
              <CustomSlider
                className="wf-video-param-popover__slider"
                min={durationRange.min}
                max={durationRange.max}
                step={durationRange.step ?? 1}
                value={typeof params.duration === 'number' && params.duration >= durationRange.min
                  ? params.duration
                  : schema.duration?.defaultValue ?? durationRange.min}
                onChange={(value) => onParamChange('duration', value)}
              />
              {schema.duration?.allowAuto ? (
                <button
                  type="button"
                  className={`wf-video-duration-pill${params.duration === -1 ? ' wf-video-duration-pill--active' : ''}`}
                  aria-pressed={params.duration === -1}
                  onClick={() => onParamChange('duration', -1)}
                >
                  自动
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {params.hasSoundSupport && popoverKeys.has('sound') && (
          <section className="wf-video-param-popover__section">
            <h4 className="wf-video-param-popover__section-title">有声视频</h4>
            <SoundSwitchSegment
              value={params.sound}
              onChange={(v) => onParamChange('sound', v)}
            />
          </section>
        )}

        {needsFileUrl || needsLinkUrl ? (
          <section className="wf-video-param-popover__section">
            <h4 className="wf-video-param-popover__section-title">
              {needsFileUrl ? '文档地址' : '网页地址'}
            </h4>
            <input
              type="url"
              className="wf-video-param-popover__input"
              value={(needsFileUrl ? params.fileUrl : params.linkUrl) ?? ''}
              placeholder={needsFileUrl ? 'https://example.com/document.pdf' : 'https://example.com/page'}
              onChange={(event) => onParamChange(needsFileUrl ? 'fileUrl' : 'linkUrl', event.target.value)}
            />
          </section>
        ) : null}

        {showAdvanced ? (
          <section className="wf-video-param-popover__section" data-testid="wf-video-advanced-parameters">
            <h4 className="wf-video-param-popover__section-title">高级参数</h4>
            {advancedKeys.has('seed') && schema.seed ? (
              <label className="wf-video-param-popover__field-row">
                <span>随机种子</span>
                <input
                  type="number"
                  className="wf-video-param-popover__input"
                  min={schema.seed.range?.min}
                  max={schema.seed.range?.max}
                  step={schema.seed.range?.step ?? 1}
                  value={params.seed ?? ''}
                  placeholder="随机"
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    onParamChange('seed', value === '' ? undefined : Number(value));
                  }}
                />
              </label>
            ) : null}
            {enumControls.map(([field, label, definition, value]) => definition?.options?.length ? (
              <div className="wf-video-param-popover__field-row" key={field}>
                <span>{label}</span>
                <CustomSelect
                  className="wf-video-param-popover__select"
                  value={value ?? definition.defaultValue}
                  options={definition.options}
                  disabled={definition.options.length === 1}
                  onChange={(next) => onParamChange(field, String(next))}
                />
              </div>
            ) : null)}
            {booleanControls.map(([field, label, definition, value]) => definition?.supported ? (
              <div className="wf-video-param-popover__field-row" key={field}>
                <span>{label}</span>
                <BooleanSwitchSegment
                  ariaLabel={label}
                  value={typeof value === 'boolean' ? value : definition.defaultValue}
                  onChange={(next) => onParamChange(field, next)}
                />
              </div>
            ) : null)}
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default VideoParamPopover;
