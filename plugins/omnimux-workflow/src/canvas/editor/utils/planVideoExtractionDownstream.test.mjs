import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planVideoExtractionDownstream,
  VIDEO_EXTRACTION_ORIGIN,
  VIDEO_EXTRACTION_SOURCE_HANDLE,
  VIDEO_EXTRACTION_TARGET_HANDLE,
  VIDEO_EXTRACTION_DOWNSTREAM_GAP,
} from './planVideoExtractionDownstream.ts';

const textPosition = { x: 100, y: 200 };
const textWidth = 350;
const videoResult = {
  videoPath: '/path/to/extracted/video.mp4',
  mediaUrl: '/omnimux-workflow/media/videos/video_123.mp4',
  previewUrl: '/omnimux-workflow/media/videos/video_123.mp4',
  title: '测试提取视频',
  duration: 15,
  coverUrl: 'https://example.com/cover.jpg',
};

test('planVideoExtractionDownstream: 首次提取创建下游视频节点与连线', () => {
  const plan = planVideoExtractionDownstream({
    textNodeId: 'node_text_1',
    textPosition,
    textNodeWidth: textWidth,
    videoResult,
    label: '自定义标签',
    currentNodes: [
      { id: 'node_text_1', type: 'material', position: textPosition, data: { materialType: 'text' } },
    ],
    currentEdges: [],
    createNodeId: () => 'node_video_target_1',
  });

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'node_video_target_1');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addEdges.length, 1);
  assert.equal(plan.nodePatches.length, 0);

  const newNode = plan.addNodes[0];
  assert.equal(newNode.id, 'node_video_target_1');
  assert.equal(newNode.type, 'material');
  assert.equal(newNode.selected, true);
  assert.equal(newNode.position.x, textPosition.x + textWidth + VIDEO_EXTRACTION_DOWNSTREAM_GAP);
  assert.equal(newNode.position.y, textPosition.y);
  assert.equal(newNode.data.materialType, 'video');
  assert.equal(newNode.data.nodeKind, 'import');
  assert.equal(newNode.data.selectedTool, 'import');
  assert.equal(newNode.data.origin, VIDEO_EXTRACTION_ORIGIN);
  assert.equal(newNode.data.sourceTextNodeId, 'node_text_1');
  assert.equal(newNode.data.label, '测试提取视频');
  assert.equal(newNode.data.realPath, videoResult.videoPath);
  assert.equal(newNode.data.mediaUrl, videoResult.mediaUrl);
  assert.equal(newNode.data.previewUrl, videoResult.previewUrl);
  assert.equal(newNode.data.duration, 15);

  const newEdge = plan.addEdges[0];
  assert.equal(newEdge.source, 'node_text_1');
  assert.equal(newEdge.target, 'node_video_target_1');
  assert.equal(newEdge.sourceHandle, VIDEO_EXTRACTION_SOURCE_HANDLE);
  assert.equal(newEdge.targetHandle, VIDEO_EXTRACTION_TARGET_HANDLE);
});

test('planVideoExtractionDownstream: 再次提取时就地更新已有关联视频节点，不创建冗余节点', () => {
  const existingVideoNode = {
    id: 'node_video_target_1',
    type: 'material',
    position: { x: 570, y: 200 },
    data: {
      materialType: 'video',
      origin: VIDEO_EXTRACTION_ORIGIN,
      sourceTextNodeId: 'node_text_1',
      label: '旧视频',
      status: 'ready',
    },
  };
  const existingEdge = {
    id: 'edge_node_text_1_node_video_target_1',
    source: 'node_text_1',
    target: 'node_video_target_1',
    sourceHandle: VIDEO_EXTRACTION_SOURCE_HANDLE,
    targetHandle: VIDEO_EXTRACTION_TARGET_HANDLE,
  };

  const updatedVideoResult = {
    ...videoResult,
    videoPath: '/path/to/extracted/new_video.mp4',
    mediaUrl: '/omnimux-workflow/media/videos/video_456.mp4',
    previewUrl: '/omnimux-workflow/media/videos/video_456.mp4',
    title: '最新提取视频',
  };

  const plan = planVideoExtractionDownstream({
    textNodeId: 'node_text_1',
    textPosition,
    textNodeWidth: textWidth,
    videoResult: updatedVideoResult,
    currentNodes: [
      { id: 'node_text_1', type: 'material', position: textPosition },
      existingVideoNode,
    ],
    currentEdges: [existingEdge],
  });

  assert.ok(plan);
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'node_video_target_1');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0); // 连线已有，无需重复添加
  assert.equal(plan.nodePatches.length, 1);

  const patch = plan.nodePatches[0];
  assert.equal(patch.nodeId, 'node_video_target_1');
  assert.equal(patch.data.label, '最新提取视频');
  assert.equal(patch.data.realPath, updatedVideoResult.videoPath);
  assert.equal(patch.data.mediaUrl, updatedVideoResult.mediaUrl);
});

test('planVideoExtractionDownstream: 缺少 textNodeId 或 videoResult 时返回 null', () => {
  assert.equal(
    planVideoExtractionDownstream({
      textNodeId: '',
      textPosition,
      textNodeWidth: textWidth,
      videoResult,
      currentNodes: [],
      currentEdges: [],
    }),
    null,
  );
  assert.equal(
    planVideoExtractionDownstream({
      textNodeId: 'node_1',
      textPosition,
      textNodeWidth: textWidth,
      videoResult: { ...videoResult, mediaUrl: '' },
      currentNodes: [],
      currentEdges: [],
    }),
    null,
  );
});
