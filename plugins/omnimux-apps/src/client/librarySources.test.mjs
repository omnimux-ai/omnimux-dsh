/**
 * plugins/omnimux-apps/src/client/librarySources.test.mjs
 *
 * Unit tests for the library picker data layer (Issue #2596):
 * row mapping for the three public library seams, the picked-value codec,
 * and fail-closed fetch behaviour (never throws, empty state on failure).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_META,
  mapAssetRow,
  mapInspirationRow,
  mapProductRow,
  hostMediaSrc,
  encodePickedValue,
  decodePickedValue,
  displayValueOf,
  fetchLibraryItems,
} from './librarySources.ts';

describe('librarySources: row mapping', () => {
  it('maps asset library rows with cover preview URL', () => {
    const item = mapAssetRow({
      id: 'ast_1',
      name: '白色卫衣主图',
      type: 'image',
      description: '',
      cover_file_id: 'fil_1',
      cover: { id: 'fil_1', uri: 'asset://image/ast_1' },
      files: [{ id: 'fil_1', uri: 'asset://image/ast_1' }],
    });
    assert.ok(item);
    assert.equal(item.id, 'ast_1');
    assert.equal(item.name, '白色卫衣主图');
    assert.equal(item.sub, '图片');
    assert.equal(item.url, 'asset://image/ast_1');
    assert.equal(item.preview, '/omnimux/assets/library/preview?id=ast_1&file=fil_1');
  });

  it('drops asset rows without id', () => {
    assert.equal(mapAssetRow({ name: '无标识' }), null);
    assert.equal(mapAssetRow(null), null);
    assert.equal(mapAssetRow('junk'), null);
  });

  it('maps inspiration rows and rewrites host media paths', () => {
    const item = mapInspirationRow({
      id: 42,
      title: '3 秒钩子开箱',
      platform: 'TikTok',
      cover_url: '/api/inspiration/v1/media/inspiration-covers/42.jpg',
      media_urls: ['/api/inspiration/v1/media/videos/42.mp4'],
    });
    assert.ok(item);
    assert.equal(item.id, '42');
    assert.equal(item.name, '3 秒钩子开箱');
    assert.equal(item.sub, 'TikTok');
    assert.equal(item.url, '/omnimux/inspiration/media/videos/42.mp4');
    assert.equal(item.preview, '/omnimux/inspiration/media/inspiration-covers/42.jpg');
  });

  it('hostMediaSrc keeps absolute URLs and rejects traversal', () => {
    assert.equal(hostMediaSrc('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
    assert.equal(hostMediaSrc('../etc/passwd'), '');
    assert.equal(hostMediaSrc(''), '');
    assert.equal(hostMediaSrc(undefined), '');
  });

  it('maps product rows with sku sub and link value', () => {
    const item = mapProductRow({
      id: 'prd_1',
      name: '极简连帽卫衣',
      sku: 'SKU-1001',
      link: 'https://shop.example.com/p/1',
      cover: { uri: '/omnimux/products/draft-media/med_1' },
    });
    assert.ok(item);
    assert.equal(item.sub, 'SKU-1001');
    assert.equal(item.url, 'https://shop.example.com/p/1');
    assert.equal(item.preview, '/omnimux/products/draft-media/med_1');
  });
});

describe('librarySources: picked value codec', () => {
  it('round-trips a picked value through encode/decode', () => {
    const value = { name: '跑鞋白底图', sub: '图片', url: 'asset://image/ast_9', source: 'asset' };
    const encoded = encodePickedValue(value);
    const decoded = decodePickedValue(encoded);
    assert.deepEqual(decoded, value);
  });

  it('decodes plain pasted links to null and renders them as link cards', () => {
    assert.equal(decodePickedValue('https://www.tiktok.com/@a/video/1'), null);
    assert.equal(decodePickedValue(''), null);
    assert.equal(decodePickedValue('{"broken'), null);
    assert.equal(decodePickedValue('{}'), null);
    assert.equal(decodePickedValue(42), null);

    const display = displayValueOf('https://www.tiktok.com/@a/video/1');
    assert.equal(display.source, 'link');
    assert.ok(display.name.startsWith('https://'));
  });

  it('displayValueOf truncates long links and prefers decoded metadata', () => {
    const longLink = `https://example.com/${'x'.repeat(60)}`;
    const display = displayValueOf(longLink);
    assert.ok(display.name.endsWith('…'));
    assert.ok(display.name.length <= 35);

    const picked = displayValueOf(encodePickedValue({ name: '丝绒哑光口红', sub: 'SKU-1003', url: '', source: 'product' }));
    assert.equal(picked.name, '丝绒哑光口红');
    assert.equal(picked.source, 'product');
  });
});

describe('librarySources: fetch behaviour', () => {
  it('library meta covers all three kinds with empty-state copy', () => {
    for (const kind of ['asset', 'inspiration', 'product']) {
      assert.ok(LIBRARY_META[kind].title);
      assert.ok(LIBRARY_META[kind].emptyText);
      assert.ok(LIBRARY_META[kind].triggerText);
    }
  });

  it('fetchLibraryItems resolves to unavailable empty state when the seam is absent', async () => {
    const result = await fetchLibraryItems('asset', '卫衣');
    assert.equal(result.unavailable, true);
    assert.deepEqual(result.items, []);
  });
});
