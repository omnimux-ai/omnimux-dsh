import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyWorkshopState, compareAndSwapWorkshopState, parseWorkshopState, WorkshopStore, readWorkshopFile, validSourceRef } from '../workshop-store.js';
const state = () => emptyWorkshopState('fixture-scope');
test('state defaults are independent and no migration or write occurs on missing file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workshop-store-'));
    try {
        const store = new WorkshopStore('fixture-scope', root);
        assert.deepEqual(await store.read(), state());
        assert.deepEqual(store.recover(), { ready: false, code: 'RECOVERY_UNAVAILABLE' });
        await assert.rejects(readFile(join(root, 'state.v1.json')));
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('state CAS is immutable, increments exactly once and rejects stale revision', () => {
    const old = state(), next = { ...state(), revision: 1 };
    const result = compareAndSwapWorkshopState(old, 0, next);
    result.preferences.autoUpdate = true;
    assert.equal(next.preferences.autoUpdate, false);
    assert.equal(old.revision, 0);
    assert.throws(() => compareAndSwapWorkshopState(old, 1, next), /REVISION_CONFLICT/);
    assert.throws(() => compareAndSwapWorkshopState(old, 0, { ...next, revision: 2 }), /REVISION_CONFLICT/);
});
test('tombstones survive generic CAS, independent of records/catalog identity revisions', () => {
    const old = state();
    old.policyTombstones.push({ scopeKey: old.scopeKey, skillKey: 'fixture', token: 'fixture', reason: 'uninstalled', operationId: 'op', revision: 0 });
    const next = { ...structuredClone(old), revision: 1 };
    assert.equal(compareAndSwapWorkshopState(old, 0, next).policyTombstones.length, 1);
    assert.throws(() => compareAndSwapWorkshopState(old, 0, { ...next, policyTombstones: [] }), /TOMBSTONE_PROTECTED/);
    next.policyTombstones[0].operationId = 'new-op';
    assert.throws(() => compareAndSwapWorkshopState(old, 0, next), /TOMBSTONE_PROTECTED/);
});
for (const [name, patch, code] of [
    ['higher schema', { schemaVersion: 2 }, 'SCHEMA_NEWER'],
    ['wrong scope', { scopeKey: 'other' }, 'STATE_INVALID'],
    ['negative revision', { revision: -1 }, 'STATE_INVALID'],
    ['missing tombstones', { policyTombstones: undefined }, 'STATE_INVALID'],
    ['invalid preference', { preferences: { autoUpdate: 'true' } }, 'STATE_INVALID'],
])
    test(`state rejects ${name} without repair`, () => {
        assert.throws(() => parseWorkshopState({ ...state(), ...patch }, 'fixture-scope'), new RegExp(code));
    });
test('higher schema persisted fixture is preserved byte for byte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workshop-store-'));
    try {
        const raw = JSON.stringify({ ...state(), schemaVersion: 2 });
        await writeFile(join(root, 'state.v1.json'), raw);
        await assert.rejects(new WorkshopStore('fixture-scope', root).read(), /SCHEMA_NEWER/);
        assert.equal(await readFile(join(root, 'state.v1.json'), 'utf8'), raw);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('metadata read rejects links, escaping paths and bounded files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workshop-store-'));
    try {
        await writeFile(join(root, 'data'), '1234');
        await mkdir(join(root, 'dir'));
        await symlink(join(root, 'data'), join(root, 'link'));
        await symlink(join(root, 'dir'), join(root, 'alias'));
        assert.equal((await readWorkshopFile(root, 'data', 4)).toString(), '1234');
        await assert.rejects(readWorkshopFile(root, 'data', 3), /READ_LIMIT/);
        await assert.rejects(readWorkshopFile(root, 'link', 10), /UNSAFE_PATH/);
        await assert.rejects(readWorkshopFile(root, 'alias/file', 10), /SCOPE_UNVERIFIED/);
        for (const name of ['../data', '/data', 'a\\b', 'a//b'])
            await assert.rejects(readWorkshopFile(root, name, 10), /UNSAFE_PATH/);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('source refs require actual evidence rather than guessed git commits', () => {
    assert(validSourceRef({ kind: 'catalog', catalogId: 'sk-x', revision: 'fingerprint' }));
    assert(!validSourceRef({ kind: 'git', sourceId: 'x', repo: 'a/b', path: '../x', ref: 'main', commit: 'a'.repeat(40) }));
    assert(!validSourceRef({ kind: 'git', sourceId: 'x', repo: 'a/b', path: 'x', ref: 'main', commit: 'main' }));
    assert(!validSourceRef({ kind: 'local', contentHash: 'unknown' }));
});
