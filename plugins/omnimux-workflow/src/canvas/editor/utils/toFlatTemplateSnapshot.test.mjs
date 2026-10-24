/**
 * Issue 3662 契约：落库前的模板扁平化。
 *
 * 模板里没有组容器，所以任何 `parentId`/`extent` 都是悬空父引用；两个范围（组 / 整块画布）
 * 共用这一个落库前的扁平化，且必须幂等。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toFlatTemplateSnapshot } from './workflowTemplateScope.ts';

test('3662：组范围形状的节点被剥掉 parentId/extent，其余字段原样', () => {
  const child = {
    id: 'a',
    type: 'text',
    parentId: 'g1',
    extent: 'parent',
    position: { x: 10, y: 20 },
    data: { label: 'a' },
    selected: false,
  };

  const flat = toFlatTemplateSnapshot([child]);
  assert.equal(flat.length, 1);
  assert.equal('parentId' in flat[0], false);
  assert.equal('extent' in flat[0], false);
  assert.deepEqual(flat[0], {
    id: 'a',
    type: 'text',
    position: { x: 10, y: 20 },
    data: { label: 'a' },
    selected: false,
  });
  assert.deepEqual(flat[0].position, { x: 10, y: 20 });
});

test('3662：已扁平的节点原样返回（幂等）', () => {
  const top = { id: 'b', type: 'text', position: { x: 500, y: 600 }, data: { label: 'b' } };

  const once = toFlatTemplateSnapshot([top]);
  const twice = toFlatTemplateSnapshot(once);
  assert.equal(once[0], top);
  assert.deepEqual(twice, once);
});

test('3662：parentId 为 null 的节点同样被剥掉（xyflow 允许 null）', () => {
  const orphan = { id: 'c', type: 'text', parentId: null, position: { x: 1, y: 2 }, data: { label: 'c' } };

  const flat = toFlatTemplateSnapshot([orphan]);
  assert.equal('parentId' in flat[0], false);
  assert.deepEqual(flat[0], { id: 'c', type: 'text', position: { x: 1, y: 2 }, data: { label: 'c' } });
});
