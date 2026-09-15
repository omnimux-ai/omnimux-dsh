/**
 * W3 测试（计划 §8）：释放菜单三分支 / 选项集派生 / disconnect→mutation plan。
 * 纯逻辑 node:test（无 React 渲染）。
 * Issue #466 B1：拒绝提示链必须携带 catalogRuntime，避免误报 catalog_unavailable。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConnectionEndOutcome } from './useConnectionMenu.logic.ts';
import {
  encodeOutputOptionKey,
  parseOutputOptionKey,
  getOutputOptionSpecs,
} from '../utils/connectionMenuOptions.ts';
import { planCanvasInputMutation } from '../utils/canvasInputMutationGateway.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, 'useConnectionMenu.ts'), 'utf8');

test('B1：invalid connection 拒绝提示链 validateConnectionDetailed 携带 catalogRuntime', () => {
  // 源码契约：onConnectEnd 二次校验必须注入 store catalog，与 CanvasEditor 硬闸一致。
  // 旧代码只传 connection/nodes/edges 三参，会把 mime_unsupported 等误报为 catalog_unavailable。
  assert.match(
    hookSrc,
    /validateConnectionDetailed\(\s*\{\s*source:\s*fromId,\s*target:\s*toId,[\s\S]*?\},\s*state\.nodes,\s*state\.edges,\s*state\.catalogRuntime\s*,?\s*\)/,
  );
  assert.doesNotMatch(
    hookSrc,
    /validateConnectionDetailed\(\s*\{\s*source:\s*fromId,\s*target:\s*toId,[\s\S]*?\},\s*state\.nodes,\s*state\.edges\s*\)/,
  );
});

// ==================== 释放菜单三分支 ====================

test('分支1：isValid → connected（正常连线，不弹菜单不提示）', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: true,
    fromNodeId: 'a',
    toNodeId: 'b',
    startedFromSource: true,
    hasOptions: true,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'connected' });
});

test('分支2：落在已有节点上但被拒 → reject（保留拒绝提示，坑#7）', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: 'a',
    toNodeId: 'b',
    startedFromSource: true,
    hasOptions: true,
    rejectReason: '这条连线会形成循环依赖',
  });
  assert.deepEqual(outcome, { type: 'reject', reason: '这条连线会形成循环依赖' });
});

test('分支2：落在已有节点上但无拒绝原因 → noop（不弹菜单）', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: 'a',
    toNodeId: 'b',
    startedFromSource: true,
    hasOptions: true,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'noop' });
});

test('分支3：空白释放 + source 拖出 + 有选项 → menu', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: 'a',
    toNodeId: null,
    startedFromSource: true,
    hasOptions: true,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'menu' });
});

test('分支3 边界：空白释放但从 target 把手拖出 → noop', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: 'a',
    toNodeId: null,
    startedFromSource: false,
    hasOptions: true,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'noop' });
});

test('分支3 边界：空白释放但无可用选项 → noop', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: 'a',
    toNodeId: null,
    startedFromSource: true,
    hasOptions: false,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'noop' });
});

test('分支边界：无 fromNode → noop', () => {
  const outcome = resolveConnectionEndOutcome({
    isValid: false,
    fromNodeId: null,
    toNodeId: null,
    startedFromSource: false,
    hasOptions: false,
    rejectReason: null,
  });
  assert.deepEqual(outcome, { type: 'noop' });
});

// ==================== 选项集派生 ====================

test('key 编码/解码往返（tool 含多个 dash）', () => {
  const key = encodeOutputOptionKey('image', 'text-to-image');
  assert.equal(key, 'image-text-to-image');
  assert.deepEqual(parseOutputOptionKey(key), {
    targetMaterialType: 'image',
    targetTool: 'text-to-image',
  });
});

test('key 解码：非法 key 返回 null', () => {
  assert.equal(parseOutputOptionKey(''), null);
  assert.equal(parseOutputOptionKey('-lead'), null);
  assert.equal(parseOutputOptionKey('trail-'), null);
  assert.equal(parseOutputOptionKey('nodash'), null);
});

test('选项集派生：四类源节点选项数量与矩阵一致', () => {
  assert.equal(getOutputOptionSpecs('text').length, 4);
  assert.equal(getOutputOptionSpecs('image').length, 3);
  assert.equal(getOutputOptionSpecs('video').length, 2);
  assert.equal(getOutputOptionSpecs('audio').length, 4);
});

test('选项集派生：每项 key 可解码回 target，i18n key 含源类型前缀', () => {
  for (const sourceType of ['text', 'image', 'video', 'audio']) {
    const specs = getOutputOptionSpecs(sourceType);
    assert.ok(specs.length > 0, `${sourceType} 应有输出选项`);
    for (const spec of specs) {
      const parsed = parseOutputOptionKey(spec.key);
      assert.ok(parsed, `${spec.key} 应可解码`);
      assert.equal(parsed.targetMaterialType, spec.targetMaterialType);
      assert.equal(parsed.targetTool, spec.targetTool);
      assert.ok(spec.labelKey.startsWith(`menu.option.${sourceType}.`));
      assert.ok(spec.descKey.endsWith('.desc'));
      assert.ok(spec.icon, '选项应带 icon');
    }
  }
});

test('选项集派生：菜单内 key 唯一', () => {
  for (const sourceType of ['text', 'image', 'video', 'audio']) {
    const keys = getOutputOptionSpecs(sourceType).map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${sourceType} 菜单 key 应唯一`);
  }
});

// ==================== disconnect → mutation plan ====================

const NODE_A = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text' } };
const NODE_B = { id: 'b', type: 'material', position: { x: 400, y: 0 }, data: { materialType: 'image' } };
const EDGE_AB = { id: 'e-a-b', source: 'a', target: 'b', type: 'animated' };

test('disconnect：removeEdgeIds 经 mutation gateway 删边，节点保留', () => {
  const plan = planCanvasInputMutation(
    { nodes: [NODE_A, NODE_B], edges: [EDGE_AB] },
    { removeEdgeIds: ['e-a-b'] },
  );
  assert.equal(plan.status, 'allowed');
  assert.equal(plan.edges.length, 0);
  assert.equal(plan.nodes.length, 2);
});

test('disconnect：删除不存在的边是 no-op（status 仍 allowed，图不变）', () => {
  const plan = planCanvasInputMutation(
    { nodes: [NODE_A, NODE_B], edges: [EDGE_AB] },
    { removeEdgeIds: ['e-nonexistent'] },
  );
  assert.equal(plan.status, 'allowed');
  assert.equal(plan.edges.length, 1);
});

test('mutation plan：addNodes + addEdges 建下游节点并连线（释放菜单选中路径）', () => {
  const newNode = {
    id: 'c',
    type: 'material',
    position: { x: 800, y: 0 },
    data: { materialType: 'image', selectedTool: 'text-to-image' },
  };
  const plan = planCanvasInputMutation(
    { nodes: [NODE_A], edges: [] },
    {
      addNodes: [newNode],
      addEdges: [{ source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in' }],
    },
  );
  assert.equal(plan.status, 'allowed');
  assert.equal(plan.nodes.length, 2);
  assert.equal(plan.edges.length, 1);
  assert.equal(plan.edges[0].source, 'a');
  assert.equal(plan.edges[0].target, 'c');
  // 归一化：继承默认边配置（type animated）
  assert.equal(plan.edges[0].type, 'animated');
});
