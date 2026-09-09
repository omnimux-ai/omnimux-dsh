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

import React, { memo, useCallback, useState } from 'react';
import SlotHoverPreview from './SlotHoverPreview.tsx';
import { ArrowLeftRight, Image as ImageIcon, Loader2, Music, Play, Plus, X } from 'lucide-react';
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
}

function buildWellModels(spec: SlotSpec, props: SlotWellsProps, upstreamByEdge: Map<string, UpstreamMediaItem>): WellModel[] {
  const occupants = props.bindings[spec.slot] ?? [];
  const models: WellModel[] = occupants.map((occupant) => ({
    spec,
    occupant,
    upstream: upstreamByEdge.get(occupant.edgeId),
    requiredEmpty: false,
  }));
  const capacity = spec.max ?? occupants.length + 1;
  const target = Math.max(capacity, spec.min, occupants.length);
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
        alt={upstream.label}
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
  const closeHover = useCallback(() => setHover(null), []);
  const slotLabel = useSlotLabel();
  const upstreamByEdge = new Map(
    props.upstreams.filter((item) => item.edgeId).map((item) => [item.edgeId as string, item]),
  );
  const conflictedEdges = new Set((props.conflicts ?? []).map((conflict) => conflict.occupant.edgeId));

  if (layout.preset === 'none' || layout.slots.length === 0) return null;

  const pickRequest = (spec: SlotSpec): SlotPickRequest => ({
    targetSlot: spec.slot,
    acceptedTypes: [spec.type],
    max: spec.max,
  });

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

    const handleWellClick = () => {
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
        data-slot-state={occupant ? (conflicted ? 'conflict' : 'filled') : 'empty'}
        aria-label={occupant ? (model.upstream?.label ?? label) : t('panel.slotPick').replace('{slot}', label)}
        onMouseEnter={(event) => { if (occupant) setHover({ anchor: event.currentTarget, model }); }}
        onFocus={(event) => { if (occupant && event.target === event.currentTarget) setHover({ anchor: event.currentTarget, model }); }}
        onClick={handleWellClick}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            handleWellClick();
          }
        }}
      >
        <WellThumb model={model} />
        {hover?.anchor.dataset.slot === spec.slot && hover.model.occupant?.edgeId === occupant?.edgeId && occupant ? (
          <SlotHoverPreview anchor={hover.anchor} upstream={model.upstream} onReplace={() => onPickSlot({ ...pickRequest(spec), replaceEdgeId: occupant.edgeId })} onClose={closeHover} />
        ) : null}
        {occupant ? (
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
    const addSpec = layout.slots.find((spec) => spec.max === null)
      ?? layout.slots.find((spec) => (props.bindings[spec.slot]?.length ?? 0) < (spec.max ?? 0));
    const showAdd = layout.addButton && addSpec
      && (addSpec.max === null || filled < layout.slots.reduce((total, spec) => total + (spec.max ?? Number.MAX_SAFE_INTEGER), 0));
    return (
      <div className="wf-slot-wells wf-slot-wells--strip" data-testid="wf-slot-wells" data-preset="strip">
        {wells.map(renderWell)}
        {showAdd ? (
          <button
            type="button"
            className="wf-slot-well wf-slot-well--add nodrag"
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
