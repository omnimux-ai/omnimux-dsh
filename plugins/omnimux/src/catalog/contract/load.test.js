import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAll,
  normalizeModel,
  resetContractCache,
  contentFingerprint,
  canonicalStringify,
  buildContentCacheKey,
  readYamlSnapshots,
  DEFAULT_SPECS_DIR,
  parseFile,
  preNormalizeDocRoot,
  prepareCanonicalDoc,
} from './load.js';
import { CANONICAL_SCHEMA_VERSION } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesValid = join(__dirname, 'fixtures', 'valid');
const fixturesInvalid = join(__dirname, 'fixtures', 'invalid');

test('loadAll real specs: 4 files merge without parse errors', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  assert.equal((index.parseErrors ?? []).length, 0, index.parseErrors?.join('\n'));
  assert.equal(index.schemaVersion, CANONICAL_SCHEMA_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(index, 'version'), false);
  assert.ok(index.all().length >= 14, `expected >=14 models, got ${index.all().length}`);
  assert.ok(index.get('kling-avatar'));
  assert.ok(index.get('whisper-1'));
  assert.ok(index.contentFingerprint);
  assert.equal(index.contentFingerprint.length, 16);
  assert.equal(index.listedOperations.length, 55);
  for (const key of [
    'seedance-2-0#first_last_frame',
    'seedance-2-0-fast#video_multi_ref',
    'seedance-2-0-mini#first_frame',
    'seedance-2-5#video_edit',
    'seedance-2-5#video_extend',
    'wan-3.0#document_to_video',
    'wan-3.0#webpage_to_video',
    'minimax-h3#end_frame',
    'grok-imagine-video-1-5#video_multi_ref',
  ]) {
    assert.ok(index.listedOperations.includes(key), key);
  }
  // formal specs must not produce schemaVersion admission errors
  assert.ok(
    !(index.issues ?? []).some(
      (i) =>
        i.level === 'error' &&
        (i.code === 'schema_version_conflict' ||
          i.code === 'schema_version_unsupported' ||
          (i.code === 'schema_invalid' && i.path === 'schemaVersion')),
    ),
    JSON.stringify((index.issues ?? []).filter((i) => i.level === 'error').slice(0, 5)),
  );
});

test('modes→operations compatibility; no magic prompt inject for required', () => {
  const model = normalizeModel({
    id: 'legacy-mode-model',
    label: 'Legacy',
    modes: [
      {
        mode: 'text_to_video',
        label: '文生',
        output: { type: 'video' },
        inputs: [],
      },
    ],
    research: { status: 'draft' },
    execution: { status: 'none' },
  });
  assert.equal(model.operations.length, 1);
  assert.equal(model.operations[0].id, 'text_to_video');
  // no ensurePromptSlot magic
  assert.equal(
    model.operations[0].inputs.some((s) => s.role === 'prompt'),
    false,
  );
  assert.ok(
    (model._admissionIssues ?? []).some((i) => i.code === 'prompt_required_missing'),
  );
});

test('speech_to_text promptPolicy=none does not inject prompt', () => {
  const model = normalizeModel({
    id: 'stt',
    label: 'STT',
    operations: [
      {
        id: 'speech_to_text',
        label: 'asr',
        output: { type: 'text' },
        inputs: [
          {
            slot: 'audio_input',
            type: 'audio',
            role: 'source',
            source: 'upstream_edge',
            min: 1,
            max: 1,
            allowedMimes: ['audio/mp3'],
            maxSizeMb: 10,
            limitSource: { kind: 'policy_conservative', note: 't' },
          },
        ],
      },
    ],
    research: { status: 'draft' },
    execution: { status: 'none' },
  });
  assert.equal(model.operations[0].inputs.some((s) => s.role === 'prompt'), false);
  assert.equal(model.operations[0].listed, false);
});

