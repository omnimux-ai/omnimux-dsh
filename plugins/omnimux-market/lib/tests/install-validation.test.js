import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { createHook } from 'node:async_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import { validateInstallPackage } from '../install-validation.js';
import { VALIDATION_LIMITS as L, checkLimit } from '../install-validation-contract.js';
import { normalizePath, pathKey } from '../install-validation-path.js';
import { SKILL, extraField, unicodeExtra, zipFixture } from './install-validation-fixture.js';
function zip(bytes, limits) {
    return validateInstallPackage({ format: 'zip', fileName: 'sample.zip', bytes }, { limits });
}
function md(bytes = SKILL, limits) {
    return validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes }, { limits });
}
async function rejected(bytes, code) {
    const result = await zip(bytes);
    assert.equal(result.ok, false, JSON.stringify(result));
    if (!result.ok && code)
        assert.equal(result.code, code);
    assert(!('manifest' in result));
}
function packageWith(entry) {
    return zipFixture([{ name: 'SKILL.md', bytes: SKILL }, entry]);
}
test('standalone Markdown returns only validated metadata and exact original byte hash', async () => {
    const result = await md();
    assert(result.ok);
    assert.equal(result.stage, 'validated');
    assert.equal(result.contentHash, createHash('sha256').update(SKILL).digest('hex'));
    assert.deepEqual(result.metadata, { name: 'sample-skill', description: 'A safe test skill', version: '1.0' });
    assert.deepEqual(Object.keys(result).sort(), ['contentHash', 'format', 'inputBytes', 'manifest', 'metadata', 'ok', 'stage', 'totalBytes']);
});
for (const method of [0, 8])
    for (const descriptor of [undefined, 'signed', 'unsigned']) {
        test(`normal ZIP method ${method}, descriptor ${descriptor ?? 'none'}`, async () => {
            const bytes = zipFixture([{ name: 'SKILL.md', bytes: SKILL, method, descriptor }, { name: 'scripts/run.sh', bytes: Buffer.from('exit 99\n'), method, descriptor }]);
            const result = await zip(bytes);
            assert(result.ok, JSON.stringify(result));
            assert.equal(result.manifest.length, 2);
            assert.equal(result.totalBytes, SKILL.length + 8);
        });
    }
test('one common wrapper is stripped, directory and resource remain', async () => {
    const result = await zip(zipFixture([{ name: 'wrap/' }, { name: 'wrap/SKILL.md', bytes: SKILL }, { name: 'wrap/res/' }, { name: 'wrap/res/data', bytes: Buffer.from('abc') }]));
    assert(result.ok, JSON.stringify(result));
    assert.deepEqual(result.manifest.map(x => x.path), ['SKILL.md', 'res', 'res/data']);
});
test('empty ordinary resource has a verified empty hash', async () => {
    const result = await zip(packageWith({ name: 'empty' }));
    assert(result.ok);
    assert.equal(result.manifest[1].sha256, createHash('sha256').digest('hex'));
});
test('synchronous copy isolates caller mutation and preserves caller buffer', async () => {
    const bytes = Buffer.from(SKILL);
    const original = createHash('sha256').update(bytes).digest('hex');
    const pending = md(bytes);
    bytes.fill(0);
    const result = await pending;
    assert(result.ok);
    assert.equal(result.contentHash, original);
    assert.equal(bytes.length, SKILL.length);
});
test('SharedArrayBuffer source is rejected before starting a worker', async () => {
    const result = await validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes: new Uint8Array(new SharedArrayBuffer(32)) });
    assert(!result.ok);
    assert.equal(result.reason, 'UNSHARED_BYTES_REQUIRED');
});
test('a subarray hashes only its own range', async () => {
    const all = Buffer.concat([Buffer.from('prefix'), SKILL, Buffer.from('suffix')]);
    const result = await md(all.subarray(6, 6 + SKILL.length));
    assert(result.ok);
    assert.equal(result.inputBytes, SKILL.length);
});
for (const name of ['skill.md', 'README.md', '/tmp/SKILL.md'])
    test(`standalone name ${name} is rejected`, async () => {
        const r = await validateInstallPackage({ format: 'markdown', fileName: name, bytes: SKILL });
        assert(!r.ok);
    });
