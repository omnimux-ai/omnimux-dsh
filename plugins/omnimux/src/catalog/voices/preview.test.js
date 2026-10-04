import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { materializeVoiceOptions, readVoiceIndexSnapshot } from './options.js';
import { parsePreviewMapping, readVoicePreviewSnapshot, voicePreviewFingerprint } from './preview.js';
import { buildContentCacheKey, loadAll } from '../contract/load.js';
import { buildModelCatalog } from '../list.js';

const AUDIT_SHA256 = 'ef8ab1047fe4fcafec6cc9d3d3a75293365cce9c119ff329b87e5ab5ba85abe4';
const EXPECTED_EVIDENCE = `audit:initial-candidate-audit.json#sha256=${AUDIT_SHA256}`;
const EXPECTED_CHECKED_AT = '2026-10-03T15:10:20.311Z';
const VERIFIED_VOICE = 'zh_male_guanggaojieshuo_uranus_bigtts';
const VERIFIED_PRIMARY = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_male_guanggaojieshuo_uranus_bigtts.mp3';
const UNVERIFIED_VOICE = 'zh_male_changtianyi_mars_bigtts';
const CDN_BASE = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts';

const source = readVoiceIndexSnapshot();
const records = JSON.parse(source.content);
const declaration = { models: [{ id: 'test', parameters: { voice: {
  optionsFrom: 'volcengine-voice-index', defaultValue: records[0].voice_type,
} } }] };

function optionsOf(snapshot) {
  return materializeVoiceOptions(declaration, snapshot).models[0].parameters.voice.options;
}

function previewOf(options, voiceType) {
  return options.find((option) => option.value === voiceType).meta.preview;
}

test('verified voices project the exact preview DTO on meta.preview', () => {
  const preview = previewOf(optionsOf(source), VERIFIED_VOICE);
  assert.equal(preview.purpose, 'official-voice-preview');
  assert.equal(preview.state, 'verified-file');
  assert.equal(preview.primary_url, VERIFIED_PRIMARY);
  assert.equal(preview.checked_at, EXPECTED_CHECKED_AT);
  assert.equal(preview.evidence_ref, EXPECTED_EVIDENCE);
  // Primary first, canvas-rule candidates after, deduplicated.
  assert.equal(preview.candidates[0], VERIFIED_PRIMARY);
  assert.deepEqual([...new Set(preview.candidates)], preview.candidates);
});

test('unverified voices keep primary null and rule-ordered candidates', () => {
  const record = records.find((row) => row.voice_type === UNVERIFIED_VOICE);
  const preview = previewOf(optionsOf(source), UNVERIFIED_VOICE);
  assert.equal(preview.purpose, 'official-voice-preview');
  assert.equal(preview.state, 'unverified');
  assert.equal(preview.primary_url, null);
  assert.equal(preview.checked_at, null);
  assert.equal(preview.evidence_ref, null);
  // Same candidate rule as the canvas picker: voice_type.mp3 first (name 悬疑解说
  // is Chinese, no English alias), then the cleaned name.
  assert.deepEqual(preview.candidates, [
    `${CDN_BASE}/${UNVERIFIED_VOICE}.mp3`,
    `${CDN_BASE}/${encodeURIComponent('悬疑解说')}.mp3`,
  ]);
});

test('every one of the 509 options carries a preview and the verified count is 124', () => {
  const options = optionsOf(source);
  assert.equal(options.length, 509);
  const verified = options.filter((option) => option.meta.preview.state === 'verified-file');
  assert.equal(verified.length, 124);
  const unverified = options.filter((option) => option.meta.preview.state === 'unverified');
  assert.equal(unverified.length, 385);
  for (const option of unverified) {
    assert.equal(option.meta.preview.primary_url, null);
    assert.ok(option.meta.preview.candidates.length > 0, `candidates missing for ${option.value}`);
    assert.ok(option.meta.preview.candidates.every((url) => url.startsWith('https://')));
  }
});

test('preview DTO is detached from the caller payload per option clone', () => {
  const mutated = optionsOf(source);
  mutated.find((option) => option.value === VERIFIED_VOICE).meta.preview.candidates.push('bogus');
  const fresh = previewOf(optionsOf(source), VERIFIED_VOICE);
  assert.equal(fresh.candidates.includes('bogus'), false);
  assert.equal(fresh.candidates[0], VERIFIED_PRIMARY);
});

test('corrupt or path-supplied preview mapping fails closed', () => {
  for (const content of [
    'not-json',
    JSON.stringify({ voices: 'not-an-object' }),
    JSON.stringify({ cdn_base: 'http://evil.test/', voices: {} }),
    JSON.stringify({ cdn_base: CDN_BASE + '/', voices: { x: '../escape' } }),
  ]) {
    assert.throws(() => optionsOf({ ...source, preview: { name: 'official-preview-mapping.json', content } }));
  }
  assert.throws(() => optionsOf({ ...source, preview: { name: '../../secret.json', content: '{}' } }),
    /registered preview snapshot/);
});

