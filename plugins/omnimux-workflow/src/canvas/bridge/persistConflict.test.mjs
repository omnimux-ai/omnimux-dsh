/**
 * 远端 version 前进：同图 adopt，本地干净 reload，真冲突才 conflict。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideRemoteVersionAdvance } from './persistConflict.ts';

/** 本地适配：新增用例用 currentSignature 语义；判定实现只有 persistConflict 一份。 */
const decideGraphReconcile = input => decideRemoteVersionAdvance({
  localSignature: input.currentSignature,
  lastSavedSignature: input.lastSavedSignature,
  remoteSignature: input.remoteSignature,
});

test('本地签名 == 远端签名 → adopt（打开自撞 / flush 409）', () => {
  assert.equal(
    decideRemoteVersionAdvance({
      localSignature: 'graph-a',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-a',
    }),
    'adopt',
  );
  assert.equal(
    decideRemoteVersionAdvance({
      localSignature: 'graph-a',
      lastSavedSignature: 'stale',
      remoteSignature: 'graph-a',
    }),
    'adopt',
  );
});

test('本地干净但远端图不同 → reload', () => {
  assert.equal(
    decideRemoteVersionAdvance({
      localSignature: 'graph-a',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-b',
    }),
    'reload',
  );
});

test('本地脏且远端图不同 → conflict', () => {
  assert.equal(
    decideRemoteVersionAdvance({
      localSignature: 'local-edit',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-b',
    }),
    'conflict',
  );
});

test('四态判定：远端推进但内容等于上次已存、本地领先 → resave', () => {
  assert.equal(
    decideGraphReconcile({
      currentSignature: 'graph-a-imported',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-a',
    }),
    'resave',
  );
});

test('四态判定：本地在探测窗口内继续变化、远端等于当前本地 → adopt', () => {
  assert.equal(
    decideGraphReconcile({
      currentSignature: 'graph-a-imported',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-a-imported',
    }),
    'adopt',
  );
});

test('四态判定：本地干净、远端推进 → reload（与三态一致）', () => {
  assert.equal(
    decideGraphReconcile({
      currentSignature: 'graph-a',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-b',
    }),
    'reload',
  );
});

test('四态判定：三方互不相同 → conflict', () => {
  assert.equal(
    decideGraphReconcile({
      currentSignature: 'local-edit',
      lastSavedSignature: 'graph-a',
      remoteSignature: 'graph-b',
    }),
    'conflict',
  );
});