for (const [label, text] of [
    ['missing', 'body'], ['empty body', '---\nname: s\ndescription: d\n---\n  '],
    ['missing description', '---\nname: s\n---\nbody'], ['missing name', '---\ndescription: d\n---\nbody'],
    ['empty name', '---\nname: " "\ndescription: d\n---\nbody'], ['numeric name', '---\nname: 3\ndescription: d\n---\nbody'],
    ['duplicate', '---\nname: a\nname: b\ndescription: d\n---\nbody'],
    ['alias', '---\nname: &x s\ndescription: *x\n---\nbody'],
    ['custom tag', '---\nname: !evil s\ndescription: d\n---\nbody'],
    ['standard explicit tag', '---\nname: !!str s\ndescription: d\n---\nbody'],
    ['complex key', '---\n? [a,b]\n: c\nname: s\ndescription: d\n---\nbody'],
    ['multiple documents', '---\nname: s\ndescription: d\n...\nname: other\n---\nbody'],
    ['unclosed', '---\nname: s\ndescription: d\nbody'],
])
    test(`Markdown rejects ${label}`, async () => { const r = await md(Buffer.from(text)); assert(!r.ok, JSON.stringify(r)); assert.equal(r.code, 'INVALID_SKILL'); });
for (const name of ['Upper', 'has space', '../bad', 'a_b', '-start', 'end-', 'two--hyphens', '技能'])
    test(`invalid invocation name ${name}`, async () => {
        const r = await md(Buffer.from(`---\nname: ${name}\ndescription: valid\n---\nbody`));
        assert(!r.ok);
        assert.equal(r.code, 'INVALID_SKILL');
    });
test('Unicode override cannot hide raw legacy traversal', async () => {
    const raw = Buffer.concat([Buffer.from('../'), Buffer.from([0x82])]);
    await rejected(packageWith({ name: raw, flags: 0, extra: unicodeExtra(raw, 'safe') }), 'UNSAFE_PATH');
});
test('strict UTF8 rejects malformed text', async () => { const r = await md(Buffer.concat([SKILL, Buffer.from([0xc0, 0xaf])])); assert(!r.ok); });
test('BOM and CRLF preserve original byte accounting', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SKILL.toString().replaceAll('\n', '\r\n'))]);
    const r = await md(bytes);
    assert(r.ok);
    assert.equal(r.inputBytes, bytes.length);
});
test('untrusted metadata cannot grant recommendation, permissions or auto update', async () => {
    const r = await md(Buffer.from('---\nname: s\ndescription: d\nrecommended: true\nautoUpdate: true\npermissions: [all]\n---\n<script>never run</script>'));
    assert(r.ok);
    assert.deepEqual(r.metadata, { name: 's', description: 'd', version: null });
});
for (const path of ['../evil', '/absolute', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'C:/bad', '//server/share', 'nul', 'CON.txt', 'a.', 'a ', 'a\0b', 'a:b', 'a\u001fb']) {
    test(`reject unsafe path ${JSON.stringify(path)}`, () => rejected(packageWith({ name: path }), 'UNSAFE_PATH'));
}
for (const pair of [['a', 'A'], ['é', 'e\u0301'], ['Straße', 'STRASSE'], ['ς', 'Σ'], ['İ', 'i\u0307'], ['a', 'a/'], ['a', 'a/b'], ['same', 'same']]) {
    test(`reject collision ${JSON.stringify(pair)}`, () => rejected(zipFixture([{ name: 'SKILL.md', bytes: SKILL }, ...pair.map(name => ({ name }))]), 'UNSAFE_PATH'));
}
test('fixed full folding covers C/F and non-Turkic behavior', () => {
    assert.equal(pathKey('ßİΣς'), 'ssi\u0307σσ');
    assert.notEqual(pathKey('I'), pathKey('ı'));
});
for (const mode of [0xa1ff0000, 0x21ff0000, 0x61ff0000, 0x11ff0000, 0xc1ff0000])
    test(`reject special mode ${mode.toString(16)}`, () => rejected(packageWith({ name: 'special', attrs: mode }), 'UNSAFE_PATH'));
