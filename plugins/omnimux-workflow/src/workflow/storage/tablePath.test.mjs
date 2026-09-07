import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  extractTableIdFromRelPath, resolveTableAbsPath, resolveTableRelativePath, TablePathError,
} from './tablePath.ts';
import { createTableHarness, tableInput } from '../agent/tableTools.test-support.mjs';
import { createCanvasGetTableNodeTool, createCanvasWriteTableNodeTool } from '../agent/tableTools.ts';
import { createWorkflowNodeRemoveTool } from '../agent/agentWriteTools.ts';
import { createTableRoutes } from '../routes/tableRoutes.ts';

const invalidPaths = [
  '../tbl_demo.htable', '.omnimux/tables/../tbl_demo.htable', '/tmp/tbl_demo.htable',
  'C:/tmp/tbl_demo.htable', 'C:\\tmp\\tbl_demo.htable', '\\\\server\\share\\tbl_demo.htable',
  '..\\tbl_demo.htable', '.omnimux/tables/%2e%2e/tbl_demo.htable',
  'other/tbl_demo.htable', 'tbl_demo.htable', '.omnimux/tables/tbl_demo.htable\0',
];

test('tablePath: parses only canonical/legacy references without basename normalization', () => {
  assert.equal(extractTableIdFromRelPath('.omnimux/tables/tbl_demo.htable'), 'tbl_demo');
  assert.equal(extractTableIdFromRelPath('.hilo/tables/tbl_demo.htable'), 'tbl_demo');
  for (const value of invalidPaths) assert.throws(() => extractTableIdFromRelPath(value), TablePathError);
  for (const id of ['../escape', '/tmp/escape', 'C:\\escape', '..', 'a/b', 'a'.repeat(129)]) {
    assert.throws(() => resolveTableRelativePath(id), TablePathError);
  }
});

test('tablePath: invalid workspace/table ids fail before project lookup or disk checks', () => {
  let lookups = 0;
  const store = { workspacesDir: '/unused', resolveProjectRoot() { lookups++; throw new Error('Unexpected lookup'); } };
  for (const id of ['..', '../escape', '/tmp/escape', 'C:\\escape', 'ws_../escape', 'ws_a/../ws_b']) {
    assert.throws(() => resolveTableAbsPath(store, id, 'tbl_demo', { checkLegacy: true }), TablePathError);
    assert.throws(() => resolveTableAbsPath(store, 'ws_demo', id, { checkLegacy: true }), TablePathError);
  }
  assert.equal(lookups, 0);
});

for (const bound of [false, true]) {
  test(`tablePath: legacy .hilo and array migration remain readable without changing user files (bound=${bound})`, async (t) => {
    const h = createTableHarness(t, { bound });
    const ws = h.store.create('legacy');
    const tableId = 'tbl_legacy';
    h.store.save(ws.id, { nodes: [{ id: tableId, type: 'table', position: { x: 0, y: 0 }, data: {} }] });
    const legacyFile = join(bound ? h.projectRoot : join(h.store.workspacesDir, ws.id), '.hilo', 'tables', `${tableId}.htable`);
    const legacyRaw = JSON.stringify({
      version: 1, title: 'Legacy', contentRev: 4,
      columns: [{ id: 'col_a', title: 'A', type: 'text' }], rows: [{ cells: ['legacy value'] }],
    });
    mkdirSync(dirname(legacyFile), { recursive: true });
    writeFileSync(legacyFile, legacyRaw);
    const canonical = resolveTableAbsPath(h.store, ws.id, tableId);
    assert.notEqual(canonical, legacyFile);
    assert.equal(resolveTableAbsPath(h.store, ws.id, tableId, { checkLegacy: true }), legacyFile);
    const get = createCanvasGetTableNodeTool(h.deps);
    const legacy = await get.execute({ workspace_id: ws.id, node_id: tableId, table_path: `.hilo/tables/${tableId}.htable` });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.contentRev, 4);
    assert.deepEqual(legacy.tableContent.rows[0].cells, ['legacy value']);
    const routes = createTableRoutes(h.store);
    const url = `/omnimux-workflow/api/workspaces/${ws.id}/tables/${tableId}`;
    const fetched = await routes.tryHandle('GET', url, { method: 'GET', url });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.table.document.rows[0].cells.col_a, 'legacy value');
    assert.equal(fetched.body.table.contentRev, 4);
    assert.equal(existsSync(canonical), false);
    assert.equal(readFileSync(legacyFile, 'utf8'), legacyRaw);
    const replaced = await createCanvasWriteTableNodeTool(h.deps).execute({ workspace_id: ws.id, node_id: tableId, ...tableInput });
    assert.equal(replaced.ok, true);
    assert.equal(resolveTableAbsPath(h.store, ws.id, tableId, { checkLegacy: true }), canonical);
    assert.equal((await get.execute({ workspace_id: ws.id, node_id: tableId })).tableContent.title, tableInput.title);
    await createWorkflowNodeRemoveTool(h.deps).execute({ workspace_id: ws.id, node_ids: [tableId] });
    assert.equal(existsSync(canonical), false);
    assert.equal(readFileSync(legacyFile, 'utf8'), legacyRaw);
  });
}
