import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importDirectorModel } from './modelImport.ts';
import { createRequire } from 'node:module';

// Original CC0 fixture: three positions (0,0,0), (1,0,0), (0,1,0).
function triangle(uri) {
  return { asset: { version: '2.0' }, buffers: [{ byteLength: 36, ...(uri ? { uri } : {}) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [1,1,0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
}
function positions() {
  const bytes = Buffer.alloc(36); bytes.writeFloatLE(1, 12); bytes.writeFloatLE(1, 28); return bytes;
}
function glb(document = triangle()) {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const binary = positions(); const result = Buffer.alloc(28 + padded.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length); binary.copy(result, 28 + padded.length);
  return result;
}
function fixture(t) {
  const base = resolve(import.meta.dirname, '../../../../../.tmp'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'model-import-')); const project = join(root, 'project'); mkdirSync(project);
  t.after(() => { assert.ok(root.startsWith(base + '/model-import-')); rmSync(root, { recursive: true, force: true }); });
  return { root, project };
}

test('rejects binary padding corruption and oversized texture dimensions including JPEG and WebP', async t => {
  const { project } = fixture(t);
  const doc = triangle(); doc.buffers[0].byteLength = 35;
  const bytes = glb(doc); bytes[bytes.length - 1] = 1;
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.glb', bytes }] }));
  const gltf = triangle('mesh.bin');
  const jpeg = Buffer.from([255,216,255,192,0,17,8,255,255,255,255,3,1,17,0,2,17,0,3,17,0,255,217]);
  gltf.images = [{ uri: 'large.jpg' }];
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.gltf', bytes: Buffer.from(JSON.stringify(gltf)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'large.jpg', bytes: jpeg }] }));
  const webp = Buffer.alloc(30); webp.write('RIFF'); webp.writeUInt32LE(22, 4); webp.write('WEBPVP8X', 8); webp.writeUInt32LE(10, 16); webp.fill(255, 24, 30);
  gltf.images = [{ uri: 'large.webp' }];
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.gltf', bytes: Buffer.from(JSON.stringify(gltf)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'large.webp', bytes: webp }] }));
});

test('rejects nonfinite vertex data, out-of-range indices, fake textures and excessive JSON work', async t => {
  const { project } = fixture(t);
  const nonfinite = glb(); nonfinite.writeFloatLE(Infinity, nonfinite.length - 36);
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.glb', bytes: nonfinite }] }));
  const doc = triangle('mesh.bin'); doc.buffers[0].byteLength = 42;
  doc.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 6 });
  doc.accessors.push({ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }); doc.meshes[0].primitives[0].indices = 1;
  const invalidIndices = Buffer.concat([positions(), Buffer.from([0, 0, 1, 0, 9, 0])]);
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'mesh.bin', bytes: invalidIndices }] }));
  const texture = triangle('mesh.bin'); texture.images = [{ uri: 'fake.png' }];
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.gltf', bytes: Buffer.from(JSON.stringify(texture)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'fake.png', bytes: Buffer.from('<script>alert(1)</script>') }] }));
  const huge = triangle('mesh.bin'); huge.extras = { text: 'a'.repeat(4 * 1024 * 1024) };
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'huge.gltf', bytes: Buffer.from(JSON.stringify(huge)) }, { name: 'mesh.bin', bytes: positions() }] }));
  const wide = triangle(); wide.extras = { items: Array.from({ length: 10001 }, () => 0) };
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'wide.glb', bytes: glb(wide) }] }));
});

test('snapshots caller bytes, refuses getters without evaluating them, and releases staging on cancellation', async t => {
  const { project } = fixture(t); const original = glb(); const caller = Buffer.from(original);
  const promise = importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes: caller }] });
  caller.fill(0); const resource = await promise;
  assert.deepEqual(readFileSync(join(project, resource.storageKey)), original);
  let evaluated = false;
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', get bytes() { evaluated = true; return original; } }] }));
  assert.equal(evaluated, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes: original }], signal: controller.signal }), { name: 'AbortError' });
  const during = new AbortController();
  const canceled = importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes: original }], signal: during.signal });
  during.abort(); await assert.rejects(canceled, { name: 'AbortError' });
  assert.equal(readdirSync(join(project, 'assets/imported/director-models')).length, 1);
  assert.deepEqual(readFileSync(join(project, resource.storageKey)), original);
});

