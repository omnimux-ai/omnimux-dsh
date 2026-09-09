import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateDefinition, validateValues, buildDraft } from '../src/index.ts';

const templates = fileURLToPath(new URL('../templates/', import.meta.url));
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const fixture = () => read(join(templates, 'structure-replication/definition.json'));
const values = () => read(join(templates, 'structure-replication/values.json'));
function fails(result, code, path) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.errors.some(error => error.code === code && (!path || JSON.stringify(error.path) === JSON.stringify(path))), JSON.stringify(result.errors));
  for (const error of result.errors) {
    assert.ok(Array.isArray(error.path));
    assert.ok(error.message.length > 0);
  }
}

for (const name of readdirSync(templates)) {
  test(`official ${name}: definition, values, full draft and negative fixture`, () => {
    const definition = read(join(templates, name, 'definition.json'));
    const input = read(join(templates, name, 'values.json'));
    const invalid = read(join(templates, name, 'invalid-values.json'));
    assert.equal(definition.id, name);
    assert.equal(validateDefinition(definition).ok, true);
    assert.equal(validateValues(definition, input).ok, true);
    assert.deepEqual(buildDraft(definition, input), { ok: true, value: read(join(templates, name, 'expected-draft.json')) });
    const result = validateValues(definition, invalid.values);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map(({ code, path }) => ({ code, path })), invalid.expectedErrors);
  });
}

const invalidDefinitions = [
  ['unsupported version', d => { d.protocolVersion = 2; }, 'UNSUPPORTED_VERSION', ['protocolVersion']],
  ['missing version', d => { delete d.protocolVersion; }, 'INVALID_DEFINITION', ['protocolVersion']],
  ['unknown component', d => { d.fields[1].type = 'html'; }, 'INVALID_DEFINITION'],
  ['script property', d => { d.onSubmit = 'fetch("https://example.com")'; }, 'INVALID_DEFINITION', ['onSubmit']],
  ['CSS property', d => { d.fields[1].style = { color: 'red' }; }, 'INVALID_DEFINITION', ['fields', 1, 'style']],
  ['duplicate field', d => { d.fields.push(d.fields[1]); }, 'DUPLICATE_FIELD'],
  ['numeric range', d => { d.fields[3].min = 70; }, 'INVALID_RANGE'],
  ['negative step', d => { d.fields[3].step = -1; }, 'INVALID_DEFINITION'],
  ['zero step', d => { d.fields[3].step = 0; }, 'INVALID_DEFINITION'],
  ['infinite bounds', d => { d.fields[3].max = Infinity; }, 'INVALID_DEFINITION'],
  ['text range', d => { d.fields[1].minLength = 2001; }, 'INVALID_RANGE'],
  ['duplicate options', d => { d.fields[2].options.push(d.fields[2].options[0]); }, 'DUPLICATE_OPTION'],
  ['invalid ratio', d => { d.fields[2].options[0].value = '0:9'; }, 'INVALID_DEFINITION'],
  ['default outside choices', d => { d.fields[2].default = '3:2'; }, 'INVALID_DEFAULT'],
  ['default out of range', d => { d.fields[3].default = 70; }, 'INVALID_DEFAULT'],
  ['wrong default type', d => { d.fields[3].default = '15'; }, 'INVALID_DEFINITION'],
  ['required empty default', d => { d.fields[1].default = ' '; }, 'INVALID_DEFAULT'],
  ['file default forbidden', d => { d.fields[0].default = []; }, 'INVALID_DEFINITION'],
  ['unknown prompt reference', d => { d.prompt += '{{absent}}'; }, 'UNKNOWN_REFERENCE'],
  ['unknown attachment reference', d => { d.attachments.push('absent'); }, 'UNKNOWN_REFERENCE'],
  ['text mapped as attachment', d => { d.attachments.push('brief'); }, 'INVALID_MAPPING'],
  ['file mapped as prompt', d => { d.prompt += '{{reference_video}}'; }, 'INVALID_MAPPING'],
  ['duplicate attachment mapping', d => { d.attachments.push('reference_video'); }, 'INVALID_MAPPING'],
  ['unmapped text', d => { d.prompt = d.prompt.replace('{{brief}}', ''); }, 'UNMAPPED_FIELD'],
  ['unmapped file', d => { d.attachments = []; }, 'UNMAPPED_FIELD'],
  ['unmapped optional field', d => { d.fields.push({ type: 'text', id: 'unmapped', label: '遗漏' }); }, 'UNMAPPED_FIELD'],
  ['whitespace placeholder', d => { d.prompt += '{{ brief }}'; }, 'INVALID_PLACEHOLDER'],
  ['expression placeholder', d => { d.prompt += '{{brief.toUpperCase()}}'; }, 'INVALID_PLACEHOLDER'],
  ['unclosed placeholder', d => { d.prompt += '{{brief'; }, 'INVALID_PLACEHOLDER'],
  ['extra opening brace', d => { d.prompt += '{{{brief}}}'; }, 'INVALID_PLACEHOLDER'],
  ['extra closing brace', d => { d.prompt += '{{brief}}}'; }, 'INVALID_PLACEHOLDER'],
];
for (const [name, mutate, code, path] of invalidDefinitions) test(`reject definition: ${name}`, () => {
  const definition = fixture();
  mutate(definition);
  fails(validateDefinition(definition), code, path);
  fails(validateValues(definition, values()), code);
  fails(buildDraft(definition, values()), code);
});

