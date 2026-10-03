import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPrefillWhenVisible, isElementShown } from './prefill-claim.js';
import {
  peekComposerPrefill,
  queueComposerPrefill,
  resetComposerPrefill,
} from '../../../omnimux/src/client/media-viewer/composer-prefill.js';

function fakeFrames() {
  const queue = [];
  return {
    raf: (fn) => { queue.push(fn); return queue.length; },
    caf: (id) => { queue[id - 1] = null; },
    flush(n = 1) {
      for (let i = 0; i < n; i += 1) {
        const batch = queue.splice(0);
        batch.forEach((fn) => fn && fn());
      }
    },
  };
}

test('隐藏页面不取走填入请求，可见页面取走（Issue #3009）', () => {
  resetComposerPrefill();
  const req = queueComposerPrefill({ prompt: 'street interview', kind: 'video', token: 'v1' });
  const frames = fakeFrames();
  const hiddenGot = [];
  const shownGot = [];

  claimPrefillWhenVisible(req, { isVisible: () => false, onClaim: (r) => hiddenGot.push(r), raf: frames.raf, caf: frames.caf });
  assert.equal(hiddenGot.length, 0);
  assert.equal(peekComposerPrefill()?.token, 'v1');

  claimPrefillWhenVisible(req, { isVisible: () => true, onClaim: (r) => shownGot.push(r), raf: frames.raf, caf: frames.caf });
  assert.equal(shownGot[0]?.prompt, 'street interview');
  assert.equal(peekComposerPrefill(), null);

  frames.flush(200);
  assert.equal(hiddenGot.length, 0);
});

test('页面起初不可见、稍后可见时，变可见后再取走（Issue #3009）', () => {
  resetComposerPrefill();
  const req = queueComposerPrefill({ prompt: 'late panel', kind: 'image', token: 'v2' });
  const frames = fakeFrames();
  let visible = false;
  const got = [];
  claimPrefillWhenVisible(req, { isVisible: () => visible, onClaim: (r) => got.push(r), raf: frames.raf, caf: frames.caf });
  frames.flush(3);
  assert.equal(got.length, 0);
  visible = true;
  frames.flush(1);
  assert.equal(got[0]?.prompt, 'late panel');
  assert.equal(peekComposerPrefill(), null);
});

test('等待期间请求被换掉或取走就停止，取消函数可停止重试（Issue #3009）', () => {
  resetComposerPrefill();
  const req = queueComposerPrefill({ prompt: 'old', kind: 'image', token: 'v3' });
  const frames = fakeFrames();
  const got = [];
  claimPrefillWhenVisible(req, { isVisible: () => false, onClaim: (r) => got.push(r), raf: frames.raf, caf: frames.caf });
  queueComposerPrefill({ prompt: 'new', kind: 'image', token: 'v4' });
  frames.flush(200);
  assert.equal(got.length, 0);
  assert.equal(peekComposerPrefill()?.token, 'v4');

  let visible = false;
  const cancel = claimPrefillWhenVisible(peekComposerPrefill(), { isVisible: () => visible, onClaim: (r) => got.push(r), raf: frames.raf, caf: frames.caf });
  cancel();
  visible = true;
  frames.flush(5);
  assert.equal(got.length, 0);
  assert.equal(peekComposerPrefill()?.token, 'v4');
  resetComposerPrefill();
});

test('可见性判断：无节点为不可见，无判断能力时按可见处理', () => {
  assert.equal(isElementShown(null), false);
  assert.equal(isElementShown({}), true);
  assert.equal(isElementShown({ checkVisibility: () => false }), false);
  assert.equal(isElementShown({ checkVisibility: () => true }), true);
});
