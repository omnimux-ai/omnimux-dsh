import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidUrl, isVideoUrl, resolvePlatformName } from './mediaUrlDetector.ts';
import { MODAL_STYLES } from './modalStyles.ts';
import { DOCK_STYLES } from './dockStyles.ts';

test('isValidUrl: validates standard HTTP and HTTPS URLs', () => {
  assert.equal(isValidUrl('https://www.tiktok.com/@user/video/123'), true);
  assert.equal(isValidUrl('http://example.com/page'), true);
  assert.equal(isValidUrl('https://github.com/omnimux-ai/omnimux-dsh'), true);
  assert.equal(isValidUrl('not a url'), false);
  assert.equal(isValidUrl(''), false);
  assert.equal(isValidUrl('ftp://example.com'), false);
});

test('isVideoUrl: detects video platform domains and media extensions', () => {
  assert.equal(isVideoUrl('https://www.tiktok.com/@user/video/123'), true);
  assert.equal(isVideoUrl('https://v.douyin.com/abc/'), true);
  assert.equal(isVideoUrl('https://www.youtube.com/watch?v=xyz'), true);
  assert.equal(isVideoUrl('https://youtu.be/xyz'), true);
  assert.equal(isVideoUrl('https://www.bilibili.com/video/BV123'), true);
  assert.equal(isVideoUrl('https://cdn.example.com/video.mp4'), true);
  assert.equal(isVideoUrl('https://github.com/omnimux-ai/omnimux-dsh'), false);
  assert.equal(isVideoUrl('https://example.com/blog/article'), false);
});

test('resolvePlatformName: resolves clean platform or domain names without "视频" label', () => {
  assert.equal(resolvePlatformName('https://www.tiktok.com/@user/video/123'), 'TikTok');
  assert.equal(resolvePlatformName('https://www.douyin.com/video/123'), '抖音');
  assert.equal(resolvePlatformName('https://www.youtube.com/watch?v=123'), 'YouTube');
  assert.equal(resolvePlatformName('https://www.bilibili.com/video/BV123'), 'B站');
  assert.equal(resolvePlatformName('https://github.com/omnimux-ai'), 'github.com');
  assert.equal(resolvePlatformName('https://example.com/article'), 'example.com');
  assert.equal(resolvePlatformName('invalid-url'), '链接');
  assert.equal(resolvePlatformName(''), '链接');
  // Must NEVER return the word "视频"
  assert.notEqual(resolvePlatformName('https://example.com/article'), '视频');
});

test('MODAL_STYLES: ensures popover card has solid opaque background', () => {
  assert.ok(MODAL_STYLES.includes('background: var(--dsw-alias-bg-layer-2, #2c2c2e) !important;'));
  assert.ok(MODAL_STYLES.includes('backdrop-filter: blur(8px);'));
  // Should NOT have bare undefined bg-elevated without fallback
  assert.ok(!MODAL_STYLES.includes('background: var(--dsw-alias-bg-elevated);'));
});

test('DOCK_STYLES: provides brand purple link icon mask for composer chip', () => {
  assert.ok(DOCK_STYLES.includes('[data-composer-chip="link"]'));
  assert.ok(DOCK_STYLES.includes('-webkit-mask: url('));
  assert.ok(DOCK_STYLES.includes('margin: 0 6px !important;'));
});
