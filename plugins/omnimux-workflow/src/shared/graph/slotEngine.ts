/**
 * Slot Engine — 动态卡槽引擎与溢出状态机纯函数核心 (Issue #714).
 *
 * 核心能力：
 * 1. calculateSlotCapacity: 根据模型与 operation 解析动态槽位容量配额；
 * 2. reconcileNodeSlotState: 协调上游连入素材，计算前 N 个有效槽位与溢出候选池；
 * 3. promoteOverflowAsset: 置换/提拔溢出池中的素材至指定激活槽位；
 * 4. demoteSlotAsset: 解绑槽位素材进入溢出池，并自动晋升候选池第一项补齐。
 */

import type { Node, Edge } from '@xyflow/react';
import type { MaterialType } from '../canvasTypes.ts';
import type { CapabilityCatalog } from '../api.ts';
import {
  buildContractView,
  resolveModelView,
} from '../validation/compatKernel.ts';
import { resolveModelInputCapability } from '../validation/modelCompatibilityEvaluator.ts';
import type {
  SlotBindingItem,
  OverflowAssetItem,
  NodeSlotEngineState,
} from './slotContractTypes.ts';

export type CanvasNode = Node<Record<string, unknown>>;

/**
 * 计算节点对应模型与 operation 的槽位容量。
 *
 * 规则：
 * 1. 查找 catalog 中对应模型和 operation。
 * 2. 若 operation 明确为纯文生图或无该模态输入，返回配额 0。
 * 3. 若 operation 支持该模态输入（如 reference 图像），取其 inputs[slot].max。
 * 4. 若未显式定义上限，兜底合理数字（如 10）。
 * 5. 若无 catalog 或未知模型，兜底合理数字 10。
 */
export function calculateSlotCapacity(
  modelId: string | undefined,
  operationId: string | undefined,
  catalog?: CapabilityCatalog | null,
  materialType?: MaterialType,
): number {
  const targetType = materialType ?? 'image';
  if (!modelId || !catalog) {
    return 10;
  }

  const view = buildContractView(catalog);
  const model = resolveModelView(view, modelId.trim());
  if (!model) {
    return 10;
  }

  // 1. 若指定了 operationId，优先按该 operation 严格计算
  if (operationId) {
    const op = model.operations.find((candidate) => candidate.id === operationId);
    if (op) {
      const matchingInputs = (op.inputs ?? []).filter((input) => {
        if (input.source === 'node_field') return false;
        return input.type === targetType;
      });

      if (matchingInputs.length === 0) {
        // 明确不支持该模态（如纯文生图 operation），配额为 0
        return 0;
      }

      let maxAllowed: number | undefined;
      for (const input of matchingInputs) {
        if (typeof input.max === 'number' && input.max >= 0) {
          maxAllowed = maxAllowed !== undefined ? Math.max(maxAllowed, input.max) : input.max;
        }
      }

      if (maxAllowed !== undefined) {
        return maxAllowed;
      }
      return 10;
    }
  }

  // 2. 若未指定 operationId 或未在 operation 中找到，尝试从模型的整体 inputCapability 提取
  const cap = resolveModelInputCapability(modelId, catalog);
  if (cap) {
    if (targetType === 'image') {
      if (typeof cap.referenceImages?.max === 'number') {
        return cap.referenceImages.max;
      }
      if (cap.referenceImages && cap.referenceImages.max === 0) {
        return 0;
      }
    } else if (targetType === 'video') {
      if (typeof cap.referenceVideos?.max === 'number') {
        return cap.referenceVideos.max;
      }
      if (cap.referenceVideos && cap.referenceVideos.max === 0) {
        return 0;
      }
    } else if (targetType === 'audio') {
      if (typeof cap.referenceAudios?.max === 'number') {
        return cap.referenceAudios.max;
      }
      if (cap.referenceAudios && cap.referenceAudios.max === 0) {
        return 0;
      }
    }
  }

  // 3. 检查模型中是否有任何 operation 支持该模态
  const anyOpSupports = model.operations.some((op) =>
    (op.inputs ?? []).some((inp) => inp.source !== 'node_field' && inp.type === targetType),
  );
  if (model.operations.length > 0 && !anyOpSupports) {
    return 0;
  }

  return 10;
}

/**
 * 协调节点的动态卡槽状态。
 *
 * 1. 收集所有连入该节点的上游合法素材。
 * 2. 计算当前模型/operation 容量 N = capacity。
 * 3. 前 N 个素材进入 activeSlots（分配 slotIndex: 0..N-1）。
 * 4. 第 N 个以后的素材进入 overflowPool（记录 addedAt）。
 * 5. 返回最新的 NodeSlotEngineState。
 */