test('reject Unix hardlink extra', () => rejected(packageWith({ name: 'link', extra: extraField(0x000d, Buffer.alloc(13)) }), 'UNSAFE_PATH'));
for (const entries of [[{ name: 'no-skill' }], [{ name: 'one/SKILL.md', bytes: SKILL }, { name: 'two/SKILL.md', bytes: SKILL }], [{ name: 'one/two/SKILL.md', bytes: SKILL }], [{ name: 'wrap/SKILL.md', bytes: SKILL }, { name: 'outside' }], [{ name: 'skill.md', bytes: SKILL }]]) {
    test(`reject invalid root ${entries.map(e => e.name).join(',')}`, () => rejected(zipFixture(entries), 'INVALID_SKILL'));
}
test('CP437 raw filename decodes losslessly', async () => {
    const r = await zip(packageWith({ name: Buffer.from([0x82, 0x2e, 0x74, 0x78, 0x74]), flags: 0 }));
    assert(r.ok, JSON.stringify(r));
    assert.equal(r.manifest[1].path, 'é.txt');
});
test('valid Unicode path extra with CP437 is supported', async () => {
    const raw = Buffer.from([0x82, 0x2e, 0x74, 0x78, 0x74]);
    const r = await zip(packageWith({ name: raw, flags: 0, extra: unicodeExtra(raw, 'é.txt') }));
    assert(r.ok, JSON.stringify(r));
});
test('bad Unicode extra CRC rejected', async () => {
    const raw = Buffer.from([0x82]);
    const extra = unicodeExtra(raw, 'é');
    extra[5] ^= 1;
    await rejected(packageWith({ name: raw, flags: 0, extra }), 'UNSAFE_PATH');
});
test('Unicode extra raw ASCII conflict rejected', () => rejected(packageWith({ name: 'safe', flags: 0, extra: unicodeExtra(Buffer.from('safe'), '../bad') }), 'UNSAFE_PATH'));
test('local and central Unicode extras must agree', () => rejected(packageWith({ name: 'é', extra: unicodeExtra(Buffer.from('é'), 'é'), localExtra: Buffer.alloc(0) }), 'UNSAFE_PATH'));
test('malformed UTF8 path is rejected without replacement', () => rejected(packageWith({ name: Buffer.from([0xc0, 0xaf]) }), 'UNSAFE_PATH'));
test('duplicate extra records rejected', () => rejected(packageWith({ name: 'x', extra: Buffer.concat([extraField(2, Buffer.alloc(0)), extraField(2, Buffer.alloc(0))]) })));
test('truncated extra framing rejected', () => rejected(packageWith({ name: 'x', extra: Buffer.from([2, 0, 3, 0, 1]) })));
test('ZIP64 extra is rejected', () => rejected(packageWith({ name: 'x', extra: extraField(1, Buffer.alloc(16)) })));
test('NTFS timestamp truncated record is rejected', () => rejected(packageWith({ name: 'x', extra: extraField(10, Buffer.alloc(5)) })));
for (const flags of [1, 0x40, 0x2000, 0x10])
    test(`reject flags ${flags}`, () => rejected(packageWith({ name: 'x', flags })));
test('unsupported method rejected', () => rejected(packageWith({ name: 'x', method: 12 })));
test('directory cannot carry data or ratio denominator', () => rejected(packageWith({ name: 'dir/', bytes: Buffer.from('bad') })));
test('CRC mismatch rejected including empty file', async () => { await rejected(packageWith({ name: 'x', bytes: Buffer.from('x'), crc: 42 })); await rejected(packageWith({ name: 'empty', crc: 1 })); });
for (const descriptor of ['signed', 'unsigned'])
    test(`descriptor ${descriptor} CRC mismatch rejected`, async () => {
        const bytes = zipFixture([{ name: 'SKILL.md', bytes: SKILL, descriptor }]);
        bytes[30 + 8 + SKILL.length + (descriptor === 'signed' ? 4 : 0)] ^= 1;
        await rejected(bytes);
    });
