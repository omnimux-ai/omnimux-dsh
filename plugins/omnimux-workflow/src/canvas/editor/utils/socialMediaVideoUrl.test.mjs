import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractSocialVideoUrl,
  isSupportedSocialVideoUrl,
  SUPPORTED_SOCIAL_PLATFORMS,
} from './socialMediaVideoUrl.ts';

test('extractSocialVideoUrl: 支持主流海内外社交媒体平台的纯 URL 解析', () => {
  const testCases = [
    {
      input: 'https://www.tiktok.com/@user/video/7123456789012345678',
      expectedPlatform: 'tiktok',
      expectedUrl: 'https://www.tiktok.com/@user/video/7123456789012345678',
    },
    {
      input: 'https://vt.tiktok.com/ZS2abc123/',
      expectedPlatform: 'tiktok',
      expectedUrl: 'https://vt.tiktok.com/ZS2abc123/',
    },
    {
      input: 'https://v.douyin.com/iabc123/',
      expectedPlatform: 'douyin',
      expectedUrl: 'https://v.douyin.com/iabc123/',
    },
    {
      input: 'https://www.douyin.com/video/7123456789012345678',
      expectedPlatform: 'douyin',
      expectedUrl: 'https://www.douyin.com/video/7123456789012345678',
    },
    {
      input: 'https://www.kuaishou.com/short-video/3xabc123',
      expectedPlatform: 'kuaishou',
      expectedUrl: 'https://www.kuaishou.com/short-video/3xabc123',
    },
    {
      input: 'https://www.xiaohongshu.com/explore/64abc123',
      expectedPlatform: 'xiaohongshu',
      expectedUrl: 'https://www.xiaohongshu.com/explore/64abc123',
    },
    {
      input: 'http://xhslink.com/a/abc123xyz',
      expectedPlatform: 'xiaohongshu',
      expectedUrl: 'http://xhslink.com/a/abc123xyz',
    },
    {
      input: 'https://www.bilibili.com/video/BV1xx411c7mD',
      expectedPlatform: 'bilibili',
      expectedUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
    },
    {
      input: 'https://b23.tv/av123456',
      expectedPlatform: 'bilibili',
      expectedUrl: 'https://b23.tv/av123456',
    },
    {
      input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      expectedPlatform: 'youtube',
      expectedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    {
      input: 'https://youtu.be/dQw4w9WgXcQ',
      expectedPlatform: 'youtube',
      expectedUrl: 'https://youtu.be/dQw4w9WgXcQ',
    },
    {
      input: 'https://x.com/username/status/1234567890123456789',
      expectedPlatform: 'x',
      expectedUrl: 'https://x.com/username/status/1234567890123456789',
    },
    {
      input: 'https://twitter.com/username/status/1234567890123456789',
      expectedPlatform: 'x',
      expectedUrl: 'https://twitter.com/username/status/1234567890123456789',
    },
    {
      input: 'https://www.instagram.com/reel/C8abc123xyz/',
      expectedPlatform: 'instagram',
      expectedUrl: 'https://www.instagram.com/reel/C8abc123xyz/',
    },
  ];

  for (const tc of testCases) {
    const res = extractSocialVideoUrl(tc.input);
    assert.ok(res, `Failed for input: ${tc.input}`);
    assert.equal(res.platform, tc.expectedPlatform);
    assert.equal(res.url, tc.expectedUrl);
    assert.equal(isSupportedSocialVideoUrl(tc.input), true);
  }
});

test('extractSocialVideoUrl: 支持从混合文案（如抖音分享口令、B站标题）中精准提取链接', () => {
  const douyinShareText = '7.21 复制打开抖音，看看【小明的作品】今天的晚霞太美了！ https://v.douyin.com/iabcde123/ 复制此链接，打开Dou音搜索';
  const resDouyin = extractSocialVideoUrl(douyinShareText);
  assert.ok(resDouyin);
  assert.equal(resDouyin.platform, 'douyin');
  assert.equal(resDouyin.url, 'https://v.douyin.com/iabcde123/');

  const bilibiliShareText = '【4K画质】超燃混剪！来感受视觉震撼吧！ https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.1007';
  const resBilibili = extractSocialVideoUrl(bilibiliShareText);
  assert.ok(resBilibili);
  assert.equal(resBilibili.platform, 'bilibili');
  assert.equal(resBilibili.url, 'https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.1007');

  const xShareText = 'Check out this breaking news: https://x.com/elonmusk/status/1831234567890123456! Amazing stuff.';
  const resX = extractSocialVideoUrl(xShareText);
  assert.ok(resX);
  assert.equal(resX.platform, 'x');
  assert.equal(resX.url, 'https://x.com/elonmusk/status/1831234567890123456');
});

test('extractSocialVideoUrl: 过滤非社媒网址与纯文本，安全返回 null', () => {
  assert.equal(extractSocialVideoUrl(null), null);
  assert.equal(extractSocialVideoUrl(''), null);
  assert.equal(extractSocialVideoUrl('   '), null);
  assert.equal(extractSocialVideoUrl('这是一篇关于AI视频生成的剧本文案，没有URL'), null);
  assert.equal(extractSocialVideoUrl('https://example.com/test.html'), null);
  assert.equal(extractSocialVideoUrl('https://github.com/deepseek-ai/deepseek-harness'), null);
  assert.equal(isSupportedSocialVideoUrl('https://google.com'), false);
});
