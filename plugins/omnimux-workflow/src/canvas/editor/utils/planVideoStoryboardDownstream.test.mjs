/**
 * planVideoStoryboardDownstream 纯函数单测。
 *
 * 覆盖：预建节点（running/generating + 连线）、复用与防抖、与内容拆解表 origin 严格隔离、
 * settlement 成功/失败只 patch 目标节点且失败不伪造 tableId。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_STORYBOARD_DOWNSTREAM_GAP,
  VIDEO_STORYBOARD_DOWNSTREAM_Y_OFFSET,
  VIDEO_STORYBOARD_ORIGIN,
  planVideoStoryboardProvisioning,
  planVideoStoryboardSettlement,
} from './planVideoStoryboardDownstream.ts';
import { planVideoDeconstructProvisioning } from './planVideoDeconstructDownstream.ts';

const VIDEO_NODE = {
  id: 'video_1',
  type: 'material',
  position: { x: 100, y: 200 },
  data: { materialType: 'video', label: '爆款参考视频', status: 'ready' },
};

function baseInput(currentNodes, currentEdges, extra) {
  return Object.assign(
    {
      videoNodeId: VIDEO_NODE.id,
      videoPosition: VIDEO_NODE.position,
      videoNodeWidth: 350,
      label: '视频分镜表',
      currentNodes: currentNodes || [VIDEO_NODE],
      currentEdges: currentEdges || [],
    },
    extra || {},
  );
}

function storyboardNode(dataOverrides) {
  const node = {
    id: 'node_table_storyboard',
    type: 'table',
    position: { x: 570, y: 520 },
    data: {
      origin: VIDEO_STORYBOARD_ORIGIN,
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_sb_prev',
      tablePath: '.omnimux/tables/tbl_sb_prev.htable',
      rowCount: 4,
      columnCount: 3,
      status: 'failed',
      executionStatus: 'error',
      executionError: '上次失败',
    },
  };
  if (dataOverrides) node.data = Object.assign(node.data, dataOverrides);
  return node;
}

test('planVideoStoryboardProvisioning: 点击分镜表立即创建 running/generating 下游 table 节点与 out→in 连线', () => {
  const sourceSnapshot = structuredClone(VIDEO_NODE);
  const input = baseInput(undefined, undefined, { createNodeId: () => 'node_table_sb_new' });

  const plan = planVideoStoryboardProvisioning(input);

  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'node_table_sb_new');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.nodePatches.length, 0);

  const node = plan.addNodes[0];
  assert.equal(node.id, 'node_table_sb_new');
  assert.equal(node.type, 'table');
  assert.equal(node.selected, true);
  // 位置约定：视频右侧 + 下方 320
  assert.deepEqual(node.position, {
    x: VIDEO_NODE.position.x + 350 + VIDEO_STORYBOARD_DOWNSTREAM_GAP,
    y: VIDEO_NODE.position.y + VIDEO_STORYBOARD_DOWNSTREAM_Y_OFFSET,
  });
  assert.equal(VIDEO_STORYBOARD_DOWNSTREAM_Y_OFFSET, 320);
  assert.deepEqual(node.data, {
    label: '视频分镜表',
    title: '视频分镜表',
    materialType: 'table',
    status: 'generating',
    executionStatus: 'running',
    tableId: '',
    tablePath: '',
    columnCount: 0,
    rowCount: 0,
    previewRows: [],
    origin: VIDEO_STORYBOARD_ORIGIN,
    sourceVideoNodeId: 'video_1',
  });
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_video_1_node_table_sb_new',
      source: 'video_1',
      target: 'node_table_sb_new',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);

  // 源视频节点零写入
  assert.deepEqual(VIDEO_NODE, sourceSnapshot);
  assert.equal('executionStatus' in VIDEO_NODE.data, false);
  assert.equal('executionError' in VIDEO_NODE.data, false);
});

test('planVideoStoryboardProvisioning: 默认 id 为 node_table_<ts>_<rand>', () => {
  const plan = planVideoStoryboardProvisioning(baseInput());
  assert.match(plan.targetNodeId, /^node_table_\d+_[a-z0-9]+$/);
  assert.equal(plan.addNodes[0].id, plan.targetNodeId);
});

test('planVideoStoryboardProvisioning: 重复执行 update 复用同一节点并保留既有表格结果字段', () => {
  const existing = storyboardNode();
  const edge = {
    id: 'edge_video_1_node_table_storyboard',
    source: 'video_1',
    target: 'node_table_storyboard',
    sourceHandle: 'out',
    targetHandle: 'in',
  };

  const plan = planVideoStoryboardProvisioning(
    baseInput([VIDEO_NODE, existing], [edge]),
  );

  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'node_table_storyboard');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0, '已连线时不重复加线');
  assert.equal(plan.nodePatches.length, 1);

  const patch = plan.nodePatches[0];
  assert.equal(patch.nodeId, 'node_table_storyboard');
  assert.equal(patch.data.label, '视频分镜表');
  assert.equal(patch.data.materialType, 'table');
  assert.equal(patch.data.status, 'generating');
  assert.equal(patch.data.executionStatus, 'running');
  assert.equal(patch.data.executionError, undefined);
  assert.equal(patch.data.origin, VIDEO_STORYBOARD_ORIGIN);
  assert.equal(patch.data.sourceVideoNodeId, 'video_1');
  assert.equal('tableId' in patch.data, false);
  assert.equal('tablePath' in patch.data, false);
});

test('planVideoStoryboardProvisioning: update 时缺连线补 out→in 连线', () => {
  const plan = planVideoStoryboardProvisioning(
    baseInput([VIDEO_NODE, storyboardNode()], []),
  );

  assert.equal(plan.mode, 'update');
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_video_1_node_table_storyboard',
      source: 'video_1',
      target: 'node_table_storyboard',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);
});

test('planVideoStoryboardProvisioning: 下游节点 running/generating 时返回 noop 防抖', () => {
  const runningNode = storyboardNode({
    executionStatus: 'running',
    status: 'generating',
  });

  const plan = planVideoStoryboardProvisioning(
    baseInput([VIDEO_NODE, runningNode], [{ source: 'video_1', target: 'node_table_storyboard' }]),
  );

  assert.deepEqual(plan, {
    mode: 'noop',
    targetNodeId: 'node_table_storyboard',
    addNodes: [],
    addEdges: [],
    nodePatches: [],
  });
});

test('planVideoStoryboardProvisioning: 只认 status=generating 时也 noop 防抖', () => {
  const generatingOnly = {
    id: 'node_table_sb_generating',
    type: 'table',
    data: {
      origin: VIDEO_STORYBOARD_ORIGIN,
      sourceVideoNodeId: 'video_1',
      status: 'generating',
    },
  };

  const plan = planVideoStoryboardProvisioning(
    baseInput([VIDEO_NODE, generatingOnly]),
  );

  assert.equal(plan.mode, 'noop');
  assert.equal(plan.targetNodeId, 'node_table_sb_generating');
});

test('planVideoStoryboardProvisioning: 已连线的内容拆解表节点不被误匹配，创建分镜表节点', () => {
  const deconstructTable = {
    id: 'node_table_deconstruct',
    type: 'table',
    position: { x: 570, y: 200 },
    data: {
      origin: 'video_deconstruct',
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_deconstruct',
    },
  };

  const plan = planVideoStoryboardProvisioning(
    baseInput(
      [VIDEO_NODE, deconstructTable],
      [{ id: 'edge_dc', source: 'video_1', target: 'node_table_deconstruct' }],
      { createNodeId: () => 'node_table_sb_isolated' },
    ),
  );

  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'node_table_sb_isolated');
  assert.equal(plan.addNodes[0].data.origin, VIDEO_STORYBOARD_ORIGIN);
  assert.deepEqual(plan.addNodes[0].position, {
    x: 570,
    y: VIDEO_NODE.position.y + 320,
  });
  assert.equal(plan.nodePatches.length, 0);
});

test('两个 origin 互不串扰：同一视频同时有拆解表与分镜表时各归各的下游节点', () => {
  const deconstructTable = {
    id: 'node_table_deconstruct',
    type: 'table',
    data: {
      origin: 'video_deconstruct',
      sourceVideoNodeId: 'video_1',
      executionStatus: 'error',
      status: 'failed',
    },
  };
  const storyboardTable = storyboardNode();
  const nodes = [VIDEO_NODE, deconstructTable, storyboardTable];
  const edges = [
    { source: 'video_1', target: 'node_table_deconstruct' },
    { source: 'video_1', target: 'node_table_storyboard' },
  ];

  const deconstructPlan = planVideoDeconstructProvisioning(baseInput(nodes, edges));
  const storyboardPlan = planVideoStoryboardProvisioning(baseInput(nodes, edges));

  assert.equal(deconstructPlan.mode, 'update');
  assert.equal(deconstructPlan.targetNodeId, 'node_table_deconstruct');
  assert.equal(deconstructPlan.nodePatches[0].nodeId, 'node_table_deconstruct');
  assert.equal(deconstructPlan.nodePatches[0].data.origin, 'video_deconstruct');

  assert.equal(storyboardPlan.mode, 'update');
  assert.equal(storyboardPlan.targetNodeId, 'node_table_storyboard');
  assert.equal(storyboardPlan.nodePatches[0].nodeId, 'node_table_storyboard');
  assert.equal(storyboardPlan.nodePatches[0].data.origin, VIDEO_STORYBOARD_ORIGIN);
});

test('planVideoStoryboardSettlement: 成功时只 patch 目标节点并回填分镜表产物', () => {
  const plan = planVideoStoryboardSettlement({
    targetNodeId: 'node_table_sb_1',
    label: '视频分镜表',
    tableResult: {
      tableId: 'tbl_sb_final',
      tablePath: '.omnimux/tables/tbl_sb_final.htable',
      title: '爆款分镜表',
      rowCount: 12,
      columnCount: 5,
      previewRows: [{ shot: '镜头 1', duration: 3 }],
    },
    origin: VIDEO_STORYBOARD_ORIGIN,
    sourceVideoNodeId: 'video_1',
  });

  assert.equal(plan.targetNodeId, 'node_table_sb_1');
  assert.equal(plan.addNodes, undefined);
  assert.equal(plan.nodePatches.length, 1);
  assert.deepEqual(plan.nodePatches[0], {
    nodeId: 'node_table_sb_1',
    data: {
      label: '爆款分镜表',
      title: '爆款分镜表',
      tableId: 'tbl_sb_final',
      tablePath: '.omnimux/tables/tbl_sb_final.htable',
      rowCount: 12,
      columnCount: 5,
      previewRows: [{ shot: '镜头 1', duration: 3 }],
      status: 'ready',
      executionStatus: 'completed',
      executionError: undefined,
      executionUpstream: undefined,
      origin: VIDEO_STORYBOARD_ORIGIN,
      sourceVideoNodeId: 'video_1',
    },
  });
});

test('planVideoStoryboardSettlement: 成功时缺省 previewRows/label 回退', () => {
  const plan = planVideoStoryboardSettlement({
    targetNodeId: 'node_table_sb_2',
    tableResult: {
      tableId: 'tbl_sb_min',
      tablePath: '.omnimux/tables/tbl_sb_min.htable',
      rowCount: 2,
      columnCount: 2,
    },
  });

  const patch = plan.nodePatches[0].data;
  assert.equal(patch.label, '视频分镜表');
  assert.deepEqual(patch.previewRows, []);
});

test('planVideoStoryboardSettlement: 失败时落错误态，只 patch 目标节点且不伪造 tableId', () => {
  const plan = planVideoStoryboardSettlement({
    targetNodeId: 'node_table_sb_3',
    error: '分镜识别失败',
    upstream: 'hub',
  });

  assert.equal(plan.targetNodeId, 'node_table_sb_3');
  assert.equal(plan.nodePatches.length, 1);
  assert.deepEqual(plan.nodePatches[0], {
    nodeId: 'node_table_sb_3',
    data: {
      status: 'failed',
      executionStatus: 'error',
      executionError: '分镜识别失败',
      executionUpstream: 'hub',
    },
  });
  assert.equal('tableId' in plan.nodePatches[0].data, false);
});

test('planVideoStoryboardSettlement: 无结果且无错误时使用默认失败文案，仍不产生 tableId', () => {
  const plan = planVideoStoryboardSettlement({ targetNodeId: 'node_table_sb_4' });
  const patch = plan.nodePatches[0].data;
  assert.equal(patch.status, 'failed');
  assert.equal(patch.executionStatus, 'error');
  assert.equal(patch.executionError, '分镜表生成失败');
  assert.equal('tableId' in patch, false);
});