const invalidValues = [
  ['required absent', v => { delete v.brief; }, 'REQUIRED', ['values', 'brief']],
  ['required whitespace', v => { v.brief = ' \n '; }, 'REQUIRED'],
  ['null text', v => { v.brief = null; }, 'INVALID_VALUE'],
  ['long text', v => { v.brief = 'x'.repeat(2001); }, 'OUT_OF_RANGE'],
  ['unknown field', v => { v.extra = 'x'; }, 'UNKNOWN_FIELD', ['values', 'extra']],
  ['string numeric', v => { v.duration = '15'; }, 'INVALID_VALUE'],
  ['fractional count', v => { v.count = 1.5; }, 'OUT_OF_RANGE'],
  ['number below min', v => { v.duration = 4; }, 'OUT_OF_RANGE'],
  ['number above max', v => { v.duration = 61; }, 'OUT_OF_RANGE'],
  ['non-finite number', v => { v.duration = NaN; }, 'INVALID_VALUE'],
  ['invalid option', v => { v.aspect_ratio = '7:3'; }, 'INVALID_OPTION'],
  ['empty required files', v => { v.reference_video = []; }, 'REQUIRED'],
  ['too many files', v => { v.reference_video.push({ ...v.reference_video[0], ref: 'example:other' }); }, 'OUT_OF_RANGE'],
  ['too big file', v => { v.reference_video[0].sizeBytes = 104857601; }, 'INVALID_ATTACHMENT'],
  ['missing metadata', v => { delete v.reference_video[0].mimeType; }, 'INVALID_ATTACHMENT'],
  ['extra metadata', v => { v.reference_video[0].url = 'https://example.com'; }, 'INVALID_ATTACHMENT'],
  ['blank reference', v => { v.reference_video[0].ref = ' '; }, 'INVALID_ATTACHMENT'],
  ['negative bytes', v => { v.reference_video[0].sizeBytes = -1; }, 'INVALID_ATTACHMENT'],
  ['fractional bytes', v => { v.reference_video[0].sizeBytes = 2.5; }, 'INVALID_ATTACHMENT'],
  ['zero bytes', v => { v.reference_video[0].sizeBytes = 0; }, 'INVALID_ATTACHMENT'],
  ['unsupported MIME', v => { v.reference_video[0].mimeType = 'image/png'; }, 'INVALID_ATTACHMENT'],
  ['MIME spoof prefix', v => { v.reference_video[0].mimeType = 'video/mp4.evil'; }, 'INVALID_ATTACHMENT'],
];
for (const [name, mutate, code, path] of invalidValues) test(`reject values: ${name}`, () => {
  const input = values();
  mutate(input);
  fails(validateValues(fixture(), input), code, path);
  fails(buildDraft(fixture(), input), code, path);
});

