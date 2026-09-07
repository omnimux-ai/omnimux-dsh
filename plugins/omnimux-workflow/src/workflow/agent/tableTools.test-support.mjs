import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import { resolveTableAbsPath, resolveTableRelativePath } from '../storage/tablePath.ts';
import { buildTableDocument } from '../../shared/types/htable.ts';

export const tableInput = {
  title: '短剧分镜表',
  columns: [{ title: '场次', type: 'number' }, { title: '台词', type: 'text' }],
  rows: [{ cells: [1, '第一镜头'] }, { cells: [2, '第二镜头'] }],
};

export function createTableHarness(t, { bound = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'table-workspace-test-'));
  const projectRoot = join(root, 'project');
  if (bound) mkdirSync(projectRoot);
  const store = createWorkspaceStore({
    workspacesDir: join(root, 'workspaces'),
    resolveProjectRoot: () => bound ? { path: projectRoot } : null,
  });
  let activeWorkspaceId;
  const deps = {
    store,
    executionManager: {},
    mediaDir: join(root, 'media'),
    getActiveView: () => ({
      ok: true,
      uiContext: activeWorkspaceId
        ? { view: { kind: 'canvas', extra: { workspaceId: activeWorkspaceId } } }
        : null,
    }),
  };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, projectRoot, store, deps, setActive: (id) => { activeWorkspaceId = id; } };
}

export async function seedTable(h, workspaceId, tableId, title = tableInput.title) {
  const saved = await TableStorageService.saveTable(
    resolveTableAbsPath(h.store, workspaceId, tableId),
    buildTableDocument({ ...tableInput, title }),
  );
  const snapshot = h.store.get(workspaceId);
  const node = {
    id: tableId, type: 'table', position: { x: 0, y: 0 },
    data: { tableId, tablePath: resolveTableRelativePath(tableId), contentRev: saved.contentRev },
  };
  h.store.save(workspaceId, { nodes: [...snapshot.nodes, node], expectedVersion: snapshot.version });
  return node;
}

export function forbidTableIo(t) {
  const calls = ['saveTable', 'loadTable', 'exists', 'deleteTable'].map((method) =>
    t.mock.method(TableStorageService, method, async () => { throw new Error(`Unexpected ${method}`); }),
  );
  return () => calls.reduce((sum, fn) => sum + fn.mock.callCount(), 0);
}
