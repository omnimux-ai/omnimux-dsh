/**
 * 端到端契约测试：视频节点工具栏「先建下游节点 + 隔离执行」。
 *
 * 验收目标（跨真实源文件 + 纯函数规划器，不只是单文件字符串）：
 * 1. 内容拆解 / 分镜表在点击瞬间由客户端规划器预建下游表格节点（running + generating + out→in 连线），
 *    源视频节点数据零写入（不出现 executionStatus / executionError / status 变化）。
 * 2. 下游节点已在下游执行中时重复点击只防抖（noop），不新增节点。
 * 3. 结算只 patch 目标表格节点：成功回填表格产物，失败落错误态且不伪造 tableId。
 * 4. 内容拆解与分镜表两个 origin 严格隔离，不误匹配/覆盖对方的下游节点。
 * 5. 执行链路把客户端预建节点 id 作为 targetNodeId 透传后端，服务端原样复用为表格节点 id，
 *    避免出现「预建节点 + 服务端另建节点」双节点。
 * 6. 源视频节点处理函数不再写 running / error（与 #1146 提取音频同一隔离契约）。
 * 7. 派生表格节点复用 GenerationStateContainer 渲染生成中/失败态，并提供失败重试入口。
 *
 * 说明：本文件是源码 + 纯函数契约测试，不是浏览器验收证据；真实浏览器验收在本环境
 * 受宿主 App 版本漂移阻断，见 docs/evidence/video-toolbar-isolated/browser-acceptance-attempt.md。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  planVideoDeconstructProvisioning,
  planVideoDeconstructSettlement,
  VIDEO_DECONSTRUCT_ORIGIN,
} from '../src/canvas/editor/utils/planVideoDeconstructDownstream.ts';
import {
  planVideoStoryboardProvisioning,
  VIDEO_STORYBOARD_ORIGIN,
} from '../src/canvas/editor/utils/planVideoStoryboardDownstream.ts';
import { parseDeconstructVideoRequest } from '../src/workflow/videoDeconstruct/schema.ts';
import { parseStoryboardVideoRequest } from '../src/workflow/videoStoryboard/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '..');

const nodeSrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/MaterialNode/index.tsx'),
  'utf8',
);
const operationsSrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/MaterialNode/nodeMediaOperations.ts'),
  'utf8',
);
const tableNodeSrc = readFileSync(
  join(pluginRoot, 'src/canvas/components/table-node/TableNode.tsx'),
  'utf8',
);
const apiClientSrc = readFileSync(join(pluginRoot, 'src/canvas/bridge/apiClient.ts'), 'utf8');

function videoNode() {
  return {
    id: 'video-1',
    type: 'material',
    position: { x: 100, y: 200 },
    data: {
      label: '源视频',
      materialType: 'video',
      status: 'completed',
      relativePath: 'assets/imported/a.mp4',
      __workspaceId: 'ws-1',
    },
  };
}

function storyboardDownstream() {
  return {
    id: 'table-sb',
    type: 'table',
    position: { x: 510, y: 520 },
    data: {
      label: '旧分镜表',
      materialType: 'table',
      origin: VIDEO_STORYBOARD_ORIGIN,
      sourceVideoNodeId: 'video-1',
      status: 'ready',
      executionStatus: 'completed',
      tableId: 'tbl-sb',
      tablePath: '.omnimux/tables/tbl-sb.htable',
      rowCount: 3,
      columnCount: 2,
      previewRows: ['镜头 1'],
    },
  };
}

function deconstructDownstream() {
  return {
    id: 'table-dc',
    type: 'table',
    position: { x: 510, y: 200 },
    data: {
      label: '旧拆解表',
      materialType: 'table',
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: 'video-1',
      status: 'ready',
      executionStatus: 'completed',
      tableId: 'tbl-dc',
      tablePath: '.omnimux/tables/tbl-dc.htable',
      rowCount: 2,
      columnCount: 2,
      previewRows: ['维度'],
    },
  };
}

function edgeTo(target) {
  return {
    id: 'edge_video-1_' + target,
    source: 'video-1',
    target,
    sourceHandle: 'out',
    targetHandle: 'in',
  };
}

test('E2E A1: 内容拆解点击瞬间预建下游表格节点，源视频节点零写入', () => {
  const source = videoNode();
  const sourceBefore = JSON.stringify(source.data);
  const plan = planVideoDeconstructProvisioning({
    videoNodeId: 'video-1',
    videoPosition: source.position,
    videoNodeWidth: 350,
    label: '源视频 内容拆解表',
    currentNodes: [source],
    currentEdges: [],
  });

  assert.equal(plan.mode, 'create');
  assert.equal(plan.addNodes.length, 1);
  const created = plan.addNodes[0];
  assert.equal(created.type, 'table');
  assert.match(created.id, /^node_table_\d+_[a-z0-9]+$/, '客户端预建节点 id 必须可直接透传后端');
  assert.equal(created.data.origin, VIDEO_DECONSTRUCT_ORIGIN);
  assert.equal(created.data.sourceVideoNodeId, 'video-1');
  assert.equal(created.data.executionStatus, 'running');
  assert.equal(created.data.status, 'generating');
  assert.equal(created.position.x, 570);
  assert.equal(created.position.y, 200);
  assert.equal(plan.addEdges.length, 1);
  assert.equal(plan.addEdges[0].sourceHandle, 'out');
  assert.equal(plan.addEdges[0].targetHandle, 'in');
  assert.equal(plan.addEdges[0].target, created.id);
  // 源视频节点数据在规划阶段完全不被触碰
  assert.equal(JSON.stringify(source.data), sourceBefore);
  assert.equal('executionStatus' in source.data, false);
});

test('E2E A2: 分镜表点击瞬间预建独立下游表格节点，并与拆解表严格隔离', () => {
  const source = videoNode();
  const deconstruct = deconstructDownstream();
  const plan = planVideoStoryboardProvisioning({
    videoNodeId: 'video-1',
    videoPosition: source.position,
    videoNodeWidth: 350,
    label: '源视频 分镜表',
    currentNodes: [source, deconstruct],
    currentEdges: [edgeTo(deconstruct.id)],
  });

  assert.equal(plan.mode, 'create', '已有拆解表时，分镜表仍须新建自己的下游节点');
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addNodes[0].data.origin, VIDEO_STORYBOARD_ORIGIN);
  assert.equal(plan.addNodes[0].data.executionStatus, 'running');
  assert.equal(plan.addNodes[0].position.y, 520);
  assert.notEqual(plan.addNodes[0].id, deconstruct.id);
});

test('E2E A3/A5: 已有下游节点复用且执行中重复点击只防抖', () => {
  const source = videoNode();
  const existing = deconstructDownstream();
  const update = planVideoDeconstructProvisioning({
    videoNodeId: 'video-1',
    videoPosition: source.position,
    videoNodeWidth: 350,
    label: '源视频 内容拆解表',
    currentNodes: [source, existing],
    currentEdges: [edgeTo(existing.id)],
  });
  assert.equal(update.mode, 'update');
  assert.equal(update.targetNodeId, 'table-dc');
  assert.equal(update.addNodes.length, 0, '重复点击不得新增第二个下游节点');
  assert.equal(update.nodePatches.length, 1);
  assert.equal(update.nodePatches[0].data.executionStatus, 'running');

  const running = deconstructDownstream();
  running.data.status = 'generating';
  running.data.executionStatus = 'running';
  const noop = planVideoDeconstructProvisioning({
    videoNodeId: 'video-1',
    videoPosition: source.position,
    videoNodeWidth: 350,
    currentNodes: [source, running],
    currentEdges: [edgeTo(running.id)],
  });
  assert.equal(noop.mode, 'noop');
  assert.equal(noop.addNodes.length, 0);
  assert.equal(noop.nodePatches.length, 0);
});

test('E2E A3/A4: 结算只 patch 目标节点，失败不伪造 tableId', () => {
  const success = planVideoDeconstructSettlement({
    targetNodeId: 'node_table_1',
    label: '源视频 内容拆解表',
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    sourceVideoNodeId: 'video-1',
    tableResult: {
      tableId: 'node_table_1',
      tablePath: '.omnimux/tables/node_table_1.htable',
      title: '源视频 内容拆解表',
      rowCount: 5,
      columnCount: 2,
      previewRows: ['画面主体'],
    },
  });
  assert.equal(success.nodePatches.length, 1);
  assert.equal(success.nodePatches[0].nodeId, 'node_table_1');
  assert.equal(success.nodePatches[0].data.tableId, 'node_table_1');
  assert.equal(success.nodePatches[0].data.rowCount, 5);
  assert.equal(success.nodePatches[0].data.executionStatus, 'completed');
  assert.equal(success.nodePatches[0].data.status, 'ready');
  assert.equal(success.nodePatches[0].data.origin, VIDEO_DECONSTRUCT_ORIGIN);

  const failed = planVideoDeconstructSettlement({
    targetNodeId: 'node_table_1',
    error: '视频理解能力不可用',
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    sourceVideoNodeId: 'video-1',
  });
  assert.equal(failed.nodePatches[0].nodeId, 'node_table_1');
  assert.equal(failed.nodePatches[0].data.executionStatus, 'error');
  assert.equal(failed.nodePatches[0].data.status, 'failed');
  assert.equal(failed.nodePatches[0].data.executionError, '视频理解能力不可用');
  assert.equal('tableId' in failed.nodePatches[0].data, false, '失败结算不得伪造 tableId');
});

test('E2E A1/A2: 源视频工具栏两个处理函数都走 deriveVideoTable，不再写源节点 running/error', () => {
  const deconstructStart = nodeSrc.indexOf('const handleDeconstructVideo = useCallback');
  const storyboardStart = nodeSrc.indexOf('const handleStoryboardVideo = useCallback');
  assert.ok(deconstructStart > 0);
  assert.ok(storyboardStart > deconstructStart);
  const deconstructBlock = nodeSrc.slice(deconstructStart, storyboardStart);
  const storyboardEnd = nodeSrc.indexOf('const handleRetryAudioExtract', storyboardStart);
  const storyboardBlock = nodeSrc.slice(storyboardStart, storyboardEnd);

  const blocks = [deconstructBlock, storyboardBlock];
  for (const block of blocks) {
    assert.match(block, /deriveVideoTable\(\{/);
    assert.doesNotMatch(block, /updateNodeData\(\{\s*executionStatus/, '源视频节点绝不写 running/error');
  }
  assert.match(deconstructBlock, /kind:\s*'deconstruct'/);
  assert.match(storyboardBlock, /kind:\s*'storyboard'/);
  assert.doesNotMatch(nodeSrc, /executeDeconstructVideo\b/, '旧的就地执行入口必须移除');
  assert.doesNotMatch(nodeSrc, /executeStoryboardVideo\b/);
});

test('E2E A7: 执行链路透传 targetNodeId，服务端原样复用客户端预建节点 id', () => {
  const deriveStart = operationsSrc.indexOf('export async function deriveVideoTable');
  const retryStart = operationsSrc.indexOf('export function retryDerivedTableNode');
  assert.ok(deriveStart > 0);
  assert.ok(retryStart > deriveStart);
  const deriveBlock = operationsSrc.slice(deriveStart, retryStart);

  assert.match(deriveBlock, /planVideoDeconstructProvisioning\(/);
  assert.match(deriveBlock, /planVideoStoryboardProvisioning\(/);
  assert.match(deriveBlock, /const targetNodeId = provisioning\.targetNodeId/);
  assert.match(deriveBlock, /targetNodeId,/);
  assert.doesNotMatch(deriveBlock, /updateNodeData\(\{\s*executionStatus/, '派生执行不得写源视频节点状态');
  // 成功路径不得整图 hydrate：客户端已持有预建节点与连线，整图灌回会让 React Flow 用内部
  // 旧快照发出 replace 变更，把下游节点重新写回 running（真实浏览器实测复现）。
  assert.doesNotMatch(deriveBlock, /applyServerWorkspaceGraph|hydrateGraph/, '成功路径必须只结算目标节点');
  assert.match(deriveBlock, /applyDerivedTableSettlement\(kind, \{[\s\S]{0,240}tableResult,/, '成功路径必须就地结算目标节点');

  // 两个 API 客户端都声明了 targetNodeId 载荷字段
  const deconstructApi = apiClientSrc.indexOf('export function deconstructVideo');
  const storyboardApi = apiClientSrc.indexOf('export function storyboardVideo');
  const extractAudioApi = apiClientSrc.indexOf('export function extractAudioFromVideo');
  const deconstructApiBlock = apiClientSrc.slice(deconstructApi, storyboardApi);
  const storyboardApiBlock = apiClientSrc.slice(storyboardApi, extractAudioApi);
  assert.match(deconstructApiBlock, /targetNodeId\?: string/);
  assert.match(storyboardApiBlock, /targetNodeId\?: string/);

  // 服务端 schema 接受合法 targetNodeId 并透传
  const parsed = parseDeconstructVideoRequest({
    nodeId: 'video-1',
    videoPath: '/tmp/a.mp4',
    targetNodeId: 'node_table_1700000000000_ab12',
  });
  assert.equal(parsed.targetNodeId, 'node_table_1700000000000_ab12');
  const parsedStoryboard = parseStoryboardVideoRequest({
    nodeId: 'video-1',
    videoPath: '/tmp/a.mp4',
    targetNodeId: 'node_table_1700000000000_cd34',
  });
  assert.equal(parsedStoryboard.targetNodeId, 'node_table_1700000000000_cd34');
});

test('E2E A7: 服务端拒绝非法 targetNodeId，避免路径穿越/跨节点夺用', () => {
  const invalidValues = ['../evil', 'a/b', 'a b', '-lead', 'x'.repeat(129)];
  for (const bad of invalidValues) {
    assert.throws(
      () => parseDeconstructVideoRequest({ nodeId: 'video-1', videoPath: '/tmp/a.mp4', targetNodeId: bad }),
      /targetNodeId/,
      'deconstruct 必须拒绝非法 targetNodeId: ' + bad,
    );
    assert.throws(
      () => parseStoryboardVideoRequest({ nodeId: 'video-1', videoPath: '/tmp/a.mp4', targetNodeId: bad }),
      /targetNodeId/,
      'storyboard 必须拒绝非法 targetNodeId: ' + bad,
    );
  }
  const omitted = parseDeconstructVideoRequest({ nodeId: 'video-1', videoPath: '/tmp/a.mp4', targetNodeId: '   ' });
  assert.equal(omitted.targetNodeId, undefined, '空白 targetNodeId 视为未提供');
});

test('E2E A8: 派生表格节点复用 GenerationStateContainer 显示生成中/失败态并可重试', () => {
  assert.match(tableNodeSrc, /GenerationStateContainer/);
  assert.match(tableNodeSrc, /video_deconstruct/);
  assert.match(tableNodeSrc, /video_storyboard/);
  assert.match(tableNodeSrc, /retryDerivedTableNode/);
  assert.match(tableNodeSrc, /derivedExecutionStatus === 'running'/);
  assert.match(tableNodeSrc, /generationStatus === 'failed' \? handleRetryDerived : undefined/);
  assert.match(operationsSrc, /export function retryDerivedTableNode/);
});