test('local filename mismatch rejected', async () => { const bytes = zipFixture([{ name: 'SKILL.md', bytes: SKILL }]); bytes[30] = 0x58; await rejected(bytes); });
test('local CRC mismatch rejected', async () => { const bytes = zipFixture([{ name: 'SKILL.md', bytes: SKILL }]); bytes[14] ^= 1; await rejected(bytes); });
test('payload padding rejected by consumed bytes rather than delivered bytes', () => rejected(zipFixture([{ name: 'SKILL.md', bytes: SKILL, method: 8, payload: Buffer.concat([deflateRawSync(SKILL), Buffer.alloc(9)]) }])));
test('concatenated deflate streams rejected by actual consumed bytes', () => rejected(zipFixture([{ name: 'SKILL.md', bytes: SKILL, method: 8, payload: Buffer.concat([deflateRawSync(SKILL), deflateRawSync(SKILL)]) }])));
test('truncated deflate stream rejected', () => rejected(zipFixture([{ name: 'SKILL.md', bytes: SKILL, method: 8, payload: deflateRawSync(SKILL).subarray(0, -1) }])));
for (const [label, mutate] of [
    ['multi disk', (b) => b.writeUInt16LE(1, b.length - 18)],
    ['ZIP64 sentinel', (b) => b.writeUInt16LE(65535, b.length - 12)],
    ['central size', (b) => b.writeUInt32LE(1, b.length - 10)],
    ['entry disk', (b) => b.writeUInt16LE(1, b.readUInt32LE(b.length - 6) + 34)],
    ['overlap', (b) => { const c = b.readUInt32LE(b.length - 6); b.writeUInt32LE(0, c + 46 + 8 + 42); }],
])
    test(`structure rejects ${label}`, async () => { const b = packageWith({ name: 'x' }); mutate(b); await rejected(b); });
