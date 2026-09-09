/**
 * SlotWells 类型契约（Feed-Slot 阶段二 / T03）。
 *
 * 视图层只消费内核派生的 SlotLayout + slotBindings，
 * 装填/卸装填/对调全部通过 canvas mutation gateway 落回 node.data.slotBindings。
 */

import type { MaterialType } from '../../../../../../shared/canvasTypes.ts';
import type {
  SlotBindings,
  SlotConflict,
  SlotLayout,
} from '../../../../../../shared/graph/feedSlot/index.ts';
import type { UpstreamMediaItem } from '../../../../hooks/useUpstreamMedia.ts';

export type { SlotBindings, SlotConflict, SlotLayout };

/** 唤起 ResourcePicker 的目标卡槽请求。 */
export interface SlotPickRequest {
  /** 目标 slot 名（内核 SlotSpec.slot）。 */
  targetSlot: string;
  /** 该 slot 接受的素材类型（SlotSpec.type 展开）。 */
  acceptedTypes: string[];
  /** 槽位上限；null 表示官方未公布上限。 */
  max: number | null;
  /** Stable occupant identity for replacement; absent for an empty well. */
  replaceEdgeId?: string;
}

export interface SlotWellsProps {
  /** deriveSlotLayout 派生的布局预设与槽位定义。 */
  layout: SlotLayout;
  /** 节点当前 slotBindings（媒体消费真源）。 */
  bindings: SlotBindings;
  /** 冲突列表（类型错误 / 角色非法 / 槽位移除），用于卡片警示态。 */
  conflicts?: SlotConflict[];
  /** 当前入边供给快照（缩略图 / 可用性解析）。 */
  upstreams: UpstreamMediaItem[];
  /** 打开 ResourcePicker 装填指定 slot。 */
  onPickSlot: (request: SlotPickRequest) => void;
  /** pair 预设的首尾帧对调（保持边不变，仅交换槽位占用）。 */
  onSwapSlots?: (firstSlot: string, lastSlot: string) => void;
  /** 卸装填：仅摘除槽位占用，不断开供给边。 */
  onClearOccupant: (slot: string, edgeId: string) => void;
  /** 点击已装填卡槽本体插入 Token 到提示词输入框。 */
  onInsertToken?: (item: {
    sourceNodeId: string;
    slotIndex: number;
    label: string;
    materialType: MaterialType;
    mediaUrl?: string;
  }) => void;
}