export function reconcileNodeSlotState(args: {
  currentNode: CanvasNode;
  incomingEdges: Edge[];
  allNodes: CanvasNode[];
  catalog?: CapabilityCatalog | null;
}): NodeSlotEngineState {
  const { currentNode, incomingEdges, allNodes, catalog } = args;

  const currentData = (currentNode.data ?? {}) as Record<string, unknown>;
  const params = (currentData.params ?? {}) as Record<string, unknown>;
  const modelId = typeof params.model === 'string' ? params.model.trim() : '';
  const operationId = typeof params.operation === 'string' ? params.operation.trim() : '';
  const nodeMaterialType = (currentData.materialType as MaterialType) ?? 'image';

  // 计算容量
  const capacity = calculateSlotCapacity(modelId, operationId, catalog, 'image');

  // 收集所有连入的上游合法素材
  interface RawCollectedAsset {
    sourceNodeId: string;
    edgeId?: string;
    materialType: MaterialType;
    mediaUrl?: string;
    label: string;
    mimeType?: string;
  }

  const collected: RawCollectedAsset[] = [];
  const visitedEdgeIds = new Set<string>();

  for (const edge of incomingEdges) {
    if (edge.target !== currentNode.id) continue;
    if (visitedEdgeIds.has(edge.id)) continue;
    visitedEdgeIds.add(edge.id);

    const sourceNode = allNodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;

    const sourceData = (sourceNode.data ?? {}) as Record<string, unknown>;
    const srcType = (sourceData.materialType as MaterialType) ?? 'image';

    // 提取直观素材信息
    const mediaUrl =
      (typeof sourceData.mediaUrl === 'string' && sourceData.mediaUrl) ||
      (typeof sourceData.url === 'string' && sourceData.url) ||
      undefined;

    const label =
      (typeof sourceData.label === 'string' && sourceData.label) ||
      sourceNode.id;

    const mimeType =
      typeof sourceData.mimeType === 'string' ? sourceData.mimeType : undefined;

    collected.push({
      sourceNodeId: sourceNode.id,
      edgeId: edge.id,
      materialType: srcType,
      mediaUrl,
      label,
      mimeType,
    });
  }

  // 读取已有的 slotState（若存在则尽可能保持活跃位置和锁定状态）
  const previousState = currentData.slotState as NodeSlotEngineState | undefined;
  const prevActive = previousState?.activeSlots ?? [];
  const prevOverflow = previousState?.overflowPool ?? [];

  const activeSlots: SlotBindingItem[] = [];
  const overflowPool: OverflowAssetItem[] = [];

  const now = Date.now();
  const assignedSourceNodeIds = new Set<string>();

  // 若 capacity > 0，先尽量复用之前已经在 activeSlots 且依然连入的项目
  if (capacity > 0 && prevActive.length > 0) {
    for (const prevItem of prevActive) {
      if (activeSlots.length >= capacity) break;
      const matched = collected.find(
        (c) => c.sourceNodeId === prevItem.sourceNodeId && !assignedSourceNodeIds.has(c.sourceNodeId),
      );
      if (matched) {
        assignedSourceNodeIds.add(matched.sourceNodeId);
        activeSlots.push({
          slotId: `slot_${activeSlots.length}`,
          slotIndex: activeSlots.length,
          sourceNodeId: matched.sourceNodeId,
          edgeId: matched.edgeId,
          materialType: matched.materialType,
          mediaUrl: matched.mediaUrl,
          label: matched.label,
          mimeType: matched.mimeType,
          isLocked: prevItem.isLocked,
        });
      }
    }
  }

  // 将未被分配的连入素材继续按顺序填充到 activeSlots
  for (const item of collected) {
    if (assignedSourceNodeIds.has(item.sourceNodeId)) continue;
    if (activeSlots.length < capacity) {
      assignedSourceNodeIds.add(item.sourceNodeId);
      activeSlots.push({
        slotId: `slot_${activeSlots.length}`,
        slotIndex: activeSlots.length,
        sourceNodeId: item.sourceNodeId,
        edgeId: item.edgeId,
        materialType: item.materialType,
        mediaUrl: item.mediaUrl,
        label: item.label,
        mimeType: item.mimeType,
      });
    } else {
      // 超过 capacity 的进入溢出候选池
      assignedSourceNodeIds.add(item.sourceNodeId);
      const prevRecorded = prevOverflow.find((p) => p.sourceNodeId === item.sourceNodeId);
      overflowPool.push({
        sourceNodeId: item.sourceNodeId,
        edgeId: item.edgeId,
        materialType: item.materialType,
        mediaUrl: item.mediaUrl,
        label: item.label,
        mimeType: item.mimeType,
        addedAt: prevRecorded?.addedAt ?? now,
      });
    }
  }

  return {
    modelId,
    operationId,
    capacity,
    activeSlots,
    overflowPool,
  };
}

