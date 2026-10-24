/**
 * Issue 3669 契约：「最近导入」本地缓存是纯函数、有界、绝不抛出。
 *
 * 这是便利缓存，不是产品真源：畸形内容一律退回空列表，写入失败返回 false，
 * 由调用方降级（面板只显示导入动作），不阻断导入本身。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMFY_RECENTS_KEY,
  COMFY_RECENTS_MAX,
  COMFY_RECENT_TEXT_MAX,
  decodeComfyRecents,
  encodeComfyRecents,
  formatComfyRecentTime,
  readComfyRecents,
  upsertComfyRecent,
  writeComfyRecents,
} from './comfyRecents.ts';

const SAVED_AT = '2026-10-24T02:00:00.000Z';

function memoryStorage(initial) {
  const store = { value: initial === undefined ? null : initial };
  return {
    getItem(key) {
      return key === COMFY_RECENTS_KEY ? store.value : null;
    },
    setItem(key, next) {
      if (key === COMFY_RECENTS_KEY) store.value = next;
    },
  };
}

test('3669：解码畸形内容一律退回空列表，不抛出', () => {
  assert.deepEqual(decodeComfyRecents(null), []);
  assert.deepEqual(decodeComfyRecents(''), []);
  assert.deepEqual(decodeComfyRecents('{ not json'), []);
  assert.deepEqual(decodeComfyRecents('{"a":1}'), []);
  assert.deepEqual(decodeComfyRecents('[1, "x", null]'), []);
  assert.deepEqual(decodeComfyRecents('[{"name":"a"}]'), []);
});

test('3669：编码/解码往返保持条目与顺序，且截断到上限', () => {
  const list = [
    { name: 'b', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{"nodes":[]}' },
    { name: 'a', format: '1', nodeCount: 7, savedAt: SAVED_AT, text: '{"nodes":[]}' },
  ];
  assert.deepEqual(decodeComfyRecents(encodeComfyRecents(list)), list);

  const many = [];
  for (let index = 0; index < COMFY_RECENTS_MAX + 3; index += 1) {
    many.push({ name: `n${index}`, format: '0.4', nodeCount: 1, savedAt: SAVED_AT, text: '{}' });
  }
  assert.equal(decodeComfyRecents(encodeComfyRecents(many)).length, COMFY_RECENTS_MAX);
});

test('3669：同名条目替换并提到最前，超出上限淘汰尾部', () => {
  const first = { name: 'flow', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' };
  const second = { name: 'other', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' };
  const updated = { name: 'flow', format: '1', nodeCount: 9, savedAt: SAVED_AT, text: '{}' };

  const once = upsertComfyRecent([first, second], updated);
  assert.equal(once.length, 2);
  assert.equal(once[0].nodeCount, 9);
  assert.equal(once[1].name, 'other');

  const third = { name: 'third', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' };
  const capped = upsertComfyRecent([first, second], third, 2);
  assert.deepEqual(capped.map((item) => item.name), ['third', 'flow']);
});

test('3669：空名称与超体积条目不入缓存（可解释降级）', () => {
  const base = [{ name: 'keep', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' }];
  const empty = { name: '', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' };
  assert.deepEqual(upsertComfyRecent(base, empty), base);

  const huge = {
    name: 'huge',
    format: '0.4',
    nodeCount: 3,
    savedAt: SAVED_AT,
    text: 'x'.repeat(COMFY_RECENT_TEXT_MAX + 1),
  };
  assert.deepEqual(upsertComfyRecent(base, huge), base);

  const atLimit = {
    name: 'limit',
    format: '0.4',
    nodeCount: 3,
    savedAt: SAVED_AT,
    text: 'x'.repeat(COMFY_RECENT_TEXT_MAX),
  };
  assert.equal(upsertComfyRecent(base, atLimit)[0].name, 'limit');
});

test('3669：存储不可用时读空列表、写返回 false，不抛出', () => {
  assert.deepEqual(readComfyRecents(null), []);
  const one = [{ name: 'a', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' }];
  assert.equal(writeComfyRecents(one, null), false);

  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.deepEqual(readComfyRecents(throwing), []);
  assert.equal(writeComfyRecents(one, throwing), false);
});

test('3669：可用存储里读回写入的内容', () => {
  const storage = memoryStorage();
  const one = [{ name: 'a', format: '0.4', nodeCount: 3, savedAt: SAVED_AT, text: '{}' }];
  assert.equal(writeComfyRecents(one, storage), true);
  assert.deepEqual(readComfyRecents(storage).map((item) => item.name), ['a']);
});

test('3669：展示时间格式为 MM-DD HH:mm，非法时间返回空串', () => {
  assert.match(formatComfyRecentTime('2026-10-24T02:05:00.000Z'), /^\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(formatComfyRecentTime('not-a-date'), '');
});
