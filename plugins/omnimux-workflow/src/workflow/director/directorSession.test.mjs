import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDirectorSessionFactory } from './directorSession.ts';

function fixture(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'director-session-'));
  t.after(() => { assert.ok(stateDir.startsWith(resolve(tmpdir()))); rmSync(stateDir, { force: true, recursive: true }); });
  return { stateDir, factory: createDirectorSessionFactory({ stateDir }) };
}

test('authenticated local operator is persisted independently of workspace and cloud keys', t => {
  const { stateDir, factory } = fixture(t);
  const first = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=fixture-a' });
  const restarted = createDirectorSessionFactory({ stateDir }).fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=fixture-a' });
  assert.equal(first.operatorScope, restarted.operatorScope);
  assert.equal(first.owner, restarted.owner);
  assert.equal(first.cloudAccount.status, 'unknown');
  assert.equal(first.modelTaskScope, null);
  assert.equal(first.localProjects, 'installation-shared');
  assert.ok(!JSON.stringify(first).includes('fixture-a'));
  assert.ok(!JSON.stringify(first).includes('workspace'));
});

test('login cookie changes rotate owner and durable epoch including A to B to A', t => {
  const { stateDir, factory } = fixture(t);
  const a = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a' });
  const same = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a' });
  const b = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=b' });
  const again = createDirectorSessionFactory({ stateDir }).fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a' });
  assert.equal(a.epoch, same.epoch);
  assert.notEqual(a.owner, b.owner);
  assert.equal(b.epoch, a.epoch + 1);
  assert.equal(again.epoch, b.epoch + 1);
  assert.equal(a.operatorScope, b.operatorScope);
  assert.notEqual(a.owner, again.owner);
  assert.equal(factory.isCurrent(a), false);
  assert.equal(factory.isCurrent(b), false);
  assert.equal(factory.isCurrent(again), true);
  const stateBeforeCheck = again.epoch;
  assert.equal(factory.isCurrent(a), false);
  assert.equal(factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a' }).epoch, stateBeforeCheck);
  assert.throws(() => factory.fromAuthenticatedRequest({ authenticated: false, rawCookie: 'session=a' }), /authenticated-session-required/);
  assert.throws(() => factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: '' }), /authenticated-session-required/);
});

test('model tasks bind public cloud account but local projects remain installation shared', t => {
  const { factory } = fixture(t);
  const input = { authenticated: true, rawCookie: 'session=a', publicIdentityStatus: { logged_in: true, verified: null, id: 12, base_url: 'https://account.example.test' } };
  const a = factory.fromAuthenticatedRequest(input);
  const b = factory.fromAuthenticatedRequest({ ...input, publicIdentityStatus: { ...input.publicIdentityStatus, id: 13 } });
  const signedOut = factory.fromAuthenticatedRequest({ ...input, publicIdentityStatus: { logged_in: false } });
  assert.equal(a.cloudAccount.status, 'known');
  assert.equal(b.cloudAccount.status, 'known');
  assert.notEqual(a.modelTaskScope, b.modelTaskScope);
  assert.equal(b.epoch, a.epoch + 1);
  assert.equal(a.operatorScope, b.operatorScope);
  assert.equal(b.operatorScope, signedOut.operatorScope);
  assert.equal(signedOut.modelTaskScope, null);
  assert.equal(signedOut.cloudAccount.status, 'signed-out');
});

test('stable task owner survives cookies, public origin path changes, account return and Host restart but not a different principal', t => {
  const { stateDir, factory } = fixture(t);
  const request = { authenticated: true, rawCookie: 'session=first', publicIdentityStatus: { logged_in: true, verified: true, id: 12, base_url: 'https://account.example.test/api' } };
  const first = factory.fromAuthenticatedRequest(request);
  assert.match(first.modelTaskOwner, /^director-model-owner:[a-f0-9]{64}$/);
  const restarted = createDirectorSessionFactory({ stateDir }).fromAuthenticatedRequest(request);
  assert.equal(restarted.modelTaskOwner, first.modelTaskOwner); assert.equal(restarted.modelTaskScope, first.modelTaskScope);
  const fresh = factory.fromAuthenticatedRequest({ ...request, rawCookie: 'session=second', publicIdentityStatus: { ...request.publicIdentityStatus, id: '12', base_url: 'https://account.example.test/other' } });
  assert.equal(fresh.modelTaskOwner, first.modelTaskOwner); assert.notEqual(fresh.modelTaskScope, first.modelTaskScope);
  const other = factory.fromAuthenticatedRequest({ ...request, publicIdentityStatus: { ...request.publicIdentityStatus, id: 13 } });
  assert.notEqual(other.modelTaskOwner, first.modelTaskOwner);
  const returned = createDirectorSessionFactory({ stateDir }).fromAuthenticatedRequest(request);
  assert.equal(returned.modelTaskOwner, first.modelTaskOwner); assert.notEqual(returned.modelTaskScope, first.modelTaskScope);
  assert.equal(factory.isCurrent(first), false); assert.equal(factory.isCurrent(returned), true);
  const origin = factory.fromAuthenticatedRequest({ ...request, publicIdentityStatus: { ...request.publicIdentityStatus, base_url: 'https://other.example.test/api' } });
  assert.notEqual(origin.modelTaskOwner, first.modelTaskOwner);
  const installation = createDirectorSessionFactory({ stateDir: join(stateDir, 'other-installation') }).fromAuthenticatedRequest(request);
  assert.notEqual(installation.modelTaskOwner, first.modelTaskOwner);
  const disk = readFileSync(join(stateDir, 'director-session.json'), 'utf8');
  assert.equal(disk.includes('session=first'), false); assert.equal(disk.includes('session=second'), false); assert.equal(disk.includes('account.example.test'), false);
  const signedOut = factory.fromAuthenticatedRequest({ ...request, publicIdentityStatus: { logged_in: false } });
  assert.equal(signedOut.modelTaskOwner, null);
  const unknown = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=first' });
  assert.equal(unknown.modelTaskOwner, null);
});

test('missing or unverifiable public identity remains unknown without reading secret fields or invoking a status loader', t => {
  const { factory } = fixture(t);
  let calls = 0;
  const snapshot = { logged_in: true, verified: null, username: 'not-stable-id', base_url: 'https://account.example.test', status: () => { calls++; throw Error('network forbidden'); } };
  Object.defineProperty(snapshot, 'access_token', { get: () => { throw Error('private token must not be read'); } });
  const context = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a', publicIdentityStatus: snapshot });
  assert.equal(context.cloudAccount.status, 'unknown');
  assert.equal(context.cloudAccount.reason, 'public-account-id-unavailable');
  assert.equal(context.modelTaskScope, null);
  assert.equal(calls, 0);
  const rejected = factory.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=a', publicIdentityStatus: { logged_in: true, verified: false, id: 12, base_url: 'https://account.example.test' } });
  assert.equal(rejected.cloudAccount.status, 'unknown');
});
