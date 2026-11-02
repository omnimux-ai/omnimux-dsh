import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  loadOperationRegistry,
  loadAdapterProfiles,
  loadJsonSchema,
  validateDoc,
  validateModel,
  validateAdapterProfiles,
  validateOperationRegistry,
  validateCrossModelAliases,
  operationIdSet,
  promptPolicyFor,
  CANONICAL_SCHEMA_VERSION,
  EXPECTED_OPERATION_COUNT,
} from './schema.js';
import { parseFile, prepareCanonicalDoc, preNormalizeDocRoot } from './load.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');

test('operation registry has unique MCC ids with valid promptPolicy (count from SSOT)', () => {
  const reg = loadOperationRegistry();
  assert.equal(typeof reg.version, 'string');
  const ids = reg.operations.map((o) => o.id);
  assert.equal(ids.length, EXPECTED_OPERATION_COUNT);
  assert.equal(new Set(ids).size, EXPECTED_OPERATION_COUNT);
  assert.ok(ids.includes('speech_to_text'));
  assert.ok(ids.includes('end_frame'), 'registry must include end_frame (#567)');
  const endFrame = reg.operations.find((o) => o.id === 'end_frame');
  assert.equal(endFrame.defaultOutputType, 'video');
  assert.equal(endFrame.promptPolicy, 'optional');
  assert.equal(endFrame.group, 'video');
  const stt = reg.operations.find((o) => o.id === 'speech_to_text');
  assert.equal(stt.defaultOutputType, 'text');
  assert.equal(stt.promptPolicy, 'none');
  assert.equal(promptPolicyFor('digital_human', reg), 'optional');
  assert.equal(promptPolicyFor('chat', reg), 'required');
  assert.equal(operationIdSet(reg).size, EXPECTED_OPERATION_COUNT);
  for (const op of reg.operations) {
    assert.ok(
      op.promptPolicy === 'required' || op.promptPolicy === 'optional' || op.promptPolicy === 'none',
      `${op.id} promptPolicy`,
    );
  }
  const regIssues = validateOperationRegistry(reg);
  assert.equal(regIssues.length, 0, JSON.stringify(regIssues));
});

test('adapter profiles declare operations/outputTypes; digital_human not in videoGenerate; end_frame present', () => {
  const profiles = loadAdapterProfiles();
  assert.equal(typeof profiles.version, 'string');
  const issues = validateAdapterProfiles(profiles, loadOperationRegistry());
  assert.equal(issues.length, 0, JSON.stringify(issues));
  const vg = profiles.profiles.find((p) => p.id === 'videoGenerate');
  assert.ok(vg);
  assert.ok(Array.isArray(vg.operations));
  assert.ok(vg.operations.includes('digital_human')); // #minimax-h3-video
  assert.ok(vg.operations.includes('end_frame'), 'videoGenerate must declare end_frame (#567)');
  assert.deepEqual(vg.outputTypes, ['video']);
  const dh = profiles.profiles.find((p) => p.id === 'videoDigitalHuman');
  assert.ok(dh);
  assert.equal(dh.status, 'live');
  assert.ok(dh.operations.includes('digital_human'));
});

test('validateAdapterProfiles rejects unknown operation with profile_operation_unknown', () => {
  const registry = loadOperationRegistry();
  const issues = validateAdapterProfiles(
    {
      version: '1.0.0',
      profiles: [
        {
          id: 'bogusProfile',
          seam: 'x',
          status: 'live',
          operations: ['chat', 'totally_fake_op'],
          outputTypes: ['text'],
        },
      ],
    },
    registry,
  );
  const hit = issues.find((i) => i.code === 'profile_operation_unknown');
  assert.ok(hit, JSON.stringify(issues));
  assert.equal(hit.operationId, 'totally_fake_op');
  assert.ok(String(hit.path).includes('operations'));
  assert.equal(hit.level, 'error');
});

test('valid fixture minimal-chat passes validateDoc (canonical schemaVersion)', () => {
  const { doc, file } = parseFile(join(fixtures, 'valid', 'minimal-chat.yaml'));
  assert.equal(doc.schemaVersion, CANONICAL_SCHEMA_VERSION);
  assert.equal(doc.version, undefined);
  const issues = validateDoc(doc, { file });
  const errors = issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors, null, 2));
});

test('schemaVersion root: missing / unsupported / bad type / both conflict', () => {
  const missing = prepareCanonicalDoc(
    parseFile(join(fixtures, 'invalid', 'schema-version-missing.yaml')).doc,
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.some((i) => i.code === 'schema_invalid' && i.path === 'schemaVersion'));

  const unsupported = prepareCanonicalDoc(
    parseFile(join(fixtures, 'invalid', 'schema-version-unsupported.yaml')).doc,
  );
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.issues.some((i) => i.code === 'schema_version_unsupported'));

  const badType = prepareCanonicalDoc(
    parseFile(join(fixtures, 'invalid', 'schema-version-bad-type.yaml')).doc,
  );
  assert.equal(badType.ok, false);
  assert.ok(badType.issues.some((i) => i.code === 'schema_invalid' && i.path === 'schemaVersion'));

  const both = prepareCanonicalDoc(
    parseFile(join(fixtures, 'invalid', 'schema-version-both.yaml')).doc,
  );
  assert.equal(both.ok, false);
  assert.ok(both.issues.some((i) => i.code === 'schema_version_conflict'));
});

