import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createDirectorHost } from './directorHost.ts';

function scene() {
  return { id: 'scene-1', version: 1, title: '测试镜头', background: '#151515', environmentIntensity: 1,
    gridVisible: true, objects: [], cameras: [{ id: 'camera-1', name: '机位', transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0], focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 100, keyframes: [] }],
    lights: [], shots: [{ id: 'shot-1', name: '镜头1', cameraId: 'camera-1', duration: 5, fps: 30, shotSize: 'medium', cameraMove: 'static', prompt: '' }], activeShotId: 'shot-1', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' };
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'director-host-'));
  const project = join(root, 'project'); mkdirSync(project);
  const snapshot = { id: 'canvas-1', version: 1, nodes: [{ id: 'director-1', type: 'director', data: {} }] };
  const store = { get: id => { if (id !== snapshot.id) throw Error('workspace-not-found'); return snapshot; }, resolveProjectRoot: id => id === snapshot.id ? { path: project } : null };
  const host = createDirectorHost({ store });
  t.after(() => { assert.ok(root.startsWith(resolve(tmpdir()))); rmSync(root, { recursive: true, force: true }); });
  return { host, root, project, snapshot };
}
test('director scene is durable and rejects stale revision without overwriting', t => {
  const { host, project } = fixture(t);
  const first = host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: scene() });
  assert.equal(first.revision, 1);
  const changed = scene(); changed.title = '第二版本';
  const second = host.saveScene('canvas-1', 'director-1', { expectedRevision: 1, scene: changed });
  assert.equal(second.revision, 2);
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 1, scene: scene() }), /version_conflict/);
  assert.equal(host.getScene('canvas-1', 'director-1').scene.title, '第二版本');
  const restarted = createDirectorHost({ store: { get: () => ({ nodes: [{ id: 'director-1', type: 'director' }] }), resolveProjectRoot: () => ({ path: project }) } });
  assert.equal(restarted.getScene('canvas-1', 'director-1').revision, 2);
});
test('deleted director node cannot receive a late save', t => {
  const { host, snapshot } = fixture(t); snapshot.nodes = [];
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: scene() }), /director-node-not-found/);
});
test('scene rejects nonfinite transforms and foreign asset URLs', t => {
  const { host } = fixture(t);
  const input = scene(); input.cameras[0].transform.position[0] = Infinity;
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: input }), /director-invalid-scene/);
  const foreign = scene(); foreign.panorama = { url: 'https://example.test/panorama.png', rotation: 0 };
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: foreign }), /director-invalid-scene/);
});
test('director rejects absent resource references without touching saved scene', t => {
  const { host } = fixture(t);
  host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: scene() });
  const next = scene(); next.panorama = { url: 'assets/imported/missing.png', rotation: 0 };
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 1, scene: next }), /director-resource-not-found/);
  assert.equal(host.getScene('canvas-1', 'director-1').revision, 1);
});
test('director document refuses path traversal and symlink escape', t => {
  const { host, project, root } = fixture(t);
  assert.throws(() => host.getScene('canvas-1', '../outside'), /invalid-id/);
  mkdirSync(join(project, '.omnimux'));
  symlinkSync(root, join(project, '.omnimux', 'director'));
  assert.throws(() => host.saveScene('canvas-1', 'director-1', { expectedRevision: 0, scene: scene() }), /path-denied/);
});
