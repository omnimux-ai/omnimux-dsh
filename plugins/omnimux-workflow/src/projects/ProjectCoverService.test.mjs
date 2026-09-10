import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectCoverService } from './ProjectCoverService.ts';
test('summaries are shared, versioned, survive restart and preserve stable order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cover-service-'));
  try {
    const file = join(dir, 'canvas.json');
    let reads = 0;
    let nodes = [{ id: 'a', data: { materialType: 'image', mediaUrl: 'https://e.test/a.png' } }];
    writeFileSync(file, '1');
    const store = { workspacesDir: dir, canvasFileOf: () => file, get: () => { reads++; return { nodes }; } };
    const project = { pages: [{ id: 'page', canvasWorkspaceId: 'ws_a' }] };
    let enrich = createProjectCoverService(store);
    assert.equal(enrich(project).cover.nodeId, 'a');
    assert.deepEqual(enrich(project).cover, enrich(project).pages[0].cover);
    assert.equal(reads, 1);
    enrich = createProjectCoverService(store);
    assert.equal(enrich(project).cover.nodeId, 'a');
    assert.equal(reads, 1);
    nodes = [{ id: 'b', data: { materialType: 'audio', mediaUrl: 'https://e.test/b.wav' } }, ...nodes];
    writeFileSync(file, '22');
    assert.equal(enrich(project).cover.nodeId, 'a');
    nodes = nodes.slice(0, 1);
    writeFileSync(file, '333');
    assert.equal(enrich(project).cover.nodeId, 'b');
    rmSync(file);
    assert.deepEqual(enrich(project).cover, { kind: 'empty', unavailable: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt cached fields never escape into a response', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cover-corrupt-'));
  try {
    mkdirSync(join(dir, 'ws_a'));
    writeFileSync(join(dir, 'ws_a', 'cover-summary.json'), JSON.stringify({ schemaVersion: 1, stamp: 'x', order: [null], cover: { kind: 'image', thumbnailUrl: 'javascript:bad' } }));
    const enrich = createProjectCoverService({ workspacesDir: dir, canvasFileOf: () => { throw new Error('unreadable'); } });
    assert.deepEqual(enrich({ pages: [{ id: 'page', canvasWorkspaceId: 'ws_a' }] }).cover, { kind: 'empty', unavailable: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
