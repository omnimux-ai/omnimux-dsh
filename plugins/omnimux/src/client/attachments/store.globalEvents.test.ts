import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentStore } from './store.ts';

type Listener = (event: { type: string; detail?: unknown }) => void;

/**
 * 假 window：只实现本用例需要的监听注册面。
 *
 * 真实进程里 `getGlobalAttachmentStore()` 单例创建与插件 effect 会各调用一次
 * `installGlobalEvents()`，两次注册的是两个不同闭包 → 同一事件被处理两次。
 */
function installFakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  const fakeWindow = {
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: { type: string; detail?: unknown }) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
      return true;
    },
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return {
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
    dispatch(type: string, detail: unknown) {
      return fakeWindow.dispatchEvent({ type, detail });
    },
  };
}

const payload = {
  sourcePlugin: 'omnimux-workflow',
  kind: 'video',
  entityId: 'node-video-1',
  title: 'video.mp4',
  relativePath: 'assets/videos/video.mp4',
};

test('installGlobalEvents 幂等：重复安装只保留一套监听', () => {
  const host = installFakeWindow();
  const store = createAttachmentStore();

  store.installGlobalEvents();
  store.installGlobalEvents();

  assert.equal(host.listenerCount('omnimux:add-to-conversation'), 1);
  assert.equal(host.listenerCount('omnimux:remove-from-conversation'), 1);
  assert.equal(host.listenerCount('omnimux:clear-conversation-attachments'), 1);
});

test('重复安装后同一事件只入桶一次', () => {
  const host = installFakeWindow();
  const store = createAttachmentStore();

  store.installGlobalEvents();
  store.installGlobalEvents();
  host.dispatch('omnimux:add-to-conversation', payload);

  assert.equal(store.getSnapshot('default').length, 1);
});

test('先安装方撤销后仍可重新安装并在新桶内生效', () => {
  const host = installFakeWindow();
  const store = createAttachmentStore();

  const dispose = store.installGlobalEvents();
  dispose();
  assert.equal(host.listenerCount('omnimux:add-to-conversation'), 0);

  store.installGlobalEvents();
  host.dispatch('omnimux:add-to-conversation', { ...payload, sessionId: 'sess-1' });

  assert.equal(host.listenerCount('omnimux:add-to-conversation'), 1);
  assert.equal(store.getSnapshot('sess-1').length, 1);
});
