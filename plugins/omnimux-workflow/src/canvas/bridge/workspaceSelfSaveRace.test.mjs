/**
 * 自撞竞态：版本探测与本地捕获不同源。判定必须用「当前」本地图，
 * 而不是探测前的旧快照；远端 == 上次已存时不得判成冲突。
 *
 * 门禁说明：本文件不使用展开语法（SpreadElement 被判为执行风险），
 * 一律用 concat / Object.assign 构造用例数据。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideRemoteVersionAdvance } from './persistConflict.ts';
import { signatureOf } from './persistSanitize.ts';

const WS = 'ws_race00000001';

/**
 * 本地适配：只有节点/边时先按同一套 sanitize+签名算两边签名，再走唯一判定入口。
 * `workspaceId` 必填——漏传会让签名与 hook 不一致（Issue #3601 删掉的正是这个陷阱）。
 */
function planRemoteReconcile(input) {
  if (!input.workspaceId) throw new Error('workspaceId is required for reconcile signatures');
  const currentSignature = signatureOf(input.currentNodes, input.currentEdges, {
    workspaceId: input.workspaceId,
  });
  const remoteSignature = signatureOf(input.remoteNodes, input.remoteEdges, {
    workspaceId: input.workspaceId,
  });
  return {
    decision: decideRemoteVersionAdvance({
      localSignature: currentSignature,
      lastSavedSignature: input.lastSavedSignature,
      remoteSignature,
    }),
    currentSignature,
    remoteSignature,
  };
}

function materialNode(id, extra) {
  return {
    id,
    type: 'material',
    position: { x: 100, y: 100 },
    data: Object.assign({
      materialType: 'image',
      nodeKind: 'generate',
      status: 'ready',
      selectedTool: 'image-generation',
    }, extra || {}),
  };
}

const beforeImport = [
  materialNode('n-text', { materialType: 'text', nodeKind: 'import' }),
  materialNode('n-video', {}),
];

const importedNode = {
  id: 'n-imported',
  type: 'material',
  position: { x: 200, y: 200 },
  selected: true,
  width: 350,
  data: {
    materialType: 'image',
    nodeKind: 'import',
    status: 'ready',
    relativePath: 'assets/subjects/ast_demo/exec-1316.png',
    realPath: '/Users/me/Pictures/exec-1316.png',
    assetId: 'ast_demo_1',
    mediaUrl: 'blob:http://127.0.0.1:45120/deadbeef',
  },
};

const afterImport = beforeImport.concat([importedNode]);
const beforeSig = signatureOf(beforeImport, [], { workspaceId: WS });
const afterSig = signatureOf(afterImport, [], { workspaceId: WS });

test('远端 == 上次已存、本地又多出导入节点 → resave，不弹冲突条', () => {
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: afterImport,
    currentEdges: [],
    remoteNodes: beforeImport,
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'resave');
  assert.equal(plan.currentSignature, afterSig);
  assert.equal(plan.remoteSignature, beforeSig);
});

test('远端只落后一条边（既非当前图也非已存图）→ conflict', () => {
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: afterImport,
    currentEdges: [{ id: 'e-1', source: 'n-video', target: 'n-imported' }],
    remoteNodes: afterImport,
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'conflict');
});

test('远端已经包含当前本地图（自己的 PUT 先落地）→ adopt', () => {
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: afterImport,
    currentEdges: [],
    remoteNodes: afterImport,
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'adopt');
});

test('远端是别人新增的节点、本地也脏 → conflict（不吞别人的写入）', () => {
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: afterImport,
    currentEdges: [],
    remoteNodes: beforeImport.concat([materialNode('n-remote-agent', {})]),
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'conflict');
});

test('本地干净、远端推进 → reload', () => {
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: beforeImport,
    currentEdges: [],
    remoteNodes: beforeImport.concat([materialNode('n-remote-agent', {})]),
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'reload');
});

test('选中态 / 绝对路径 / blob 预览不参与判定', () => {
  const selectedText = materialNode('n-text', { materialType: 'text', nodeKind: 'import' });
  selectedText.selected = true;
  const blobUrlNode = JSON.parse(JSON.stringify(importedNode));
  blobUrlNode.selected = false;
  blobUrlNode.data.realPath = '/tmp/another.png';
  const plan = planRemoteReconcile({
    workspaceId: WS,
    currentNodes: [selectedText, materialNode('n-video', {}), blobUrlNode],
    currentEdges: [],
    remoteNodes: afterImport,
    remoteEdges: [],
    lastSavedSignature: beforeSig,
  });
  assert.equal(plan.decision, 'adopt');
});
