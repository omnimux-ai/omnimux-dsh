import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceStore, resolveCanvasFilePath, canvasExistsOnDisk } from './WorkspaceStore.ts';
import { assertProjectWriteSafe } from '../../projects/paths.ts';
test('every workspace path entry rejects invalid identifiers before writing', () => {
 const tmp = mkdtempSync(join(tmpdir(), 'workspace-boundary-'));
 try {
  const root = join(tmp, 'workspaces'); const store = createWorkspaceStore({ workspacesDir: root });
  for (const id of ['../../outside', '', ' ws_valid', 'ws_../escape', '/tmp/escape', 'ws_a\\..\\escape']) {
   for (const fn of [() => store.create('x', id), () => store.canvasFileOf(id), () => resolveCanvasFilePath({ workspacesDir: root, workspaceId: id }), () => canvasExistsOnDisk({ workspacesDir: root, workspaceId: id })]) assert.throws(fn);
  }
  mkdirSync(join(root, 'unrelated')); assert.deepEqual(store.list(), []);
  const row = store.create('valid', 'ws_normal'); assert.equal(store.get(row.id).name, 'valid');
  assert.equal(existsSync(join(tmp, 'outside')), false);
 } finally { rmSync(tmp, { recursive: true, force: true }); }
});
test('existing and dangling parent symlinks fail before mkdir or write', () => {
 const tmp = mkdtempSync(join(tmpdir(), 'workspace-symlink-'));
 try {
  const root = join(tmp, 'workspaces'); const outside = join(tmp, 'outside'); mkdirSync(outside);
  const store = createWorkspaceStore({ workspacesDir: root });
  symlinkSync(outside, join(root, 'ws_escape')); assert.throws(() => store.create('x', 'ws_escape'));
  symlinkSync(join(tmp, 'missing'), join(root, 'ws_dangling')); assert.throws(() => store.create('x', 'ws_dangling'));
  const project = join(tmp, 'project'); mkdirSync(project); symlinkSync(outside, join(project, '.omnimux'));
  const bound = createWorkspaceStore({ workspacesDir: root, resolveProjectRoot: () => ({ path: project }) });
  bound.create('valid', 'ws_bound'); assert.throws(() => bound.get('ws_bound'));
  assert.equal(existsSync(join(outside, 'canvases')), false);
  assertProjectWriteSafe(join(project, 'fresh', 'file'), project);
 } finally { rmSync(tmp, { recursive: true, force: true }); }
});
