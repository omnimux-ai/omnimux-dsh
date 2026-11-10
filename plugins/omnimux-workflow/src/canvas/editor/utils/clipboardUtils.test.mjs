import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyNodesToClipboard, pasteFromClipboard } from './clipboardUtils.ts';
import { recomputeCanvasSlots } from '../../../shared/graph/canvasSlotRecompute.ts';

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

function sourceNode(id = 'src1') {
  return { id, type: 'material', position: { x: 0, y: 0 }, selected: true, data: { label: 'src', materialType: 'image', nodeKind: 'import' } };
}

function genNode(id = 'gen1', { pinned = true } = {}) {
  return {
    id, type: 'material', position: { x: 200, y: 0 }, selected: true,
    data: {
      label: 'gen', materialType: 'image', nodeKind: 'generate', inputBindingVersion: 1,
      params: { model: 'gpt-image-2.5', operation: 'multi_reference' },
      slotBindings: { reference_image: [{ sourceNodeId: 'src1', edgeId: 'e1', outputId: 'o1', pinned }] },
      slotStandbyEdgeIds: ['e1'],
    },
  };
}

const edge = { id: 'e1', source: 'src1', target: 'gen1', selected: false };

test('粘贴把 slotBindings 的 source/edge id 重映射到克隆出的新节点/新边（Issue #4039）', () => {
  const nodes = [sourceNode(), genNode()];
  const clipboard = copyNodesToClipboard(nodes, [edge]);
  assert.equal(clipboard.nodes.length, 2);
  assert.equal(clipboard.edges.length, 1);

  const result = pasteFromClipboard(clipboard);
  assert.ok(result);
  const newSrc = result.nodes.find((n) => n.data.label === 'src');
  const newGen = result.nodes.find((n) => n.data.label === 'gen');
  const newEdge = result.edges[0];

  assert.notEqual(newGen.id, 'gen1');
  assert.notEqual(newSrc.id, 'src1');
  assert.notEqual(newEdge.id, 'e1');

  const occ = newGen.data.slotBindings.reference_image;
  assert.equal(occ.length, 1, '绑定在克隆子图内应被保留');
  assert.equal(occ[0].sourceNodeId, newSrc.id, 'sourceNodeId 应指向新节点');
  assert.equal(occ[0].edgeId, newEdge.id, 'edgeId 应指向新边');
  assert.deepEqual(newGen.data.slotStandbyEdgeIds, [newEdge.id], '待命边应重映射到新边');

  // 深拷贝：克隆节点的 data 不得与原节点共享引用，原数据也不得被篡改
  assert.notEqual(newGen.data, nodes[1].data, '克隆节点 data 必须是新对象');
  assert.equal(nodes[1].data.slotBindings.reference_image[0].sourceNodeId, 'src1');
  assert.equal(nodes[1].data.slotBindings.reference_image[0].edgeId, 'e1');
});

test('只粘贴生成节点时，源/边不在范围内的绑定被丢弃为空数组（不留悬空引用）', () => {
  const nodes = [genNode()];
  const clipboard = copyNodesToClipboard(nodes, []);
  const result = pasteFromClipboard(clipboard);
  assert.ok(result);
  const newGen = result.nodes[0];
  assert.deepEqual(newGen.data.slotBindings.reference_image, [], '源/边未被复制，绑定应丢弃');
  assert.deepEqual(newGen.data.slotStandbyEdgeIds, [], '无法映射的待命边应过滤');
});

test('重映射后的绑定在克隆图上重算仍存活（不会被 #4032 的存活校验清除）', () => {
  // 未固定(pinned=false)占位者：base 下会被 #4032 清除；重映射到新 id 后应存活。
  const nodes = [sourceNode(), genNode('gen1', { pinned: false })];
  const result = pasteFromClipboard(copyNodesToClipboard(nodes, [edge]));
  assert.ok(result);
  const newGen = result.nodes.find((n) => n.data.label === 'gen');
  const rebuilt = recomputeCanvasSlots(newGen, { nodes: result.nodes, edges: result.edges }, { catalog: catalog() });
  const refs = rebuilt.data.slotBindings?.reference_image ?? [];
  assert.equal(refs.length, 1, '重映射后占位者在新子图里应存活');
  assert.equal(refs[0].edgeId, result.edges[0].id, '存活占位者指向新边');
});
