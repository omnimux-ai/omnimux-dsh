/**
 * 图生图契约对齐（Issue #3128）。
 *
 * 锁定一条不变量：**界面上显示为「已装填且就绪」的卡槽，其占位者必须出现在提交侧的选择结果里**。
 * 历史缺陷：V1 节点首次重算把未初始化的 `slotBindings` 归一成 `{}`。显示侧把 `{}` 当「未初始化」自愈装填，
 * 执行侧把 `{}` 当「显式为空」跳过装填 —— 卡槽显示已装好、按钮可用，请求里却没有那张图，两端都不报错。
 * 这里直接调用画布重算内核与执行侧同源函数（`effectiveInputDisplay` / `selectSlotOccupants`），与产品走同一条路径。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recomputeCanvasSlots } from './canvasSlotRecompute.ts';
import { deriveSlotLayout, selectSlotOccupants } from './feedSlot/index.ts';
import { effectiveInputDisplay } from './feedSlot/effectiveInputDisplay.ts';

function imageCatalog() {
  return {
    source: 'omnimux',
    models: [{
      id: 'gpt-image-2.5',
      label: 'GPT Image 2.5',
      operations: [
        {
          id: 'text_to_image', label: '文生图', listed: true, output: { type: 'image' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }],
        },
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

const upstreamImage = {
  id: 'upstream',
  type: 'material',
  position: { x: 0, y: 0 },
  data: {
    materialType: 'image', nodeKind: 'import',
    mediaAssets: [{ type: 'image', url: 'https://fixture.test/reference.png', mimeType: 'image/png', sizeBytes: 2048 }],
  },
};

function targetNode(extra = {}) {
  return {
    id: 'target',
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      materialType: 'image', nodeKind: 'generate', status: 'empty', inputBindingVersion: 1,
      prompt: '把参考图里的主体换成金属质感',
      params: { model: 'gpt-image-2.5', operation: 'multi_reference' },
      ...extra,
    },
  };
}

const edge = { id: 'e-ref', source: 'upstream', target: 'target', targetHandle: 'in' };

/** 执行侧读取路径：与 collectMaterialSlotInputs 内部对 slotBindings 的用法一致。 */
function submissionSelection(node, layout) {
  const display = effectiveInputDisplay(layout, feedFor(node), node.data.slotBindings, node.data.slotConflicts ?? [], [], node.data.slotStandbyEdgeIds ?? [], 1);
  return { display, selected: selectSlotOccupants(layout, display.bindings, feedFor(node), display.conflicts) };
}

function feedFor(node) {
  const bound = Object.values(node.data.slotBindings ?? {}).flat();
  return bound.map((occupant) => ({
    edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId, outputId: 'asset-1', type: 'image',
    availability: 'ready', ordinal: 0, url: 'https://fixture.test/reference.png',
  }));
}

describe('Issue #3128 · 显示已装填 ⇒ 提交必含该 reference', () => {
  it('未初始化的 V1 节点在重算时落盘自愈装填，且提交侧选中同一占位者', () => {
    const catalog = imageCatalog();
    const node = targetNode();
    const graph = { nodes: [upstreamImage, node], edges: [edge] };

    const result = recomputeCanvasSlots(node, graph, { catalog });
    assert.equal(result.data.params.operation, 'multi_reference');
    const persisted = result.data.slotBindings;
    assert.equal(persisted.reference_image?.length, 1, '重算必须落盘自愈装填结果，而不是停在空字典');
    assert.equal(persisted.reference_image[0].edgeId, 'e-ref');
    assert.equal(result.data.compat.readyToSubmit, true, '正文与参考图齐备时必须可提交');

    const layout = deriveSlotLayout(catalog, 'gpt-image-2.5', 'multi_reference');
    const { display, selected } = submissionSelection(result, layout);
    assert.equal(display.records.find((record) => record.slot.slot === 'reference_image')?.state, 'ready');
    assert.deepEqual(selected.map((item) => item.occupant.edgeId), ['e-ref'], '显示已装填的参考图必须进入提交选择');
  });

  it('待命边是用户意志：不自动装填，显示与提交都为空', () => {
    const catalog = imageCatalog();
    const node = targetNode({ slotStandbyEdgeIds: ['e-ref'] });
    const graph = { nodes: [upstreamImage, node], edges: [edge] };

    const result = recomputeCanvasSlots(node, graph, { catalog });
    assert.deepEqual(result.data.slotBindings, {}, '待命边不得被自动装填');

    const layout = deriveSlotLayout(catalog, 'gpt-image-2.5', 'multi_reference');
    const { selected } = submissionSelection(result, layout);
    assert.deepEqual(selected, []);
  });

  it('没有可装填供给时保持原有的空字典形状', () => {
    const catalog = imageCatalog();
    const node = targetNode();
    const result = recomputeCanvasSlots(node, { nodes: [node], edges: [] }, { catalog });
    assert.deepEqual(result.data.slotBindings, {}, '无可装填供给时不得写入槽位空数组');
  });

  it('用户清空（显式空字典）不被自愈装填覆盖', () => {
    const catalog = imageCatalog();
    const node = targetNode({ slotBindings: {} });
    const graph = { nodes: [upstreamImage, node], edges: [edge] };
    const result = recomputeCanvasSlots(node, graph, { catalog });
    assert.deepEqual(result.data.slotBindings, {}, '显式空字典代表用户清空，重算不得改写');
  });
});
