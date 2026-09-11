import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMessageLinks,
  inferLinkMetadata,
  TIKTOK_ICON_SVG,
  YOUTUBE_ICON_SVG,
  BILIBILI_ICON_SVG,
  XIAOHONGSHU_ICON_SVG,
  GENERIC_WEB_ICON_SVG,
} from './linkPillMetadata.ts';

test('linkPillMetadata: detectMessageLinks extracts TikTok video link from realistic user prompt', () => {
  const prompt = '分析拆解视频 https://www.tiktok.com/@jinglenap.official/video/7675208855269281054?is_from_webapp=1&sender_device=pc';
  const links = detectMessageLinks(prompt);

  assert.equal(links.length, 1);
  const item = links[0];
  assert.equal(item.url, 'https://www.tiktok.com/@jinglenap.official/video/7675208855269281054?is_from_webapp=1&sender_device=pc');
  assert.equal(item.platform, 'TikTok');
  assert.equal(item.title, 'TikTok - @jinglenap.official');
  assert.equal(item.iconSvg, TIKTOK_ICON_SVG);
  assert.equal(item.start, 7);
});

test('linkPillMetadata: detectMessageLinks extracts Markdown link with explicit title', () => {
  const text = '请看这个 [TikTok - Make Your Day](https://www.tiktok.com/@test/video/123)';
  const links = detectMessageLinks(text);

  assert.equal(links.length, 1);
  const item = links[0];
  assert.equal(item.raw, '[TikTok - Make Your Day](https://www.tiktok.com/@test/video/123)');
  assert.equal(item.url, 'https://www.tiktok.com/@test/video/123');
  assert.equal(item.title, 'TikTok - Make Your Day');
  assert.equal(item.platform, 'TikTok');
});

test('linkPillMetadata: inferLinkMetadata resolves multiple video platforms accurately', () => {
  // TikTok fallback
  const tiktokMeta = inferLinkMetadata('https://www.tiktok.com/explore');
  assert.equal(tiktokMeta.platform, 'TikTok');
  assert.equal(tiktokMeta.title, 'TikTok - Make Your Day');
  assert.equal(tiktokMeta.iconSvg, TIKTOK_ICON_SVG);

  // YouTube
  const ytMeta = inferLinkMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(ytMeta.platform, 'YouTube');
  assert.equal(ytMeta.title, 'YouTube · 视频');
  assert.equal(ytMeta.iconSvg, YOUTUBE_ICON_SVG);

  // Bilibili
  const biliMeta = inferLinkMetadata('https://www.bilibili.com/video/BV1xx411c7mD');
  assert.equal(biliMeta.platform, 'B站');
  assert.equal(biliMeta.title, '哔哩哔哩 · 视频');
  assert.equal(biliMeta.iconSvg, BILIBILI_ICON_SVG);

  // Xiaohongshu
  const xhsMeta = inferLinkMetadata('https://www.xiaohongshu.com/explore/123456');
  assert.equal(xhsMeta.platform, '小红书');
  assert.equal(xhsMeta.title, '小红书 · 笔记');
  assert.equal(xhsMeta.iconSvg, XIAOHONGSHU_ICON_SVG);

  // Generic website
  const webMeta = inferLinkMetadata('https://github.com/omnimux-ai/omnimux-dsh');
  assert.equal(webMeta.platform, 'github.com');
  assert.equal(webMeta.title, 'github.com');
  assert.equal(webMeta.iconSvg, GENERIC_WEB_ICON_SVG);
});

test('linkPillMetadata: detectMessageLinks handles trailing punctuation gracefully', () => {
  const text = '参考这个网址：https://github.com/features，以及 https://example.com/test。';
  const links = detectMessageLinks(text);

  assert.equal(links.length, 2);
  assert.equal(links[0].url, 'https://github.com/features');
  assert.equal(links[1].url, 'https://example.com/test');
});

test('linkPillMetadata: detectMessageLinks returns empty list for plain text', () => {
  assert.deepEqual(detectMessageLinks('纯文本没有任何链接'), []);
  assert.deepEqual(detectMessageLinks(''), []);
  assert.deepEqual(detectMessageLinks(null), []);
});
