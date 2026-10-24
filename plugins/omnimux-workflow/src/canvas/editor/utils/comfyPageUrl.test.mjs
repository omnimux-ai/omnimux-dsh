import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_COMFY_PAGE_URL,
  comfyPageUrlFromData,
  normalizeComfyPageUrl,
} from './comfyPageUrl.ts';
import { COMFY_BACKEND_BASE_URL } from '../../../workflow/comfyBackend/plan.ts';

test('默认地址指向托管后端 localhost:18188', () => {
  assert.equal(DEFAULT_COMFY_PAGE_URL, 'http://localhost:18188');
  assert.equal(normalizeComfyPageUrl(DEFAULT_COMFY_PAGE_URL).ok, true);
  // 与宿主托管后端同一份默认值：两处漂移会让画布指向一个后端不监听的地址。
  assert.equal(DEFAULT_COMFY_PAGE_URL, COMFY_BACKEND_BASE_URL);
});

test('缺协议时补 http://，并去掉尾部斜杠', () => {
  const bare = normalizeComfyPageUrl('127.0.0.1:8188');
  assert.deepEqual(bare, { ok: true, url: 'http://127.0.0.1:8188' });
  const slashed = normalizeComfyPageUrl('http://127.0.0.1:8188/');
  assert.deepEqual(slashed, { ok: true, url: 'http://127.0.0.1:8188' });
});

test('保留 https、子路径与查询串，只去掉路径尾部斜杠', () => {
  assert.deepEqual(
    normalizeComfyPageUrl('https://example.test/comfy/'),
    { ok: true, url: 'https://example.test/comfy' },
  );
  assert.deepEqual(
    normalizeComfyPageUrl('https://example.test/comfy/?a=1'),
    { ok: true, url: 'https://example.test/comfy?a=1' },
  );
});

test('两端空白被裁掉', () => {
  assert.deepEqual(
    normalizeComfyPageUrl('  http://127.0.0.1:8188  '),
    { ok: true, url: 'http://127.0.0.1:8188' },
  );
});

test('空输入与非字符串给 empty，不抛出', () => {
  assert.deepEqual(normalizeComfyPageUrl(''), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeComfyPageUrl('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeComfyPageUrl(undefined), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeComfyPageUrl(42), { ok: false, reason: 'empty' });
});

test('非 http/https 协议给 scheme，不静默接受', () => {
  assert.deepEqual(normalizeComfyPageUrl('ftp://127.0.0.1'), { ok: false, reason: 'scheme' });
  assert.deepEqual(normalizeComfyPageUrl('file:///tmp/a.html'), { ok: false, reason: 'scheme' });
});

test('无法解析的输入给 invalid', () => {
  assert.deepEqual(normalizeComfyPageUrl('http://'), { ok: false, reason: 'invalid' });
});

test('节点数据里的非法地址回退到默认地址', () => {
  assert.equal(comfyPageUrlFromData({ url: 'http://127.0.0.1:9000/' }), 'http://127.0.0.1:9000');
  assert.equal(comfyPageUrlFromData({ url: 'ftp://x' }), DEFAULT_COMFY_PAGE_URL);
  assert.equal(comfyPageUrlFromData({}), DEFAULT_COMFY_PAGE_URL);
  assert.equal(comfyPageUrlFromData(undefined), DEFAULT_COMFY_PAGE_URL);
});
