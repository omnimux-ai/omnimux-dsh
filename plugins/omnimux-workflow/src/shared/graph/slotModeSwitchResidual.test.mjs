/**
 * Issue #4048 阻断回归：跨模式残留槽位清理的三条安全边界
 * 1) catalog 不可用/未解析时不得把空 layout 当成「槽位已移除」清空绑定；
 * 2) 已保存 slotConflicts 不得把刚被清掉的未固定占位者回填；
 * 3) 裁剪后必须保留空槽键（不得落成 {}），避免展示侧 autoFill 与提交侧不一致。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recomputeCanvasSlots } from './canvasSlotRecompute.ts';
import { deriveSlotLayout, selectSlotOccupants } from './feedSlot/index.ts';
import { effectiveInputDisplay } from './feedSlot/effectiveInputDisplay.ts';

function imageCatalog() {
  return {
    source: 'omnimux',
    models: [{
      id: 'gpt-image-2.5', label: 'GPT Image 2.5',
      operations: [
        { id: 'text_to_image', label: '文生图', listed: true, output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }] },
        {
          id: 'multi_reference', label: '垫图参考', listed: true, output: { type: 'image' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
            { slot: 'reference_image', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1 },
          ],
        },
      ],
    }],
    text: [], image: [], audio: [], video: [],
    defaults: { image: 'gpt-image-2.5' }, defaultsByOperation: {},
    defaultOperations: { image: { modelId: 'gpt-image-2.5', operationId: 'multi_reference', rule: 'auto' } },
  };
}

function videoCatalog() {
  return {
    source: 'omnimux',
    models: [{
      id: 'wan-3.0', label: 'Wan 3.0',
      operations: [
        {
          id: 'first_frame', label: '首帧', listed: true, output: { type: 'video' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
            { slot: 'first_frame', type: 'image', role: 'first_frame', source: 'upstream_edge', min: 1, max: 1 },
          ],
        },
        {
          id: 'video_multi_ref', label: '多图参考', listed: true, output: { type: 'video' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
            { slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 10 },
          ],
        },
      ],
    }],
    text: [], image: [], audio: [], video: [],
    defaults: { video: 'wan-3.0' }, defaultsByOperation: {},
    defaultOperations: { video: { modelId: 'wan-3.0', operationId: 'video_multi_ref', rule: 'auto' } },
  };
}

const upstream = {
  id: 'upstream', type: 'material', position: { x: 0, y: 0 },
  data: { materialType: 'image', nodeKind: 'import', mediaAssets: [{ type: 'image', url: 'https://fixture.test/r.png', mimeType: 'image/png', sizeBytes: 2048 }] },
};

function node(extra = {}) {
  return {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'image', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1,
      prompt: 'p', params: { model: 'gpt-image-2.5', operation: 'multi_reference' }, ...extra,
    },
  };
}

const edge = { id: 'e-ref', source: 'upstream', target: 'target', targetHandle: 'in' };

test('#4048 阻断1：catalog 不可用（空 layout）不得清空未固定但存活的绑定', () => {
  const target = node({ slotBindings: { reference_image: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }] } });
  const result = recomputeCanvasSlots(target, { nodes: [upstream, target], edges: [edge] }, { catalog: null });
  assert.equal((result.data.slotBindings?.reference_image ?? []).length, 1, 'catalog 不可用时不得误清绑定');
});

test('#4048 阻断2：已保存 slotConflicts 不得把被清理的占位者回填', () => {
  const target = node({
    params: { model: 'gpt-image-2.5', operation: 'text_to_image' },
    slotBindings: { reference_image: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }] },
    slotConflicts: [{ slot: 'reference_image', occupant: { sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }, reason: 'slot_removed' }],
  });
  const result = recomputeCanvasSlots(target, { nodes: [upstream, target], edges: [edge] }, { catalog: imageCatalog() });
  assert.equal((result.data.slotBindings?.reference_image ?? []).length, 0, 'conflict 不得回填已清理占位者');
  assert.ok(!(result.data.compat?.reasonCodes ?? []).includes('role_conflict'));
});

test('#4048 阻断3：裁剪后保留空槽键，展示/提交不出现「显示已填、提交为空」', () => {
  const target = {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'video', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1, prompt: 'p',
      params: { model: 'wan-3.0', operation: 'video_multi_ref' },
      slotBindings: { first_frame: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }] },
    },
  };
  const result = recomputeCanvasSlots(target, { nodes: [upstream, target], edges: [edge] }, { catalog: videoCatalog() });
  assert.equal((result.data.slotBindings?.first_frame ?? []).length, 0, 'first_frame 槽不在 video_multi_ref，应清理');
  assert.ok(!Object.hasOwn(result.data.slotBindings ?? {}, 'first_frame'), 'first_frame 空槽键必须移除');

  // 裁剪致空后按未初始化自愈：同一条 live 边自动装填到新模式的 reference_images
  assert.equal((result.data.slotBindings?.reference_images ?? []).length, 1, '新槽位应自动装填');
  const layout = deriveSlotLayout(videoCatalog(), 'wan-3.0', 'video_multi_ref');
  const feed = [{ edgeId: 'e-ref', sourceNodeId: 'upstream', outputId: 'o', type: 'image', availability: 'ready', ordinal: 0, url: 'https://fixture.test/r.png' }];
  const display = effectiveInputDisplay(layout, feed, result.data.slotBindings, result.data.slotConflicts ?? [], [], [], 1);
  assert.equal(display.records.find((record) => record.slot.slot === 'reference_images')?.state, 'ready', '展示侧应为已填');
  const selected = selectSlotOccupants(layout, display.bindings, feed, display.conflicts, 1);
  assert.equal(selected.length, 1, '提交侧必须消费同一条');
  assert.equal(selected[0].occupant.edgeId, 'e-ref', '显示=提交一致');
});

test('#4048 阻断1b：无 feed 裁剪后保持未初始化，重新连线可在数据层自动装填', () => {
  const target = {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'video', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1, prompt: 'p',
      params: { model: 'wan-3.0', operation: 'video_multi_ref' },
      slotBindings: { first_frame: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }] },
    },
  };
  const first = recomputeCanvasSlots(target, { nodes: [target], edges: [] }, { catalog: videoCatalog() });
  assert.ok(!Object.hasOwn(first.data.slotBindings ?? {}, 'first_frame'), '旧槽位键必须移除');
  assert.equal((first.data.slotBindings?.reference_images ?? []).length, 0, '无 feed 时不得凭空装填');

  const second = recomputeCanvasSlots(first, { nodes: [upstream, first], edges: [edge] }, { catalog: videoCatalog() });
  assert.equal((second.data.slotBindings?.reference_images ?? []).length, 1, '重新连线后数据层应自动装填');
});

test('#4048 Q2：用户显式空数组清空不被自愈覆盖', () => {
  const target = {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'video', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1, prompt: 'p',
      params: { model: 'wan-3.0', operation: 'video_multi_ref' },
      slotBindings: {
        reference_images: [],
        first_frame: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned: false }],
      },
    },
  };
  const result = recomputeCanvasSlots(target, { nodes: [upstream, target], edges: [edge] }, { catalog: videoCatalog() });
  assert.deepEqual(result.data.slotBindings?.reference_images ?? [], [], '用户显式清空的空数组不得被 autoFill 覆盖');
  assert.ok(!Object.hasOwn(result.data.slotBindings ?? {}, 'first_frame'), '失效槽位键应移除');
});
