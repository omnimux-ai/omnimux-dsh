import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constants } from 'node:fs';
import { parseDevDeepSeekCredential, readDevDeepSeekCredential } from './test-env-credentials.mjs';

const good = 'refs:\n  DEEPSEEK_API_KEY: fixture-only-value\n  OTHER_KEY: ignored\n';
const fails = (fn, code) => assert.throws(fn, (error) => error.message === code && error.code === code && !error.cause);

test('parses only the exact nonempty DeepSeek reference', () => {
  assert.equal(parseDevDeepSeekCredential(good), 'fixture-only-value');
  assert.equal(parseDevDeepSeekCredential('refs: { DEEPSEEK_API_KEY: "  fixture-only-value  " }'), 'fixture-only-value');
});
for (const [name, text] of Object.entries({
  malformed: 'refs: [', duplicate: 'refs: { DEEPSEEK_API_KEY: first, DEEPSEEK_API_KEY: second }',
  alias: 'refs: &a { DEEPSEEK_API_KEY: fixture-only-value }\ncopy: *a',
  anchor: 'refs: &a { DEEPSEEK_API_KEY: fixture-only-value }',
  tag: 'refs: { DEEPSEEK_API_KEY: !secret fixture-only-value }',
  knownTag: 'refs: { DEEPSEEK_API_KEY: !!str fixture-only-value }',
  multiDocument: `${good}\n---\n${good}`, missing: 'refs: { OMNIMUX_API_KEY: fixture-only-value }',
  empty: 'refs: { DEEPSEEK_API_KEY: " " }', numeric: 'refs: { DEEPSEEK_API_KEY: 123 }',
  mapping: 'refs: { DEEPSEEK_API_KEY: { value: fixture-only-value } }',
  sequence: 'refs: [fixture-only-value]', merge: 'refs: { <<: {DEEPSEEK_API_KEY: fixture-only-value} }',
  rootSequence: '- refs: {}', prototype: 'refs: { __proto__: {DEEPSEEK_API_KEY: fixture-only-value} }',
})) test(`rejects ${name} with no source in error`, () => fails(() => parseDevDeepSeekCredential(text), 'TEST_ENV_CREDENTIAL_INVALID'));
test('bounds input bytes before parsing', () => {
  fails(() => parseDevDeepSeekCredential('x'.repeat(65537)), 'TEST_ENV_CREDENTIAL_TOO_LARGE');
  fails(() => parseDevDeepSeekCredential(null), 'TEST_ENV_CREDENTIAL_INVALID');
});

function fixture(overrides = {}) {
  const calls = [];
  const directory = { dev: 1, ino: 1, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
  const file = { dev: 1, ino: 2, size: Buffer.byteLength(good), isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
  const io = {
    realpathSync(path) { calls.push(['realpath', path]); return path; },
    lstatSync(path) { calls.push(['lstat', path]); return path.endsWith('.credentials.yaml') ? file : directory; },
    openSync(path, flags) { calls.push(['open', path, flags]); return 42; },
    fstatSync() { return file; },
    readSync(fd, buffer, offset, length, position) { calls.push(['read', fd]); return Buffer.from(good).copy(buffer, offset, position, position + length); },
    closeSync(fd) { calls.push(['close', fd]); },
    ...overrides,
  };
  return { io, calls, file, directory, home: '/fixture-user' };
}
test('reads only fixed Dev file with no-follow and closes descriptor', () => {
  const f = fixture();
  assert.equal(readDevDeepSeekCredential({ fs: f.io, userInfo: () => ({ homedir: f.home }) }), 'fixture-only-value');
  assert.deepEqual(f.calls.find(([op]) => op === 'open').slice(1), ['/fixture-user/.omnimux-dev/.credentials.yaml', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK]);
  assert.deepEqual(f.calls.at(-1), ['close', 42]);
  assert.ok(f.calls.filter(([op]) => ['realpath', 'lstat', 'open'].includes(op)).every(([, p]) => p.startsWith('/fixture-user')));
});
for (const failure of ['directory-link', 'file-link', 'escape', 'not-file', 'too-large', 'changed-inode', 'read-error', 'missing']) {
  test(`rejects ${failure} without secret diagnostics`, () => {
    const f = fixture();
    if (failure === 'directory-link' || failure === 'file-link') f.io.lstatSync = (p) => ({ ...(p.endsWith('.yaml') ? f.file : f.directory), isSymbolicLink: () => failure === 'file-link' ? p.endsWith('.yaml') : p.endsWith('.omnimux-dev') });
    if (failure === 'escape') f.io.realpathSync = () => '/forbidden';
    if (failure === 'not-file') f.io.fstatSync = () => f.directory;
    if (failure === 'too-large') f.io.fstatSync = () => ({ ...f.file, size: 65537 });
    if (failure === 'changed-inode') f.io.fstatSync = () => ({ ...f.file, ino: 999 });
    if (failure === 'read-error') f.io.readSync = () => { throw new Error('fixture-only-value'); };
    if (failure === 'missing') f.io.openSync = () => { throw Object.assign(new Error('fixture-only-value'), { code: 'ENOENT' }); };
    assert.throws(() => readDevDeepSeekCredential({ fs: f.io, userInfo: () => ({ homedir: f.home }) }), (e) => /^TEST_ENV_CREDENTIAL_[A-Z_]+$/.test(e.message) && !e.cause && e.code === e.message);
    if (f.calls.some(([op]) => op === 'open') && failure !== 'missing') assert.deepEqual(f.calls.at(-1), ['close', 42]);
    if (!['read-error'].includes(failure)) assert.equal(f.calls.some(([op]) => op === 'read'), false);
  });
}
test('invalid YAML still closes the descriptor', () => {
  const f = fixture({ readSync() { return 0; } });
  fails(() => readDevDeepSeekCredential({ fs: f.io, userInfo: () => ({ homedir: f.home }) }), 'TEST_ENV_CREDENTIAL_INVALID');
  assert.deepEqual(f.calls.at(-1), ['close', 42]);
});