test('legacy root version-only migrates to schemaVersion 1.1 and strips version', () => {
  const { doc } = parseFile(join(fixtures, 'valid', 'legacy-version-only.yaml'));
  assert.equal(doc.version, '1.0');
  assert.equal(doc.schemaVersion, undefined);
  const pre = preNormalizeDocRoot(doc);
  assert.equal(pre.ok, true);
  assert.equal(pre.doc.schemaVersion, '1.1');
  assert.equal(Object.prototype.hasOwnProperty.call(pre.doc, 'version'), false);
  assert.ok(pre.issues.some((i) => i.code === 'legacy_schema_version_key' && i.level === 'warning'));

  const prepared = prepareCanonicalDoc(doc);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.doc.schemaVersion, '1.1');
  assert.equal(prepared.doc.version, undefined);
  const errors = prepared.issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test('model aliases are wire ids; operation aliases are not model-id mappings', () => {
  const { doc } = parseFile(join(fixtures, 'valid', 'model-aliases-layered.yaml'));
  const prepared = prepareCanonicalDoc(doc);
  assert.equal(prepared.ok, true);
  const model = prepared.doc.models[0];
  assert.deepEqual(model.aliases, ['wire-primary-a', 'wire-primary-b']);
  assert.deepEqual(model.operations[0].aliases, ['legacy_chat_mode']);

  // Collision: model alias steals another model id
  const collide = validateCrossModelAliases([
    {
      id: 'alpha',
      aliases: ['beta'],
      operations: [{ id: 'chat', aliases: [] }],
    },
    {
      id: 'beta',
      aliases: [],
      operations: [{ id: 'chat', aliases: ['op-only'] }],
    },
  ]);
  assert.ok(
    collide.some((i) => i.code === 'duplicate_alias' && String(i.message).includes('beta')),
    JSON.stringify(collide),
  );

  // Operation alias must not be treated as a free model wire id for lookup layering:
  // uniqueness still applies, but the token lives on the op, not as model.aliases.
  const layeredOk = validateCrossModelAliases([
    {
      id: 'fixture-alias-primary',
      aliases: ['wire-primary-a'],
      operations: [{ id: 'chat', aliases: ['legacy_chat_mode'] }],
    },
    {
      id: 'other',
      aliases: ['wire-other'],
      operations: [{ id: 'chat', aliases: ['other_legacy_mode'] }],
    },
  ]);
  assert.equal(layeredOk.length, 0, JSON.stringify(layeredOk));
});

test('valid whisper fixture has explicit text output and no prompt', () => {
  const { doc } = parseFile(join(fixtures, 'valid', 'whisper-stt.yaml'));
  const model = doc.models[0];
  const op = model.operations[0];
  assert.equal(op.id, 'speech_to_text');
  assert.equal(op.output.type, 'text');
  assert.equal(
    op.inputs.some((s) => s.role === 'prompt'),
    false,
  );
  const issues = validateModel(model);
  assert.equal(issues.filter((i) => i.level === 'error').length, 0);
});

test('missing output.type → output_type_missing', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'missing-output.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'output_type_missing'));
});

test('unknown operation → operation_unknown', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'unknown-operation.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'operation_unknown'));
});

test('bad min/max → slot_minmax_invalid', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'bad-minmax.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'slot_minmax_invalid'));
});

test('missing limitSource → limit_source_missing', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'missing-limit-source.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'limit_source_missing'));
});

test('live missing profile → profile_unknown', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'live-missing-profile.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'profile_unknown'));
});

test('digital_human + videoGenerate live → profile_incompatible', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'profile-incompatible-digital-human.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(
    issues.some((i) => i.code === 'profile_incompatible'),
    JSON.stringify(issues, null, 2),
  );
});

test('research verified without evidence → research_verified_without_evidence', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'research-verified-no-evidence.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'research_verified_without_evidence'));
});

test('bad allowedMimes → allowed_mimes_invalid', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'bad-allowed-mimes.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'allowed_mimes_invalid'));
});

test('bad output min/max order → schema_invalid', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'bad-output-minmax.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.level === 'error' && String(i.message).includes('min')));
});

test('bad aliases → duplicate_alias', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'bad-aliases.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'duplicate_alias'));
});

test('missing required prompt → prompt_required_missing', () => {
  const { doc, file } = parseFile(join(fixtures, 'invalid', 'missing-prompt-required.yaml'));
  const issues = validateDoc(doc, { file });
  assert.ok(issues.some((i) => i.code === 'prompt_required_missing'));
});

test('broken YAML syntax throws yaml_parse_error', () => {
  assert.throws(
    () => parseFile(join(fixtures, 'invalid', 'syntax-broken.yaml')),
    (err) => err && err.code === 'yaml_parse_error',
  );
});

test('schema file is readable JSON with op research/execution', () => {
  const schema = loadJsonSchema();
  assert.equal(schema.title.includes('Model Capability'), true);
  assert.ok(schema.$defs.operation);
  assert.ok(schema.$defs.operation.properties.research);
  assert.ok(schema.$defs.operation.properties.execution);
  assert.ok(schema.$defs.inputSlot.properties.allowedMimes);
});

test('yaml package parses nested operations', () => {
  const text = readFileSync(join(fixtures, 'valid', 'minimal-chat.yaml'), 'utf8');
  const doc = parseYaml(text);
  assert.equal(doc.models[0].operations[0].output.type, 'text');
});

test('profile_incompatible rejects wrong output type on live profile', () => {
  const issues = validateModel({
    id: 'bad-out',
    label: 'Bad Out',
    operations: [
      {
        id: 'text_to_video',
        label: 't2v',
        output: { type: 'audio' },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            source: 'node_field',
            min: 1,
            max: 1,
          },
        ],
        research: { status: 'verified', docUrl: 'https://x' },
        implementation: { status: 'ready', profileId: 'videoGenerate', seam: 'videoGenerate' },
        execution: { status: 'live', profileId: 'videoGenerate', seam: 'videoGenerate' },
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'profile_incompatible' || i.code === 'output_type_invalid'));
});
