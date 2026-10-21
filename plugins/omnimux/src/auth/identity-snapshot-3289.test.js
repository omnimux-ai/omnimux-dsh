import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from './identity.js';
import { createTokenStore } from './store.js';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-identity-snapshot-3289-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const forbidden = () => { throw Error('credentials/network forbidden'); };
  const store = createTokenStore({ homeDir: join(root, 'home'), configDir: join(root, 'config'), env: {},
    credentials: { resolve: forbidden, describe: forbidden } });
  const identity = createIdentity({ store, siteBaseUrl: 'https://account.example.test', fetcher: forbidden });
  function profile(row) {
    store.writeProfileCache(row);
    const time = new Date(statSync(store.secretsPath).mtimeMs + 1000);
    utimesSync(store.profilePath, time, time);
  }
  return { store, identity, profile };
}

test('current canonical account is returned synchronously with only public whitelist fields', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  profile({ id: 42, username: 'Ada', access_token: 'must-not-escape', logged_in: false, base_url: 'https://wrong.test' });
  const snapshot = identity.getSnapshot();
  assert.deepEqual(snapshot, { logged_in: true, verified: null, base_url: 'https://account.example.test', id: 42 });
  assert.equal(snapshot instanceof Promise, false);
});

test('logout and expired state invalidate an already-created snapshot reader immediately', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  profile({ id: '42' });
  assert.equal(identity.getSnapshot().logged_in, true);
  store.markExpired();
  assert.equal(identity.getSnapshot().logged_in, false);
  assert.equal(identity.getSnapshot().id, undefined);
  store.clearExpired();
  assert.equal(identity.getSnapshot().logged_in, true);
  await store.unset();
  assert.equal(identity.getSnapshot().logged_in, false);
});

test('account replacement rejects stale profile even when old config metadata is retained', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  profile({ id: '42' });
  const newer = new Date(statSync(store.profilePath).mtimeMs + 1000);
  await store.set('synthetic-token-b');
  utimesSync(store.secretsPath, newer, newer);
  assert.equal(identity.getSnapshot().logged_in, false);
  assert.equal(identity.getSnapshot().id, undefined);
  store.writeConfig({ userId: '43' });
  profile({ id: '43' });
  assert.equal(identity.getSnapshot().id, '43');
  assert.equal(identity.getSnapshot().logged_in, true);
});

test('missing or inconsistent stable identity never authenticates a display-only profile', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  for (const row of [{ username: 'Ada' }, { id: '' }, { id: {} }, { id: '43' }]) {
    profile(row);
    assert.equal(identity.getSnapshot().logged_in, false);
  }
  profile({ id: '42' });
  store.unsetConfig();
  assert.equal(identity.getSnapshot().logged_in, false);
});

test('missing, malformed and blank canonical credentials fail closed despite fresh matching profile', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  for (const text of ['{', '{}', '{"access_token":"   "}', '{"active_slot":"missing","slots":{}}']) {
    writeFileSync(store.secretsPath, text);
    profile({ id: '42' });
    assert.equal(identity.getSnapshot().logged_in, false);
  }
  rmSync(store.secretsPath);
  assert.equal(identity.getSnapshot().logged_in, false);
});

test('flat and active-slot canonical formats both support the shared public reader', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  for (const text of ['{"access_token":"synthetic-flat"}',
    '{"active_slot":"cli:default","slots":{"cli:default":{"access_token":"synthetic-slot"}}}']) {
    writeFileSync(store.secretsPath, text);
    profile({ id: '42' });
    assert.equal(identity.getSnapshot().logged_in, true);
  }
});

test('environment override is explicitly unknown even with a current canonical account', async (t) => {
  const { store, identity, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  profile({ id: '42' });
  const previous = process.env.OMNIMUX_ACCESS_TOKEN;
  try {
    process.env.OMNIMUX_ACCESS_TOKEN = 'synthetic-env-override';
    assert.deepEqual(identity.getSnapshot(), { logged_in: false, verified: null, base_url: 'https://account.example.test' });
  } finally {
    if (previous === undefined) delete process.env.OMNIMUX_ACCESS_TOKEN;
    else process.env.OMNIMUX_ACCESS_TOKEN = previous;
  }
});

test('profile getters and inherited identity are not evaluated or exposed', async (t) => {
  const { store, profile } = fixture(t);
  await store.set('synthetic-token-a', { userId: '42' });
  profile({ id: '42' });
  const cached = { id: '42' };
  for (const field of ['access_token', 'secret', 'toJSON']) {
    Object.defineProperty(cached, field, { get() { throw Error('secret getter forbidden'); } });
  }
  const identity = createIdentity({ siteBaseUrl: 'https://account.example.test', store: {
    ...store, readProfileCache: () => cached } });
  assert.equal(identity.getSnapshot().logged_in, true);
  assert.deepEqual(Object.keys(identity.getSnapshot()).sort(), ['base_url', 'id', 'logged_in', 'verified']);
  Object.defineProperty(cached, 'id', { get() { throw Error('identity getter forbidden'); } });
  assert.equal(identity.getSnapshot().logged_in, false);
  const inherited = createIdentity({ siteBaseUrl: 'https://account.example.test', store: {
    ...store, readProfileCache: () => Object.create({ id: '42' }) } });
  assert.equal(inherited.getSnapshot().logged_in, false);
});

test('synchronous public account snapshot does not load credentials or call the network', () => {
  const identity = createIdentity({ siteBaseUrl: 'https://account.example.test', fetcher: () => { throw Error('network forbidden'); }, store: {
    describe: () => { throw Error('async credentials forbidden'); }, resolve: () => { throw Error('secret resolution forbidden'); },
    readProfileCache: () => null, isExpired: () => false, readConfig: () => ({})
  } });
  assert.equal(typeof identity.getSnapshot, 'function');
  const snapshot = identity.getSnapshot();
  assert.equal(snapshot.logged_in, false);
  assert.equal(snapshot.verified, null);
  assert.equal(snapshot.id, undefined);
});
