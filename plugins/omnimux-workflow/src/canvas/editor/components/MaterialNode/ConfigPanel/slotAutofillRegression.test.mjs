import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveSlotLayout } from '../../../../../shared/graph/feedSlot/deriveSlotLayout.ts';
import { effectiveInputDisplay } from '../../../../../shared/graph/feedSlot/effectiveInputDisplay.ts';
import { validateCanvasInputSelection } from '../../../../../shared/graph/canvasInputMutationGateway.ts';

const input = (slot, type, role, min = 1, max = 1) => ({ slot, type, role, min, max, source: 'upstream_edge' });
const catalog = {
  models: [
    {
      id: 'minimax-h3',
      operations: [
        { id: 'text_to_video', inputs: [], output: { type: 'video' }, listed: true },
        { id: 'first_frame', inputs: [input('first_frame', 'image', 'first_frame', 1, 1)], output: { type: 'video' }, listed: true },
        { id: 'digital_human', inputs: [input('character', 'image', 'reference', 1, 1), input('audio_track', 'audio', 'audio_track', 1, 1)], output: { type: 'video' }, listed: true },
      ],
    },
  ],
};

const imageFeed = {
  edgeId: 'e-img-1',
  sourceNodeId: 'node-img',
  outputId: 'ast-1',
  type: 'image',
  availability: 'ready',
  ordinal: 0,
  url: 'https://fixture.test/gloves.png',
};

test('首帧模式自愈装填：当 slotBindings 初始为空字典且无待命边时，自动装填连线图片并解除 min_unsatisfied', () => {
  const layout = deriveSlotLayout(catalog, 'minimax-h3', 'first_frame');
  assert.equal(layout.slots[0].slot, 'first_frame');

  // 1. 当 nodeData.slotBindings 为 {}，且 slotStandbyEdgeIds 为 [] 时
  const raw = {};
  const standby = [];
  const storedBindings = Object.keys(raw).length === 0 && standby.length === 0 ? undefined : raw;
  const result = effectiveInputDisplay(layout, [imageFeed], storedBindings, [], [], standby, 1);

  assert.equal(result.bindings.first_frame?.length, 1, '首帧卡槽必须自动装填连线图片');
  assert.equal(result.bindings.first_frame[0].edgeId, 'e-img-1');
  assert.equal(result.records[0].state, 'ready');

  // 2. 校验器验证：基于有效绑定，首帧节点应处于 ready: true 状态
  const targetNode = {
    id: 'node-video',
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      materialType: 'video',
      nodeKind: 'generate',
      inputBindingVersion: 1,
      params: { model: 'minimax-h3', operation: 'first_frame' },
      slotBindings: result.bindings,
    },
  };
  const imgNode = {
    id: 'node-img',
    type: 'material',
    position: { x: -100, y: 0 },
    data: { materialType: 'image', nodeKind: 'import', mediaUrl: 'https://fixture.test/gloves.png' },
  };
  const graph = {
    nodes: [imgNode, targetNode],
    edges: [{ id: 'e-img-1', source: 'node-img', target: 'node-video' }],
  };
  const verdict = validateCanvasInputSelection(graph, { targetNodeId: 'node-video', chosenOperationId: 'first_frame' }, { catalog });
  assert.equal(verdict.accepts, true);
  assert.equal(verdict.ready, true, '首帧节点必须就绪，允许生成');
  assert.equal(verdict.reasonCode, undefined, '无阻塞原因');
});

test('跨模式切换平滑继承：从 digital_human 切换到 first_frame 时自动将图片装入首帧槽位', () => {
  const ffLayout = deriveSlotLayout(catalog, 'minimax-h3', 'first_frame');
  // 模拟之前在数字人模式下保存的残留绑定
  const digitalHumanBindings = {
    character: [{ edgeId: 'e-img-1', sourceNodeId: 'node-img', outputId: 'ast-1', pinned: false }],
  };
  const standby = [];

  // 判断是否与新模式槽位有交集
  const hasMatchingSlot = ffLayout.slots.some((slot) => digitalHumanBindings[slot.slot] !== undefined);
  assert.equal(hasMatchingSlot, false, '旧 character 槽位在新 first_frame 模式下不存在');

  const storedBindings = !hasMatchingSlot && standby.length === 0 ? undefined : digitalHumanBindings;
  const result = effectiveInputDisplay(ffLayout, [imageFeed], storedBindings, [], [], standby, 1);

  assert.equal(result.bindings.first_frame?.length, 1, '切换模式后新 first_frame 槽位自动装入图片');
  assert.equal(result.bindings.first_frame[0].edgeId, 'e-img-1');
});

test('待命池主动排除：用户显式移入待命池的素材不得反向自动装填', () => {
  const layout = deriveSlotLayout(catalog, 'minimax-h3', 'first_frame');
  const raw = {};
  const standby = ['e-img-1']; // 用户主动删除了该素材连线

  const isUnbound = Object.keys(raw).length === 0 && standby.length === 0;
  assert.equal(isUnbound, false, '待命池有记录时不得判定为未装填态');

  const result = effectiveInputDisplay(layout, [imageFeed], raw, [], [], standby, 1);
  assert.equal(result.bindings.first_frame?.length ?? 0, 0, '待命池中的素材绝对不自动装填');
});
