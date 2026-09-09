/**
 * 社媒视频链接识别与提取工具。
 * 纯函数、无 React 依赖，供组件、工具栏与 node:test 共用。
 */

export interface SupportedSocialPlatform {
  key: string;
  name: string;
  patterns: RegExp[];
}

export const SUPPORTED_SOCIAL_PLATFORMS: readonly SupportedSocialPlatform[] = Object.freeze([
  {
    key: 'tiktok',
    name: 'TikTok',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|vt\.|vm\.)?tiktok\.com\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'douyin',
    name: '抖音',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|v\.|ies\.)?douyin\.com\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'kuaishou',
    name: '快手',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|v\.)?(?:kuaishou|kwai)\.com\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'xiaohongshu',
    name: '小红书',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'bilibili',
    name: '哔哩哔哩',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com|b23\.tv)\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'x',
    name: 'X (Twitter)',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'instagram',
    name: 'Instagram',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
  {
    key: 'wechat_channels',
    name: '视频号',
    patterns: [
      /(?:https?:\/\/)?(?:channels\.weixin\.qq\.com|weixin\.qq\.com)\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i,
    ],
  },
]);

/** 通用 HTTP(S) URL 匹配正则（过滤中文与常见包裹字符） */
const HTTP_URL_REGEX = /https?:\/\/[^\s\u4e00-\u9fa5<>'"()[\]{}]+/i;

/** 清理 URL 尾部常见标点符号 */
function cleanUrlTail(url: string): string {
  return url.replace(/[.,;!?)>。，；！？）》]+$/, '');
}

export interface ExtractedSocialVideoUrl {
  url: string;
  platform: string;
  platformName: string;
}

/**
 * 从文本中查找并提取支持的社交媒体平台视频地址。
 * 支持用户直接输入裸 URL 或粘贴包含中文文案的社媒分享口令/文案。
 */
export function extractSocialVideoUrl(text: unknown): ExtractedSocialVideoUrl | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const raw = text.trim();

  // 1. 尝试使用 HTTP(S) 正则提取链接
  const match = raw.match(HTTP_URL_REGEX);
  let candidateUrl = match ? cleanUrlTail(match[0]) : '';

  // 2. 若无协议前缀，但文本看起来像常见社媒域名短链（如 v.douyin.com/xxx、b23.tv/xxx）
  if (!candidateUrl) {
    for (const p of SUPPORTED_SOCIAL_PLATFORMS) {
      for (const pattern of p.patterns) {
        const m = raw.match(pattern);
        if (m) {
          const matchedStr = cleanUrlTail(m[0]);
          candidateUrl = matchedStr.startsWith('http') ? matchedStr : `https://${matchedStr}`;
          break;
        }
      }
      if (candidateUrl) break;
    }
  }

  if (!candidateUrl) return null;

  // 3. 校验该 URL 是否属于支持的社交媒体平台
  for (const p of SUPPORTED_SOCIAL_PLATFORMS) {
    for (const pattern of p.patterns) {
      if (pattern.test(candidateUrl)) {
        return {
          url: candidateUrl,
          platform: p.key,
          platformName: p.name,
        };
      }
    }
  }

  return null;
}

/** 快捷判定文本中是否包含支持的社媒视频链接 */
export function isSupportedSocialVideoUrl(text: unknown): boolean {
  return extractSocialVideoUrl(text) !== null;
}
