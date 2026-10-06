/**
 * SlotWells — 模式驱动的媒体卡槽区（Feed-Slot 阶段二 / T03 / Issue #737 还原视觉）.
 *
 * 按 deriveSlotLayout 的 preset 渲染：
 *   - none  → 不渲染（文生视频等纯文本输入不占高度）；
 *   - pair  → [首帧] ⇆ [尾帧]，ArrowLeftRight 对调（swapNamedSlots，保持边不变）；
 *   - strip → 已填缩略图顺序排列，尾部虚线 + 槽（未达上限或上限未定时）；
 *   - named → 各具名卡槽并列（角色图 / 音频驱动等）。
 *
 * 视觉规格（对齐图 2）：
 *   - 空态与添加卡槽为 44px × 44px 大方圆角虚线加号框，圆角 10px，居中清爽 Plus(size=20) 图标；
 *   - 空态坚决不展示截断文字（绝无 refe... 截断标签）；
 *   - 填入素材后展示完整圆角大方块预览，悬浮显示小叉号 ✕ 卸装填。
 */

import React, { memo, useCallback, useRef, useState } from 'react';
import SlotHoverPreview from './SlotHoverPreview.tsx';
import { ArrowLeftRight, FileText, Image as ImageIcon, Loader2, Music, Play, Plus, X } from 'lucide-react';
import type { MaterialType } from '../../../../../../shared/canvasTypes.ts';
import type { SlotOccupant, SlotSpec } from '../../../../../../shared/graph/feedSlot/index.ts';
import { useT } from '../../../../../i18n';
import type { UpstreamMediaItem } from '../../../../hooks/useUpstreamMedia.ts';
import type { SlotPickRequest, SlotWellsProps } from './types.ts';

/** labelKey 未入典时回退到 slot 原名，绝不渲染裸 key。 */
function useSlotLabel() {
  const t = useT();
  return (spec: SlotSpec): string => {
    const label = t(spec.labelKey);
    return label === spec.labelKey ? spec.slot : label;
  };
}

interface WellModel {
  spec: SlotSpec;
  occupant?: SlotOccupant;
  upstream?: UpstreamMediaItem;
  /** 必需槽位空着 → 强调空态（自解释缺素材）。 */
  requiredEmpty: boolean;
  state?: 'ready' | 'inactive' | 'pending' | 'invalid';
  reasonCode?: string;
}

function buildWellModels(spec: SlotSpec, props: SlotWellsProps, upstreamByEdge: Map<string, UpstreamMediaItem>): WellModel[] {
  const occupants = props.bindings[spec.slot] ?? [];
  const models: WellModel[] = occupants.map((occupant) => ({
    spec,
    occupant,
    upstream: upstreamByEdge.get(occupant.edgeId),
    requiredEmpty: false,
  }));
  // 同一槽位定义至多渲染 1 个空卡（占位与追加合一）：已绑显示素材卡，未满给 1 个空卡，绑满隐藏。
  const capacity = spec.max ?? occupants.length + 1;
  const target = Math.max(Math.min(capacity, occupants.length + 1), Math.min(spec.min ?? 0, occupants.length + 1), occupants.length);
  while (models.length < target) {
    models.push({ spec, requiredEmpty: models.length < spec.min });
  }
  return models;
}