const MAPPING_NAME = 'official-preview-mapping.json';
const AUDIT_URL = new URL(
  '../../../../../docs/evidence/shared-official-voice-preview/initial-candidate-audit.json',
  import.meta.url,
);

/** Mapping snapshot factory: shipped mapping as base, caller applies `mutate`. */
function previewWith(mutate) {
  const mapping = JSON.parse(readVoicePreviewSnapshot().content);
  if (mutate) mutate(mapping);
  return { ...source, preview: { name: MAPPING_NAME, content: JSON.stringify(mapping) } };
}

test('preview mapping voices must join the unique official voice index', () => {
  assert.throws(
    () => optionsOf(previewWith((m) => {
      m.voices.not_a_registered_voice_type = 'x.mp3';
    })),
    /unknown voice_type/,
  );
});

test('preview mapping files cannot override or escape the registered cdn_base', () => {
  const base = `${CDN_BASE}/`;
  const cdnBases = [
    'https://evil.example/obj/eden-cn/',
    `${CDN_BASE.replace('/portal/bigtts', '')}/`,
    'http://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/',
    'not-a-url',
    // URL.origin hides userinfo, so a credentialed cdn_base would pass the
    // origin/path check and then leak userinfo into every preview URL
    // materializeVoiceOptions publishes (#3058 OCR #6).
    `https://user@lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/`,
    `https://user:pass@lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/`,
    `https://:pass@lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/`,
  ];
  for (const cdnBase of cdnBases) {
    assert.throws(
      () => optionsOf(previewWith((m) => {
        m.cdn_base = cdnBase;
      })),
      /cdn_base/,
      `cdn_base ${cdnBase} must be rejected`,
    );
  }
  const files = [
    'https://evil.example/a.mp3',
    '//evil.example/a.mp3',
    'file:///etc/passwd',
    '/absolute/path.mp3',
    '../escape.mp3',
    'a/../../escape.mp3',
    'dir\\..\\evil.mp3',
    'x.mp3?y=1',
    'x.mp3#frag',
    // Encoded separators hide inside a single segment: decodeURIComponent sees
    // them but the raw checks above do not, and some CDN layers decode before
    // resolving the object key (#3058 OCR #5).
    'safe%2F..%2Fescape.mp3',
    'sub%2Ffile.mp3',
    '%5C..%5Cevil.mp3',
    'a%5Cb.mp3',
  ];
  for (const file of files) {
    assert.throws(
      () => optionsOf(previewWith((m) => {
        m.voices[VERIFIED_VOICE] = file;
      })),
      /preview mapping/,
      `file ${file} must be rejected`,
    );
  }
  // Relative paths may stay under the registered base path.
  const options = optionsOf(previewWith((m) => {
    m.voices[VERIFIED_VOICE] = 'subdir/file.mp3';
  }));
  assert.equal(previewOf(options, VERIFIED_VOICE).primary_url, `${base}subdir/file.mp3`);
  // The shipped mapping's own cdn_base remains accepted.
  assert.doesNotThrow(() => parsePreviewMapping(readVoicePreviewSnapshot()));
});

test('verified mapping rows require valid audit provenance and matching purpose/schema', () => {
  const cases = [
    (m) => {
      delete m.audit;
    },
    (m) => {
      m.audit.checked_at = 'not-a-date';
    },
    (m) => {
      m.audit.checked_at = '  ';
    },
    (m) => {
      delete m.audit.checked_at;
    },
    (m) => {
      m.audit.evidence_ref = '';
    },
    (m) => {
      delete m.audit.evidence_ref;
    },
    (m) => {
      m.purpose = 'wrong-purpose';
    },
    (m) => {
      delete m.purpose;
    },
    (m) => {
      m.schema_version = 2;
    },
    (m) => {
      delete m.schema_version;
    },
  ];
  for (const mutate of cases) {
    assert.throws(() => optionsOf(previewWith(mutate)), /preview mapping/);
  }
  // An empty verified set carries no provenance requirement.
  assert.doesNotThrow(() => optionsOf(previewWith((m) => {
    m.voices = {};
    delete m.audit;
    delete m.purpose;
    delete m.schema_version;
  })));
});

