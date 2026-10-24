/**
 * Issue 3659 契约：「创建可复用工作流模板」的范围解析。
 *
 * 组右键入口 = 该组直接子节点；入口卡（无分组）= 整块画布，且组内子节点绝对化、
 * 不留悬空 parentId/extent、连线两端必须都在范围内。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWorkflowTemplateScope } from './workflowTemplateScope.ts';

const GROUP_A = { id: 'g1', type: 'group', position: { x: 100, y: 200 }, data: { title: 'g1' } };
const CHILD_A = { id: 'a', type: 'text', parentId: 'g1', extent: 'parent', position: { x: 10, y: 20 }, data: { label: 'a' } };
const CHILD_B = { id: 'b', type: 'text', parentId: 'g1', extent: 'parent', position: { x: 30, y: 40 }, data: { label: 'b' } };
const TOP_C = { id: 'c', type: 'text', position: { x: 500, y: 600 }, data: { label: 'c' } };

test('3659：组范围只取该组直接子节点（非 group），坐标保持原样', () => {
  const nodes = [GROUP_A, CHILD_A, CHILD_B, TOP_C];
  const edges = [
    { id: 'a->b', source: 'a', target: 'b' },
    { id: 'a->c', source: 'a', target: 'c' },
  ];

  const scope = resolveWorkflowTemplateScope(nodes, edges, 'g1');
  assert.deepEqual(scope.nodes.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(scope.nodes[0].position, { x: 10, y: 20 });
  assert.equal(scope.nodes[0].parentId, 'g1');
  assert.deepEqual(scope.edges.map((item) => item.id), ['a->b']);
  assert.equal(scope.nodeCount, 2);
});

test('3659：无分组 = 整块画布，组内子节点绝对化且不留悬空父引用', () => {
  const nodes = [
    GROUP_A,
    CHILD_A,
    TOP_C,
    { id: 'd', type: 'text', parentId: 'g2', extent: 'parent', position: { x: 5, y: 5 }, data: { label: 'd' } },
  ];
  const edges = [
    { id: 'a->c', source: 'a', target: 'c' },
    { id: 'c->d', source: 'c', target: 'd' },
  ];

  const scope = resolveWorkflowTemplateScope(nodes, edges, null);
  assert.deepEqual(scope.nodes.map((item) => item.id), ['a', 'c', 'd']);
  assert.equal(scope.nodeCount, 3);

  const childA = scope.nodes.find((item) => item.id === 'a');
  assert.deepEqual(childA.position, { x: 110, y: 220 });
  assert.equal('parentId' in childA, false);
  assert.equal('extent' in childA, false);

  const topC = scope.nodes.find((item) => item.id === 'c');
  assert.deepEqual(topC.position, { x: 500, y: 600 });

  const orphanD = scope.nodes.find((item) => item.id === 'd');
  assert.deepEqual(orphanD.position, { x: 5, y: 5 });

  assert.deepEqual(scope.edges.map((item) => item.id), ['a->c', 'c->d']);
});

test('3659：空画布（只有组容器）范围为 0，调用方据此拦截保存', () => {
  const scope = resolveWorkflowTemplateScope([GROUP_A], [], null);
  assert.deepEqual(scope.nodes, []);
  assert.deepEqual(scope.edges, []);
  assert.equal(scope.nodeCount, 0);
});

test('3659：连线只保留两端都在范围内者', () => {
  const nodes = [
    TOP_C,
    { id: 'e', type: 'text', position: { x: 1, y: 1 }, data: { label: 'e' } },
    { id: 'gx', type: 'group', position: { x: 2, y: 2 }, data: { title: 'gx' } },
  ];
  const edges = [
    { id: 'c->e', source: 'c', target: 'e' },
    { id: 'gx->c', source: 'gx', target: 'c' },
  ];
  const scope = resolveWorkflowTemplateScope(nodes, edges, null);
  assert.deepEqual(scope.edges.map((item) => item.id), ['c->e']);
});
