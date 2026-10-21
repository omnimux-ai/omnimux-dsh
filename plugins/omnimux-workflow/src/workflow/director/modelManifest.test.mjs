import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, truncateSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as models from './modelImport.ts';
import { createHash } from 'node:crypto';
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function rehash(value) { const { hash, ...body } = value; return { ...body, hash: createHash('sha256').update(canonical(body)).digest('hex') }; }

function fixture(t) {
  const base = resolve(import.meta.dirname, '../../../../../.tmp'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'model-manifest-')); const project = join(root, 'project'); mkdirSync(project);
  t.after(() => { assert.ok(root.startsWith(base + '/model-manifest-')); rmSync(root, { recursive: true, force: true }); });
  return { root, project };
}
function bundle() {
  const bin = Buffer.alloc(36); bin.writeFloatLE(1, 12); bin.writeFloatLE(1, 28);
  const doc = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh/triangle.bin', byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  return [{ name: 'bundle/triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'bundle/mesh/triangle.bin', bytes: bin }];
}

test('managed bundle has durable identity, complete byte ledger and synchronous exact dependency mapping', async t => {
  const { project } = fixture(t); const files = bundle();
  const imported = await models.importDirectorModel({ projectRoot: project, files });
  assert.match(imported.assetId, /^director-model-[a-f0-9-]{36}$/);
  assert.equal(imported.bytes, files[0].bytes.length);
  assert.equal(imported.bundleBytes, files[0].bytes.length + 36);
  assert.equal(imported.confirmed, true);
  assert.equal(imported.manifest.files.length, 2);
  const verified = models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey });
  assert.equal(verified.assetId, imported.assetId); assert.deepEqual(verified.manifest, imported.manifest);
  assert.deepEqual(JSON.parse(readFileSync(join(project, imported.manifestPath), 'utf8')), imported.manifest);
  const map = models.getDirectorModelDependencies({ projectRoot: project, reference: imported.storageKey });
  assert.equal(map.mainPath, imported.storageKey);
  assert.deepEqual(map.dependencies, [{ uri: 'mesh/triangle.bin', storageKey: imported.storageKey.replace('triangle.gltf', 'mesh/triangle.bin') }]);
  assert.deepEqual(map.embeddedUris, []);
  const manifestPath = join(project, imported.manifestPath); const manifestBytes = readFileSync(manifestPath);
  for (const change of [m => { m.costs.instances = 0; }, m => { m.dependencies = [{ uri: 'https://example.test/evil.bin', path: m.mainPath }]; }, m => { m.commitState = 'staging'; }, m => { m.extraField = true; }]) {
    const forged = structuredClone(imported.manifest); change(forged); writeFileSync(manifestPath, JSON.stringify(rehash(forged)));
    assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }));
  }
  writeFileSync(manifestPath, manifestBytes);
  const arbitrary = join(project, 'assets/imported/arbitrary.gltf'); writeFileSync(arbitrary, files[0].bytes);
  for (const reference of ['assets/imported/arbitrary.gltf', imported.manifestPath, imported.storageKey + '?x', imported.storageKey.replace('triangle.gltf', '../triangle.gltf')]) {
    assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference }));
  }
  const extra = join(project, imported.manifestPath.replace('manifest.json', 'extra.bin')); writeFileSync(extra, Buffer.from([1]));
  assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }));
  assert.ok(extra.startsWith(project + '/assets/imported/director-models/')); rmSync(extra);
  assert.equal(models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }).confirmed, true);
  const binPath = join(project, map.dependencies[0].storageKey); const original = readFileSync(binPath);
  const changed = Buffer.from(original); changed[0] ^= 1; writeFileSync(binPath, changed);
  assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }));
  writeFileSync(binPath, original); assert.equal(models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }).assetId, imported.assetId);
  writeFileSync(binPath, Buffer.concat([original, Buffer.from([0])]));
  assert.throws(() => models.getDirectorModelDependencies({ projectRoot: project, reference: imported.storageKey }));
  writeFileSync(binPath, original);
  assert.ok(binPath.startsWith(project + '/assets/imported/director-models/')); rmSync(binPath);
  const outside = join(project, 'outside.bin'); writeFileSync(outside, original); symlinkSync(outside, binPath);
  assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }));
  rmSync(binPath); writeFileSync(binPath, original);
  truncateSync(manifestPath, 1024 * 1024);
  assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }), /director-model-budget/);
  writeFileSync(manifestPath, manifestBytes);
  const mainPath = join(project, imported.storageKey); const alteredMain = Buffer.from(files[0].bytes); alteredMain[0] ^= 1; writeFileSync(mainPath, alteredMain);
  assert.throws(() => models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }));
  writeFileSync(mainPath, files[0].bytes);
  assert.equal(models.verifyDirectorModel({ projectRoot: project, reference: imported.storageKey }).confirmed, true);
});