test('refuses project symlink escapes and file-directory collisions without writing outside', async t => {
  const { root, project } = fixture(t); const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(project, 'assets'));
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes: glb() }] }), /path-denied/);
  assert.deepEqual(readdirSync(outside), []);
  const other = join(root, 'other'); mkdirSync(other);
  const doc = triangle('mesh.bin'); doc.images = [{ uri: 'mesh.bin/pixel.png' }];
  await assert.rejects(importDirectorModel({ projectRoot: other, files: [{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'mesh.bin/pixel.png', bytes: Buffer.from('x') }] }));
});

test('imports strict embedded buffer data while rejecting unbounded, wrongly typed and malformed payloads', async t => {
  const { project } = fixture(t); const doc = triangle('data:application/octet-stream;base64,' + positions().toString('base64'));
  const bytes = Buffer.from(JSON.stringify(doc));
  const resource = await importDirectorModel({ projectRoot: project, files: [{ name: 'embedded.gltf', bytes }] });
  assert.deepEqual(readFileSync(join(project, resource.storageKey)), bytes);
  for (const uri of ['data:application/octet-stream;base64,AA=A', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:application/octet-stream;base64,AAAA', 'data:application/octet-stream,hello']) {
    await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'bad.gltf', bytes: Buffer.from(JSON.stringify(triangle(uri))) }] }));
  }
});

test('rejects malformed headers, chunk layout, unsafe dependencies, scripts and invalid geometry before publishing', async t => {
  const { project } = fixture(t);
  const original = await importDirectorModel({ projectRoot: project, files: [{ name: 'original.glb', bytes: glb() }] });
  const reject = async files => {
    await assert.rejects(importDirectorModel({ projectRoot: project, files }));
    assert.equal(readdirSync(join(project, 'assets/imported/director-models')).length, 1);
    assert.deepEqual(readFileSync(join(project, original.storageKey)), glb());
  };
  for (const mutate of [b => b.writeUInt32LE(0, 0), b => b.writeUInt32LE(1, 4), b => b.writeUInt32LE(b.length - 4, 8),
    b => b.writeUInt32LE(3, 12), b => b.writeUInt32LE(0x004e4942, 16), b => b.writeUInt32LE(0xffffffff, 12),
    b => b.fill(0xff, 20, 24)]) {
    const bytes = glb(); mutate(bytes); await reject([{ name: 'broken.glb', bytes }]);
  }
  for (const uri of ['https://example.test/a.bin', 'http://127.0.0.1/a.bin', '//host/a.bin', '/a.bin', '../a.bin', 'C:/a.bin', 'a\\b.bin', '%2e%2e/a.bin', 'a.bin?x', 'a.bin#x', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
    await reject([{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(triangle(uri))) }, { name: 'a.bin', bytes: positions() }]);
  }
  const cases = [
    doc => { doc.extras = { script: 'alert(1)' }; },
    doc => { doc.nodes[0].extras = { onload: 'alert(1)' }; },
    doc => { doc.bufferViews[0].byteLength = 40; },
    doc => { doc.accessors[0].count = 1000000000; },
    doc => { doc.accessors[0].componentType = 1; },
    doc => { doc.meshes[0].primitives[0].attributes.POSITION = 40; },
    doc => { doc.nodes[0].children = [0]; },
    doc => { doc.scenes[0].nodes = [99]; },
    doc => { doc.extensions = { UNKNOWN_remote: { uri: 'https://example.test' } }; },
    doc => { doc.images = [{ uri: 'texture.svg' }]; },
    doc => { doc.images = [{ bufferView: 90, mimeType: 'image/png' }]; },
  ];
  for (const mutate of cases) { const doc = triangle(); mutate(doc); await reject([{ name: 'broken.glb', bytes: glb(doc) }]); }
  await reject([{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(triangle('missing.bin'))) }]);
  await reject([{ name: 'triangle.glb', bytes: glb() }, { name: 'triangle.GLB', bytes: glb() }]);
  await reject([{ name: 'triangle.glb', bytes: glb() }, { name: 'script.js', bytes: Buffer.from('x') }]);
  await reject([{ name: 'triangle.glb', bytes: glb() }, { name: 'unused.bin', bytes: positions() }]);
  await reject([{ name: '../triangle.glb', bytes: glb() }]);
  await reject([{ name: 'triangle.glb', bytes: new Uint8Array(64 * 1024 * 1024 + 1) }]);
  await reject(Array.from({ length: 65 }, (_, i) => ({ name: `file${i}.glb`, bytes: glb() })));
  let deep = {}; for (let i = 0; i < 40; i++) deep = { child: deep };
  const doc = triangle(); doc.extras = deep; await reject([{ name: 'deep.glb', bytes: glb(doc) }]);
});

