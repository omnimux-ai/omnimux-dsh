import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHook } from 'node:async_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import { deflateRawSync } from 'node:zlib';
import { validateInstallPackage } from '../install-validation.js';
import { VALIDATION_LIMITS as L, type ValidationLimits, type ValidationResult } from '../install-validation-contract.js';
import { QA_SKILL, qaCrc, qaExtra, qaUnicode, qaZip, qaPackage, qaCentralOffsets } from './install-validation-qa-fixture.js';

const zip = (bytes: Uint8Array, limits?: Partial<ValidationLimits>) => validateInstallPackage({ format: 'zip', fileName: 'qa.zip', bytes }, { limits });
const md = (bytes: Uint8Array) => validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes });
function denied(result: ValidationResult, code?: string): void {
  assert.equal(result.ok, false, `expected rejection, got ${JSON.stringify(result)}`);
  if (!result.ok) {
    if (code) assert.equal(result.code, code);
    assert.deepEqual(Object.keys(result).sort(), ['code', 'ok', 'reason']);
    assert.match(result.reason, /^[A-Z0-9_]+$/);
  }
}

test('QA independent CRC agrees with standard known vector', () => {
  assert.equal(qaCrc(Buffer.from('123456789')), 0xcbf43926);
});
for (const method of [0, 8] as const) for (const descriptor of [undefined, 'signed', 'unsigned'] as const) {
  test(`QA independent good ZIP method=${method} descriptor=${descriptor}`, async () => {
    const data = Buffer.from('synthetic resource');
    const bytes = qaZip([{ name: 'pack/SKILL.md', data: QA_SKILL, method, descriptor }, { name: 'pack/r', data, method, descriptor }], Buffer.from('ordinary archive comment'));
    const result = await zip(bytes); assert(result.ok, JSON.stringify(result));
    assert.equal(result.contentHash, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(result.manifest.map(e => [e.path, e.bytes, e.sha256]), [
      ['SKILL.md', QA_SKILL.length, createHash('sha256').update(QA_SKILL).digest('hex')],
      ['r', data.length, createHash('sha256').update(data).digest('hex')],
    ]);
  });
}
test('QA actual valid ZIP reaches exactly 20 MiB and +1 fails input admission', async () => {
  const empty = qaPackage({ name: 'a' }, { name: 'b' });
  const first = Buffer.alloc(L.resourceBytes, 97);
  const second = Buffer.alloc(L.zipBytes - empty.length - first.length, 98);
  const bytes = qaPackage({ name: 'a', data: first }, { name: 'b', data: second });
  assert.equal(bytes.length, L.zipBytes); assert(second.length < L.resourceBytes);
  const result = await zip(bytes); assert(result.ok, JSON.stringify(result)); assert.equal(result.inputBytes, L.zipBytes);
  denied(await zip(Buffer.concat([bytes, Buffer.from([0])])), 'PACKAGE_LIMIT');
});
test('QA metadata precedence rejects final unsafe path before broken first inflate', async () => {
  const bytes = qaZip([{ name: 'SKILL.md', data: QA_SKILL, method: 8, payload: Buffer.from([255]) }, { name: '../late' }]);
  denied(await zip(bytes), 'UNSAFE_PATH');
});
test('QA legal maximum comment is bounded and does not enter manifest', async () => {
  const bytes = qaZip([{ name: 'SKILL.md', data: QA_SKILL }], Buffer.alloc(65535, 120));
  const result = await zip(bytes); assert(result.ok); assert.equal(result.manifest.length, 1);
});
test('QA two structurally plausible EOCD candidates are rejected', async () => {
  const fake = Buffer.alloc(22); fake.writeUInt32LE(0x06054b50);
  denied(await zip(qaZip([{ name: 'SKILL.md', data: QA_SKILL }], fake)), 'PACKAGE_FORMAT');
});
for (const [label, mutate] of [
  ['local signature', (b: Buffer) => b.writeUInt32LE(0, 0)],
  ['local header overlaps central', (b: Buffer) => b.writeUInt16LE(65535, 28)],
  ['local method differs', (b: Buffer) => b.writeUInt16LE(8, 8)],
  ['local flags differ', (b: Buffer) => b.writeUInt16LE(0, 6)],
  ['local version differs', (b: Buffer) => b.writeUInt16LE(10, 4)],
  ['central count lower', (b: Buffer) => { b.writeUInt16LE(1, b.length - 14); b.writeUInt16LE(1, b.length - 12); }],
  ['central record points into payload', (b: Buffer) => b.writeUInt32LE(40, qaCentralOffsets(b)[1] + 42)],
  ['ZIP64 local sentinel', (b: Buffer) => b.writeUInt32LE(0xffffffff, 18)],
  ['central ZIP64 size', (b: Buffer) => b.writeUInt32LE(0xffffffff, qaCentralOffsets(b)[0] + 24)],
  ['central disk mismatch', (b: Buffer) => b.writeUInt16LE(1, b.length - 14)],
] as const) test(`QA structure rejects ${label}`, async () => {
  const bytes = qaPackage({ name: 'r' }); mutate(bytes); denied(await zip(bytes), 'PACKAGE_FORMAT');
});
for (const descriptor of ['signed', 'unsigned'] as const) test(`QA descriptor ${descriptor} local nonzero exact values are legal`, async () => {
  const bytes = qaZip([{ name: 'SKILL.md', data: QA_SKILL, descriptor }]);
  bytes.writeUInt32LE(qaCrc(QA_SKILL), 14); bytes.writeUInt32LE(QA_SKILL.length, 18); bytes.writeUInt32LE(QA_SKILL.length, 22);
  assert((await zip(bytes)).ok);
});
test('QA local-only hardlink extra cannot hide behind safe central metadata', async () => {
  denied(await zip(qaPackage({ name: 'r', localExtra: qaExtra(0x000d, Buffer.alloc(13)) })), 'UNSAFE_PATH');
});
test('QA harmless local extra need not be byte-identical to central', async () => {
  assert((await zip(qaPackage({ name: 'r', localExtra: qaExtra(0x5455, Buffer.from([1, 0, 0, 0, 0])) }))).ok);
});
test('QA ASI hardlink payload is rejected even when Unix mode says ordinary file', async () => {
  const data = Buffer.alloc(15); data.writeUInt16LE(0x81a4, 4); data[14] = 120; data.writeUInt32LE(qaCrc(data.subarray(4)), 0);
  denied(await zip(qaPackage({ name: 'r', extra: qaExtra(0x756e, data) })), 'UNSAFE_PATH');
});
for (const flag of [2, 4, 0x20, 0x100, 0x400, 0x1000, 0x8000]) test(`QA STORE unsupported flag ${flag}`, async () => {
  denied(await zip(qaPackage({ name: 'r', flags: flag })), 'PACKAGE_FORMAT');
});
for (const pair of [['ﬃ', 'ffi'], ['ſ', 'S'], ['Ꭰ', 'ꭰ'], ['𐐀', '𐐨'], ['A/x', 'a/y'], ['e\u0301/', 'é/'], ['a/b', 'a']] as const) {
  test(`QA fullfold or file-directory conflict ${JSON.stringify(pair)}`, async () => {
    denied(await zip(qaPackage(...pair.map(name => ({ name })))), 'UNSAFE_PATH');
  });
}
test('QA default non-Turkic folding keeps dotless i distinct', async () => {
  assert((await zip(qaPackage({ name: 'I' }, { name: 'ı' }))).ok);
});
test('QA fixed Unicode 15.1 does not fold Unicode 16 additions', async () => {
  assert((await zip(qaPackage({ name: '\u1c89' }, { name: '\u1c8a' }))).ok);
});
test('QA CP437 Unicode override collision with another entry is rejected', async () => {
  const raw = Buffer.from([0x82]);
  denied(await zip(qaPackage({ name: raw, flags: 0, extra: qaUnicode(raw, 'É') }, { name: 'é' })), 'UNSAFE_PATH');
});
test('QA UTF8 flag forbids conflicting Unicode extra', async () => {
  denied(await zip(qaPackage({ name: 'é', extra: qaUnicode(Buffer.from('é'), 'ø') })), 'UNSAFE_PATH');
});
test('QA CP437 raw unsafe device component is rejected before Unicode override', async () => {
  const raw = Buffer.concat([Buffer.from('NUL/'), Buffer.from([0x82])]);
  denied(await zip(qaPackage({ name: raw, flags: 0, extra: qaUnicode(raw, 'safe') })), 'UNSAFE_PATH');
});
test('QA directory denominator cannot rescue real deflate ratio above 100', async () => {
  const data = Buffer.alloc(1201, 97); assert.equal(deflateRawSync(data).length, 12);
  denied(await zip(qaPackage({ name: 'empty/', method: 8 }, { name: 'r', data, method: 8 })), 'PACKAGE_LIMIT');
});
for (const suffix of [Buffer.alloc(16384), deflateRawSync(Buffer.from('second stream'))]) test(`QA real consumed bytes reject appended ${suffix.length} bytes`, async () => {
  denied(await zip(qaZip([{ name: 'SKILL.md', data: QA_SKILL, method: 8, payload: Buffer.concat([deflateRawSync(QA_SKILL), suffix]) }])), 'PACKAGE_FORMAT');
});
test('QA scripts hooks HTML and nested archive stay opaque bytes', async () => {
  const nested = qaPackage({ name: '../unsafe' });
  const result = await zip(qaPackage({ name: 'scripts/run.sh', data: Buffer.from('DO_NOT_EXECUTE_QA_SENTINEL') }, { name: 'hooks/x.js', data: Buffer.from('throw new Error("DO_NOT_EXECUTE")') }, { name: 'nested.zip', data: nested }));
  assert(result.ok); assert.equal(result.manifest.length, 4); assert.equal(result.manifest[3].bytes, nested.length);
});
for (const yaml of [
  'name: qa\ndescription: ok\nextra: {nested: !private hidden}',
  'name: qa\ndescription: ok\nextra: [&a hidden, *a]',
  'name: qa\ndescription: ok\nextra: {x: 1, x: 2}',
  'name: qa\ndescription: ok\n...\nname: second\ndescription: hidden',
  'name: qa\ndescription: ok\nextra: !!map {x: y}',
  'name: qa\ndescription: ok\nextra: ' + '['.repeat(30000) + 'x' + ']'.repeat(30000),
] as const) test(`QA rejected YAML is redacted ${yaml.slice(0, 45)}`, async () => {
  const result = await md(Buffer.from(`---\n${yaml}\n---\nPRIVATE_BODY_QA /private/synthetic/qa`));
  denied(result, 'INVALID_SKILL'); assert(!JSON.stringify(result).includes('PRIVATE_BODY_QA')); assert(!JSON.stringify(result).includes('/private'));
});
test('QA legal folded description block and YAML end marker remain accepted', async () => {
  const result = await md(Buffer.from('---\nname: qa\ndescription: >-\n  first\n  second\n...\n---\nbody'));
  assert(result.ok, JSON.stringify(result)); assert.equal(result.metadata.description, 'first second');
});
for (const bad of [Buffer.from([0xed, 0xa0, 0x80]), Buffer.from([0xf4, 0x90, 0x80, 0x80]), Buffer.from([0x80])]) test(`QA UTF8 fatal ${bad.toString('hex')}`, async () => {
  denied(await md(Buffer.concat([QA_SKILL, bad])), 'INVALID_SKILL');
});
for (const invalid of [NaN, Infinity, 0, -1, 1.5]) test(`QA invalid reduced budget ${invalid}`, async () => {
  denied(await zip(qaPackage(), { entries: invalid }), 'PACKAGE_LIMIT');
});
test('QA inherited enlarged budget cannot override frozen defaults', async () => {
  const limits = Object.create({ zipBytes: L.zipBytes + 1 }) as Partial<ValidationLimits>;
  denied(await zip(Buffer.alloc(L.zipBytes + 1), limits), 'PACKAGE_LIMIT'); assert(Object.isFrozen(L));
});
test('QA SAB backing cannot be disguised by shadowing public buffer property', async () => {
  const bytes = new Uint8Array(new SharedArrayBuffer(QA_SKILL.length)); bytes.set(QA_SKILL);
  Object.defineProperty(bytes, 'buffer', { value: new ArrayBuffer(QA_SKILL.length) });
  denied(await md(bytes), 'PACKAGE_FORMAT');
});
test('QA input accessor cannot substitute SAB after byte admission', async () => {
  const shared = new Uint8Array(new SharedArrayBuffer(QA_SKILL.length)); shared.set(QA_SKILL);
  let reads = 0;
  const input = { format: 'markdown' as const, fileName: 'SKILL.md', get bytes(): Uint8Array { return ++reads <= 2 ? QA_SKILL : shared; } };
  denied(await validateInstallPackage(input), 'PACKAGE_FORMAT');
});
test('QA accessor cannot substitute a valid over-20MiB ZIP after admission', async () => {
  const overhead = qaPackage({ name: 'a' }, { name: 'b' }).length;
  const oversized = qaPackage({ name: 'a', data: Buffer.alloc(L.resourceBytes, 97) }, { name: 'b', data: Buffer.alloc(L.zipBytes + 1 - overhead - L.resourceBytes, 98) });
  assert.equal(oversized.length, L.zipBytes + 1);
  const small = qaPackage(); let reads = 0;
  const input = { format: 'zip' as const, fileName: 'qa.zip', get bytes(): Uint8Array { return ++reads <= 3 ? small : oversized; } };
  denied(await validateInstallPackage(input), 'PACKAGE_LIMIT');
});
test('QA intrinsic byte length cannot be shadowed to bypass ZIP input budget', async () => {
  const overhead = qaPackage({ name: 'a' }, { name: 'b' }).length;
  const bytes = qaPackage({ name: 'a', data: Buffer.alloc(L.resourceBytes, 97) }, { name: 'b', data: Buffer.alloc(L.zipBytes + 1 - overhead - L.resourceBytes, 98) });
  const actualLength = bytes.length; let reads = 0;
  Object.defineProperty(bytes, 'byteLength', { get: () => ++reads === 1 ? 1 : actualLength });
  denied(await zip(bytes), 'PACKAGE_LIMIT');
});
test('QA valid deep YAML within byte budget is bounded without invented depth policy', async () => {
  const bytes = Buffer.from('---\nname: qa\ndescription: ok\nextra: ' + '['.repeat(2000) + 'x' + ']'.repeat(2000) + '\n---\nbody');
  const result = await md(bytes);
  if (result.ok) assert.deepEqual(result.metadata, { name: 'qa', description: 'ok', version: null });
  else denied(result, 'INVALID_SKILL');
});
for (const kind of ['success', 'malformed', 'cancel'] as const) test(`QA actual worker exits on ${kind} and abort listener is released`, async () => {
  const ids = new Set<number>(); const destroyed = new Set<number>();
  const hook = createHook({ init(id, type) { if (type === 'WORKER') ids.add(id); }, destroy(id) { destroyed.add(id); } });
  hook.enable();
  try {
    const controller = new AbortController();
    const pending = validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes: kind === 'malformed' ? Buffer.from('invalid') : QA_SKILL }, { signal: controller.signal });
    if (kind === 'cancel') setImmediate(() => controller.abort());
    const result = await pending;
    if (kind === 'success') assert(result.ok); else denied(result, kind === 'cancel' ? 'VALIDATION_ABORTED' : 'INVALID_SKILL');
    await immediate(); assert.equal(ids.size, 1); for (const id of ids) assert(destroyed.has(id));
    controller.abort(); await immediate();
  } finally { hook.disable(); }
});
