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
test('source versions refresh independently of canvas and missing posters preserve video fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cover-source-'));
  try {
    const file = join(dir, 'canvas.json'); writeFileSync(file, '1');
    let reads = 0, revision = 'one', missingPoster = false;
    const store = { workspacesDir: dir, canvasFileOf: () => file, get: () => { reads++; return { nodes: [{ id: 'video', data: { materialType: 'video', mediaUrl: 'https://e.test/body.mp4', thumbnailUrl: 'https://e.test/poster.png' } }] }; } };
    const enrich = createProjectCoverService(store, (url) => { if (missingPoster && url.endsWith('png')) throw new Error('missing'); return revision; });
    const project = { pages: [{ id: 'page', canvasWorkspaceId: 'ws_a' }] };
    const first = enrich(project).cover;
    revision = 'two';
    assert.notEqual(enrich(project).cover.sourceRevision, first.sourceRevision);
    assert.equal(reads, 1);
    missingPoster = true;
    const cover = enrich(project).cover;
    assert.equal(cover.thumbnailUrl, undefined);
    assert.equal(cover.mediaUrl, 'https://e.test/body.mp4');
    assert.equal(cover.unavailable, undefined);
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