test('imports triangle JSON with nested local buffer and image sidecars preserving offline references', async t => {
  const { project } = fixture(t); const document = triangle('mesh/triangle.bin');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=', 'base64');
  document.images = [{ uri: 'textures/pixel.png' }]; document.textures = [{ source: 0 }];
  const bytes = Buffer.from(JSON.stringify(document));
  const resource = await importDirectorModel({ projectRoot: project, files: [
    { name: 'bundle/triangle.gltf', bytes }, { name: 'bundle/mesh/triangle.bin', bytes: positions() }, { name: 'bundle/textures/pixel.png', bytes: png },
  ], trustedInspect: async ({ path }) => {
    assert.deepEqual(readFileSync(path), png);
    return { type: 'image', mime: 'image/png', sizeBytes: png.length, width: 1, height: 1 };
  } });
  assert.equal(resource.mimeType, 'model/gltf+json'); assert.equal(resource.fileName, 'triangle.gltf'); assert.equal(resource.bytes, bytes.length);
  assert.deepEqual(readFileSync(join(project, resource.storageKey)), bytes);
  assert.deepEqual(readFileSync(join(project, resource.storageKey, '../mesh/triangle.bin')), positions());
  assert.deepEqual(readFileSync(join(project, resource.storageKey, '../textures/pixel.png')), png);
  assert.equal(JSON.parse(readFileSync(join(project, resource.storageKey), 'utf8')).buffers[0].uri, 'mesh/triangle.bin');
});

test('requires trusted full image inspection and binds decoded evidence to exact bytes', async t => {
  const { project } = fixture(t); const doc = triangle('mesh.bin'); doc.images = [{ uri: 'pixel.png' }]; doc.textures = [{ source: 0 }];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=', 'base64');
  const files = [{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'pixel.png', bytes: png }];
  await assert.rejects(importDirectorModel({ projectRoot: project, files }), /director-model-inspector-required/);
  await assert.rejects(importDirectorModel({ projectRoot: project, files, trustedInspect: { decoded: true } }), /director-model-inspector-required/);
  let calls = 0;
  const trustedInspect = async ({ path, type, maxBytes }) => {
    calls++; assert.equal(type, 'image'); assert.equal(maxBytes, png.length); assert.deepEqual(readFileSync(path), png);
    return { type: 'image', mime: 'image/png', sizeBytes: png.length, width: 1, height: 1 };
  };
  const imported = await importDirectorModel({ projectRoot: project, files, trustedInspect });
  assert.equal(calls, 1); assert.equal(imported.manifest.costs.texturePixels, 1);
  assert.equal(imported.manifest.decodedImages[0].bytes, png.length);
  assert.match(imported.manifest.decodedImages[0].sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(importDirectorModel({ projectRoot: project, files, trustedInspect: async () => { throw new Error('decode failed'); } }), /decode failed/);
  await assert.rejects(importDirectorModel({ projectRoot: project, files, trustedInspect: async () => ({ type: 'image', mime: 'image/png', sizeBytes: png.length, width: 2, height: 1 }) }));
  const canceled = new AbortController();
  await assert.rejects(importDirectorModel({ projectRoot: project, files, signal: canceled.signal, trustedInspect: async input => { canceled.abort(); return trustedInspect(input); } }), { name: 'AbortError' });
  assert.deepEqual(readFileSync(join(project, imported.storageKey)), files[0].bytes);
  assert.equal(readdirSync(join(project, 'assets/imported/director-models')).length, 1);
  const embedded = triangle('data:application/octet-stream;base64,' + positions().toString('base64'));
  embedded.images = [{ uri: 'data:image/png;base64,' + png.toString('base64') }];
  const embeddedResource = await importDirectorModel({ projectRoot: project, files: [{ name: 'embedded.gltf', bytes: Buffer.from(JSON.stringify(embedded)) }], trustedInspect });
  assert.equal(embeddedResource.manifest.decodedImages.length, 1);
  assert.deepEqual(embeddedResource.manifest.embeddedUris, [embedded.buffers[0].uri, embedded.images[0].uri]);
  const packed = triangle('packed.bin'); packed.buffers[0].byteLength = 36 + png.length;
  packed.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: png.length }); packed.images = [{ bufferView: 1, mimeType: 'image/png' }];
  const packedResource = await importDirectorModel({ projectRoot: project, files: [{ name: 'packed.gltf', bytes: Buffer.from(JSON.stringify(packed)) }, { name: 'packed.bin', bytes: Buffer.concat([positions(), png]) }], trustedInspect });
  assert.equal(packedResource.manifest.decodedImages[0].sha256, imported.manifest.decodedImages[0].sha256);
});