test('fingerprint stable for same payload, changes on edit', () => {
  const a = contentFingerprint([{ id: 'x', v: 1 }]);
  const b = contentFingerprint([{ id: 'x', v: 1 }]);
  const c = contentFingerprint([{ id: 'x', v: 2 }]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(
    contentFingerprint({ b: 1, a: 2 }),
    contentFingerprint({ a: 2, b: 1 }),
  );
  assert.ok(canonicalStringify({ z: 1, a: 2 }).startsWith('{"a"'));
});

test('content-hash cache: same mtime but changed content must miss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omx-contract-cache-'));
  const file = join(dir, 'a.yaml');
  const body1 = `schemaVersion: "1.1"\nmodels:\n  - id: "cache-a"\n    label: "A"\n    operations:\n      - id: "chat"\n        label: "c"\n        output: { type: "text" }\n        inputs:\n          - slot: "prompt"\n            type: "text"\n            role: "prompt"\n            source: "node_field"\n            min: 1\n            max: 1\n    research: { status: "draft" }\n    execution: { status: "none" }\n`;
  writeFileSync(file, body1);
  const fixed = new Date('2020-01-01T00:00:00Z');
  utimesSync(file, fixed, fixed);

  resetContractCache();
  const i1 = loadAll(dir, { useCache: true });
  assert.equal(i1.get('cache-a')?.label, 'A');
  assert.equal(i1.schemaVersion, '1.1');
  const key1 = i1.contentCacheKey;

  // Change content but force same mtime
  const body2 = body1.replace('label: "A"', 'label: "B"');
  writeFileSync(file, body2);
  utimesSync(file, fixed, fixed);

  const i2 = loadAll(dir, { useCache: true });
  assert.notEqual(key1, i2.contentCacheKey);
  assert.notEqual(i1, i2);
  assert.equal(i2.get('cache-a')?.label, 'B');
});

test('legacy version-only fixture loads; both/missing/unsupported fail closed', () => {
  resetContractCache();
  const index = loadAll(fixturesValid, { useCache: false });
  const legacy = index.get('fixture-legacy-version');
  assert.ok(legacy, 'legacy-version-only must migrate and index');
  assert.equal(legacy.listed, false);
  assert.equal(index.schemaVersion, '1.1');
  // normalized index must not expose root version
  assert.equal(Object.prototype.hasOwnProperty.call(index, 'version'), false);

  // isolated dirs for fail-closed cases
  for (const name of [
    'schema-version-both.yaml',
    'schema-version-missing.yaml',
    'schema-version-unsupported.yaml',
    'schema-version-bad-type.yaml',
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'omx-sv-'));
    const src = readFileSync(join(fixturesInvalid, name), 'utf8');
    writeFileSync(join(dir, name), src);
    resetContractCache();
    const bad = loadAll(dir, { useCache: false });
    assert.equal(bad.all().length, 0, name);
    assert.ok(
      (bad.issues ?? []).some((i) => i.level === 'error'),
      `${name} issues=${JSON.stringify(bad.issues)}`,
    );
  }
});

test('preNormalizeDocRoot pure function matrix', () => {
  const ok = preNormalizeDocRoot({ schemaVersion: '1.1', models: [] });
  assert.equal(ok.ok, true);
  assert.equal(ok.doc.schemaVersion, '1.1');

  const legacy = preNormalizeDocRoot({ version: '1.0', models: [] });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.doc.schemaVersion, '1.1');
  assert.equal(Object.prototype.hasOwnProperty.call(legacy.doc, 'version'), false);

  const both = preNormalizeDocRoot({ schemaVersion: '1.1', version: '1.1', models: [] });
  assert.equal(both.ok, false);
  assert.ok(both.issues.some((i) => i.code === 'schema_version_conflict'));

  const missing = preNormalizeDocRoot({ models: [] });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.some((i) => i.code === 'schema_invalid'));

  const unsupported = preNormalizeDocRoot({ schemaVersion: 'v1.1', models: [] });
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.issues.some((i) => i.code === 'schema_version_unsupported'));

  const badType = preNormalizeDocRoot({ schemaVersion: 1.1, models: [] });
  assert.equal(badType.ok, false);
  assert.ok(badType.issues.some((i) => i.code === 'schema_invalid'));
});

