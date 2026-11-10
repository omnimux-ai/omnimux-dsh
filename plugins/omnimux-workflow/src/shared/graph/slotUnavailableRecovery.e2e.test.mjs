/**
 * 端到端(集成)回归 · Issue #4032
 *
 * 走「画布重算内核 → 展示/提交同源读取」完整链路：V1 生成节点在某上游节点/边被删除后，
 * `slotBindings` 残留的未固定(pinned=false)占位者必须被清理，展示侧不得再出现填充态/
 * input_unavailable 记录；用户拍板(pinned=true)的失效占位者保留为可停用的无效意图。
 * 用真实内核与真实读取函数，不 mock 业务逻辑。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recomputeCanvasSlots } from './canvasSlotRecompute.ts';
import { deriveSlotLayout, selectSlotOccupants } from './feedSlot/index.ts';
import { effectiveInputDisplay } from './feedSlot/effectiveInputDisplay.ts';

function catalog() {
  return {
    source: 'omnimux',
    models: [{
      id: 'gpt-image-2.5', label: 'GPT Image 2.5',
      operations: [{
        id: 'multi_reference', label: '垫图参考', listed: true, output: { type: 'image' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
          { slot: 'reference_image', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1 },
        ],
      }],
    }],
    text: [], image: [], audio: [], video: [],
    defaults: { image: 'gpt-image-2.5' },
    defaultsByOperation: {},
    defaultOperations: { image: { modelId: 'gpt-image-2.5', operationId: 'multi_reference', rule: 'auto' } },
  };
}

function target(slotBindings) {
  return {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'image', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1,
      prompt: '把参考图里的主体换成金属质感',
      params: { model: 'gpt-image-2.5', operation: 'multi_reference' }, slotBindings,
    },
  };
}

/** 展示/提交同源读取：只喂「画布当前真实存在的边」构成的 feed。 */
function readGraph(node) {
  const feed = [];
  const layout = deriveSlotLayout(catalog(), 'gpt-image-2.5', 'multi_reference');
  const display = effectiveInputDisplay(layout, feed, node.data.slotBindings, node.data.slotConflicts ?? [], [], [], 1);
  const selected = selectSlotOccupants(layout, display.bindings, feed, display.conflicts);
  return { layout, display, selected };
}

test('#4032 e2e：上游被删除后，残留未固定绑定在重算中被清理，展示侧无填充态/input_unavailable', () => {
  const revoked = target({ reference_image: [{ sourceNodeId: 'gone', edgeId: 'e-dead', outputId: 'x', pinned: false }] });
  const node = recomputeCanvasSlots(revoked, { nodes: [revoked], edges: [] }, { catalog: catalog() });

  const { display, selected } = readGraph(node);
  assert.equal((node.data.slotBindings?.reference_image ?? []).length, 0, '僵尸绑定应被清理');
  assert.equal(display.records.find((r) => r.slot.slot === 'reference_image'), undefined, '展示侧不得再出现该参考图填充态');
  assert.deepEqual(selected, [], '提交侧不得消费已删除的上游');
  assert.ok(!(node.data.compat?.reasonCodes ?? []).includes('input_unavailable'), '不得再因残留绑定报 input_unavailable');
});

test('#4032 e2e：pinned 用户选择在供给失效时保留为可停用的无效意图', () => {
  const kept = target({ reference_image: [{ sourceNodeId: 'gone', edgeId: 'e-dead', outputId: 'x', pinned: true }] });
  const node = recomputeCanvasSlots(kept, { nodes: [kept], edges: [] }, { catalog: catalog() });
  assert.equal((node.data.slotBindings?.reference_image ?? []).length, 1, 'pinned 用户选择不得被静默清理');
  assert.equal(node.data.slotBindings.reference_image[0].edgeId, 'e-dead');
});