test('trusted full decoder accepts valid PNG JPEG WebP but refuses truncated headers', async t => {
  const { project } = fixture(t);
  // Use an already-installed public package, not any Hub-private implementation.
  const require = createRequire(new URL('../../../../omnimux/package.json', import.meta.url));
  const sharp = require('sharp');
  const inspect = async ({ path, maxBytes }) => {
    const bytes = readFileSync(path); assert.ok(bytes.length <= maxBytes);
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }); const metadata = await image.metadata();
    await image.resize({ width: 1, height: 1 }).raw().toBuffer();
    return { type: 'image', mime: 'image/' + metadata.format, sizeBytes: bytes.length, width: metadata.width, height: metadata.height };
  };
  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#808080' } }).toFormat(format).toBuffer();
    const doc = triangle('mesh.bin'); doc.images = [{ uri: 'pixel.' + format }];
    const files = [{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'mesh.bin', bytes: positions() }, { name: 'pixel.' + format, bytes }];
    const resource = await importDirectorModel({ projectRoot: project, files, trustedInspect: inspect });
    assert.equal(resource.manifest.costs.texturePixels, 4);
    if (format === 'png') {
      files[2] = { name: 'pixel.png', bytes: bytes.subarray(0, 33) };
      await assert.rejects(importDirectorModel({ projectRoot: project, files, trustedInspect: inspect }));
    }
  }
  assert.equal(readdirSync(join(project, 'assets/imported/director-models')).length, 3);
});

test('rejects cumulative texture pixels and texture/material counts before any decoder work', async t => {
  const { project } = fixture(t); let calls = 0;
  const inspect = async () => { calls++; throw new Error('budget must run first'); };
  const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR', 12); png.writeUInt32BE(4000, 16); png.writeUInt32BE(4000, 20);
  const doc = triangle('mesh.bin'); doc.images = [{ uri: 'a.png' }, { uri: 'b.png' }, { uri: 'c.png' }];
  const files = [{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, { name: 'mesh.bin', bytes: positions() }, ...['a.png','b.png','c.png'].map(name => ({ name, bytes: png }))];
  await assert.rejects(importDirectorModel({ projectRoot: project, files, trustedInspect: inspect }), /director-model-budget/);
  doc.images = [{ uri: 'a.png' }]; doc.textures = Array.from({ length: 3 }, () => ({ source: 0 }));
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.gltf', bytes: Buffer.from(JSON.stringify(doc)) }, files[1], files[2]], trustedInspect: inspect }), /director-model-budget/);
  for (const mutate of [d => { d.textures = Array.from({ length: 65 }, () => ({ source: 0 })); }, d => { d.materials = Array.from({ length: 129 }, () => ({})); }]) {
    const d = triangle(); mutate(d);
    await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'many.glb', bytes: glb(d) }], trustedInspect: inspect }), /director-model-budget/);
  }
  assert.equal(calls, 0);
});

test('rejects oversized dependency ledger before commit and leaves prior imports untouched', async t => {
  const { project } = fixture(t);
  const prior = await importDirectorModel({ projectRoot: project, files: [{ name: 'prior.glb', bytes: glb() }] });
  const bytes = Buffer.alloc(240000); positions().copy(bytes);
  const doc = triangle('data:application/octet-stream;base64,' + bytes.toString('base64'));
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'large.gltf', bytes: Buffer.from(JSON.stringify(doc)) }] }), /director-model-budget/);
  assert.equal(readdirSync(join(project, 'assets/imported/director-models')).length, 1);
  assert.deepEqual(readFileSync(join(project, prior.storageKey)), glb());
});

test('rejects deep hierarchies regardless of node ordering before publishing', async t => {
  const { project } = fixture(t); const doc = triangle();
  doc.nodes = Array.from({ length: 200 }, (_, i) => i ? { children: [i - 1] } : { mesh: 0 }); doc.scenes[0].nodes = [199];
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'deep.glb', bytes: glb(doc) }] }));
});