test('trailing garbage and truncated archive rejected', async () => { const b = zipFixture([{ name: 'SKILL.md', bytes: SKILL }]); await rejected(Buffer.concat([b, Buffer.from('junk')])); await rejected(b.subarray(0, -1)); });
test('resource actual output limit cannot be bypassed by smaller declared size', () => rejected(packageWith({ name: 'x', bytes: randomBytes(50000), method: 8, declaredSize: 10 })));
test('ZIP 20MiB and +1 use inclusive bounded input', async () => {
    const at = await zip(Buffer.alloc(L.zipBytes));
    assert(!at.ok);
    assert.notEqual(at.reason, 'INPUT_BYTES');
    const over = await zip(Buffer.alloc(L.zipBytes + 1));
    assert(!over.ok);
    assert.equal(over.reason, 'INPUT_BYTES');
});
test('standalone and ZIP SKILL bytes exact 1MiB accepted, +1 rejected', async () => {
    const exact = Buffer.concat([SKILL, Buffer.alloc(L.skillBytes - SKILL.length, 0x61)]);
    assert((await md(exact)).ok);
    assert((await zip(zipFixture([{ name: 'SKILL.md', bytes: exact }]))).ok);
    assert(!(await md(Buffer.concat([exact, Buffer.from('x')]))).ok);
    await rejected(zipFixture([{ name: 'SKILL.md', bytes: Buffer.concat([exact, Buffer.from('x')]) }]), 'PACKAGE_LIMIT');
});
test('resource exact 10MiB accepted and +1 rejected', async () => {
    const data = Buffer.alloc(L.resourceBytes, 7);
    assert((await zip(packageWith({ name: 'data', bytes: data }))).ok);
    await rejected(packageWith({ name: 'data', bytes: Buffer.concat([data, Buffer.from('x')]) }), 'PACKAGE_LIMIT');
});
test('entry count includes directory entries, 1000 accepted and 1001 rejected', async () => {
    const entries = [{ name: 'SKILL.md', bytes: SKILL }, ...Array.from({ length: 999 }, (_, i) => ({ name: `d${i}/` }))];
    assert((await zip(zipFixture(entries))).ok);
    await rejected(zipFixture([...entries, { name: 'extra/' }]), 'PACKAGE_LIMIT');
});
test('raw frontmatter byte limit includes delimiter and CRLF, excludes BOM', async () => {
    const prefix = '---\r\nname: s\r\ndescription: d\r\n#';
    const suffix = '\r\n---\r\n';
    const front = prefix + 'a'.repeat(L.frontmatterBytes - Buffer.byteLength(prefix + suffix)) + suffix;
    assert((await md(Buffer.from('\ufeff' + front + 'body'))).ok);
    const r = await md(Buffer.from('\ufeff' + front.replace('#', '#a') + 'body'));
    assert(!r.ok);
    assert.equal(r.reason, 'FRONTMATTER_BYTES');
});
test('depth pre-strip 8 accepted, 9 rejected', async () => {
    assert((await zip(zipFixture([{ name: 'w/SKILL.md', bytes: SKILL }, { name: 'w/a/b/c/d/e/f/g' }]))).ok);
    await rejected(zipFixture([{ name: 'w/SKILL.md', bytes: SKILL }, { name: 'w/a/b/c/d/e/f/g/h' }]), 'PACKAGE_LIMIT');
});
test('240 code points accepted, 241 rejected', async () => {
    assert((await zip(packageWith({ name: 'a'.repeat(240) }))).ok);
    await rejected(packageWith({ name: 'a'.repeat(241) }), 'PACKAGE_LIMIT');
});
test('255 component bytes accepted, 256 rejected', async () => {
    assert((await zip(packageWith({ name: 'é'.repeat(127) + 'a' }))).ok);
    await rejected(packageWith({ name: 'é'.repeat(128) }), 'PACKAGE_LIMIT');
});
test('UTF8 total bytes use actual encoding, not UTF16 length', () => {
    const name = Array.from({ length: 4 }, () => '😀'.repeat(59)).join('/');
    assert.equal(Array.from(name).length, 239);
    assert.equal(Buffer.byteLength(normalizePath(name, L).path), 947);
    assert.throws(() => normalizePath(name, { ...L, pathBytes: 946 }));
});
test('compression budget integer boundary and zero denominator', () => {
    assert.doesNotThrow(() => checkLimit(100, 1 * L.ratio, 'COMPRESSION_RATIO'));
    assert.throws(() => checkLimit(101, 1 * L.ratio, 'COMPRESSION_RATIO'));
    assert.doesNotThrow(() => checkLimit(0, 0, 'COMPRESSION_RATIO'));
    assert.throws(() => checkLimit(1, 0, 'COMPRESSION_RATIO'));
});
test('high ratio real deflate rejected without buffering full output', () => rejected(packageWith({ name: 'bomb', bytes: Buffer.alloc(2 * 1024 * 1024), method: 8 }), 'PACKAGE_LIMIT'));
test('total bytes exact reduced budget accepted and +1 rejected during streaming', async () => {
    const b = packageWith({ name: 'r', bytes: Buffer.alloc(100) });
    assert((await zip(b, { totalBytes: SKILL.length + 100 })).ok);
    const r = await zip(b, { totalBytes: SKILL.length + 99 });
    assert(!r.ok);
    assert.equal(r.reason, 'TOTAL_BYTES');
});
test('lowered actual output budget stops a lying deflate declaration', async () => {
    const r = await zip(packageWith({ name: 'r', bytes: randomBytes(10000), method: 8, declaredSize: 10 }), { resourceBytes: 100 });
    assert(!r.ok);
    assert.equal(r.reason, 'RESOURCE_BYTES');
});
test('callers cannot raise any production hard limit', async () => {
    for (const key of Object.keys(L)) {
        const r = await md(SKILL, { [key]: L[key] + 1 });
        assert(!r.ok);
        assert.equal(r.reason, 'INVALID_BUDGET');
    }
});
test('compressed empty directories are measured without contributing ratio budget', async () => {
    const r = await zip(zipFixture([{ name: 'w/', method: 8 }, { name: 'w/SKILL.md', bytes: SKILL }, { name: 'w/empty/', method: 8 }]));
    assert(r.ok, JSON.stringify(r));
    assert.equal(r.totalBytes, SKILL.length);
    await rejected(zipFixture([{ name: 'w/', method: 8, payload: Buffer.concat([deflateRawSync(Buffer.alloc(0)), Buffer.from('padding')]) }, { name: 'w/SKILL.md', bytes: SKILL }]));
});
test('real deflate u=100*c accepted and u=100*c+1 rejected', async () => {
    assert.equal(deflateRawSync(Buffer.alloc(1200, 97)).length, 12);
    assert.equal(deflateRawSync(Buffer.alloc(1201, 97)).length, 12);
    assert((await zip(packageWith({ name: 'ratio', bytes: Buffer.alloc(1200, 97), method: 8 }))).ok);
    await rejected(packageWith({ name: 'ratio', bytes: Buffer.alloc(1201, 97), method: 8 }), 'PACKAGE_LIMIT');
});
test('real total 100MiB accepted and cumulative +1 rejected', async () => {
    const block = Buffer.concat([randomBytes(16384), Buffer.alloc(131072)]);
    const resource = Buffer.alloc(L.resourceBytes);
    for (let offset = 0; offset < resource.length; offset += block.length)
        block.copy(resource, offset, 0, Math.min(block.length, resource.length - offset));
    const entries = [{ name: 'SKILL.md', bytes: SKILL, method: 8 }, ...Array.from({ length: 9 }, (_, i) => ({ name: `r${i}`, bytes: resource, method: 8 })), { name: 'last', bytes: resource.subarray(0, resource.length - SKILL.length), method: 8 }];
    const exact = zipFixture(entries);
    assert(exact.length < L.zipBytes);
    const r = await zip(exact);
    assert(r.ok, JSON.stringify(r));
    assert.equal(r.totalBytes, L.totalBytes);
    entries[entries.length - 1].bytes = resource.subarray(0, resource.length - SKILL.length + 1);
    await rejected(zipFixture(entries), 'PACKAGE_LIMIT');
});
test('deep YAML stays bounded and rejects invalid nesting', async () => {
    const r = await md(Buffer.from('---\nname: s\ndescription: d\na: ' + '['.repeat(10000) + 'x' + ']'.repeat(10000) + '\n---\nbody'));
    assert(!r.ok);
});
test('independent MD total budget cannot be bypassed', async () => {
    const r = await md(SKILL, { totalBytes: SKILL.length - 1 });
    assert(!r.ok);
    assert.equal(r.reason, 'TOTAL_BYTES');
});
test('already aborted input creates no result manifest', async () => {
    const c = new AbortController();
    c.abort();
    const r = await validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes: SKILL }, { signal: c.signal });
    assert(!r.ok);
    assert.equal(r.code, 'VALIDATION_ABORTED');
});
for (const mode of ['cancel', 'timeout'])
    test(`worker ${mode} actually exits before promise settles`, async () => {
        const workers = new Set();
        const destroyed = new Set();
        const hook = createHook({ init(id, type) { if (type === 'WORKER')
                workers.add(id); }, destroy(id) { destroyed.add(id); } });
        hook.enable();
        try {
            const c = new AbortController();
            const p = validateInstallPackage({ format: 'zip', fileName: 'test.zip', bytes: packageWith({ name: 'large', bytes: randomBytes(1024 * 1024), method: 8 }) }, { signal: c.signal, limits: { timeoutMs: mode === 'timeout' ? 1 : 30000 } });
            if (mode === 'cancel')
                c.abort();
            const r = await p;
            assert(!r.ok);
            assert.equal(r.code, mode === 'cancel' ? 'VALIDATION_ABORTED' : 'VALIDATION_TIMEOUT');
            await immediate();
            assert.equal(workers.size, 1);
            for (const id of workers)
                assert(destroyed.has(id), 'WORKER resource must be destroyed');
        }
        finally {
            hook.disable();
        }
    });
