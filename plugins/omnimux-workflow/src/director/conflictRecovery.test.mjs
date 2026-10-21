import test from 'node:test';
import assert from 'node:assert/strict';
import * as wiring from './vendor/lib/director-save-wiring.ts';
import { directorSceneFingerprint } from './services.ts';

const identity = { userId: 'user-1', projectId: 'project-1', nodeId: 'node-1', sceneId: 'scene-1', epoch: 1 };
const scene = title => ({ id: 'scene-1', version: 1, title, background: '#151515', environmentIntensity: 1, gridVisible: true,
  objects: [], cameras: [], lights: [], shots: [], activeShotId: 'shot-1', createdAt: '2026-10-14', updatedAt: '2026-10-15' });
function fixture() {
  const ownDraft = scene('我的未保存修改');
  let remote = { identity: { ...identity }, revision: 2, scene: scene('另一处已保存修改') };
  let writes = 0;
  let current = true;
  const abort = new AbortController();
  const save = async (draft, expectedRevision) => {
    if (expectedRevision !== remote.revision) throw Object.assign(new Error('版本已变更'), { code: 'version_conflict' });
    remote = { ...remote, revision: remote.revision + 1, scene: structuredClone(draft) }; writes++;
    return { confirmed: true, revision: remote.revision, sceneId: draft.id, sceneFingerprint: directorSceneFingerprint(remote.scene) };
  };
  const input = { scene: ownDraft, identity, expectedRevision: 1, signal: abort.signal,
    isCurrent: () => current, fingerprint: directorSceneFingerprint, confirmReplacement: async () => true,
    recover: async (draft, context) => {
      const latest = structuredClone(remote);
      if (!await context.confirmReplacement(latest)) return null;
      return save(draft, latest.revision);
    } };
  return { input, ownDraft, save, abort, writes: () => writes, remote: () => remote,
    replace: next => { remote = next; }, leave: () => { current = false; } };
}

test('403 and ordinary failures never qualify as version conflicts', () => {
  assert.equal(typeof wiring.isDirectorSaveConflict, 'function');
  assert.equal(wiring.isDirectorSaveConflict({ code: 'version_conflict' }), true);
  for (const error of [{ code: 'forbidden' }, { status: 409 }, new Error('409 版本冲突'), { code: 'unavailable' }, null]) {
    assert.equal(wiring.isDirectorSaveConflict(error), false);
  }
});

test('old-version retries reject; explicit review saves unchanged own draft against fresh revision', async () => {
  const f = fixture(); let reviews = 0;
  f.replace({ ...f.remote(), revision: 0 });
  assert.equal((await f.save(scene('首次正常保存'), 0)).revision, 1);
  f.ownDraft.environmentIntensity = 1.6;
  f.ownDraft.objects = [{ id: 'actor-1', name: '我的角色', transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }];
  const before = structuredClone(f.ownDraft);
  f.replace({ ...f.remote(), revision: 2, scene: { ...scene('另一处已保存修改'), environmentIntensity: 0.5 } });
  await assert.rejects(f.save(f.ownDraft, 1), { code: 'version_conflict' });
  await assert.rejects(f.save(f.ownDraft, 1), { code: 'version_conflict' });
  f.input.confirmReplacement = async latest => {
    reviews++; assert.equal(latest.revision, 2); assert.equal(latest.scene.title, '另一处已保存修改'); return true;
  };
  const receipt = await wiring.recoverDirectorSaveConflict(f.input);
  assert.equal(receipt.revision, 3); assert.equal(reviews, 1); assert.equal(f.writes(), 2);
  assert.deepEqual(f.remote().scene, before); assert.deepEqual(f.ownDraft, before);
});

test('review cancellation performs no write and keeps the own draft', async () => {
  const f = fixture(); f.input.confirmReplacement = async () => false;
  assert.equal(await wiring.recoverDirectorSaveConflict(f.input), null);
  assert.equal(f.writes(), 0); assert.equal(f.remote().revision, 2); assert.equal(f.ownDraft.title, '我的未保存修改');
});

