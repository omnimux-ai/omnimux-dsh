import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDirectorOperations } from './directorOperations.ts';

test('oversized operation records fail the durable queue budget', t => {
  const root = mkdtempSync(join(tmpdir(), 'director-operation-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, '.omnimux', 'director-operations', 'ws_budget', 'operation_budget');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, '0.json'), ' '.repeat(32769));
  const store = { get: () => ({ nodes: [], edges: [], version: 0 }), resolveProjectRoot: () => ({ path: root }) };
  const operations = createDirectorOperations({ host: {}, store, assetsStore: { get: () => ({ items: [] }) } });
  assert.throws(() => operations.list({ workspaceId: 'ws_budget' }), /director-operation-invalid-record/);
});
