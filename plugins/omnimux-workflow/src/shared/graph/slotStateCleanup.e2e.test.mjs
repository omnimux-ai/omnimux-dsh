/**
 * 端到端(集成)回归 · Issue #4048
 *
 * 完整链路：切换生成方式后，当前 operation 的 layout 不存在的槽位绑定（未固定 pinned=false）
 * 必须被重算清理，并在展示/提交同源读取里不再产生记录；pinned=true 的旧槽位占用保留为可停用意图。
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
    defaults: { image: 'gpt-image-2.5' },
    defaultsByOperation: {},
    defaultOperations: { image: { modelId: 'gpt-image-2.5', operationId: 'multi_reference', rule: 'auto' } },
  };
}

const upstream = {
  id: 'upstream', type: 'material', position: { x: 0, y: 0 },
  data: { materialType: 'image', nodeKind: 'import', mediaAssets: [{ type: 'image', url: 'https://fixture.test/r.png', mimeType: 'image/png', sizeBytes: 2048 }] },
};
const edge = { id: 'e-ref', source: 'upstream', target: 'target', targetHandle: 'in' };

function target({ pinned, operation = 'text_to_image' }) {
  return {
    id: 'target', type: 'material', position: { x: 0, y: 0 },
    data: {
      materialType: 'image', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1,
      prompt: '一张产品图',
      params: { model: 'gpt-image-2.5', operation },
      slotBindings: { reference_image: [{ sourceNodeId: 'upstream', edgeId: 'e-ref', outputId: 'o', pinned }] },
    },
  };
}

test('#4048 e2e：切到 text_to_image 后，reference_image 残留绑定被清理且展示/提交无记录', () => {
  const node = target({ pinned: false });
  const result = recomputeCanvasSlots(node, { nodes: [upstream, node], edges: [edge] }, { catalog: catalog() });

  assert.equal((result.data.slotBindings?.reference_image ?? []).length, 0, '当前 layout 无该槽位，未固定绑定必须清理');
  assert.ok(!(result.data.compat?.reasonCodes ?? []).includes('role_conflict'), '不得再报 role_conflict');

  const layout = deriveSlotLayout(catalog(), 'gpt-image-2.5', 'text_to_image');
  const feed = [{ edgeId: 'e-ref', sourceNodeId: 'upstream', outputId: 'o', type: 'image', availability: 'ready', ordinal: 0, url: 'https://fixture.test/r.png' }];
  const display = effectiveInputDisplay(layout, feed, result.data.slotBindings, result.data.slotConflicts ?? [], [], [], 1);
  assert.equal(display.records.find((record) => record.slot.slot === 'reference_image'), undefined, '展示侧不得出现该槽位记录');
  assert.deepEqual(selectSlotOccupants(layout, display.bindings, feed, display.conflicts), [], '提交侧不得消费该残留绑定');
});

test('#4048 e2e：pinned=true 的旧槽位占用仍保留为可停用的无效意图', () => {
  const node = target({ pinned: true });
  const result = recomputeCanvasSlots(node, { nodes: [node], edges: [] }, { catalog: catalog() });
  assert.equal((result.data.slotBindings?.reference_image ?? []).length, 1, 'pinned 用户选择不得被静默清理');
});
