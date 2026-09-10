/**
 * Video Param Popover — 视频参数浮层门面（Issue 467 / W2, 2026-09-07 全模态收敛 / T03）。
 *
 * Portal / 定位 / Esc / 外点 / nowheel 隔离全部由通用 CfgPopoverShell 承担；
 * 本文件只负责视频区块信息架构（生成方式 / 比例 / 质量行 / 时长 / 高级）。
 * Mode section renders only when effectiveOps ≥ 2 (params.showModeUi).
 * Operation ids come from Catalog DTO options (open strings).
 *
 * Styles: `wf-video-param-popover*` 与 `wf-cfg-popover*` 双选择器别名（数值单处定义）。
 * No raw hex, no banned token island, no JS theme branch. light/dark follows host cascade.
 */

import { useMemo } from 'react';
import type { ReactElement, RefObject } from 'react';
import type { CapabilityModelItem, ModelParameterSchema } from '../../../../../../shared/api.ts';
import { CustomSelect, CustomSlider } from '../../../../../ui/index.ts';
import { CfgPopoverShell } from '../cfg/CfgPopoverShell.tsx';
import { CfgSegment } from '../cfg/CfgSegment.tsx';
import { AspectCardGrid } from './AspectCardGrid.tsx';
import { DurationGrid } from './DurationGrid.tsx';
import { projectParamControl } from './paramSchemaFilter.ts';
import {
  BooleanSwitchSegment,
  OperationSegment,
  ResolutionSegment,
  SoundSwitchSegment,
} from './SegmentControls.tsx';
import type { EffectiveVideoParams, VideoNodeParams } from './types.ts';

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
 * 视频参数浮层：CfgPopoverShell（Portal 契约）+ 视频区块。
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
  const resolutionOptions = schema.resolution?.options ?? [];
  const durationOptions = schema.duration?.options ?? [];
  const hasAutoDurationSupport = Boolean(
    schema.duration?.allowAuto || durationOptions.some((opt) => opt.value === -1),
  );
  const durationRange = useMemo(() => {
    if (schema.duration?.range) {
      return {
        min: schema.duration.range.min,
        max: schema.duration.range.max,
        step: schema.duration.range.step ?? 1,
      };
    }
    const positiveOptions = durationOptions.filter((opt) => typeof opt.value === 'number' && opt.value > 0);
    if (positiveOptions.length > 0) {
      const vals = positiveOptions.map((opt) => opt.value);
      return {
        min: Math.min(...vals),
        max: Math.max(...vals),
        step: 1,
      };
    }
    return { min: 4, max: 30, step: 1 };
  }, [schema.duration?.range, durationOptions]);

  const isAutoDuration = params.duration === -1 || (typeof params.duration === 'string' && (params.duration === 'auto' || params.duration === '-1'));
  const validCustomDuration = typeof params.duration === 'number' && params.duration > 0
    ? params.duration
    : (typeof schema.duration?.defaultValue === 'number' && schema.duration.defaultValue > 0
        ? schema.duration.defaultValue
        : durationRange.min);
  const durationDisplayValue = isAutoDuration ? '自动' : `${validCustomDuration}s`;
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
    booleanControls.some(([, , definition]) => definition?.supported)
    || enumControls.some(([, , definition]) => definition?.options?.length),
  );

  return (
    <CfgPopoverShell
      triggerRef={triggerRef}
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="视频参数配置"
      className="wf-video-param-popover"
    >
      <div
        className="wf-video-param-popover__scrollable"
        data-show-mode={showModeUi ? 'true' : 'false'}
      >
        {/* effectiveOps ≥ 2 only — 0/1 不渲染 mode DOM；且 operation 须在 popover 白名单内 */}
        {showModeUi && popoverKeys.has('operation') ? (
          <section
            className="wf-video-param-popover__section"
            data-testid="wf-operation-mode-section"
          >
            {/* 生成模式 / 生成方式对齐 */}
            <h4 className="wf-video-param-popover__section-title">生成模式</h4>
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

        {(resolutionOptions.length > 0 && popoverKeys.has('resolution')) || (params.hasSoundSupport && popoverKeys.has('sound')) ? (
          <section className="wf-video-param-popover__section" data-testid="wf-video-quality-section">
            <div className="wf-video-param-popover__quality-row">
              {resolutionOptions.length > 0 && popoverKeys.has('resolution') ? (
                <div className="wf-video-param-popover__quality-field">
                  <h4 className="wf-video-param-popover__section-title">清晰度</h4>
                  <ResolutionSegment
                    value={params.resolution}
                    options={resolutionOptions}
                    onChange={(v) => onParamChange('resolution', v)}
                  />
                </div>
              ) : null}
              {params.hasSoundSupport && popoverKeys.has('sound') ? (
                <div className="wf-video-param-popover__quality-field wf-video-param-popover__quality-field--sound">
                  <h4 className="wf-video-param-popover__section-title">有声</h4>
                  <SoundSwitchSegment
                    value={params.sound}
                    onChange={(v) => onParamChange('sound', v)}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {popoverKeys.has('duration') && (
          <section className="wf-video-param-popover__section" data-testid="wf-video-duration-section">
            <div className="wf-video-param-popover__section-heading">
              <h4 className="wf-video-param-popover__section-title">时长</h4>
              <span className="wf-video-param-popover__value">{durationDisplayValue}</span>
            </div>

            {hasAutoDurationSupport ? (
              <div className="wf-video-param-popover__duration-mode-row">
                <CfgSegment
                  options={[
                    { value: 'custom', label: '自定义' },
                    { value: 'auto', label: '自动' },
                  ]}
                  value={isAutoDuration ? 'auto' : 'custom'}
                  onChange={(mode) => {
                    if (mode === 'auto') {
                      onParamChange('duration', -1);
                    } else {
                      onParamChange('duration', validCustomDuration);
                    }
                  }}
                  ariaLabel="时长模式"
                  className="wf-video-seg"
                />
              </div>
            ) : null}

            {!isAutoDuration ? (
              <div className="wf-video-param-popover__duration-slider-container">
                <div className="wf-video-param-popover__range-row">
                  <CustomSlider
                    className="wf-video-param-popover__slider"
                    min={durationRange.min}
                    max={durationRange.max}
                    step={durationRange.step}
                    value={validCustomDuration}
                    onChange={(value) => onParamChange('duration', value)}
                  />
                </div>
                <div className="wf-video-param-popover__range-labels">
                  <span className="wf-video-param-popover__range-min">{durationRange.min}s</span>
                  <span className="wf-video-param-popover__range-max">{durationRange.max}s</span>
                </div>
              </div>
            ) : null}

            {durationOptions.length > 0 && !schema.duration?.range && !hasAutoDurationSupport ? (
              <DurationGrid
                value={typeof params.duration === 'number' ? params.duration : Number(params.duration) || 5}
                options={durationOptions}
                onChange={(v) => onParamChange('duration', v)}
              />
            ) : null}
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
                  value={typeof value === 'boolean' ? value : false}
                  onChange={(next) => onParamChange(field, next)}
                />
              </div>
            ) : null)}
          </section>
        ) : null}
      </div>
    </CfgPopoverShell>
  );
}

export default VideoParamPopover;