test('rejects cumulative drawing costs before publishing even with shared small geometry', async t => {
  const { project } = fixture(t);
  const huge = triangle(); huge.nodes = Array.from({ length: 1025 }, () => ({ mesh: 0 })); huge.scenes[0].nodes = huge.nodes.map((_, i) => i);
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'many.glb', bytes: glb(huge) }] }), /director-model-budget/);
  const primitives = triangle(); primitives.meshes[0].primitives = Array.from({ length: 2049 }, () => ({ attributes: { POSITION: 0 } }));
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'many.glb', bytes: glb(primitives) }] }), /director-model-budget/);
  const expanded = triangle(); expanded.meshes[0].primitives = Array.from({ length: 100 }, () => ({ attributes: { POSITION: 0 } }));
  expanded.nodes = Array.from({ length: 100 }, () => ({ mesh: 0 })); expanded.scenes[0].nodes = expanded.nodes.map((_, i) => i);
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'many.glb', bytes: glb(expanded) }] }), /director-model-budget/);
  const doc = triangle(); doc.scenes = Array.from({ length: 1025 }, () => ({ nodes: [0] }));
  await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'scenes.glb', bytes: glb(doc) }] }), /director-model-budget/);
  const indexed = triangle('mesh.bin'); indexed.buffers[0].byteLength = 6036;
  indexed.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 6000 });
  indexed.accessors.push({ bufferView: 1, componentType: 5123, count: 3000, type: 'SCALAR' });
  const indexedBytes = Buffer.concat([positions(), Buffer.alloc(6000)]);
  for (const [definitions, instances] of [[1001, 1], [700, 3]]) {
    indexed.meshes[0].primitives = Array.from({ length: definitions }, () => ({ attributes: { POSITION: 0 }, indices: 1 }));
    indexed.nodes = Array.from({ length: instances }, () => ({ mesh: 0 })); indexed.scenes[0].nodes = indexed.nodes.map((_, i) => i);
    await assert.rejects(importDirectorModel({ projectRoot: project, files: [{ name: 'indexed.gltf', bytes: Buffer.from(JSON.stringify(indexed)) }, { name: 'mesh.bin', bytes: indexedBytes }] }), /director-model-budget/);
  }
  indexed.meshes[0].primitives = Array.from({ length: 100 }, () => ({ attributes: { POSITION: 0 }, indices: 1 })); indexed.nodes = [{ mesh: 0 }]; indexed.scenes[0].nodes = [0];
  const shared = await importDirectorModel({ projectRoot: project, files: [{ name: 'shared.gltf', bytes: Buffer.from(JSON.stringify(indexed)) }, { name: 'mesh.bin', bytes: indexedBytes }] });
  assert.equal(shared.manifest.costs.components, 6009); assert.equal(shared.manifest.costs.triangles, 100000);
  const safe = triangle(); safe.nodes = [{ children: [1] }, { mesh: 0 }]; safe.scenes = [{ nodes: [0] }, { nodes: [1] }];
  const resource = await importDirectorModel({ projectRoot: project, files: [{ name: 'safe.glb', bytes: glb(safe) }] });
  assert.equal(resource.manifest.costs.instances, 2); assert.equal(resource.manifest.costs.primitives, 2);
  assert.equal(resource.manifest.costs.triangles, 2); assert.equal(resource.manifest.costs.vertices, 6);
});

test('imports original triangle GLB as durable project-relative resource without replacing an earlier import', async t => {
  const { project } = fixture(t); const bytes = glb();
  const first = await importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes }] });
  assert.match(first.storageKey, /^assets\/imported\/director-models\/[a-zA-Z0-9-]+\/triangle\.glb$/);
  assert.equal(first.url, first.storageKey); assert.equal(first.mimeType, 'model/gltf-binary');
  assert.equal(first.bytes, bytes.length); assert.equal(first.fileName, 'triangle.glb');
  assert.deepEqual(readFileSync(join(project, first.storageKey)), bytes);
  const next = await importDirectorModel({ projectRoot: project, files: [{ name: 'triangle.glb', bytes }] });
  assert.notEqual(next.storageKey, first.storageKey);
  assert.deepEqual(readFileSync(join(project, first.storageKey)), bytes);
});
