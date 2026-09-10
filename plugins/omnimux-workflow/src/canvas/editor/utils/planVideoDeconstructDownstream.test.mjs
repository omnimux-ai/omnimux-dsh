/**
 * planVideoDeconstructDownstream 纯函数单测。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_DECONSTRUCT_DOWNSTREAM_GAP,
  VIDEO_DECONSTRUCT_ORIGIN,
  planVideoDeconstructDownstream,
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