/**
 * 提拔溢出池中的素材到指定槽位，原槽位素材退入溢出池（置换 Swap）。
 */
export function promoteOverflowAsset(
  state: NodeSlotEngineState,
  sourceNodeId: string,
  targetSlotIndex: number,
): NodeSlotEngineState {
  const overflowIndex = state.overflowPool.findIndex((item) => item.sourceNodeId === sourceNodeId);
  if (overflowIndex === -1) {
    return state;
  }

  const candidate = state.overflowPool[overflowIndex]!;
  const nextOverflowPool = state.overflowPool.filter((_, idx) => idx !== overflowIndex);
  const nextActiveSlots = [...state.activeSlots];

  const currentSlotIndex = nextActiveSlots.findIndex((item) => item.slotIndex === targetSlotIndex);
  const currentSlotItem = currentSlotIndex !== -1 ? nextActiveSlots[currentSlotIndex] : undefined;

  // 如果原槽位有素材，将其退入溢出池（置换）
  if (currentSlotItem) {
    nextOverflowPool.push({
      sourceNodeId: currentSlotItem.sourceNodeId,
      edgeId: currentSlotItem.edgeId,
      materialType: currentSlotItem.materialType,
      mediaUrl: currentSlotItem.mediaUrl,
      label: currentSlotItem.label,
      mimeType: currentSlotItem.mimeType,
      addedAt: Date.now(),
    });
  }

  // 构造提拔项
  const promotedItem: SlotBindingItem = {
    slotId: `slot_${targetSlotIndex}`,
    slotIndex: targetSlotIndex,
    sourceNodeId: candidate.sourceNodeId,
    edgeId: candidate.edgeId,
    materialType: candidate.materialType,
    mediaUrl: candidate.mediaUrl,
    label: candidate.label,
    mimeType: candidate.mimeType,
  };

  if (currentSlotIndex !== -1) {
    nextActiveSlots[currentSlotIndex] = promotedItem;
  } else {
    nextActiveSlots.push(promotedItem);
  }

  nextActiveSlots.sort((a, b) => a.slotIndex - b.slotIndex);

  return {
    ...state,
    activeSlots: nextActiveSlots,
    overflowPool: nextOverflowPool,
  };
}

/**
 * 手动解绑槽位素材（移入溢出池），若溢出池有可用素材则自动晋升第一项补齐。
 */
export function demoteSlotAsset(
  state: NodeSlotEngineState,
  slotIndex: number,
): NodeSlotEngineState {
  const targetIndex = state.activeSlots.findIndex((item) => item.slotIndex === slotIndex);
  if (targetIndex === -1) {
    return state;
  }

  const demotedItem = state.activeSlots[targetIndex]!;
  let nextActiveSlots = state.activeSlots.filter((_, idx) => idx !== targetIndex);
  const nextOverflowPool = [...state.overflowPool];

  // 移入溢出池
  nextOverflowPool.push({
    sourceNodeId: demotedItem.sourceNodeId,
    edgeId: demotedItem.edgeId,
    materialType: demotedItem.materialType,
    mediaUrl: demotedItem.mediaUrl,
    label: demotedItem.label,
    mimeType: demotedItem.mimeType,
    addedAt: Date.now(),
  });

  // 若溢出池有其他可用素材（在刚刚移入之前），自动晋升首项补齐
  if (state.overflowPool.length > 0) {
    const candidate = nextOverflowPool.shift()!;
    const promotedItem: SlotBindingItem = {
      slotId: `slot_${slotIndex}`,
      slotIndex,
      sourceNodeId: candidate.sourceNodeId,
      edgeId: candidate.edgeId,
      materialType: candidate.materialType,
      mediaUrl: candidate.mediaUrl,
      label: candidate.label,
      mimeType: candidate.mimeType,
    };
    nextActiveSlots.push(promotedItem);
  }

  // 重新对 activeSlots 排序并保持索引连续
  nextActiveSlots.sort((a, b) => a.slotIndex - b.slotIndex);
  nextActiveSlots = nextActiveSlots.map((item, idx) => ({
    ...item,
    slotIndex: idx,
    slotId: `slot_${idx}`,
  }));

  return {
    ...state,
    activeSlots: nextActiveSlots,
    overflowPool: nextOverflowPool,
  };
}
