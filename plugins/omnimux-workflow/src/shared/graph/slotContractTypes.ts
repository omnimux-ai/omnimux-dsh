/**
 * Slot Contract Types — 动态卡槽与图拓扑契约扩展 (Issue #714).
 *
 * 定义动态卡槽引擎状态、卡槽绑定项、溢出池资产项、Prompt 引用 Token 以及编译执行载荷接口。
 */

import type { MaterialType } from '../canvasTypes.ts';

/** 单个活跃卡槽绑定项 */
export interface SlotBindingItem {
  slotId: string;
  slotIndex: number;
  sourceNodeId: string;
  edgeId?: string;
  materialType: MaterialType;
  mediaUrl?: string;
  label: string;
  mimeType?: string;
  isLocked?: boolean;
}

/** 溢出候选池资产项 */
export interface OverflowAssetItem {
  sourceNodeId: string;
  edgeId?: string;
  materialType: MaterialType;
  mediaUrl?: string;
  label: string;
  mimeType?: string;
  addedAt: number;
}

/** 节点动态卡槽引擎聚合状态 */
export interface NodeSlotEngineState {
  modelId: string;
  operationId: string;
  capacity: number;
  activeSlots: SlotBindingItem[];
  overflowPool: OverflowAssetItem[];
}

/** Prompt 引用 Token（例如 @slot_1 或 @素材名 引用解析） */
export interface PromptReferenceToken {
  raw: string;
  nodeId: string;
  slotIndex: number;
  label: string;
  materialType: MaterialType;
  mediaUrl?: string;
}

/** 编译后的执行载荷 */
export interface CompiledExecutionPayload {
  cleanedPrompt: string;
  interleavedParts?: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'video_url'; video_url: { url: string } }
    | { type: 'audio_url'; audio_url: { url: string } }
  >;
  resolvedReferences: Array<{
    slotIndex?: number;
    sourceNodeId?: string;
    mediaUrl?: string;
    pathOrUrl?: string;
    materialType?: MaterialType;
    type?: string;
    role?: string;
    label?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
}