for (const field of ['format', 'fileName', 'bytes']) {
    for (const format of ['markdown', 'zip'])
        test(`admission rejects ${format} ${field} accessor without invoking it`, async () => {
            const input = { format, fileName: format === 'zip' ? 'test.zip' : 'SKILL.md', bytes: SKILL };
            let calls = 0;
            Object.defineProperty(input, field, { get() { calls++; throw new Error('PRIVATE_GETTER'); } });
            const result = await validateInstallPackage(input);
            assert(!result.ok);
            assert.equal(calls, 0);
            assert(!JSON.stringify(result).includes('PRIVATE_GETTER'));
        });
}
test('admission does not execute reentrant or detaching byte getters', async () => {
    const backing = new ArrayBuffer(SKILL.length);
    const bytes = new Uint8Array(backing);
    bytes.set(SKILL);
    let calls = 0;
    const input = { format: 'markdown', fileName: 'SKILL.md', get bytes() {
            calls++;
            void validateInstallPackage(input);
            structuredClone(backing, { transfer: [backing] });
            return bytes;
        } };
    const result = await validateInstallPackage(input);
    assert(!result.ok);
    assert.equal(calls, 0);
    assert.equal(backing.byteLength, SKILL.length);
});
test('input proxies are rejected without invoking descriptor or get traps', async () => {
    let traps = 0;
    const input = new Proxy({ format: 'markdown', fileName: 'SKILL.md', bytes: SKILL }, {
        get() { traps++; throw new Error('PRIVATE_PROXY'); },
        getOwnPropertyDescriptor() { traps++; throw new Error('PRIVATE_PROXY'); },
    });
    const result = await validateInstallPackage(input);
    assert(!result.ok);
    assert.equal(traps, 0);
});
test('inherited byte accessors are rejected without prototype traversal', async () => {
    let calls = 0;
    const input = Object.assign(Object.create({ get bytes() { calls++; return SKILL; } }), { format: 'markdown', fileName: 'SKILL.md' });
    assert(!(await validateInstallPackage(input)).ok);
    assert.equal(calls, 0);
});
for (const kind of ['buffer', 'uint8array', 'subclass'])
    test(`intrinsic range preserves ${kind} subview hash without public getters`, async () => {
        class ByteSubclass extends Uint8Array {
        }
        const backing = new ArrayBuffer(SKILL.length + 24);
        const bytes = kind === 'buffer' ? Buffer.from(backing, 11, SKILL.length)
            : kind === 'subclass' ? new ByteSubclass(backing, 11, SKILL.length) : new Uint8Array(backing, 11, SKILL.length);
        bytes.set(SKILL);
        let calls = 0;
        for (const field of ['buffer', 'byteOffset', 'byteLength', 'length', Symbol.iterator]) {
            Object.defineProperty(bytes, field, { get() { calls++; throw new Error('PRIVATE_VIEW'); } });
        }
        const pending = validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes });
        new Uint8Array(backing).fill(0);
        const result = await pending;
        assert(result.ok, JSON.stringify(result));
        assert.equal(calls, 0);
        assert.equal(result.inputBytes, SKILL.length);
        assert.equal(result.contentHash, createHash('sha256').update(SKILL).digest('hex'));
        assert.equal(backing.byteLength, SKILL.length + 24);
    });
