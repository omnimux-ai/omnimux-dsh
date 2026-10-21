/**
 * planVideoDeconstructDownstream 纯函数单测。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_DECONSTRUCT_DOWNSTREAM_GAP,
  VIDEO_DECONSTRUCT_ORIGIN,
  planVideoDeconstructDownstream,
  planVideoDeconstructProvisioning,
  planVideoDeconstructSettlement,
} from './planVideoDeconstructDownstream.ts';

const VIDEO_NODE = {
  id: 'video_1',
  type: 'material',
  position: { x: 100, y: 200 },
  data: { materialType: 'video', label: '爆款参考视频' },
};

function baseInput(overrides = {}) {
  return {
    videoNodeId: VIDEO_NODE.id,
    videoPosition: VIDEO_NODE.position,
    videoNodeWidth: 350,
    tableResult: {
      tableId: 'tbl_test123',
      tablePath: '.omnimux/tables/tbl_test123.htable',
      title: '短视频拆解表',
      rowCount: 5,
      columnCount: 6,
      previewRows: ['镜头1：开场黄金钩子', '镜头2：沉浸使用演示'],
    },
    label: '短视频拆解表',
    currentNodes: [VIDEO_NODE],
    currentEdges: [],
    ...overrides,
  };
}

test('无下游节点：右侧创建 table 节点并连线（硬性数据约束全量断言）', () => {
  const plan = planVideoDeconstructDownstream(baseInput({ createNodeId: () => 'tbl_new' }));
  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'tbl_new');
  assert.equal(plan.addNodes.length, 1);
  const node = plan.addNodes[0];
  assert.equal(node.type, 'table');
  // 右侧偏移 nodeWidth + 120，纵向对齐
  assert.deepEqual(node.position, { x: 100 + 350 + VIDEO_DECONSTRUCT_DOWNSTREAM_GAP, y: 200 });
  assert.equal(VIDEO_DECONSTRUCT_DOWNSTREAM_GAP, 120);
  assert.equal(node.selected, true);
  assert.deepEqual(node.data, {
    label: '短视频拆解表',
    title: '短视频拆解表',
    tableId: 'tbl_test123',
    tablePath: '.omnimux/tables/tbl_test123.htable',
    columnCount: 6,
    rowCount: 5,
    previewRows: ['镜头1：开场黄金钩子', '镜头2：沉浸使用演示'],
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    sourceVideoNodeId: 'video_1',
    status: 'ready',
  });
  assert.equal(plan.nodePatches.length, 0);
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_video_1_tbl_new',
      source: 'video_1',
      target: 'tbl_new',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);
});

test('已有连线 video_deconstruct 节点：仅就地更新，不产生新节点', () => {
  const existingTableNode = {
    id: 'tbl_existing',
    type: 'table',
    position: { x: 570, y: 200 },
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_old',
      tablePath: '.omnimux/tables/tbl_old.htable',
      rowCount: 2,
      columnCount: 4,
    },
  };
  const edge = {
    id: 'edge_video_1_tbl_existing',
    source: 'video_1',
    target: 'tbl_existing',
    sourceHandle: 'out',
    targetHandle: 'in',
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, existingTableNode],
      currentEdges: [edge],
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'tbl_existing');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0);
  assert.equal(plan.nodePatches.length, 1);
  assert.deepEqual(plan.nodePatches[0], {
    nodeId: 'tbl_existing',
    data: {
      label: '短视频拆解表',
      title: '短视频拆解表',
      tableId: 'tbl_test123',
      tablePath: '.omnimux/tables/tbl_test123.htable',
      rowCount: 5,
      columnCount: 6,
      previewRows: ['镜头1：开场黄金钩子', '镜头2：沉浸使用演示'],
      status: 'ready',
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
    },
  });
});

test('已有关联记录但连线缺失：更新内容并补线', () => {
  const existingTableNode = {
    id: 'tbl_unlinked',
    type: 'table',
    position: { x: 570, y: 200 },
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_prev',
    },
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, existingTableNode],
      currentEdges: [], // 无连线
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'tbl_unlinked');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 1);
  assert.deepEqual(plan.addEdges[0], {
    id: 'edge_video_1_tbl_unlinked',
    source: 'video_1',
    target: 'tbl_unlinked',
    sourceHandle: 'out',
    targetHandle: 'in',
  });
  assert.equal(plan.nodePatches.length, 1);
});

test('其他视频节点的拆解表格不被误更新', () => {
  const otherTableNode = {
    id: 'tbl_other',
    type: 'table',
    position: { x: 600, y: 300 },
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_other', // 归属其他视频节点
    },
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, otherTableNode],
      createNodeId: () => 'tbl_mine',
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'tbl_mine');
  assert.equal(plan.nodePatches.length, 0);
});

test('单一下游约束：只要存在已连线的 table 节点（即使无 origin 标记），强制就地更新不产生新节点', () => {
  const genericTable = {
    id: 'tbl_manual',
    type: 'table',
    data: { label: '已有表格' },
  };
  const edge = {
    id: 'e1',
    source: 'video_1',
    target: 'tbl_manual',
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, genericTable],
      currentEdges: [edge],
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'tbl_manual');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.nodePatches.length, 1);
  assert.equal(plan.nodePatches[0].nodeId, 'tbl_manual');
  assert.equal(plan.nodePatches[0].data.tableId, 'tbl_test123');
});

test('已连线的分镜表节点（origin === video_storyboard）不被误认为是拆解表，必须创建新的拆解表节点', () => {
  const storyboardTable = {
    id: 'tbl_storyboard',
    type: 'table',
    position: { x: 570, y: 520 },
    data: {
      label: '视频分镜表',
      origin: 'video_storyboard',
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_sb_999',
    },
  };
  const edge = {
    id: 'edge_sb',
    source: 'video_1',
    target: 'tbl_storyboard',
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, storyboardTable],
      currentEdges: [edge],
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'tbl_test123');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addNodes[0].data.origin, VIDEO_DECONSTRUCT_ORIGIN);
  assert.equal(plan.nodePatches.length, 0);
});

test('未与该视频连线的普通表格节点不被判定为下游，创建新节点且 id 默认对齐 tableId', () => {
  const genericTable = {
    id: 'tbl_unrelated',
    type: 'table',
    data: { label: '无关表格' },
  };

  const plan = planVideoDeconstructDownstream(
    baseInput({
      currentNodes: [VIDEO_NODE, genericTable],
      currentEdges: [],
    }),
  );

  assert.ok(plan);
  assert.equal(plan.mode, 'create');
  // 未指定 createNodeId 时，直接对齐 tableResult.tableId
  assert.equal(plan.targetNodeId, 'tbl_test123');
  assert.equal(plan.addNodes[0].id, 'tbl_test123');
});

test('空输入守卫：空节点 id 或空 tableId 返回 null', () => {
  assert.equal(planVideoDeconstructDownstream(baseInput({ videoNodeId: '' })), null);
  assert.equal(
    planVideoDeconstructDownstream(
      baseInput({
        tableResult: {
          tableId: '',
          tablePath: '',
          rowCount: 0,
          columnCount: 0,
        },
      }),
    ),
    null,
  );
});

test('异常宽度回退 350，label 缺省为「视频拆解表」', () => {
  const plan = planVideoDeconstructDownstream(
    baseInput({
      videoNodeWidth: 0,
      label: undefined,
      tableResult: {
        tableId: 'tbl_default',
        tablePath: '.omnimux/tables/tbl_default.htable',
        title: undefined,
        rowCount: 1,
        columnCount: 1,
      },
      createNodeId: () => 'tbl_fallback',
    }),
  );

  assert.ok(plan);
  assert.equal(plan.addNodes[0].position.x, 100 + 350 + VIDEO_DECONSTRUCT_DOWNSTREAM_GAP);
  assert.equal(plan.addNodes[0].data.label, '视频拆解表');
});

/* -------------------------------------------------------------------------- */
/* 两阶段：provisioning（先建下游节点） + settlement（隔离执行收敛）             */
/* -------------------------------------------------------------------------- */

