import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planVideoDepthProvisioning,
  planVideoDepthSettlement,
  isVideoDepthDownstreamNode,
  VIDEO_DEPTH_ORIGIN,
  VIDEO_DEPTH_SOURCE_HANDLE,
  VIDEO_DEPTH_TARGET_HANDLE,
} from './planVideoDepthDownstream.ts';

const sourceVideo = {
  id: 'video_1',
  type: 'material',
  data: { materialType: 'video', status: 'ready' },
  position: { x: 100, y: 200 },
};

test('provisioning: 点击深度视频立即创建 Running 态下游视频节点与连线', () => {
  const plan = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '产品视频 深度视频',
    currentNodes: [sourceVideo],
    currentEdges: [],
    createNodeId: () => 'depth_provision_1',
  });

  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'depth_provision_1');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addEdges.length, 1);

  const node = plan.addNodes[0];
  assert.equal(node.id, 'depth_provision_1');
  assert.equal(node.data.materialType, 'video');
  assert.equal(node.data.executionStatus, 'running');
  assert.equal(node.data.status, 'generating');
  assert.equal(node.data.origin, VIDEO_DEPTH_ORIGIN);
  assert.equal(node.data.sourceVideoNodeId, 'video_1');
  assert.equal(node.position.x, 100 + 360 + 120);
  assert.equal(node.position.y, 200);

  const edge = plan.addEdges[0];
  assert.equal(edge.source, 'video_1');
  assert.equal(edge.target, 'depth_provision_1');
  assert.equal(edge.sourceHandle, VIDEO_DEPTH_SOURCE_HANDLE);
  assert.equal(edge.targetHandle, VIDEO_DEPTH_TARGET_HANDLE);
});

test('provisioning: 已有下游节点时复用并补线，不重复建节点', () => {
  const plan = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '深度视频',
    currentNodes: [
      sourceVideo,
      {
        id: 'depth_existing',
        type: 'material',
        data: {
          materialType: 'video',
          executionStatus: 'completed',
          origin: VIDEO_DEPTH_ORIGIN,
          sourceVideoNodeId: 'video_1',
        },
        position: { x: 600, y: 200 },
      },
    ],
    currentEdges: [],
  });

  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'depth_existing');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 1);
  assert.equal(plan.nodePatches[0].data.executionStatus, 'running');
});

test('provisioning: 下游仍在运行时不重复触发 (noop)', () => {
  const plan = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    currentNodes: [
      sourceVideo,
      {
        id: 'depth_running',
        type: 'material',
        data: {
          materialType: 'video',
          executionStatus: 'running',
          origin: VIDEO_DEPTH_ORIGIN,
          sourceVideoNodeId: 'video_1',
        },
        position: { x: 600, y: 200 },
      },
    ],
    currentEdges: [{ source: 'video_1', target: 'depth_running' }],
  });

  assert.equal(plan.mode, 'noop');
  assert.equal(plan.targetNodeId, 'depth_running');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.nodePatches.length, 0);
});

test('provisioning: running 但无活跃请求时重跑，不 noop（Issue #3586）', () => {
  const runningNode = {
    id: 'depth_running',
    type: 'material',
    data: {
      materialType: 'video',
      executionStatus: 'running',
      origin: VIDEO_DEPTH_ORIGIN,
      sourceVideoNodeId: 'video_1',
      realPath: '/tmp/old.mp4',
      mediaUrl: '/old.mp4',
    },
    position: { x: 600, y: 200 },
  };
  const input = {
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '深度视频',
    currentNodes: [sourceVideo, runningNode],
    currentEdges: [{ source: 'video_1', target: 'depth_running' }],
  };

  const active = planVideoDepthProvisioning({ ...input, isNodeActive: () => true });
  assert.equal(active.mode, 'noop', '本渲染器确实在跑 → 防抖');

  const stale = planVideoDepthProvisioning({ ...input, isNodeActive: () => false });
  assert.equal(stale.mode, 'update', '失联的 running 必须重跑');
  assert.equal(stale.targetNodeId, 'depth_running');
  assert.equal(stale.nodePatches[0].data.executionStatus, 'running');
  assert.equal(stale.nodePatches[0].data.realPath, undefined, '重跑前清旧媒体');
});

test('provisioning: 同 y 已有其它下游节点时纵向错开，避免重叠', () => {
  const plan = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    currentNodes: [
      sourceVideo,
      {
        id: 'table_1',
        type: 'table',
        data: { materialType: 'table', sourceVideoNodeId: 'video_1' },
        position: { x: 600, y: 200 },
      },
    ],
    currentEdges: [{ source: 'video_1', target: 'table_1' }],
    createNodeId: () => 'depth_provision_2',
  });

  assert.equal(plan.mode, 'create');
  assert.equal(plan.addNodes[0].position.y, 200 + 360);
});

test('settlement: 成功回填深度视频路径与媒体 URL，节点收敛 completed', () => {
  const plan = planVideoDepthSettlement({
    targetNodeId: 'depth_1',
    label: '产品视频 深度视频',
    depthResult: {
      depthPath: '/tmp/out/depth_1.mp4',
      mediaUrl: '/omnimux-workflow/media/video-depth/ws/out/depth_1.mp4',
      previewUrl: '/api/local-file?path=%2Ftmp%2Fout%2Fdepth_1.mp4',
      title: '产品视频 深度视频',
    },
  });

  const data = plan.nodePatches[0].data;
  assert.equal(data.executionStatus, 'completed');
  assert.equal(data.status, 'ready');
  assert.equal(data.realPath, '/tmp/out/depth_1.mp4');
  assert.equal(data.mediaUrl, '/omnimux-workflow/media/video-depth/ws/out/depth_1.mp4');
  assert.equal(data.previewUrl, '/api/local-file?path=%2Ftmp%2Fout%2Fdepth_1.mp4');
  assert.equal(data.label, '产品视频 深度视频');
});

test('settlement: 失败只把下游节点置为 error，保留可读错误', () => {
  const plan = planVideoDepthSettlement({
    targetNodeId: 'depth_1',
    error: '本机缺少深度图 Python 依赖',
  });

  const data = plan.nodePatches[0].data;
  assert.equal(data.executionStatus, 'error');
  assert.equal(data.status, 'failed');
  assert.equal(data.executionError, '本机缺少深度图 Python 依赖');
  assert.equal(data.realPath, undefined, '失败后不得继续播放上一次的深度视频');
  assert.equal(data.mediaUrl, undefined);
  assert.equal(plan.nodePatches.length, 1);
  assert.equal(plan.nodePatches[0].nodeId, 'depth_1');
});

test('isVideoDepthDownstreamNode: 只认来源标记，不误认普通视频节点', () => {
  assert.equal(
    isVideoDepthDownstreamNode(
      { id: 'd', data: { materialType: 'video', origin: VIDEO_DEPTH_ORIGIN, sourceVideoNodeId: 'video_1' } },
      'video_1',
    ),
    true,
  );
  assert.equal(
    isVideoDepthDownstreamNode(
      { id: 'd', data: { materialType: 'video', sourceVideoNodeId: 'video_1' } },
      'video_1',
    ),
    false,
  );
  assert.equal(
    isVideoDepthDownstreamNode(
      { id: 'd', data: { materialType: 'video', origin: VIDEO_DEPTH_ORIGIN, sourceVideoNodeId: 'video_2' } },
      'video_1',
    ),
    false,
  );
});
