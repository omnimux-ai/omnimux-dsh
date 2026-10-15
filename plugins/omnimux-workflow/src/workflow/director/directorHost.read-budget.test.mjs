import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectorHost } from './directorHost.ts';

const budget = 4_194_304;
const chunk = 65_536;
const taskRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const scratch = resolve(taskRoot, '.tmp');

function scene(title = '预算测试镜头') {
  return { id: 'scene-1', version: 1, title, background: '#151515', environmentIntensity: 1,
    gridVisible: true, objects: [], cameras: [{ id: 'camera-1', name: '机位',
      transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0],
      focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 100, keyframes: [] }],
    lights: [], shots: [{ id: 'shot-1', name: '镜头1', cameraId: 'camera-1', duration: 5, fps: 30,
      shotSize: 'medium', cameraMove: 'static', prompt: '' }], activeShotId: 'shot-1',
    createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' };
}
function document(revision = 1, title) {
  return { schemaVersion: 1, workspaceId: 'canvas-1', nodeId: 'director-1', revision, scene: scene(title) };
}
function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(join(scratch, 'director-3289-read-budget-'));
  assert.equal(dirname(root), scratch);
  const project = join(root, 'project');
  fs.mkdirSync(project);
  const store = {
    get: id => { assert.equal(id, 'canvas-1'); return { nodes: [{ id: 'director-1', type: 'director' }] }; },
    resolveProjectRoot: id => { assert.equal(id, 'canvas-1'); return { path: project }; },
  };
  const host = createDirectorHost({ store });
  const file = join(project, '.omnimux', 'director', 'canvas-1', 'director-1.json');
  fs.mkdirSync(dirname(file), { recursive: true });
  t.after(() => {
    const absolute = resolve(root);
    assert.equal(dirname(absolute), scratch);
    assert.ok(absolute.startsWith(`${scratch}${sep}director-3289-read-budget-`));
    fs.rmSync(absolute, { recursive: true, force: true });
    assert.equal(fs.existsSync(absolute), false);
  });
  return { host, root, file };
}
function get(host) { return host.getScene('canvas-1', 'director-1'); }
function save(host, expectedRevision = 1, title = '保存的新版本') {
  return host.saveScene('canvas-1', 'director-1', { expectedRevision, scene: scene(title) });
}
function rejects(action, code) {
  assert.throws(action, error => error?.code === code);
}

// Instrument only the standard filesystem boundary; every read still reaches a real file.
function observe(file, action, { partial = false, afterRead } = {}) {
  const originals = Object.fromEntries(['openSync', 'closeSync', 'readSync', 'readFileSync'].map(name => [name, fs[name]]));
  const active = new Set();
  const stats = { bytes: 0, reads: 0, wholeReads: 0, opened: 0, closed: 0 };
  fs.openSync = function (path, ...args) {
    const fd = originals.openSync.call(fs, path, ...args);
    if (path === file) { active.add(fd); stats.opened++; }
    return fd;
  };
  fs.closeSync = function (fd) {
    const result = originals.closeSync.call(fs, fd);
    if (active.delete(fd)) stats.closed++;
    return result;
  };
  fs.readSync = function (fd, buffer, offset, length, position) {
    const tracked = active.has(fd);
    const count = originals.readSync.call(fs, fd, buffer, offset,
      tracked && partial ? Math.min(length, chunk) : length, position);
    if (tracked) { stats.bytes += count; stats.reads++; afterRead?.(stats, fd); }
    return count;
  };
  fs.readFileSync = function (path, ...args) {
    const value = originals.readFileSync.call(fs, path, ...args);
    if (path === file || active.has(path)) {
      stats.wholeReads++;
      // readFileSync may delegate to the public readSync export; avoid counting those bytes twice.
      if (stats.reads === 0) stats.bytes += Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value);
    }
    return value;
  };
  syncBuiltinESMExports();
  try { action(stats); }
  finally {
    Object.assign(fs, originals);
    syncBuiltinESMExports();
    const leaked = [...active];
    for (const fd of leaked) originals.closeSync.call(fs, fd);
    assert.equal(leaked.length, 0, 'the public operation must close every scene descriptor');
    assert.equal(stats.closed, stats.opened);
  }
  assert.equal(stats.wholeReads, 0, 'scene loading must not use an unbounded whole-file read');
  return stats;
}

test('public GET and SAVE reject an oversized existing document before reading any bytes', t => {
  const { host, file } = fixture(t);
  fs.writeFileSync(file, '');
  fs.truncateSync(file, budget + 1);
  for (const action of [() => get(host), () => save(host)]) {
    const stats = observe(file, () => rejects(action, 'director-document-budget'));
    assert.equal(stats.bytes, 0);
    assert.equal(stats.reads, 0);
    assert.equal(stats.opened, 1);
    assert.equal(fs.statSync(file).size, 4_194_305);
  }
});