test('planVideoDeconstructProvisioning: 点击内容拆解立即创建 running/generating 下游 table 节点与 out→in 连线', () => {
  const sourceSnapshot = structuredClone(VIDEO_NODE);
  const input = baseInput({ createNodeId: () => 'node_table_new' });

  const plan = planVideoDeconstructProvisioning(input);

  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'node_table_new');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.nodePatches.length, 0);

  const node = plan.addNodes[0];
  assert.equal(node.id, 'node_table_new');
  assert.equal(node.type, 'table');
  assert.equal(node.selected, true);
  assert.deepEqual(node.position, {
    x: VIDEO_NODE.position.x + 350 + VIDEO_DECONSTRUCT_DOWNSTREAM_GAP,
    y: VIDEO_NODE.position.y,
  });
  assert.deepEqual(node.data, {
    label: '短视频拆解表',
    title: '短视频拆解表',
    materialType: 'table',
    status: 'generating',
    executionStatus: 'running',
    tableId: '',
    tablePath: '',
    columnCount: 0,
    rowCount: 0,
    previewRows: [],
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    sourceVideoNodeId: 'video_1',
  });

  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_video_1_node_table_new',
      source: 'video_1',
      target: 'node_table_new',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);

  // 源视频节点零写入：调用后节点数与内容均未变化
  assert.deepEqual(VIDEO_NODE, sourceSnapshot);
  assert.equal(input.currentNodes.length, 1);
  assert.equal('executionStatus' in VIDEO_NODE.data, false);
  assert.equal('executionError' in VIDEO_NODE.data, false);
});

