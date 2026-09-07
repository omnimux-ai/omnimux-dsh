import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createCanvasWriteTableNodeTool, createCanvasGetTableNodeTool } from './tableTools.ts';
import { createWorkflowNodeRemoveTool } from './agentWriteTools.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import { resolveTableAbsPath } from '../storage/tablePath.ts';
import { createTableHarness, tableInput, seedTable, forbidTableIo } from './tableTools.test-support.mjs';

for (const bound of [false, true]) {
  test(`tableTools: CREATE -> GET -> REPLACE -> REMOVE with saved revisions (bound=${bound})`, async (t) => {
    const h = createTableHarness(t, { bound });
    const ws = h.store.create('表格测试画布');
    const write = createCanvasWriteTableNodeTool(h.deps);
    const get = createCanvasGetTableNodeTool(h.deps);
    const created = await write.execute({ workspace_id: ws.id, ...tableInput });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.created, true);
    assert.equal(created.columnCount, tableInput.columns.length);
    assert.equal(created.rowCount, tableInput.rows.length);
    assert.equal(created.contentRev, 1);
    const file = resolveTableAbsPath(h.store, ws.id, created.nodeId);
    assert.equal(existsSync(file), true);
    const node = h.store.get(ws.id).nodes.find((n) => n.id === created.nodeId);
    assert.equal(node.type, 'table');
    assert.equal(node.data.contentRev, created.contentRev);
    assert.equal(node.data.rowCount, 2);
    assert.equal(node.data.status, 'ready');
    const loaded = await get.execute({ workspace_id: ws.id, table_path: created.tablePath });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.contentRev, 1);
    assert.deepEqual(loaded.tableContent.rows, tableInput.rows);
    const replaced = await write.execute({
      workspace_id: ws.id, node_id: created.nodeId, table_path: created.tablePath,
      ...tableInput, title: '新分镜表',
      columns: [...tableInput.columns, { title: '备注', type: 'text' }],
      rows: [{ cells: [3, '第三镜头', '晨光'] }],
    });
    assert.equal(replaced.ok, true);
    assert.equal(replaced.created, false);
    assert.equal(replaced.contentRev, 2);
    const updated = h.store.get(ws.id).nodes.find((n) => n.id === created.nodeId);
    assert.equal(updated.data.contentRev, 2);
    assert.equal(updated.data.label, '新分镜表');
    assert.equal(updated.data.rowCount, 1);
    assert.equal(updated.data.columnCount, 3);
    assert.equal(replaced.columnCount, 3);
    assert.deepEqual(updated.data.previewRows, ['3']);
    assert.equal((await TableStorageService.loadTable(file)).contentRev, 2);
    const removed = await createWorkflowNodeRemoveTool(h.deps).execute({
      workspace_id: ws.id, node_ids: [created.nodeId],
    });
    assert.equal(removed.removedNodes, 1);
    assert.equal(h.store.get(ws.id).nodes.length, 0);
    assert.equal(existsSync(file), false);
  });
}