test('a second remote write during review rejects CAS and retains both versions', async () => {
  const f = fixture(); f.input.confirmReplacement = async () => {
    f.replace({ ...f.remote(), revision: 3, scene: scene('再次保存的版本') }); return true;
  };
  await assert.rejects(wiring.recoverDirectorSaveConflict(f.input), { code: 'version_conflict' });
  assert.equal(f.writes(), 0); assert.equal(f.remote().scene.title, '再次保存的版本');
  assert.equal(f.ownDraft.title, '我的未保存修改');
});

test('different caller/project/node/scene/epoch is rejected before showing confirmation', async () => {
  for (const field of ['userId', 'projectId', 'nodeId', 'sceneId', 'epoch']) {
    const f = fixture(); let reviews = 0;
    f.replace({ ...f.remote(), identity: { ...identity, [field]: field === 'epoch' ? 2 : 'other' } });
    f.input.confirmReplacement = async () => { reviews++; return true; };
    await assert.rejects(wiring.recoverDirectorSaveConflict(f.input));
    assert.equal(reviews, 0); assert.equal(f.writes(), 0);
  }
  const f = fixture(); f.replace({ ...f.remote(), scene: { ...scene('异场景'), id: 'other-scene' } });
  await assert.rejects(wiring.recoverDirectorSaveConflict(f.input)); assert.equal(f.writes(), 0);
});

test('abort or changed scope during review cannot produce a successful save', async () => {
  for (const stop of [f => f.abort.abort(), f => f.leave()]) {
    const f = fixture(); f.input.confirmReplacement = async () => { stop(f); return true; };
    await assert.rejects(wiring.recoverDirectorSaveConflict(f.input), { name: 'AbortError' });
    assert.equal(f.writes(), 0);
  }
});

test('unreviewed, unconfirmed, wrong scene, wrong draft, or stale receipts are not acknowledged', async () => {
  for (const override of [{ confirmed: false }, { sceneId: 'other' }, { revision: 2 }, { sceneFingerprint: 'another-draft' }]) {
    const f = fixture(); f.input.recover = async (draft, context) => {
      await context.confirmReplacement(f.remote());
      return { confirmed: true, sceneId: draft.id, revision: 3, sceneFingerprint: directorSceneFingerprint(draft), ...override };
    };
    await assert.rejects(wiring.recoverDirectorSaveConflict(f.input));
  }
  const f = fixture(); f.input.recover = async draft => ({ confirmed: true, sceneId: draft.id, revision: 3, sceneFingerprint: directorSceneFingerprint(draft) });
  await assert.rejects(wiring.recoverDirectorSaveConflict(f.input));
  const cancelled = fixture(); cancelled.input.confirmReplacement = async () => false;
  cancelled.input.recover = async (draft, context) => {
    await context.confirmReplacement(cancelled.remote());
    return { confirmed: true, sceneId: draft.id, revision: 3, sceneFingerprint: directorSceneFingerprint(draft) };
  };
  await assert.rejects(wiring.recoverDirectorSaveConflict(cancelled.input));
});

test('invalid current scene or revision never reaches the adapter', async () => {
  for (const override of [{ expectedRevision: -1 }, { expectedRevision: NaN }, { scene: { ...scene('错误'), id: 'other' } }]) {
    const f = fixture(); let called = false;
    f.input.recover = async () => { called = true; return null; };
    await assert.rejects(wiring.recoverDirectorSaveConflict({ ...f.input, ...override }));
    assert.equal(called, false);
  }
});

test('review is required once and remote revision must really be newer', async () => {
  const f = fixture(); f.input.recover = async (_draft, context) => {
    await context.confirmReplacement(f.remote()); await context.confirmReplacement(f.remote()); return null;
  };
  await assert.rejects(wiring.recoverDirectorSaveConflict(f.input));
  const stale = fixture(); stale.replace({ ...stale.remote(), revision: 1 });
  await assert.rejects(wiring.recoverDirectorSaveConflict(stale.input)); assert.equal(stale.writes(), 0);
});
