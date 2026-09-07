import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { materializeVoiceOptions, readVoiceIndexSnapshot } from './options.js';
import { buildContentCacheKey, DEFAULT_SPECS_DIR, loadAll } from '../contract/load.js';
import { buildModelCatalog } from '../list.js';
import { loadCatalogDefaults } from '../contract/dispositions.js';

const source = readVoiceIndexSnapshot();
const records = JSON.parse(source.content);
const declaration = { models: [{ id: 'test', parameters: { voice: {
  optionsFrom: 'volcengine-voice-index', defaultValue: records[0].voice_type,
} } }] };
const snapshot = (rows) => ({ ...source, content: JSON.stringify(rows) });

test('catalog DTO and contract expose the same 509 rich options with one canonical default', () => {
  const index = loadAll();
  const voice = index.get('seed-audio-1.0').parameters.voice;
  assert.equal(voice.options.length, 509);
  assert.equal('optionsFrom' in voice, false);
  assert.deepEqual(voice.options, records.map((row) => ({ value: row.voice_type, label: row.display_name, meta: row })));
  assert.equal(voice.defaultValue, records[0].voice_type);
  assert.equal(loadCatalogDefaults().byOperation.text_to_speech, 'seed-audio-1.0');
  const catalog = buildModelCatalog({ env: {} });
  assert.equal(catalog.defaults.audio, 'seed-audio-1.0');
  assert.equal(catalog.defaultsByOperation.text_to_speech, 'seed-audio-1.0');
  assert.deepEqual(catalog.audio[0].parameters.voice, voice);
  assert.deepEqual(catalog.models.find((model) => model.id === 'seed-audio-1.0').parameters.voice, voice);
  assert.notEqual(catalog.audio[0].parameters.voice.options, voice.options);
});

test('options source resolution is pure and supports operation-level declarations', () => {
  const original = structuredClone(declaration);
  const result = materializeVoiceOptions(declaration, source);
  assert.deepEqual(declaration, original);
  result.models[0].parameters.voice.options[0].meta.tags.push('changed');
  assert.deepEqual(materializeVoiceOptions(declaration, source).models[0].parameters.voice.options[0].meta, records[0]);
  const operationDoc = { models: [{ operations: [{ parameters: declaration.models[0].parameters }] }] };
  assert.equal(materializeVoiceOptions(operationDoc, source).models[0].operations[0].parameters.voice.options.length, 509);
});

test('unknown sources, double declarations, invalid defaults and corrupt index fail closed', () => {
  for (const change of [{ optionsFrom: '../../secret.json' }, { options: [] }, { defaultValue: 'alloy' }]) {
    const doc = structuredClone(declaration);
    Object.assign(doc.models[0].parameters.voice, change);
    assert.throws(() => materializeVoiceOptions(doc, source));
  }
  for (const rows of [[], {}, [null], [{ voice_type: '', display_name: 'invalid' }], [records[0], records[0]]]) {
    assert.throws(() => materializeVoiceOptions(declaration, snapshot(rows)));
  }
});

test('voice index content participates in contract cache identity', () => {
  const updated = structuredClone(records);
  updated[0].display_name += ' changed';
  assert.notEqual(buildContentCacheKey('specs', [source]), buildContentCacheKey('specs', [snapshot(updated)]));
});

test('voice parameter changes invalidate both memoized contracts and published fingerprints', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-contract-735-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync(DEFAULT_SPECS_DIR)) copyFileSync(join(DEFAULT_SPECS_DIR, name), join(dir, name));
  const path = join(dir, 'audio-models.yaml');
  const before = loadAll(dir);
  assert.equal(loadAll(dir), before);
  const yaml = readFileSync(path, 'utf8');
  writeFileSync(path, yaml.replace(`defaultValue: "${records[0].voice_type}"`, `defaultValue: "${records[1].voice_type}"`));
  const after = loadAll(dir);
  assert.notEqual(after, before);
  assert.notEqual(after.contentFingerprint, before.contentFingerprint);
  assert.notEqual(buildModelCatalog({ contractIndex: after, env: {} }).fingerprint, buildModelCatalog({ contractIndex: before, env: {} }).fingerprint);
  writeFileSync(path, yaml.replace('optionsFrom: "volcengine-voice-index"', 'optionsFrom: "missing-index"'));
  const invalid = loadAll(dir);
  assert.equal(invalid.get('seed-audio-1.0'), undefined);
  assert.ok(invalid.parseErrors.length > 0);
  assert.throws(() => buildModelCatalog({ contractIndex: invalid, env: {} }));
});
