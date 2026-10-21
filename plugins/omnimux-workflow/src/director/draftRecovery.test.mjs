import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorSaveCoordinator } from './vendor/lib/director-save.ts';

function scene(title = '当前编辑') {
  return { id: 'scene-1', version: 1, title, background: '#151515', environmentIntensity: 1,
    gridVisible: true, objects: [], cameras: [], lights: [], shots: [], activeShotId: 'shot-1',
    createdAt: '2026-10-14', updatedAt: '2026-10-15' };
}

function coordinator(storage, flush = async () => { throw new Error('保存被拒绝'); }) {
  return createDirectorSaveCoordinator({ initialScene: scene('项目原稿'), scope: 'operator:project:node:scene-1',
    storage, flush, now: () => 100, schedule: () => 1, cancelSchedule: () => undefined });
}

test('writeSilentDropReadbackFalse: silently dropped storage writes never protect current edits', async t => {
  const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const save = coordinator(storage);
  t.after(() => save.dispose());
  assert.equal(save.edit(scene()), true);
  assert.equal(save.getSnapshot().draftStored, false);
  assert.equal(save.getSnapshot().status, 'error');
  assert.equal(await save.retry(), false);
  assert.equal(await save.prepareClose(), 'stay');
  assert.equal(save.getSnapshot().scene.title, '当前编辑');
});