test('memo cache returns same index until content changes or reset', () => {
  resetContractCache();
  const i1 = loadAll(DEFAULT_SPECS_DIR, { useCache: true });
  const i2 = loadAll(DEFAULT_SPECS_DIR, { useCache: true });
  assert.equal(i1, i2);
  resetContractCache();
  const i3 = loadAll(DEFAULT_SPECS_DIR, { useCache: true });
  assert.notEqual(i1, i3);
  assert.equal(i1.contentFingerprint, i3.contentFingerprint);
});

test('buildContentCacheKey depends on file bytes not mtime', () => {
  const snaps = [
    { name: 'b.yaml', content: 'x' },
    { name: 'a.yaml', content: 'y' },
  ];
  const k1 = buildContentCacheKey('/tmp/x', snaps);
  const k2 = buildContentCacheKey('/tmp/x', [
    { name: 'a.yaml', content: 'y' },
    { name: 'b.yaml', content: 'x' },
  ]);
  assert.equal(k1, k2);
  const k3 = buildContentCacheKey('/tmp/x', [
    { name: 'a.yaml', content: 'z' },
    { name: 'b.yaml', content: 'x' },
  ]);
  assert.notEqual(k1, k3);
});

test('fixture valid dir: chat listed; whisper not; partial ops; aliases layered', () => {
  resetContractCache();
  const index = loadAll(fixturesValid, { useCache: false });
  assert.equal(index.schemaVersion, '1.1');
  const w = index.get('fixture-whisper');
  assert.ok(w);
  assert.equal(w.listed, false);
  assert.equal(w.operations[0].listed, false);
  assert.equal(w.operations[0].output.type, 'text');
  assert.equal(
    w.operations[0].inputs.some((s) => s.role === 'prompt'),
    false,
  );

  const chat = index.get('fixture-chat-ok');
  assert.ok(chat);
  assert.equal(chat.listed, true);
  assert.equal(chat.operations[0].listed, true);
  assert.ok((index.listedOperations ?? []).includes('fixture-chat-ok#chat'));

  const partial = index.get('fixture-partial-ops');
  assert.ok(partial);
  const t2i = partial.operations.find((o) => o.id === 'text_to_image');
  const i2i = partial.operations.find((o) => o.id === 'image_to_image');
  assert.equal(t2i.listed, true);
  assert.equal(i2i.listed, false);
  assert.equal(partial.listed, true);
  assert.deepEqual(partial.listedOperations, ['fixture-partial-ops#text_to_image']);

  const aliased = index.get('fixture-alias-primary');
  assert.ok(aliased);
  assert.deepEqual(aliased.aliases, ['wire-primary-a', 'wire-primary-b']);
  assert.deepEqual(aliased.operations[0].aliases, ['legacy_chat_mode']);
  // operation alias must not appear as a model id in the index
  assert.equal(index.get('legacy_chat_mode'), undefined);
});

test('parseFile returns doc', () => {
  const { doc } = parseFile(join(fixturesValid, 'minimal-chat.yaml'));
  assert.equal(doc.models[0].id, 'fixture-chat-ok');
  assert.equal(doc.schemaVersion, '1.1');
});

test('readYamlSnapshots sorts names', () => {
  const snaps = readYamlSnapshots(fixturesValid);
  const names = snaps.map((s) => s.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.ok(snaps.every((s) => typeof s.content === 'string' && s.content.length > 0));
});

test('prepareCanonicalDoc does not let malformed roots become soft-only warnings', () => {
  const bad = prepareCanonicalDoc({ schemaVersion: '1.1', version: '1.0', models: [] });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.level === 'error' && i.code === 'schema_version_conflict'));
});