test('shadowed SAB backing is rejected without executing public getters', async () => {
    const bytes = new Uint8Array(new SharedArrayBuffer(SKILL.length));
    bytes.set(SKILL);
    let calls = 0;
    Object.defineProperty(bytes, 'buffer', { get() { calls++; return new ArrayBuffer(SKILL.length); } });
    const result = await validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes });
    assert(!result.ok);
    assert.equal(result.reason, 'UNSHARED_BYTES_REQUIRED');
    assert.equal(calls, 0);
});
test('detached ordinary backing returns a redacted failure before worker creation', async () => {
    const backing = new ArrayBuffer(SKILL.length);
    const bytes = new Uint8Array(backing);
    bytes.set(SKILL);
    structuredClone(backing, { transfer: [backing] });
    const workers = new Set();
    const hook = createHook({ init(id, type) { if (type === 'WORKER')
            workers.add(id); } });
    hook.enable();
    try {
        const result = await validateInstallPackage({ format: 'markdown', fileName: 'SKILL.md', bytes });
        assert(!result.ok);
        assert.deepEqual(Object.keys(result).sort(), ['code', 'ok', 'reason']);
        assert.equal(workers.size, 0);
    }
    finally {
        hook.disable();
    }
});
test('real oversized ZIP cannot hide its intrinsic size or start a worker', async () => {
    const entries = [{ name: 'SKILL.md', bytes: SKILL }, { name: 'a' }, { name: 'b' }];
    const overhead = zipFixture(entries).length;
    entries[1].bytes = Buffer.alloc(L.resourceBytes, 97);
    entries[2].bytes = Buffer.alloc(L.zipBytes + 1 - overhead - L.resourceBytes, 98);
    const bytes = zipFixture(entries);
    assert.equal(bytes.length, L.zipBytes + 1);
    let calls = 0;
    Object.defineProperty(bytes, 'byteLength', { get() { calls++; return 1; } });
    const workers = new Set();
    const hook = createHook({ init(id, type) { if (type === 'WORKER')
            workers.add(id); } });
    hook.enable();
    try {
        assert.deepEqual(await zip(bytes), { ok: false, code: 'PACKAGE_LIMIT', reason: 'INPUT_BYTES' });
        assert.equal(calls, 0);
        assert.equal(workers.size, 0);
    }
    finally {
        hook.disable();
    }
});
/** Exercise the worker boundary directly, without the public admission checks. */
async function validateWorkerInput(bytes, format, limits = {}) {
    const { Worker } = await import('node:worker_threads');
    const worker = new Worker(new URL('../install-validation-worker.js', import.meta.url), { workerData: { bytes, format, limits } });
    return new Promise((resolve, reject) => {
        let result;
        const timer = setTimeout(() => { void worker.terminate(); reject(new Error('worker test deadline')); }, 5000);
        worker.once('message', (message) => { result = message; });
        worker.once('error', reject);
        worker.once('exit', code => {
            clearTimeout(timer);
            if (code !== 0 || !result)
                reject(new Error('worker did not return a result'));
            else
                resolve(result);
        });
    });
}
for (const format of ['zip', 'markdown'])
    test(`worker independently checks actual ${format} input bytes`, async () => {
        const limit = format === 'zip' ? L.zipBytes : L.skillBytes;
        assert.deepEqual(await validateWorkerInput(new ArrayBuffer(limit + 1), format), { ok: false, code: 'PACKAGE_LIMIT', reason: 'INPUT_BYTES' });
    });
