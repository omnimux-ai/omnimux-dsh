import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { createTableRoutes } from './tableRoutes.ts';
import { createCanvasWriteTableNodeTool, createCanvasGetTableNodeTool } from '../agent/tableTools.ts';
import { createWorkflowNodeRemoveTool } from '../agent/agentWriteTools.ts';
import { createTableHarness, tableInput, forbidTableIo } from '../agent/tableTools.test-support.mjs';

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), 'table-routes-test-'));
  const workspacesDir = join(root, 'workspaces');
  mkdirSync(workspacesDir, { recursive: true });

  const workspaceStore = createWorkspaceStore({
    workspacesDir,
  });

  const ws = workspaceStore.create('Test WS');
  const tableRoutes = createTableRoutes(workspaceStore);

  return {
    root,
    workspaceStore,
    wsId: ws.id,
    tableRoutes,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('tableRoutes: GET 404 on non-existent table', async () => {
  const { wsId, tableRoutes, cleanup } = createHarness();
  try {
    const res = await tableRoutes.tryHandle(
      'GET',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/tbl_nonexistent`,
      { method: 'GET', url: `/omnimux-workflow/api/workspaces/${wsId}/tables/tbl_nonexistent` },
    );
    assert.ok(res);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'table-not-found');
  } finally {
    cleanup();
  }
});

test('tableRoutes: PUT and GET table document with optimistic lock', async () => {
  const { wsId, tableRoutes, cleanup } = createHarness();
  try {
    const tableId = 'tbl_demo1';
    const sampleDoc = {
      version: 1,
      title: '剧本分镜表',
      columns: [
        { id: 'col_1', title: '分镜', type: 'text', visible: true, width: 200 },
      ],
      rows: [
        { id: 'row_1', cells: { col_1: '第1镜头' } },
        { id: 'row_2', cells: { col_1: '第2镜头' } },
      ],
    };

    // 1. Initial PUT (expectedRev: 0)
    const putRes1 = await tableRoutes.tryHandle(
      'PUT',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      {
        method: 'PUT',
        url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
        body: {
          expectedRev: 0,
          document: sampleDoc,
        },
      },
    );

    assert.ok(putRes1);
    assert.equal(putRes1.status, 200);
    assert.equal(putRes1.body.table.tableId, tableId);
    assert.equal(putRes1.body.table.contentRev, 1);
    assert.equal(putRes1.body.table.rowCount, 2);
    assert.equal(putRes1.body.table.title, '剧本分镜表');

    // 2. GET table
    const getRes = await tableRoutes.tryHandle(
      'GET',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      { method: 'GET', url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}` },
    );

    assert.ok(getRes);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.table.contentRev, 1);
    assert.equal(getRes.body.table.rowCount, 2);
    assert.equal(getRes.body.table.document.rows[0].cells['col_1'], '第1镜头');

    // 3. Concurrent PUT with stale expectedRev -> 409 version_conflict
    const putConflict = await tableRoutes.tryHandle(
      'PUT',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      {
        method: 'PUT',
        url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
        body: {
          expectedRev: 0, // Stale! Current is 1
          document: sampleDoc,
        },
      },
    );

    assert.ok(putConflict);
    assert.equal(putConflict.status, 409);
    assert.equal(putConflict.body.error, 'version_conflict');
    assert.equal(putConflict.body.currentRev, 1);

    // 4. PUT with matching expectedRev: 1 -> increments to 2
    const putRes2 = await tableRoutes.tryHandle(
      'PUT',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      {
        method: 'PUT',
        url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
        body: {
          expectedRev: 1,
          document: {
            ...sampleDoc,
            rows: [
              ...sampleDoc.rows,
              { id: 'row_3', cells: { col_1: '第3镜头' } },
            ],
          },
        },
      },
    );

    assert.ok(putRes2);
    assert.equal(putRes2.status, 200);
    assert.equal(putRes2.body.table.contentRev, 2);
    assert.equal(putRes2.body.table.rowCount, 3);

    // 5. DELETE table
    const delRes = await tableRoutes.tryHandle(
      'DELETE',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      { method: 'DELETE', url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}` },
    );
    assert.ok(delRes);
    assert.equal(delRes.status, 200);

    // 6. GET after DELETE -> 404
    const getAfterDel = await tableRoutes.tryHandle(
      'GET',
      `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}`,
      { method: 'GET', url: `/omnimux-workflow/api/workspaces/${wsId}/tables/${tableId}` },
    );
    assert.ok(getAfterDel);
    assert.equal(getAfterDel.status, 404);
  } finally {
    cleanup();
  }
});

for (const bound of [false, true]) {
  test(`tableRoutes: Agent CREATE -> HTTP GET/PUT -> Agent REPLACE/GET/REMOVE (bound=${bound})`, async (t) => {
    const h = createTableHarness(t, { bound });
    const ws = h.store.create('cross-entry');
    const routes = createTableRoutes(h.store);
    const write = createCanvasWriteTableNodeTool(h.deps);
    const get = createCanvasGetTableNodeTool(h.deps);
    const created = await write.execute({ workspace_id: ws.id, ...tableInput });
    assert.equal(created.ok, true);
    const url = `/omnimux-workflow/api/workspaces/${ws.id}/tables/${created.nodeId}`;
    const request = (method, body) => routes.tryHandle(method, url, { method, url, body });
    const fetched = await request('GET');
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.table.contentRev, 1);
    assert.equal(fetched.body.table.contentRev, created.contentRev);
    const node = h.store.get(ws.id).nodes.find((n) => n.id === created.nodeId);
    const saved = await request('PUT', {
      expectedRev: node.data.contentRev,
      document: { ...fetched.body.table.document, title: 'UI edit' },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved));
    assert.equal(saved.body.table.contentRev, 2);
    assert.equal(saved.body.table.document.contentRev, 2);
    const read = await get.execute({ workspace_id: ws.id, table_path: created.tablePath });
    assert.equal(read.contentRev, 2);
    assert.equal(read.tableContent.title, 'UI edit');
    const replaced = await write.execute({ workspace_id: ws.id, node_id: created.nodeId, ...tableInput });
    assert.equal(replaced.contentRev, 3);
    assert.equal(h.store.get(ws.id).nodes.find((n) => n.id === created.nodeId).data.contentRev, 3);
    const stale = await request('PUT', { expectedRev: 2, document: saved.body.table.document });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.currentRev, 3);
    assert.equal((await request('GET')).body.table.contentRev, 3);
    const removed = await createWorkflowNodeRemoveTool(h.deps).execute({
      workspace_id: ws.id, node_ids: [created.nodeId],
    });
    assert.equal(removed.removedNodes, 1);
    assert.equal((await request('GET')).status, 404);
  });
}

test('tableRoutes: malformed table/workspace paths are rejected before resolver lookup or table I/O', async (t) => {
  const h = createTableHarness(t);
  const ws = h.store.create('test');
  const routes = createTableRoutes(h.store);
  const ioCalls = forbidTableIo(t);
  const projectLookup = t.mock.method(h.store, 'resolveProjectRoot', () => null);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    for (const tableId of ['..', '%2e%2e%2fescape', '%2Ftmp%2Fescape', '..\\escape', 'C:\\escape']) {
      const url = `/omnimux-workflow/api/workspaces/${ws.id}/tables/${tableId}`;
      const result = await routes.tryHandle(method, url, { method, url });
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'invalid-id');
    }
    for (const workspaceId of ['..', '%2e%2e', '%2Ftmp', '..\\escape', 'C:\\escape']) {
      const url = `/omnimux-workflow/api/workspaces/${workspaceId}/tables/tbl_demo`;
      const result = await routes.tryHandle(method, url, { method, url });
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'invalid-id');
    }
  }
  assert.equal(projectLookup.mock.callCount(), 0);
  assert.equal(ioCalls(), 0);
});
