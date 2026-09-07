/**
 * Unit tests for SlotEngine (Issue #714 / T01 & T02).
 *
 * 覆盖：
 * 1. 容量计算 (calculateSlotCapacity)
 * 2. 超额素材的前 2 截断与后 3 溢出候选 (reconcileNodeSlotState)
 * 3. 置换 (Swap via promoteOverflowAsset) 与自动晋升 (Promote via demoteSlotAsset)
 * 4. 连线拖拽图片连图片不再被 connectionValidator 拒绝
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSlotCapacity,
  reconcileNodeSlotState,
  promoteOverflowAsset,
  demoteSlotAsset,
} from './slotEngine.ts';
import {
  validateConnection,
  validateConnectionDetailed,
} from './connectionValidator.ts';
import { createCompatTestCatalog } from '../../../shared/validation/compatTestCatalog.ts';

function createNode(id, type, materialType, extraData = {}) {
  return {
    id,
    type,
    data: {
      label: `Node ${id}`,
      materialType,
      ...extraData,
    },
  };
}

function createGenerateNode(id, materialType, model, operation, extraData = {}) {
  return createNode(id, 'material', materialType, {
    nodeKind: 'generate',
    params: {
      model,
      operation,
    },
    ...extraData,
  });
}

function createImportNode(id, materialType, extraData = {}) {
  return createNode(id, 'material', materialType, {
    nodeKind: 'import',
    mediaUrl: `https://example.com/${id}.png`,
    mimeType: 'image/png',
    ...extraData,
  });
}

// ============================================================================
// 1. 容量计算 (calculateSlotCapacity)
// ============================================================================

test('calculateSlotCapacity: 精确计算指定模型与 operation 的槽位容量', () => {
  const catalog = createCompatTestCatalog();

  // 1. img-ref 模型，image_to_image operation (max: 2)
  const capRef = calculateSlotCapacity('img-ref', 'image_to_image', catalog, 'image');
  assert.equal(capRef, 2, 'img-ref#image_to_image 应该支持 2 个参考图');

  // 2. img-prompt-only 模型 (纯文生图 operation，无图片输入) -> 容量为 0
  const capTextOnly = calculateSlotCapacity('img-prompt-only', 'text_to_image', catalog, 'image');
  assert.equal(capTextOnly, 0, '纯文生图 operation 容量应为 0');

  // 3. img-hd 模型 (max: 1)
  const capHd = calculateSlotCapacity('img-hd', 'image_to_image', catalog, 'image');
  assert.equal(capHd, 1, 'img-hd#image_to_image 容量应为 1');

  // 4. 未知模型或 catalog 为空时兜底合理数字 (10)
  const capFallback = calculateSlotCapacity('unknown-model', undefined, null, 'image');
  assert.equal(capFallback, 10, '无 catalog 兜底应为 10');
});

// ============================================================================
// 2. 超额素材的前 2 截断与后 3 溢出候选 (reconcileNodeSlotState)
// ============================================================================

test('reconcileNodeSlotState: 5 个素材连入容量为 2 的节点，前 2 激活截断，后 3 溢出候选', () => {
  const catalog = createCompatTestCatalog();
  const target = createGenerateNode('target', 'image', 'img-ref', 'image_to_image');
  const sources = Array.from({ length: 5 }, (_, i) =>
    createImportNode(`src_${i}`, 'image', { label: `素材 ${i + 1}` }),
  );

  const allNodes = [target, ...sources];
  const incomingEdges = sources.map((s, idx) => ({
    id: `e_${idx}`,
    source: s.id,
    target: 'target',
  }));

  const state = reconcileNodeSlotState({
    currentNode: target,
    incomingEdges,
    allNodes,
    catalog,
  });

  assert.equal(state.capacity, 2, '容量计算应为 2');
  assert.equal(state.activeSlots.length, 2, '前 2 个应进入 activeSlots');
  assert.equal(state.overflowPool.length, 3, '后 3 个应进入 overflowPool');

  // 验证 activeSlots 顺序与属性
  assert.equal(state.activeSlots[0].sourceNodeId, 'src_0');
  assert.equal(state.activeSlots[0].slotIndex, 0);
  assert.equal(state.activeSlots[0].slotId, 'slot_0');
  assert.equal(state.activeSlots[0].label, '素材 1');

  assert.equal(state.activeSlots[1].sourceNodeId, 'src_1');
  assert.equal(state.activeSlots[1].slotIndex, 1);
  assert.equal(state.activeSlots[1].slotId, 'slot_1');
  assert.equal(state.activeSlots[1].label, '素材 2');

  // 验证 overflowPool 包含后 3 项并记录 addedAt
  assert.equal(state.overflowPool[0].sourceNodeId, 'src_2');
  assert.equal(state.overflowPool[1].sourceNodeId, 'src_3');
  assert.equal(state.overflowPool[2].sourceNodeId, 'src_4');
  assert.ok(state.overflowPool[0].addedAt > 0, 'overflowPool 项必须记录 addedAt 时间戳');
});

// ============================================================================
// 3. 置换 (Swap) 与自动晋升 (Promote)
// ============================================================================

test('promoteOverflowAsset: 将溢出池中的素材提拔到指定槽位，原槽位素材退入溢出池 (Swap 置换)', () => {
  const catalog = createCompatTestCatalog();
  const target = createGenerateNode('target', 'image', 'img-ref', 'image_to_image');
  const sources = Array.from({ length: 3 }, (_, i) =>
    createImportNode(`src_${i}`, 'image', { label: `素材 ${i + 1}` }),
  );

  const allNodes = [target, ...sources];
  const incomingEdges = sources.map((s, idx) => ({
    id: `e_${idx}`,
    source: s.id,
    target: 'target',
  }));

  // 初始状态：容量 2，src_0, src_1 在 activeSlots；src_2 在 overflowPool
  const initialState = reconcileNodeSlotState({
    currentNode: target,
    incomingEdges,
    allNodes,
    catalog,
  });

  assert.equal(initialState.activeSlots[0].sourceNodeId, 'src_0');
  assert.equal(initialState.activeSlots[1].sourceNodeId, 'src_1');
  assert.equal(initialState.overflowPool[0].sourceNodeId, 'src_2');

  // 将 overflowPool 中的 src_2 提拔到 slot 0，原 slot 0 的 src_0 退入 overflowPool
  const swappedState = promoteOverflowAsset(initialState, 'src_2', 0);

  // 验证 slot 0 变为 src_2
  assert.equal(swappedState.activeSlots.length, 2);
  const slot0 = swappedState.activeSlots.find((s) => s.slotIndex === 0);
  assert.ok(slot0);
  assert.equal(slot0.sourceNodeId, 'src_2');

  // 验证 slot 1 仍为 src_1
  const slot1 = swappedState.activeSlots.find((s) => s.slotIndex === 1);
  assert.ok(slot1);
  assert.equal(slot1.sourceNodeId, 'src_1');

  // 验证 overflowPool 现在包含退下来的 src_0
  assert.equal(swappedState.overflowPool.length, 1);
  assert.equal(swappedState.overflowPool[0].sourceNodeId, 'src_0');
});

test('demoteSlotAsset: 解绑槽位素材退入溢出池，溢出池首项自动晋升补齐', () => {
  const catalog = createCompatTestCatalog();
  const target = createGenerateNode('target', 'image', 'img-ref', 'image_to_image');
  const sources = Array.from({ length: 3 }, (_, i) =>
    createImportNode(`src_${i}`, 'image', { label: `素材 ${i + 1}` }),
  );

  const allNodes = [target, ...sources];
  const incomingEdges = sources.map((s, idx) => ({
    id: `e_${idx}`,
    source: s.id,
    target: 'target',
  }));

  // 初始状态：activeSlots [src_0, src_1]，overflowPool [src_2]
  const initialState = reconcileNodeSlotState({
    currentNode: target,
    incomingEdges,
    allNodes,
    catalog,
  });

  // 解绑 slot 0 (src_0)：src_2 应该自动晋升补齐 slot 0，src_0 退入 overflowPool
  const nextState = demoteSlotAsset(initialState, 0);

  assert.equal(nextState.activeSlots.length, 2, '活跃卡槽数量应保持为 2 (自动补齐)');
  assert.equal(nextState.activeSlots[0].sourceNodeId, 'src_2', '原本在溢出池第一位的 src_2 自动晋升');
  assert.equal(nextState.activeSlots[1].sourceNodeId, 'src_1', '原 slot 1 保持');
  assert.equal(nextState.overflowPool.length, 1, '退下来的项进入溢出池');
  assert.equal(nextState.overflowPool[0].sourceNodeId, 'src_0');
});

// ============================================================================
// 4. 连线拖拽图片连图片不再被 connectionValidator 拒绝
// ============================================================================

test('连线校验解耦：从图片节点拉线到图片节点（即使槽位已满或纯文生图），连线永远 valid: true', () => {
  const catalog = createCompatTestCatalog();

  // 场景 A：下游节点为容量为 1 的模型，已经连了 1 张图（槽位满）
  const targetFull = createGenerateNode('target_full', 'image', 'img-hd', 'image_to_image');
  const img1 = createImportNode('img1', 'image');
  const img2 = createImportNode('img2', 'image');

  const nodesA = [targetFull, img1, img2];
  const edgesA = [{ id: 'e1', source: 'img1', target: 'target_full' }];

  // 拖拽接入第 2 张图
  const connectionA = { source: 'img2', target: 'target_full' };
  const detailA = validateConnectionDetailed(connectionA, nodesA, edgesA, catalog);

  assert.equal(detailA.valid, true, '槽位已满时连线不应被物理阻断，返回 valid: true');
  assert.equal(validateConnection(connectionA, nodesA, edgesA, catalog), true);

  // 场景 B：下游节点当前为纯文生图模型（容量为 0）
  const targetTextOnly = createGenerateNode('target_text', 'image', 'img-prompt-only', 'text_to_image');
  const img3 = createImportNode('img3', 'image');

  const nodesB = [targetTextOnly, img3];
  const connectionB = { source: 'img3', target: 'target_text' };
  const detailB = validateConnectionDetailed(connectionB, nodesB, [], catalog);

  assert.equal(detailB.valid, true, '纯文生图节点接收图片输入不应被物理阻断，返回 valid: true');
  assert.equal(validateConnection(connectionB, nodesB, [], catalog), true);
});