for (const input of [null, [], 'text', 7, new Date('2026-01-01T00:00:00Z')]) test(`reject non-record values ${JSON.stringify(input)}`, () => {
  fails(validateValues(fixture(), input), 'INVALID_VALUES');
});

test('defaults apply to absent fields only; explicit invalid values do not fall back', () => {
  const input = values();
  delete input.duration;
  delete input.aspect_ratio;
  assert.equal(validateValues(fixture(), input).value.duration, 15);
  assert.equal(validateValues(fixture(), input).value.aspect_ratio, '9:16');
  input.duration = null;
  fails(validateValues(fixture(), input), 'INVALID_VALUE');
});

test('optional absent fields render empty and emit no attachments', () => {
  const definition = fixture();
  definition.fields[0].required = false;
  definition.fields[1].required = false;
  const input = values();
  delete input.reference_video;
  delete input.brief;
  const result = buildDraft(definition, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.attachments, []);
  assert.ok(result.value.prompt.includes('新主题与要求：\n'));
});

test('interpolation is single-pass and preserves special characters, multiline text and literals', () => {
  const definition = fixture();
  definition.prompt += '\n固定单括号 {文字}；重复：{{brief}}{{brief}}';
  const input = values();
  input.brief = '<script>not code</script>\n{{duration}} $& $$ ${process.env.SECRET} 中文🙂';
  const result = buildDraft(definition, input);
  assert.equal(result.ok, true);
  assert.ok(result.value.prompt.includes(input.brief));
  assert.ok(result.value.prompt.endsWith(input.brief + input.brief));
  assert.ok(result.value.prompt.includes('固定单括号 {文字}'));
});

test('text fields reject line separators while textarea allows them', () => {
  const definition = fixture();
  definition.fields[1].type = 'text';
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) fails(validateValues(definition, { ...values(), brief: `one${separator}two` }), 'INVALID_VALUE');
});

test('floating point steps use min as origin without rounding invalid values into compliance', () => {
  const definition = fixture();
  definition.fields[3] = { id: 'duration', label: '时长', type: 'slider', min: -0.3, max: 0.5, step: 0.1 };
  for (const duration of [-0.3, -0.2, 0, 0.1 + 0.2, 0.5]) assert.equal(validateValues(definition, { ...values(), duration }).ok, true);
  fails(validateValues(definition, { ...values(), duration: 0.25 }), 'OUT_OF_RANGE');
});

test('file MIME wildcard, duplicate references and independent ordered output', () => {
  const definition = read(join(templates, 'element-replacement/definition.json'));
  const input = read(join(templates, 'element-replacement/values.json'));
  input.replacement_assets.push({ ref: 'example:second', name: 'second.jpg', mimeType: 'image/jpeg', sizeBytes: 100 });
  const result = buildDraft(definition, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.attachments.map(a => a.fieldId), ['reference_video', 'replacement_assets', 'replacement_assets']);
  input.replacement_assets.push(input.replacement_assets[0]);
  fails(validateValues(definition, input), 'INVALID_ATTACHMENT');
});

test('API does not mutate configuration or values; draft does not share mutable attachments', () => {
  const definition = fixture(), input = values();
  const original = JSON.stringify({ definition, input });
  const draft = buildDraft(definition, input);
  draft.value.attachments[0].name = 'changed';
  assert.equal(JSON.stringify({ definition, input }), original);
});

test('prototype-like keys are safe and inherited properties never satisfy required fields', () => {
  const definition = fixture();
  definition.fields[1].id = 'constructor';
  definition.prompt = definition.prompt.replace('{{brief}}', '{{constructor}}');
  const input = values();
  delete input.brief;
  fails(validateValues(definition, input), 'REQUIRED', ['values', 'constructor']);
  input.constructor = '内容';
  assert.ok(buildDraft(definition, input).value.prompt.includes('内容'));
  const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
  fails(validateValues(fixture(), malicious), 'UNKNOWN_FIELD');
  assert.equal({}.polluted, undefined);
});