function WellThumb({ model }: { model: WellModel }) {
  const { upstream } = model;

  if (!model.occupant) {
    return (
      <span className="wf-slot-well__placeholder">
        <Plus size={20} aria-hidden="true" />
      </span>
    );
  }
  if (!upstream || upstream.availability === 'unavailable') {
    return (
      <span className="wf-slot-well__placeholder wf-slot-well__placeholder--broken">
        <ImageIcon size={18} aria-hidden="true" />
      </span>
    );
  }
  if (upstream.availability === 'waiting' || !upstream.hasMedia) {
    return (
      <span className="wf-slot-well__placeholder wf-slot-well__placeholder--loading">
        <Loader2 size={18} className="wf-slot-well__spin" aria-hidden="true" />
      </span>
    );
  }
  if (upstream.url && upstream.materialType === 'image') {
    return (
      <img
        className="wf-slot-well__media"
        src={upstream.url}
        alt=""
      />
    );
  }
  if (upstream.url && upstream.materialType === 'video') {
    return (
      <span className="wf-slot-well__video-box">
        <video className="wf-slot-well__media" src={upstream.url} muted />
        <Play size={12} className="wf-slot-well__overlay-icon" aria-hidden="true" />
      </span>
    );
  }
  if (upstream.materialType === 'text') {
    return <span className="wf-slot-well__text"><FileText size={16} aria-hidden="true" /><span>{upstream.textContent}</span></span>;
  }
  if (upstream.materialType === 'audio') {
    return (
      <span className="wf-slot-well__placeholder wf-slot-well__placeholder--audio">
        <Music size={18} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="wf-slot-well__placeholder">
      <ImageIcon size={18} aria-hidden="true" />
    </span>
  );
}

const SlotWells: React.FC<SlotWellsProps> = (props) => {
  const { layout, onPickSlot, onSwapSlots, onClearOccupant, onInsertToken } = props;
  const t = useT();
  const [hover, setHover] = useState<{ anchor: HTMLElement; model: WellModel } | null>(null);
  const suppressFocus = useRef<HTMLElement | null>(null);
  const closeHover = useCallback(() => setHover(null), []);
  const returnPreviewFocus = useCallback((anchor: HTMLElement) => {
    suppressFocus.current = anchor;
    anchor.focus();
    setTimeout(() => {
      if (suppressFocus.current === anchor) suppressFocus.current = null;
    }, 300);
  }, []);
  const slotLabel = useSlotLabel();
  const upstreamByEdge = new Map(
    props.upstreams.filter((item) => item.edgeId).map((item) => [item.edgeId as string, item]),
  );
  const conflictedEdges = new Set((props.conflicts ?? []).map((conflict) => conflict.occupant.edgeId));

  if (layout.slots.length === 0 && !props.records?.length) return null;

  // Contract type stays the single-slot whitelist ('image'/'video'/'audio'/
  // 'document'/'text'). Any other value (e.g. a role) widens to all media
  // types so the picker still accepts files instead of rejecting every pick.
  const pickRequest = (spec: SlotSpec): SlotPickRequest => {
    const type = String(spec.type || '');
    const acceptedTypes =
      type === 'image' || type === 'video' || type === 'audio' || type === 'document' || type === 'text'
        ? [type]
        : ['image', 'video', 'audio', 'document', 'text'];
    return {
      targetSlot: spec.slot,
      acceptedTypes,
      max: spec.max,
    };
  };

  const renderWell = (model: WellModel, index: number) => {
    const { spec, occupant } = model;
    const label = slotLabel(spec);
    const conflicted = occupant ? conflictedEdges.has(occupant.edgeId) : false;
    const className = [
      'wf-slot-well',
      occupant ? 'wf-slot-well--filled' : 'wf-slot-well--empty',
      model.requiredEmpty ? 'wf-slot-well--required' : '',
      conflicted ? 'wf-slot-well--conflict' : '',
    ].filter(Boolean).join(' ');

    const handleWellClick = (anchor?: HTMLElement) => {
      if (props.records && occupant) {
        if (anchor) setHover({ anchor, model });
        return;
      }
      if (occupant) {
        if (onInsertToken && model.upstream) {
          onInsertToken({
            sourceNodeId: model.upstream.nodeId,
            slotIndex: Object.values(props.bindings).flat().findIndex((item) => item === occupant),
            label: model.upstream?.label ?? label,
            materialType: (model.upstream?.materialType ?? (spec.type as MaterialType) ?? 'image') as MaterialType,
            mediaUrl: model.upstream?.url,
          });
        } else {
          onPickSlot(pickRequest(spec));
        }
      } else {
        onPickSlot(pickRequest(spec));
      }
    };

    return (
      <div
        key={`${spec.slot}:${occupant?.edgeId ?? `empty-${index}`}`}
        className={className}
        role="button"
        tabIndex={0}
        data-slot={spec.slot}
        data-slot-role={spec.role}
        data-slot-edge={occupant?.edgeId}
        data-slot-state={model.state ?? (occupant ? (conflicted ? 'conflict' : 'filled') : 'empty')}
        aria-label={occupant ? (model.upstream?.label ?? label) : t('panel.slotPick').replace('{slot}', label)}
        onMouseEnter={(event) => { if (occupant) setHover({ anchor: event.currentTarget, model }); }}
        onFocus={(event) => { if (suppressFocus.current === event.currentTarget) return;
          if (occupant && event.target === event.currentTarget) setHover({ anchor: event.currentTarget, model }); }}
        onClick={event => handleWellClick(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            handleWellClick(event.currentTarget);
          }
        }}
      >
        <WellThumb model={model} />
        {hover?.anchor.dataset.slot === spec.slot && hover.model.occupant?.edgeId === occupant?.edgeId && occupant ? (
          <SlotHoverPreview anchor={hover.anchor} upstream={model.upstream} state={model.state} reasonCode={model.reasonCode}
            onReturnFocus={returnPreviewFocus} onReplace={() => onPickSlot({ ...pickRequest(spec), replaceEdgeId: occupant.edgeId, openerAnchor: hover.anchor, onReturnFocus: returnPreviewFocus })}
            use={model.state === 'inactive' ? 'inactive' : 'active'} onSetUse={props.onSetUse ? use => props.onSetUse!(spec.slot, occupant.edgeId, use) : undefined} onClose={closeHover} />
        ) : null}
        {model.state && model.state !== 'ready' ? <span className="wf-slot-well__state">{t(model.state === 'inactive' ? 'input.state.inactive' : model.reasonCode === 'input_unavailable' ? 'input.state.unavailable' : model.state === 'pending' ? 'input.state.pending' : 'input.state.invalid')}</span> : null}
        {occupant && !props.records ? (
          <button
            type="button"
            className="wf-slot-well__clear nodrag"
            aria-label={t('panel.slotClear')}
            onClick={(event) => {
              event.stopPropagation();
              onClearOccupant(spec.slot, occupant.edgeId);
            }}
          >
            <X size={10} />
          </button>
        ) : null}
      </div>
    );
  };

  if (props.records) {
    if (layout.preset === 'named') {
      const recordsBySlot = new Map<string, typeof props.records>();
      for (const record of props.records) {
        const list = recordsBySlot.get(record.slot.slot) ?? [];
        list.push(record);
        recordsBySlot.set(record.slot.slot, list);
      }
      return (
        <div className="wf-slot-wells wf-slot-wells--named" data-testid="wf-slot-wells" data-preset="named">
          {layout.slots.flatMap((spec) => {
            const slotRecords = recordsBySlot.get(spec.slot) ?? [];
            const models: WellModel[] = slotRecords.map((record) => ({
              spec: record.slot,
              occupant: record.occupant,
              upstream: upstreamByEdge.get(record.occupant.edgeId),
              requiredEmpty: false,
              state: record.state,
              reasonCode: record.reasonCode,
            }));
            // Same rule: at most one empty well per slot definition.
            const needed = Math.min(1, Math.max((spec.min ?? 1) - models.length, models.length < (spec.max ?? 1) ? 1 : 0));
            const emptyWells = [];
            for (let i = 0; i < needed; i++) {
              emptyWells.push(
                <button
                  key={`${spec.slot}:empty-${i}`}
                  type="button"
                  className={`wf-slot-well wf-slot-well--empty nodrag${models.length < (spec.min ?? 0) ? ' wf-slot-well--required' : ''}`}
                  data-slot={spec.slot}
                  data-slot-role={spec.role}
                  aria-label={t('panel.slotPick').replace('{slot}', slotLabel(spec))}
                  title={t('panel.slotPick').replace('{slot}', slotLabel(spec))}
                  onClick={() => onPickSlot(pickRequest(spec))}
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              );
            }
            return [...models.map(renderWell), ...emptyWells];
          })}
        </div>
      );
    }

    if (layout.preset === 'pair' && layout.slots.length === 2) {
      const [first, last] = layout.slots as [SlotSpec, SlotSpec];
      const recordsFirst = props.records.filter((r) => r.slot.slot === first.slot);
      const recordsLast = props.records.filter((r) => r.slot.slot === last.slot);
      const modelsFirst: WellModel[] = recordsFirst.map((record) => ({
        spec: record.slot,
        occupant: record.occupant,
        upstream: upstreamByEdge.get(record.occupant.edgeId),
        requiredEmpty: false,
        state: record.state,
        reasonCode: record.reasonCode,
      }));
      const modelsLast: WellModel[] = recordsLast.map((record) => ({
        spec: record.slot,
        occupant: record.occupant,
        upstream: upstreamByEdge.get(record.occupant.edgeId),
        requiredEmpty: false,
        state: record.state,
        reasonCode: record.reasonCode,
      }));
      return (
        <div className="wf-slot-wells wf-slot-wells--pair" data-testid="wf-slot-wells" data-preset="pair">
          {modelsFirst.length ? modelsFirst.map(renderWell) : (
            <button
              type="button"
              className="wf-slot-well wf-slot-well--empty nodrag"
              data-slot={first.slot}
              data-slot-role={first.role}
              aria-label={t('input.first')}
              title={t('input.first')}
              onClick={() => onPickSlot(pickRequest(first))}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="wf-slot-wells__swap nodrag"
            title={t('panel.slotSwap')}
            aria-label={t('panel.slotSwap')}
            disabled={!layout.swap}
            onClick={(event) => {
              event.stopPropagation();
              onSwapSlots?.(first.slot, last.slot);
            }}
          >
            <ArrowLeftRight size={14} />
          </button>
          {modelsLast.length ? modelsLast.map(renderWell) : (
            <button
              type="button"
              className="wf-slot-well wf-slot-well--empty nodrag"
              data-slot={last.slot}
              data-slot-role={last.role}
              aria-label={t('input.last')}
              title={t('input.last')}
              onClick={() => onPickSlot(pickRequest(last))}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      );
    }

    const models: WellModel[] = props.records.map(record => ({ spec: record.slot, occupant: record.occupant,
      upstream: upstreamByEdge.get(record.occupant.edgeId), requiredEmpty: false, state: record.state, reasonCode: record.reasonCode }));
    // 同一槽位定义至多 1 个空卡：具名帧空卡覆盖各自定义；追加按钮只覆盖其余未满定义，
    // 且不与已渲染的具名空卡重复。组合正文槽（composition）允许多来源，始终可追加。
    const frameDefs = new Set(
      layout.slots.filter(spec => spec.role === 'first_frame' || spec.role === 'last_frame').map(spec => spec.slot),
    );
    const unfilledDefs = layout.slots.filter(spec =>
      spec.type === 'text' && Boolean(spec.composition) || spec.max === null
      || props.records!.filter(record => record.slot.slot === spec.slot && record.state !== 'inactive').length < spec.max);
    const frames = layout.slots.filter(spec => spec.role === 'first_frame' || spec.role === 'last_frame');
    const canAdd = unfilledDefs.some(spec => !frameDefs.has(spec.slot));
    return <div className="wf-slot-wells wf-slot-wells--strip" data-testid="wf-slot-wells" data-preset={layout.preset}>
      {models.map(renderWell)}
      {frames.filter(spec => !models.some(model => model.spec.slot === spec.slot)).map(spec => <button key={spec.slot} type="button"
        className="wf-slot-well wf-slot-well--empty nodrag" data-slot={spec.slot} data-slot-role={spec.role}
        aria-label={t(spec.role === 'first_frame' ? 'input.first' : 'input.last')}
        onClick={() => onPickSlot(pickRequest(spec))}><Plus size={20} aria-hidden="true" /></button>)}
      {canAdd ? <button type="button" className="wf-slot-well wf-slot-well--append nodrag" title={t('input.add')} aria-label={t('input.add')}
        onClick={() => onPickSlot({ acceptedTypes: [...new Set(layout.slots.map(spec => spec.type))], max: null })}><Plus size={20} aria-hidden="true" /></button> : null}
    </div>;
  }

  if (layout.preset === 'pair' && layout.slots.length === 2) {
    const [first, last] = layout.slots as [SlotSpec, SlotSpec];
    return (
      <div className="wf-slot-wells wf-slot-wells--pair" data-testid="wf-slot-wells" data-preset="pair">
        {buildWellModels(first, props, upstreamByEdge).map(renderWell)}
        <button
          type="button"
          className="wf-slot-wells__swap nodrag"
          title={t('panel.slotSwap')}
          aria-label={t('panel.slotSwap')}
          disabled={!layout.swap}
          onClick={(event) => {
            event.stopPropagation();
            onSwapSlots?.(first.slot, last.slot);
          }}
        >
          <ArrowLeftRight size={14} />
        </button>
        {buildWellModels(last, props, upstreamByEdge).map(renderWell)}
      </div>
    );
  }

  if (layout.preset === 'strip') {
    const wells = layout.slots.flatMap((spec) => buildWellModels(spec, props, upstreamByEdge)
      .filter((model) => model.occupant || model.requiredEmpty));
    const filled = layout.slots.reduce(
      (total, spec) => total + (props.bindings[spec.slot]?.length ?? 0),
      0,
    );
    // The append well exists only for a definition that is bound at least to its
    // minimum and still has capacity; unbound definitions already show their own
    // required-empty well, so the append button never duplicates a slot's empty card.
    const addSpec = layout.slots.find((spec) => {
      const bound = props.bindings[spec.slot]?.length ?? 0;
      return bound >= (spec.min ?? 0) && (spec.max === null || bound < spec.max);
    });
    const showAdd = layout.addButton && addSpec
      && (addSpec.max === null || filled < layout.slots.reduce((total, spec) => total + (spec.max ?? Number.MAX_SAFE_INTEGER), 0));
    return (
      <div className="wf-slot-wells wf-slot-wells--strip" data-testid="wf-slot-wells" data-preset="strip">
        {wells.map(renderWell)}
        {showAdd ? (
          <button
            type="button"
            className="wf-slot-well wf-slot-well--append nodrag"
            data-slot={addSpec.slot}
            title={t('panel.slotPick').replace('{slot}', slotLabel(addSpec))}
            aria-label={t('panel.slotPick').replace('{slot}', slotLabel(addSpec))}
            onClick={() => onPickSlot(pickRequest(addSpec))}
          >
            <Plus size={20} />
          </button>
        ) : null}
      </div>
    );
  }

  // named：各具名卡槽并列（数字人角色图 / 驱动音频等）。
  return (
    <div className="wf-slot-wells wf-slot-wells--named" data-testid="wf-slot-wells" data-preset="named">
      {layout.slots.flatMap((spec) => buildWellModels(spec, props, upstreamByEdge).map((model, index) => renderWell(model, index)))}
    </div>
  );
};

export default memo(SlotWells);