test('public GET reads an exactly four MiB UTF-8 document through 64 real partial reads', t => {
  const { host, file } = fixture(t);
  const expected = document();
  const bytes = Buffer.from(JSON.stringify(expected));
  fs.writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(budget - bytes.length, 0x20)]));
  assert.equal(fs.statSync(file).size, 4_194_304);
  const stats = observe(file, () => assert.deepEqual(get(host), expected), { partial: true });
  assert.equal(stats.bytes, 4_194_304);
  assert.equal(stats.reads, 64);
  assert.equal(stats.opened, 1);
});

test('public SAVE accepts the exact limit, advances the revision and confirms the new document', t => {
  const { host, file } = fixture(t);
  const bytes = Buffer.from(JSON.stringify(document()));
  fs.writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(budget - bytes.length, 0x20)]));
  const expected = document(2, '保存的新版本');
  const stats = observe(file, () => assert.deepEqual(save(host), expected), { partial: true });
  assert.equal(stats.bytes, 4_194_304 + Buffer.byteLength(JSON.stringify(expected)));
  assert.equal(stats.reads, 65);
  assert.equal(stats.opened, 2);
  assert.deepEqual(get(host), expected);
});

test('public GET and SAVE reject malformed, non-UTF-8 and foreign documents without overwriting bytes', t => {
  const { host, file } = fixture(t);
  const invalidUtf8 = Buffer.from(JSON.stringify(document(1, 'INVALID_UTF8')));
  invalidUtf8[invalidUtf8.indexOf('INVALID_UTF8')] = 0xff;
  const foreignWorkspace = { ...document(), workspaceId: 'another-canvas' };
  const foreignNode = { ...document(), nodeId: 'another-director' };
  const cases = [Buffer.from('{'), invalidUtf8, Buffer.from(JSON.stringify({ ...document(), scene: null })),
    Buffer.from(JSON.stringify(foreignWorkspace)), Buffer.from(JSON.stringify(foreignNode))];
  for (const bytes of cases) {
    fs.writeFileSync(file, bytes);
    for (const action of [() => get(host), () => save(host)]) {
      const stats = observe(file, () => rejects(action, 'director-invalid-document'));
      assert.equal(stats.bytes, bytes.length);
      assert.equal(stats.opened, 1);
      assert.deepEqual(fs.readFileSync(file), bytes);
    }
  }
});

test('public GET and SAVE reject an in-project leaf symlink without replacing it or its target', t => {
  const { host, file, root } = fixture(t);
  const target = join(dirname(file), 'original.json');
  const original = Buffer.from(JSON.stringify(document()));
  fs.writeFileSync(target, original);
  assert.ok(target.startsWith(`${root}${sep}`));
  fs.symlinkSync(target, file);
  for (const action of [() => get(host), () => save(host)]) {
    const stats = observe(file, () => rejects(action, 'director-invalid-document'));
    assert.equal(stats.bytes, 0);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.equal(fs.readlinkSync(file), target);
    assert.deepEqual(fs.readFileSync(target), original);
  }
});

test('public GET and SAVE reject a leaf directory without reading it or writing scene bytes', t => {
  const { host, file } = fixture(t);
  fs.mkdirSync(file);
  for (const action of [() => get(host), () => save(host)]) {
    const stats = observe(file, () => rejects(action, 'director-invalid-document'));
    assert.equal(stats.bytes, 0);
    assert.equal(stats.opened, 1);
    assert.ok(fs.statSync(file).isDirectory());
    assert.deepEqual(fs.readdirSync(file), []);
  }
});

test('public GET and SAVE reject real file growth after a partial read and preserve the grown file', t => {
  const { host, file } = fixture(t);
  const bytes = Buffer.from(JSON.stringify(document()));
  const original = Buffer.concat([bytes, Buffer.alloc(131_072 - bytes.length, 0x20)]);
  for (const action of [() => get(host), () => save(host)]) {
    fs.writeFileSync(file, original);
    const stats = observe(file, () => rejects(action, 'director-invalid-document'), {
      partial: true,
      afterRead: state => { if (state.reads === 1) fs.appendFileSync(file, ' '); },
    });
    assert.equal(stats.bytes, original.length);
    assert.equal(stats.reads, 2);
    assert.equal(stats.opened, 1);
    assert.deepEqual(fs.readFileSync(file), Buffer.concat([original, Buffer.from(' ')]));
  }
});

test('public GET stays consistent with its open file after atomic replacement and the next GET sees the new revision', t => {
  const { host, file } = fixture(t);
  const previous = document(1, '旧版本');
  const next = document(2, '新版本');
  const bytes = Buffer.from(JSON.stringify(previous));
  fs.writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(budget - bytes.length, 0x20)]));
  const replacement = join(dirname(file), 'replacement.json');
  fs.writeFileSync(replacement, JSON.stringify(next));
  const first = observe(file, () => assert.deepEqual(get(host), previous), {
    partial: true,
    afterRead: state => { if (state.reads === 1) fs.renameSync(replacement, file); },
  });
  assert.equal(first.bytes, 4_194_304);
  assert.equal(first.reads, 64);
  assert.equal(first.opened, 1);
  assert.equal(fs.existsSync(replacement), false);
  const second = observe(file, () => assert.deepEqual(get(host), next));
  assert.equal(second.bytes, Buffer.byteLength(JSON.stringify(next)));
  assert.equal(second.opened, 1);
});
