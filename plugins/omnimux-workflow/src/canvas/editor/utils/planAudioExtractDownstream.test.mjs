import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planAudioExtractDownstream,
  AUDIO_EXTRACT_ORIGIN,
  AUDIO_EXTRACT_SOURCE_HANDLE,
  AUDIO_EXTRACT_TARGET_HANDLE,
} from './planAudioExtractDownstream.ts';

test('planAudioExtractDownstream: 初次提取时创建新音频节点与连线', () => {
  const plan = planAudioExtractDownstream({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    extractResult: {
      audioPath: '/abs/path/audio.mp3',
      mediaUrl: '/media/audio.mp3',
      previewUrl: '/preview/audio.mp3',
      duration: 15.2,
      format: 'mp3',
      title: '测试视频原声',
    },
    currentNodes: [
      { id: 'video_1', type: 'material', data: { materialType: 'video' }, position: { x: 100, y: 200 } },
    ],
    currentEdges: [],
    createNodeId: () => 'audio_new_1',
  });

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'audio_new_1');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addEdges.length, 1);

  const node = plan.addNodes[0];
  assert.equal(node.id, 'audio_new_1');
  assert.equal(node.type, 'material');
  assert.equal(node.position.x, 100 + 360 + 120); // 580
  assert.equal(node.position.y, 200); // 默认水平对齐
  assert.equal(node.data.origin, AUDIO_EXTRACT_ORIGIN);
  assert.equal(node.data.materialType, 'audio');
  assert.equal(node.data.sourceVideoNodeId, 'video_1');
  assert.equal(node.data.realPath, '/abs/path/audio.mp3');
  assert.equal(node.data.mediaUrl, '/media/audio.mp3');
  assert.equal(node.data.format, 'mp3');

  const edge = plan.addEdges[0];
  assert.equal(edge.source, 'video_1');
  assert.equal(edge.target, 'audio_new_1');
  assert.equal(edge.sourceHandle, AUDIO_EXTRACT_SOURCE_HANDLE);
  assert.equal(edge.targetHandle, AUDIO_EXTRACT_TARGET_HANDLE);
});

test('planAudioExtractDownstream: 再次提取时就地更新已有音频节点（update 模式）', () => {
  const existingAudioNode = {
    id: 'audio_exist',
    type: 'material',
    position: { x: 580, y: 200 },
    data: {
      materialType: 'audio',
      origin: AUDIO_EXTRACT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      realPath: '/old/path.mp3',
    },
  };

  const plan = planAudioExtractDownstream({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    extractResult: {
      audioPath: '/new/path.mp3',
      mediaUrl: '/media/new.mp3',
      duration: 20.0,
      format: 'mp3',
      title: '更新视频原声',
    },
    currentNodes: [
      { id: 'video_1', type: 'material', data: { materialType: 'video' }, position: { x: 100, y: 200 } },
      existingAudioNode,
    ],
    currentEdges: [
      {
        id: 'edge_video_1_audio_exist',
        source: 'video_1',
        target: 'audio_exist',
        sourceHandle: 'out',
        targetHandle: 'in',
      },
    ],
  });

  assert.ok(plan);
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'audio_exist');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0, '已连线时不重复加线');
  assert.equal(plan.nodePatches.length, 1);
  assert.equal(plan.nodePatches[0].nodeId, 'audio_exist');
  assert.equal(plan.nodePatches[0].data.realPath, '/new/path.mp3');
  assert.equal(plan.nodePatches[0].data.label, '更新视频原声');
});

test('planAudioExtractDownstream: 当右侧同水平位置已被占用时，智能避让下移 +360', () => {
  const tableNode = {
    id: 'tbl_deconstruct_1',
    type: 'table',
    position: { x: 580, y: 200 }, // 与视频 y 轴一致 (200)
    data: {
      origin: 'video_deconstruct',
      sourceVideoNodeId: 'video_1',
    },
  };

  const plan = planAudioExtractDownstream({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    extractResult: {
      audioPath: '/abs/path/audio.mp3',
      title: '测试避让原声',
    },
    currentNodes: [
      { id: 'video_1', type: 'material', data: { materialType: 'video' }, position: { x: 100, y: 200 } },
      tableNode,
    ],
    currentEdges: [
      { source: 'video_1', target: 'tbl_deconstruct_1' },
    ],
    createNodeId: () => 'audio_avoid_1',
  });

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.addNodes[0].position.y, 200 + 360); // 560，成功避开 200
});

test('planAudioExtractDownstream: 参数缺失时安全返回 null', () => {
  assert.equal(planAudioExtractDownstream({}), null);
  assert.equal(
    planAudioExtractDownstream({
      videoNodeId: 'v1',
      videoPosition: { x: 0, y: 0 },
      videoNodeWidth: 300,
      extractResult: { audioPath: '' },
      currentNodes: [],
      currentEdges: [],
    }),
    null,
  );
});
