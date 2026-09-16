/**
 * 新建节点默认生成模式（Issue #2003）。
 *
 * 验证目录推荐模式被写入新节点，且已保存的创意选择永不改写。
 * 这里直接调用画布槽位重算内核，与界面走同一条路径。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recomputeCanvasSlots } from '../src/shared/graph/canvasSlotRecompute.ts';
import { deriveSlotLayout } from '../src/shared/graph/feedSlot/index.ts';

function videoCatalog() {
  return {
    source: 'omnimux',
    models: [{
      id: 'seedance-2-5',
      label: 'Seedance 2.5',
      operations: [
        {
          id: 'text_to_video', label: '文生视频', listed: true,
          output: { type: 'video' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }],
        },
        {
          id: 'video_multi_ref', label: '全能参考', listed: true,
          output: { type: 'video' },
          inputs: [{ slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 5 }],
        },
      ],
    }],
    text: [], image: [], audio: [],
    video: [{ id: 'seedance-2-5', label: 'Seedance 2.5' }],
    defaults: { video: 'seedance-2-5' },
    defaultsByOperation: {},
    defaultOperations: { video: { modelId: 'seedance-2-5', operationId: 'video_multi_ref', rule: 'auto' } },
  };
}

function videoNode(params = {}) {
  return {
    id: 'video-1',
    type: 'material',
    position: { x: 0, y: 0 },
    data: { materialType: 'video', nodeKind: 'generate', status: 'empty', params },
  };
}

describe('new node starts in the catalog default generation mode', () => {
  it('a fresh video node receives the media-consuming mode and renders slots', () => {
    const catalog = videoCatalog();
    const node = videoNode();
    const result = recomputeCanvasSlots(node, { nodes: [node], edges: [] }, { catalog });
    assert.equal(result.data.params.operation, 'video_multi_ref');
    assert.equal(result.data.params.model, 'seedance-2-5');

    const layout = deriveSlotLayout(catalog, 'seedance-2-5', 'video_multi_ref');
    assert.notEqual(layout.preset, 'none');
    assert.ok(layout.slots.length > 0, 'the default mode must expose slots');
    assert.deepEqual(layout.slots.map((slot) => slot.slot), ['reference_images']);
  })

  it('a saved mode is never replaced by the default', () => {
    const catalog = videoCatalog();
    const node = videoNode({ model: 'seedance-2-5', operation: 'text_to_video' });
    const result = recomputeCanvasSlots(node, { nodes: [node], edges: [] }, { catalog });
    assert.equal(result.data.params.operation, 'text_to_video');
  })

  it('an unlisted recommendation is refused', () => {
    const catalog = videoCatalog();
    catalog.models[0].operations[1].listed = false;
    const node = videoNode();
    const result = recomputeCanvasSlots(node, { nodes: [node], edges: [] }, { catalog });
    assert.notEqual(result.data.params.operation, 'video_multi_ref');
  })
})