for (const operation of ['CREATE', 'REPLACE', 'GET']) {
  test(`tableTools: ${operation} resolves explicit > UI > unique name`, async (t) => {
    const h = createTableHarness(t);
    const workspaces = ['explicit', 'UI', 'name'].map((name) => h.store.create(name));
    for (const ws of workspaces) await seedTable(h, ws.id, 'tbl_shared', ws.name);
    const tool = operation === 'GET'
      ? createCanvasGetTableNodeTool(h.deps) : createCanvasWriteTableNodeTool(h.deps);
    for (let index = 0; index < workspaces.length; index++) {
      h.setActive(index < 2 ? workspaces[1].id : undefined);
      const result = await tool.execute({
        ...(operation === 'GET' ? {} : tableInput),
        ...(operation !== 'CREATE' ? { node_id: 'tbl_shared' } : {}),
        ...(index === 0 ? { workspace_id: workspaces[0].id } : {}),
        workspace_name: workspaces[2].name,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      if (operation === 'GET') {
        assert.equal(result.tableContent.title, workspaces[index].name);
      } else {
        const expected = h.store.get(workspaces[index].id).nodes.find((n) => n.id === result.nodeId);
        assert.ok(expected);
        assert.equal(expected.data.contentRev, result.contentRev);
        if (operation === 'CREATE') {
          assert.equal(h.store.get(workspaces[index].id).nodes.length, 2);
        } else {
          assert.equal(result.contentRev, 2);
        }
      }
    }
  });
}

for (const count of [0, 1, 2]) {
  test(`tableTools: no context does not select/create a workspace (${count} stored)`, async (t) => {
    const h = createTableHarness(t);
    for (let i = 0; i < count; i++) h.store.create(`workspace ${i}`);
    const before = h.store.list();
    const ioCalls = forbidTableIo(t);
    const write = createCanvasWriteTableNodeTool(h.deps);
    const get = createCanvasGetTableNodeTool(h.deps);
    for (const [tool, args] of [
      [write, tableInput], [write, { ...tableInput, node_id: 'tbl_missing' }],
      [get, { node_id: 'tbl_missing' }], [get, { table_path: '.omnimux/tables/tbl_missing.htable' }],
    ]) {
      assert.deepEqual(await tool.execute(args), {
        error: 'no-current-workspace', message: '未指定 workspace_id 且未打开任何工作流',
      });
    }
    assert.equal(ioCalls(), 0);
    assert.deepEqual(h.store.list(), before);
  });
}

test('tableTools: deleted explicit/UI targets and ambiguous names do not fall back', async (t) => {
  const h = createTableHarness(t);
  const live = h.store.create('live');
  const removed = h.store.create('removed');
  h.store.remove(removed.id);
  h.store.create('duplicate');
  h.store.create('duplicate');
  const ioCalls = forbidTableIo(t);
  for (const tool of [createCanvasWriteTableNodeTool(h.deps), createCanvasGetTableNodeTool(h.deps)]) {
    h.setActive(removed.id);
    assert.equal((await tool.execute({ ...tableInput, node_id: 'tbl_demo', workspace_name: live.name })).error,
      'workspace-not-found');
    h.setActive(live.id);
    assert.equal((await tool.execute({ ...tableInput, node_id: 'tbl_demo', workspace_id: removed.id })).error,
      'workspace-not-found');
    h.setActive(undefined);
    assert.equal((await tool.execute({ ...tableInput, node_id: 'tbl_demo', workspace_name: 'duplicate' })).error,
      'ambiguous-workspace-name');
    assert.equal((await tool.execute({ ...tableInput, node_id: 'tbl_demo', workspace_name: 'unknown' })).error,
      'workspace-not-found');
  }
  assert.equal(ioCalls(), 0);
});

test('tableTools: REPLACE missing or non-table nodes never saves an orphan', async (t) => {
  const h = createTableHarness(t);
  const ws = h.store.create('test');
  h.store.save(ws.id, { nodes: [{ id: 'not_table', type: 'text', position: { x: 0, y: 0 }, data: {} }] });
  const ioCalls = forbidTableIo(t);
  const tool = createCanvasWriteTableNodeTool(h.deps);
  const before = h.store.get(ws.id);
  for (const nodeId of ['tbl_missing', 'not_table']) {
    const result = await tool.execute({ ...tableInput, workspace_id: ws.id, node_id: nodeId });
    assert.equal(result.error, nodeId === 'tbl_missing' ? 'node-not-found' : 'invalid-args');
  }
  assert.equal(ioCalls(), 0);
  assert.deepEqual(h.store.get(ws.id), before);
});

test('tableTools: L1 metadata and response use the document returned by storage', async (t) => {
  const h = createTableHarness(t);
  const ws = h.store.create('test');
  t.mock.method(TableStorageService, 'saveTable', async () => ({
    contentRev: 7,
    document: {
      version: 1, contentRev: 7, title: 'Saved title',
      columns: [{ id: 'col_a', title: 'A', type: 'text', visible: true, width: 200 }],
      rows: [{ id: 'row_a', cells: { col_a: 'Saved preview' } }],
    },
  }));
  const result = await createCanvasWriteTableNodeTool(h.deps).execute({ workspace_id: ws.id, ...tableInput });
  assert.equal(result.ok, true);
  assert.equal(result.title, 'Saved title');
  assert.equal(result.contentRev, 7);
  assert.equal(result.rowCount, 1);
  assert.equal(result.columnCount, 1);
  const node = h.store.get(ws.id).nodes.find((row) => row.id === result.nodeId);
  assert.equal(node.data.contentRev, 7);
  assert.equal(node.data.title, 'Saved title');
  assert.deepEqual(node.data.previewRows, ['Saved preview']);
});

test('tableTools: REMOVE rejects unsafe table node ids before graph or file mutation', async (t) => {
  const h = createTableHarness(t);
  const ws = h.store.create('test');
  const nodeId = '../outside';
  h.store.save(ws.id, { nodes: [{ id: nodeId, type: 'table', position: { x: 0, y: 0 }, data: {} }] });
  const before = h.store.get(ws.id);
  const ioCalls = forbidTableIo(t);
  const result = await createWorkflowNodeRemoveTool(h.deps).execute({ workspace_id: ws.id, node_ids: [nodeId] });
  assert.equal(result.error, 'invalid-args');
  assert.equal(ioCalls(), 0);
  assert.deepEqual(h.store.get(ws.id), before);
});

test('tableTools: path traversal, absolutes and basename disguises are denied before table I/O', async (t) => {
  const h = createTableHarness(t);
  const ws = h.store.create('test');
  await seedTable(h, ws.id, 'tbl_demo');
  const before = h.store.get(ws.id);
  const ioCalls = forbidTableIo(t);
  const write = createCanvasWriteTableNodeTool(h.deps);
  const get = createCanvasGetTableNodeTool(h.deps);
  const invalidPaths = [
    '../tbl_demo.htable', '.omnimux/tables/../tbl_demo.htable', '/tmp/tbl_demo.htable',
    'C:\\tmp\\tbl_demo.htable', '\\\\server\\share\\tbl_demo.htable',
    '..\\tbl_demo.htable', '.omnimux/tables/%2e%2e/tbl_demo.htable',
    'elsewhere/tbl_demo.htable', 'tbl_demo.htable', '.omnimux/tables/tbl_demo.htable/extra',
  ];
  for (const tablePath of invalidPaths) {
    for (const args of [{ table_path: tablePath }, { node_id: 'tbl_demo', table_path: tablePath }]) {
      const read = await get.execute({ workspace_id: ws.id, ...args });
      assert.equal(read.error, 'invalid-args', JSON.stringify(read));
    }
    const saved = await write.execute({ ...tableInput, workspace_id: ws.id, node_id: 'tbl_demo', table_path: tablePath });
    assert.equal(saved.error, 'invalid-args', JSON.stringify(saved));
  }
  for (const nodeId of ['../outside', '/tmp/outside', '..\\outside', 'C:\\outside']) {
    assert.equal((await write.execute({ ...tableInput, workspace_id: ws.id, node_id: nodeId })).error, 'invalid-args');
    assert.equal((await get.execute({ workspace_id: ws.id, node_id: nodeId })).error, 'invalid-args');
  }
  for (const tool of [write, get]) {
    assert.deepEqual(await tool.execute({
      ...tableInput, workspace_id: ws.id, node_id: 'tbl_demo', table_path: '.omnimux/tables/tbl_other.htable',
    }), { error: 'invalid-args', message: 'node_id 与 table_path 指向不同的表格' });
  }
  assert.equal(ioCalls(), 0);
  assert.deepEqual(h.store.get(ws.id), before);
});