for (const budget of ['skillBytes', 'totalBytes'])
    test(`worker independently checks reduced Markdown ${budget}`, async () => {
        const backing = new ArrayBuffer(SKILL.length);
        new Uint8Array(backing).set(SKILL);
        assert.deepEqual(await validateWorkerInput(backing, 'markdown', { [budget]: SKILL.length - 1 }), {
            ok: false, code: 'PACKAGE_LIMIT', reason: budget === 'skillBytes' ? 'INPUT_BYTES' : 'TOTAL_BYTES',
        });
    });
test('worker independently enforces reduced ZIP budget', async () => {
    const bytes = zipFixture([{ name: 'SKILL.md', bytes: SKILL }]);
    const backing = new ArrayBuffer(bytes.length);
    new Uint8Array(backing).set(bytes);
    assert.deepEqual(await validateWorkerInput(backing, 'zip', { zipBytes: bytes.length - 1 }), { ok: false, code: 'PACKAGE_LIMIT', reason: 'INPUT_BYTES' });
});
test('worker rejects shared backing and invalid formats with finite failures', async () => {
    for (const [bytes, format] of [[new SharedArrayBuffer(32), 'markdown'], [new ArrayBuffer(32), 'other']]) {
        const result = await validateWorkerInput(bytes, format);
        assert(!result.ok);
        assert.equal(result.code, 'PACKAGE_FORMAT');
        assert.deepEqual(Object.keys(result).sort(), ['code', 'ok', 'reason']);
    }
});
test('worker cannot be given enlarged hard limits', async () => {
    assert.deepEqual(await validateWorkerInput(new ArrayBuffer(0), 'zip', { zipBytes: L.zipBytes + 1 }), {
        ok: false, code: 'PACKAGE_LIMIT', reason: 'INVALID_BUDGET',
    });
});