test('planVideoDeconstructProvisioning: 默认 id 为 node_table_<ts>_<rand>，便于透传后端 targetNodeId', () => {
  const plan = planVideoDeconstructProvisioning(baseInput());
  assert.match(plan.targetNodeId, /^node_table_\d+_[a-z0-9]+$/);
  assert.equal(plan.addNodes[0].id, plan.targetNodeId);
});

test('planVideoDeconstructProvisioning: 重复执行 update 复用同一节点 id 并保留既有表格结果字段', () => {
  const existingTableNode = {
    id: 'node_table_existing',
    type: 'table',
    position: { x: 570, y: 200 },
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_prev',
      tablePath: '.omnimux/tables/tbl_prev.htable',
      rowCount: 3,
      columnCount: 4,
      status: 'failed',
      executionStatus: 'error',
      executionError: '上次失败',
    },
  };
  const edge = {
    id: 'edge_video_1_node_table_existing',
    source: 'video_1',
    target: 'node_table_existing',
    sourceHandle: 'out',
    targetHandle: 'in',
  };

  const plan = planVideoDeconstructProvisioning(
    baseInput({
      currentNodes: [VIDEO_NODE, existingTableNode],
      currentEdges: [edge],
    }),
  );

  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'node_table_existing');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0, '已连线时不重复加线');
  assert.equal(plan.nodePatches.length, 1);

  const patch = plan.nodePatches[0];
  assert.equal(patch.nodeId, 'node_table_existing');
  assert.equal(patch.data.label, '短视频拆解表');
  assert.equal(patch.data.title, '短视频拆解表');
  assert.equal(patch.data.materialType, 'table');
  assert.equal(patch.data.status, 'generating');
  assert.equal(patch.data.executionStatus, 'running');
  assert.equal(patch.data.executionError, undefined);
  assert.equal(patch.data.origin, VIDEO_DECONSTRUCT_ORIGIN);
  assert.equal(patch.data.sourceVideoNodeId, 'video_1');

  // 结果字段不在 patch 中，重试期间旧产物继续可用
  assert.equal('tableId' in patch.data, false);
  assert.equal('tablePath' in patch.data, false);
  assert.equal('rowCount' in patch.data, false);
  assert.equal('columnCount' in patch.data, false);
});

test('planVideoDeconstructProvisioning: update 时缺连线补 out→in 连线', () => {
  const existingTableNode = {
    id: 'node_table_unlinked',
    type: 'table',
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_prev',
    },
  };

  const plan = planVideoDeconstructProvisioning(
    baseInput({ currentNodes: [VIDEO_NODE, existingTableNode], currentEdges: [] }),
  );

  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'node_table_unlinked');
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_video_1_node_table_unlinked',
      source: 'video_1',
      target: 'node_table_unlinked',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);
});

test('planVideoDeconstructProvisioning: 下游节点 running/generating 时返回 noop 防抖', () => {
  const runningTableNode = {
    id: 'node_table_running',
    type: 'table',
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      executionStatus: 'running',
      status: 'generating',
    },
  };

  const plan = planVideoDeconstructProvisioning(
    baseInput({
      currentNodes: [VIDEO_NODE, runningTableNode],
      currentEdges: [{ source: 'video_1', target: 'node_table_running' }],
    }),
  );

  assert.deepEqual(plan, {
    mode: 'noop',
    targetNodeId: 'node_table_running',
    addNodes: [],
    addEdges: [],
    nodePatches: [],
  });
});

test('planVideoDeconstructProvisioning: 仅 status=generating（executionStatus 未同步）也返回 noop', () => {
  const generatingOnlyNode = {
    id: 'node_table_generating',
    type: 'table',
    data: {
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
      status: 'generating',
    },
  };

  const plan = planVideoDeconstructProvisioning(
    baseInput({ currentNodes: [VIDEO_NODE, generatingOnlyNode] }),
  );

  assert.equal(plan.mode, 'noop');
  assert.equal(plan.targetNodeId, 'node_table_generating');
});