test('shipped mapping preserves importer evidence: audit sha256, checked_at and byte-exact matchedUrl', () => {
  const auditText = readFileSync(AUDIT_URL, 'utf8');
  const audit = JSON.parse(auditText);
  const mapping = JSON.parse(readVoicePreviewSnapshot().content);
  const sha256 = createHash('sha256').update(auditText).digest('hex');
  // Declared provenance must resolve to the real audit file, byte for byte.
  assert.equal(mapping.audit.sha256, sha256);
  assert.equal(mapping.audit.evidence_ref, `audit:initial-candidate-audit.json#sha256=${sha256}`);
  assert.equal(mapping.audit.checked_at, audit.checkedAt);
  // Every verified row keeps the audit's own matchedUrl — never re-derived or fabricated.
  const byType = new Map(audit.results.filter((row) => typeof row.matchedUrl === 'string' && row.matchedUrl)
    .map((row) => [row.voice_type, row.matchedUrl]));
  const parsed = parsePreviewMapping(readVoicePreviewSnapshot());
  assert.equal(parsed.verified.size, byType.size);
  for (const [voiceType, url] of parsed.verified) {
    assert.equal(url, byType.get(voiceType), `${voiceType} must keep the audit matchedUrl bytes`);
  }
});

test('catalog, contract index and exporter share one preview_fingerprint from the loaded snapshot', () => {
  const index = loadAll();
  const expected = voicePreviewFingerprint(readVoicePreviewSnapshot().content);
  assert.equal(index.previewFingerprint, expected);
  const catalog = buildModelCatalog({ contractIndex: index, env: {} });
  assert.equal(catalog.preview_fingerprint, expected);
  const script = new URL('../../../scripts/export-voice-previews.mjs', import.meta.url).pathname;
  const snapshot = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
  assert.equal(snapshot.preview_fingerprint, expected);
  assert.equal(snapshot.preview_fingerprint, catalog.preview_fingerprint);
});

test('preview mapping participates in the contract cache key', () => {
  const preview = { name: 'official-preview-mapping.json', content: '{"voices":{}}' };
  const changed = { ...preview, content: '{"voices":{"x":{"state":"unverified","primary_url":null}}}' };
  assert.notEqual(
    buildContentCacheKey('specs', [source, preview]),
    buildContentCacheKey('specs', [source, changed]),
  );
});

test('a changed preview mapping drives a different verified set', () => {
  const before = buildModelCatalog({ env: {} });
  const mapping = JSON.parse(readFileSync(new URL('./official-preview-mapping.json', import.meta.url), 'utf8'));
  mapping.voices[UNVERIFIED_VOICE] = `${UNVERIFIED_VOICE}.mp3`;
  const preview = { name: 'official-preview-mapping.json', content: JSON.stringify(mapping) };
  const options = optionsOf({ ...source, preview });
  assert.equal(previewOf(options, UNVERIFIED_VOICE).state, 'verified-file');
  assert.equal(previewOf(options, UNVERIFIED_VOICE).primary_url, `${CDN_BASE}/${UNVERIFIED_VOICE}.mp3`);
  assert.ok(typeof before.fingerprint === 'string' && before.fingerprint.length > 0);
});

test('exporter emits a deterministic snapshot for the real catalog', () => {
  const script = new URL('../../../scripts/export-voice-previews.mjs', import.meta.url).pathname;
  const first = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  const second = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(first, second, 'snapshot must be byte-deterministic');
  const snapshot = JSON.parse(first);
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.purpose, 'official-voice-preview');
  assert.ok(/^[0-9a-f]{16}$/.test(snapshot.catalog_fingerprint));
  assert.ok(/^[0-9a-f]{64}$/.test(snapshot.preview_fingerprint));
  assert.equal(snapshot.voices.length, 509);
  const verified = snapshot.voices.find((row) => row.voice_type === VERIFIED_VOICE);
  assert.equal(verified.preview.primary_url, VERIFIED_PRIMARY);
  assert.equal(verified.preview.state, 'verified-file');
  const unverified = snapshot.voices.find((row) => row.voice_type === UNVERIFIED_VOICE);
  assert.equal(unverified.preview.state, 'unverified');
  assert.equal(unverified.preview.primary_url, null);
  // Snapshot voice rows carry the same identity the catalog exposes.
  assert.equal(verified.display_name, records.find((row) => row.voice_type === VERIFIED_VOICE).display_name);
});

test('exporter --check verifies a written snapshot and rejects drift', () => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-preview-export-'));
  try {
    const script = new URL('../../../scripts/export-voice-previews.mjs', import.meta.url).pathname;
    const out = join(dir, 'snapshot.json');
    execFileSync(process.execPath, [script, '--out', out]);
    execFileSync(process.execPath, [script, '--check', out]);
    const drifted = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
    drifted.voices[0].preview.primary_url = 'https://drifted.example/x.mp3';
    const driftPath = join(dir, 'drifted.json');
    writeFileSync(driftPath, JSON.stringify(drifted));
    assert.throws(() => execFileSync(process.execPath, [script, '--check', driftPath], { stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
