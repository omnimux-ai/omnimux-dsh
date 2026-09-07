/**
 * Audio Param Popover — 音频（非 ASR）参数浮层门面（2026-09-07 全模态收敛 / T05）。
 *
 * CfgPopoverShell（Portal 契约）+ 音频区块信息架构（schema-driven 显隐）：
 *   Section 1 生成方式（ops≥2；长标签 2×N ChoiceTile / 短标签 Segment）
 *   Section 2 时长（duration.options → CfgDurationGrid；range 且无 options →
 *             Slider + 当前值 + allowAuto 自动 pill；不发明 15/30/60 快捷、无 1–60 硬编码）
 *   Section 3 音色（voice.options；基数 ≥6 → CustomSelect，否则 Segment）
 *   Section 4 纯音乐（instrumental.supported → 行内 CfgCompactToggle 160px）
 *   Section 5 格式 / 高级（outputFormat.options → Segment；schema.seed → 数值输入）
 * 写路径先 assertAudioParamWriteKey 再透传宿主 updateParam。
 */

import type { ReactElement } from 'react';
import { CustomSelect, CustomSlider } from '../../../../../ui/index.ts';
import { CfgChoiceTile } from '../cfg/CfgChoiceTile.tsx';
import { CfgCompactToggle } from '../cfg/CfgCompactToggle.tsx';
import { CfgDurationGrid } from '../cfg/CfgDurationGrid.tsx';
import { CfgPopoverShell } from '../cfg/CfgPopoverShell.tsx';
import { CfgSegment } from '../cfg/CfgSegment.tsx';
import { resolveControlKind } from '../cfg/controlKind.ts';
import { assertAudioParamWriteKey } from './audioParamAdapter.ts';
import type { AudioParamPopoverProps } from './types.ts';

/** 音色基数 ≥6 走 CustomSelect（选型矩阵） */
const VOICE_SELECT_THRESHOLD = 6;

/** 音频参数浮层：schema 驱动显隐，废除齿轮抽屉的硬编码滑块。 */
export function AudioParamPopover({
  triggerRef,
  params,
  isOpen,
  onClose,
  onParamChange,
}: AudioParamPopoverProps): ReactElement | null {
  const schema = params.schema;
  const durationOptions = schema.duration?.options ?? [];
  const durationRange = schema.duration?.range;
  const voiceOptions = schema.voice?.options ?? [];
  const formatOptions = schema.outputFormat?.options ?? [];
  const showModeUi = Boolean(params.showModeUi) && (params.effectiveOperations?.length ?? 0) >= 2;

  const writeParam = (key: string, value: unknown): void => {
    assertAudioParamWriteKey(key);
    onParamChange(key, value);
  };

  const modeOptions = params.effectiveOperations.map((op) => ({
    value: op.id,
    label: op.label || op.id,
  }));
  const modeKind = resolveControlKind({
    cardinality: modeOptions.length,
    labels: modeOptions.map((opt) => opt.label),
    containerPx: 328,
  });

  return (
    <CfgPopoverShell
      triggerRef={triggerRef}
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="音频参数配置"
    >
      <div
        className="wf-cfg-popover__scrollable"
        data-show-mode={showModeUi ? 'true' : 'false'}
      >
        {showModeUi ? (
          <section
            className="wf-cfg-popover__section"
            data-testid="wf-audio-operation-mode-section"
          >
            <h4 className="wf-cfg-popover__section-title">生成方式</h4>
            {modeKind === 'choice-tile' ? (
              <CfgChoiceTile
                options={modeOptions}
                value={params.operation}
                onChange={(operationId) => writeParam('operation', operationId)}
                ariaLabel="生成方式"
              />
            ) : (
              <CfgSegment
                options={modeOptions}
                value={params.operation}
                onChange={(operationId) => writeParam('operation', operationId)}
                ariaLabel="生成方式"
              />
            )}
          </section>
        ) : null}

        {durationOptions.length > 0 ? (
          <section className="wf-cfg-popover__section">
            <h4 className="wf-cfg-popover__section-title">时长</h4>
            <CfgDurationGrid
              value={params.duration}
              options={durationOptions}
              onChange={(v) => writeParam('duration', v)}
            />
          </section>
        ) : durationRange ? (
          <section className="wf-cfg-popover__section">
            <div className="wf-cfg-popover__section-heading">
              <h4 className="wf-cfg-popover__section-title">时长</h4>
              <span className="wf-cfg-popover__value">
                {params.duration === -1 ? '自动' : `${params.duration}s`}
              </span>
            </div>
            <div className="wf-cfg-popover__range-row">
              <CustomSlider
                className="wf-cfg-popover__slider"
                min={durationRange.min}
                max={durationRange.max}
                step={durationRange.step ?? 1}
                value={params.duration >= durationRange.min ? params.duration : durationRange.min}
                onChange={(value) => writeParam('duration', value)}
              />
              {schema.duration?.allowAuto ? (
                <button
                  type="button"
                  className={`wf-cfg-duration-pill${params.duration === -1 ? ' wf-cfg-duration-pill--active' : ''}`}
                  aria-pressed={params.duration === -1}
                  onClick={() => writeParam('duration', -1)}
                >
                  自动
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {voiceOptions.length > 0 ? (
          <section className="wf-cfg-popover__section" data-testid="wf-audio-voice-section">
            <h4 className="wf-cfg-popover__section-title">音色</h4>
            {voiceOptions.length >= VOICE_SELECT_THRESHOLD ? (
              <CustomSelect
                className="wf-cfg-popover__select"
                value={params.voice}
                options={voiceOptions}
                disabled={voiceOptions.length === 1}
                onChange={(next) => writeParam('voice', String(next))}
              />
            ) : (
              <CfgSegment
                options={voiceOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                value={params.voice}
                onChange={(v) => writeParam('voice', v)}
                ariaLabel="音色"
              />
            )}
          </section>
        ) : null}

        {params.hasInstrumentalSupport ? (
          <section className="wf-cfg-popover__section" data-testid="wf-audio-instrumental-section">
            <div className="wf-cfg-popover__field-row">
              <span>纯音乐</span>
              <CfgCompactToggle
                value={params.instrumental}
                onChange={(v) => writeParam('instrumental', v)}
                trueLabel="纯音乐"
                falseLabel="带人声"
                ariaLabel="纯音乐"
              />
            </div>
          </section>
        ) : null}

        {formatOptions.length > 0 || schema.seed ? (
          <section className="wf-cfg-popover__section" data-testid="wf-audio-advanced-parameters">
            <h4 className="wf-cfg-popover__section-title">高级参数</h4>
            {formatOptions.length > 0 ? (
              <div className="wf-cfg-popover__field-row">
                <span>输出格式</span>
                <CfgSegment
                  options={formatOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                  value={params.outputFormat}
                  onChange={(v) => writeParam('outputFormat', v)}
                  ariaLabel="输出格式"
                />
              </div>
            ) : null}
            {schema.seed ? (
              <label className="wf-cfg-popover__field-row">
                <span>随机种子</span>
                <input
                  type="number"
                  className="wf-cfg-popover__input"
                  min={schema.seed.range?.min}
                  max={schema.seed.range?.max}
                  step={schema.seed.range?.step ?? 1}
                  value={params.seed ?? ''}
                  placeholder="随机"
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    writeParam('seed', value === '' ? undefined : Number(value));
                  }}
                />
              </label>
            ) : null}
          </section>
        ) : null}
      </div>
    </CfgPopoverShell>
  );
}

export default AudioParamPopover;