test('planVideoDeconstructProvisioning: 已连线的分镜表节点不被误匹配，创建拆解表并上移避让', () => {
  const storyboardTable = {
    id: 'node_table_storyboard',
    type: 'table',
    position: { x: 570, y: 200 },
    data: {
      origin: 'video_storyboard',
      sourceVideoNodeId: 'video_1',
      tableId: 'tbl_storyboard',
    },
  };
  const edge = { id: 'edge_sb', source: 'video_1', target: 'node_table_storyboard' };

  const plan = planVideoDeconstructProvisioning(
    baseInput({
      currentNodes: [VIDEO_NODE, storyboardTable],
      currentEdges: [edge],
      createNodeId: () => 'node_table_deconstruct_new',
    }),
  );

  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'node_table_deconstruct_new');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addNodes[0].data.origin, VIDEO_DECONSTRUCT_ORIGIN);
  assert.deepEqual(plan.addNodes[0].position, {
    x: 570,
    y: VIDEO_NODE.position.y - 320,
  });
  assert.equal(plan.nodePatches.length, 0);
});

test('planVideoDeconstructSettlement: 成功时只 patch 目标节点并回填表格产物', () => {
  const plan = planVideoDeconstructSettlement({
    targetNodeId: 'node_table_1',
    label: '视频拆解表',
    tableResult: {
      tableId: 'tbl_final',
      tablePath: '.omnimux/tables/tbl_final.htable',
      title: '抖音爆款拆解',
      rowCount: 8,
      columnCount: 6,
      previewRows: [{ shot: '开场' }],
    },
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    sourceVideoNodeId: 'video_1',
  });

  assert.equal(plan.targetNodeId, 'node_table_1');
  assert.equal(plan.addNodes, undefined);
  assert.equal(plan.nodePatches.length, 1);
  assert.deepEqual(plan.nodePatches[0], {
    nodeId: 'node_table_1',
    data: {
      label: '抖音爆款拆解',
      title: '抖音爆款拆解',
      tableId: 'tbl_final',
      tablePath: '.omnimux/tables/tbl_final.htable',
      rowCount: 8,
      columnCount: 6,
      previewRows: [{ shot: '开场' }],
      status: 'ready',
      executionStatus: 'completed',
      executionError: undefined,
      executionUpstream: undefined,
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video_1',
    },
  });
});

test('planVideoDeconstructSettlement: 成功时缺省 previewRows/label 回退且不落未提供的归属键', () => {
  const plan = planVideoDeconstructSettlement({
    targetNodeId: 'node_table_2',
    tableResult: {
      tableId: 'tbl_min',
      tablePath: '.omnimux/tables/tbl_min.htable',
      rowCount: 1,
      columnCount: 2,
    },
  });

  const patch = plan.nodePatches[0].data;
  assert.equal(patch.label, '视频拆解表');
  assert.deepEqual(patch.previewRows, []);
  assert.equal('origin' in patch, false);
  assert.equal('sourceVideoNodeId' in patch, false);
});

test('planVideoDeconstructSettlement: 失败时落错误态，只 patch 目标节点且不伪造 tableId', () => {
  const plan = planVideoDeconstructSettlement({
    targetNodeId: 'node_table_3',
    error: '视频理解服务超时',
    upstream: 'hub',
  });

  assert.equal(plan.targetNodeId, 'node_table_3');
  assert.equal(plan.nodePatches.length, 1);
  assert.deepEqual(plan.nodePatches[0], {
    nodeId: 'node_table_3',
    data: {
      status: 'failed',
      executionStatus: 'error',
      executionError: '视频理解服务超时',
      executionUpstream: 'hub',
    },
  });
  assert.equal('tableId' in plan.nodePatches[0].data, false);
  assert.equal('tablePath' in plan.nodePatches[0].data, false);
});

test('planVideoDeconstructSettlement: 无结果且无错误时使用默认失败文案，仍不产生 tableId', () => {
  const plan = planVideoDeconstructSettlement({ targetNodeId: 'node_table_4' });
  const patch = plan.nodePatches[0].data;
  assert.equal(patch.status, 'failed');
  assert.equal(patch.executionStatus, 'error');
  assert.equal(patch.executionError, '视频拆解失败');
  assert.equal('tableId' in patch, false);
});
