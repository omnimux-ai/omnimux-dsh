/**
 * videoCompositionStatus 纯函数单测（T1）。
 *
 * 断言范围：
 * 1. 状态映射矩阵（Badge / Generation / View 三条），含 hasOutput 组合分支；
 * 2. 格式化边界（时长：正常 / 取整 / 零 / 非法；分辨率：缺失 / 合法）；
 * 3. projectFileName 清洗（非法字符折叠、CJK 保留、截断、空兜底）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatResolution,
  mapVideoCompositionToBadge,
  mapVideoCompositionToGeneration,
  mapVideoCompositionToView,
  projectFileName,
} from './videoCompositionStatus.ts';

// .mjs 由 node --test 直跑：不要出现 import type（Node 不对 .mjs 做类型剥离）
const ALL_STATUSES = ['idle', 'editing', 'rendering', 'completed', 'error'];

// ==================== Badge 映射矩阵 ====================

test('mapVideoCompositionToBadge：五种状态全矩阵', () => {
  assert.equal(mapVideoCompositionToBadge('completed'), 'completed');
  assert.equal(mapVideoCompositionToBadge('rendering'), 'generating');
  assert.equal(mapVideoCompositionToBadge('editing'), undefined);
  assert.equal(mapVideoCompositionToBadge('error'), 'failed');
  assert.equal(mapVideoCompositionToBadge('idle'), undefined);
});

// ==================== Generation 映射矩阵 ====================

test('mapVideoCompositionToGeneration：五种状态全矩阵', () => {
  assert.equal(mapVideoCompositionToGeneration('completed'), 'completed');
  assert.equal(mapVideoCompositionToGeneration('rendering'), 'generating');
  assert.equal(mapVideoCompositionToGeneration('editing'), null);
  assert.equal(mapVideoCompositionToGeneration('error'), 'failed');
  assert.equal(mapVideoCompositionToGeneration('idle'), null);
});

// ==================== View 映射矩阵（含 hasOutput 分支） ====================

test('mapVideoCompositionToView：错误态优先 error，且与 hasOutput 无关', () => {
  assert.equal(mapVideoCompositionToView('error', false), 'error');
  assert.equal(mapVideoCompositionToView('error', true), 'error');
});

test('mapVideoCompositionToView：渲染态固定 rendering，与 hasOutput 无关', () => {
  assert.equal(mapVideoCompositionToView('rendering', false), 'rendering');
  assert.equal(mapVideoCompositionToView('rendering', true), 'rendering');
});

test('mapVideoCompositionToView：completed/idle/editing 始终 launcher，与 hasOutput 无关', () => {
  assert.equal(mapVideoCompositionToView('completed', true), 'launcher');
  assert.equal(mapVideoCompositionToView('completed', false), 'launcher');
  assert.equal(mapVideoCompositionToView('idle', true), 'launcher');
  assert.equal(mapVideoCompositionToView('idle', false), 'launcher');
  assert.equal(mapVideoCompositionToView('editing', true), 'launcher');
  assert.equal(mapVideoCompositionToView('editing', false), 'launcher');
});

test('mapVideoCompositionToView：映射不抛异常且返回值都在三分支集合内', () => {
  const branches = new Set(['rendering', 'error', 'launcher']);
  for (const status of ALL_STATUSES) {
    for (const hasOutput of [false, true]) {
      const view = mapVideoCompositionToView(status, hasOutput);
      assert.ok(branches.has(view), `未知分支：${status}/${hasOutput} → ${view}`);
    }
  }
});

// ==================== formatDuration 边界 ====================

test('formatDuration：正常值与零', () => {
  assert.equal(formatDuration(0), '00:00.000');
  assert.equal(formatDuration(65_000), '01:05.000');
  assert.equal(formatDuration(61_234), '01:01.234');
  assert.equal(formatDuration(3_599_999), '59:59.999');
});

test('formatDuration：毫秒取整（Math.round）', () => {
  assert.equal(formatDuration(999.4), '00:00.999');
  assert.equal(formatDuration(1000.6), '00:01.001');
});

test('formatDuration：非法输入兜底占位符', () => {
  assert.equal(formatDuration(undefined), '—');
  assert.equal(formatDuration(Number.NaN), '—');
  assert.equal(formatDuration(-1), '—');
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), '—');
});

// ==================== formatResolution 边界 ====================

test('formatResolution：合法与缺失维度', () => {
  assert.equal(formatResolution(1920, 1080), '1920×1080');
  assert.equal(formatResolution(720), '—');
  assert.equal(formatResolution(undefined, 1080), '—');
  assert.equal(formatResolution(0, 1080), '—');
  assert.equal(formatResolution(undefined, undefined), '—');
});

// ==================== projectFileName ====================

test('projectFileName：非法字符折叠、CJK 保留、-/. 放行语义', () => {
  assert.equal(projectFileName('我的 视频!@#$%'), '我的_视频_');
  // 旧函数原样迁移：连字符与点属于白名单（文件名片段分隔符），原样保留
  assert.equal(projectFileName('final-cut v2'), 'final-cut_v2');
  assert.equal(projectFileName('a.b-1_2'), 'a.b-1_2');
});

test('projectFileName：截断 48 字符与空兜底', () => {
  assert.equal(projectFileName('a'.repeat(60)).length, 48);
  assert.equal(projectFileName(''), 'clip');
  // 旧函数行为原样迁移：纯符号串折叠为下划线后仍为真值，不回退 'clip'
  assert.equal(projectFileName('!!!'), '_');
});

// ==================== 状态流转与产物联动契约 ====================

test('状态流转：save 事件触发后状态从 rendering/editing 转换为 completed，视图仍保持 launcher', () => {
  // 模拟从 editing 阶段开始：编辑态下为静态交互，不展示运行中徽标（undefined），视图保持 launcher
  const editingStatus = 'editing';
  const hasOutputBefore = false;
  assert.equal(mapVideoCompositionToView(editingStatus, hasOutputBefore), 'launcher');
  assert.equal(mapVideoCompositionToBadge(editingStatus), undefined);

  // 模拟导出进行中 rendering 阶段：真正后台渲染时才展示 generating 徽标，视图切至 rendering
  const renderingStatus = 'rendering';
  assert.equal(mapVideoCompositionToView(renderingStatus, hasOutputBefore), 'rendering');
  assert.equal(mapVideoCompositionToBadge(renderingStatus), 'generating');

  // 模拟监听到 onSave 事件，output.videoPath 写入
  const savePayload = {
    nodeId: 'node_comp_1',
    createDownstreamNode: true,
    output: {
      videoPath: '/exports/final_render.mp4',
      thumbnailPath: 'data:image/jpeg;base64,thumb_data',
      durationMs: 12500,
      width: 1920,
      height: 1080,
    },
  };

  const nextStatus = savePayload.output.videoPath ? 'completed' : 'idle';
  const hasOutputAfter = Boolean(savePayload.output.videoPath);

  assert.equal(nextStatus, 'completed');
  assert.equal(hasOutputAfter, true);
  assert.equal(mapVideoCompositionToView(nextStatus, hasOutputAfter), 'launcher');
  assert.equal(mapVideoCompositionToBadge(nextStatus), 'completed');
  assert.equal(formatDuration(savePayload.output.durationMs), '00:12.500');
  assert.equal(formatResolution(savePayload.output.width, savePayload.output.height), '1920×1080');
});

test('下游连线：save 事件携带 createDownstreamNode 时的目标节点与边数据契约', async () => {
  const { planClipExportDownstream } = await import('./videoCompositionDownstream.ts');
  const plan = planClipExportDownstream({
    sourceNodeId: 'node_comp_1',
    sourcePosition: { x: 100, y: 200 },
    sourceLabel: '视频合成',
    output: {
      videoPath: '/data/renders/project_123.mp4',
      thumbnailPath: 'data:image/jpeg;base64,cover',
      durationMs: 30000,
      width: 3840,
      height: 2160,
    },
    currentNodes: [],
    currentEdges: [],
    nodeWidth: 350,
    createNodeId: () => 'node_mat_vid_test_1',
  });

  assert.ok(plan);
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addEdges.length, 1);
  assert.equal(plan.addNodes[0].type, 'material');
  assert.equal(plan.addNodes[0].data.materialType, 'video');
  assert.equal(plan.addNodes[0].data.realPath, '/data/renders/project_123.mp4');
  assert.equal(plan.addNodes[0].position.x, 530);
  assert.equal(plan.addNodes[0].position.y, 200);
  assert.equal(plan.addEdges[0].sourceHandle, 'out');
  assert.equal(plan.addEdges[0].targetHandle, 'in');
});