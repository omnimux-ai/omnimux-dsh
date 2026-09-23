import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { privateStarterFs, redact, taskRoot } from './composer-inline-bootstrap.mjs';

test('private starter rejects forbidden paths before reading metadata', () => {
  const calls = [];
  const io = new Proxy({ constants: {}, lstatSync: () => ({ isSymbolicLink: () => false }) }, { get(target, key) { return target[key] || ((...args) => { calls.push([key, ...args]); return true; }); } });
  const guarded = privateStarterFs(io, '/fixture/home');
  for (const path of ['/fixture/home/.omnimux-dev/', '/fixture/home/.omnimux/profiles/web/x', new URL('file:///fixture/home/.omnimux-dev/profiles/omnimux')]) {
    assert.equal(guarded.existsSync(path), false);
    assert.throws(() => guarded.readFileSync(path), /forbids shared profile/);
    assert.throws(() => guarded.cpSync('/private/source', path), /forbids shared profile/);
    assert.throws(() => guarded.symlinkSync(path, '/private/destination'), /forbids shared profile/);
  }
  assert.equal(calls.length, 0);
  assert.throws(() => guarded.openSync, /method not admitted/);
  assert.throws(() => guarded.readFileSync(Buffer.from('/private/file')), /requires string/);
  assert.equal(guarded.existsSync('/private/package'), true);
  assert.equal(calls.length, 1);
});

test('private starter fails closed on task-owned ancestor links and missing descendants', () => {
  const root = fs.mkdtempSync(join(taskRoot, '.agent-reports/composer-inline/path-fixture-'));
  try {
    const home = join(root, 'home');
    fs.mkdirSync(join(home, '.omnimux-dev'), { recursive: true });
    fs.symlinkSync(home, join(root, 'alias'));
    fs.symlinkSync(join(root, 'missing'), join(root, 'dangling'));
    const guarded = privateStarterFs(fs, home);
    for (const path of [join(root, 'alias/.omnimux-dev/new/deep/file'), join(root, 'dangling/file')]) {
      assert.throws(() => guarded.readFileSync(path), /symlink path ancestors/);
      assert.throws(() => guarded.mkdirSync(path, { recursive: true }), /symlink path ancestors/);
      assert.throws(() => guarded.cpSync(root, path), /symlink path ancestors/);
    }
    assert.throws(() => guarded.symlinkSync('.omnimux-dev/child', join(home, 'link')), /shared profile/);
    assert.equal(guarded.existsSync(join(home, '.omnimux-dev-other')), false);
    guarded.mkdirSync(join(home, 'safe/new'), { recursive: true });
    assert.equal(fs.statSync(join(home, 'safe/new')).isDirectory(), true);
    const denied = privateStarterFs({ lstatSync() { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } }, home);
    assert.throws(() => denied.existsSync(join(root, 'safe')), /denied/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('diagnostics remove synthetic credential forms and preserve hashes', () => {
  for (const text of [
    'https://example.test/?Token=SENTINEL%2Fabc+def.xyz&next=ok',
    'https://SENTINEL:password@example.test/path',
    'Authorization: Bearer SENTINEL', 'Cookie: session=SENTINEL; other=value',
    'Set-Cookie: session=SENTINEL; HttpOnly', '{"access_token":"SENTINEL"}',
    'Error: https://example.test/?api_key=SENTINEL\n at fn', 'Basic SENTINEL',
  ]) assert.ok(!redact(text).includes('SENTINEL'), text);
  assert.equal(redact('bundleHash=abcdef012345 /private/evidence'), 'bundleHash=abcdef012345 /private/evidence');
  const childRedact = Function(`return (${redact.toString()})`)();
  assert.equal(childRedact('Bearer SENTINEL'), 'Bearer REDACTED');
});
