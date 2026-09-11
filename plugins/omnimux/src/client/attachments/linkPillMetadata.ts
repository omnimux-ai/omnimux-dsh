/**
 * Link Pill Metadata Resolver
 * Extracts URLs and Markdown links from text, resolves platform branding,
 * SVG icons, and smart human-readable titles (matching the pill design in Figure 2).
 */

export interface DetectedLinkItem {
  readonly raw: string;
  readonly url: string;
  readonly title: string;
  readonly platform: string;
  readonly iconSvg: string;
  readonly start: number;
  readonly end: number;
}

// Global regex to match Markdown links [title](url) or standalone http(s) URLs.
// Uses RFC 3986 safe ASCII URL characters to avoid swallowing Chinese/multibyte characters.
const LINK_DETECTION_REGEX = /(?:\[([^\]\n]+)\]\((https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]+)\))|(https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]+)/gu;

function trimUrlTrailingPunctuation(rawUrl: string): string {
  return rawUrl.replace(/[.,:;!?()[\]{}，。；：！？（）【】'"]+$/gu, '');
}

/**
 * TikTok Official Colored Music Note Icon (16x16 with dark circular backdrop)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const TIKTOK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#000000"/><path d="M11.66 5.86a3.25 3.25 0 0 1-1.88-.6 3.32 3.32 0 0 1-.94-1.2h-1.6v6.6a1.64 1.64 0 1 1-1.64-1.64c.26 0 .5.06.72.16v-1.7a3.28 3.28 0 0 0-.72-.08 3.28 3.28 0 1 0 3.28 3.28V6.9a4.88 4.88 0 0 0 2.78.85v-1.89z" fill="#FE2C55"/><path d="M11.56 5.76a3.25 3.25 0 0 1-1.88-.6 3.32 3.32 0 0 1-.94-1.2h-1.6v6.6a1.64 1.64 0 1 1-1.64-1.64c.26 0 .5.06.72.16v-1.7a3.28 3.28 0 0 0-.72-.08 3.28 3.28 0 1 0 3.28 3.28V6.9a4.88 4.88 0 0 0 2.78.85v-1.89z" fill="#25F4EE" style="mix-blend-mode: screen;"/><path d="M11.61 5.81a3.25 3.25 0 0 1-1.88-.6 3.32 3.32 0 0 1-.94-1.2h-1.6v6.6a1.64 1.64 0 1 1-1.64-1.64c.26 0 .5.06.72.16v-1.7a3.28 3.28 0 0 0-.72-.08 3.28 3.28 0 1 0 3.28 3.28V6.9a4.88 4.88 0 0 0 2.78.85v-1.89z" fill="#FFFFFF"/></svg>`; /* exempt-ui03 */

/**
 * YouTube Official Red & White Icon (16x16)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const YOUTUBE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="8" fill="#FF0000"/><path d="M6.5 5.5L10.5 8L6.5 10.5V5.5Z" fill="#FFFFFF"/></svg>`; /* exempt-ui03 */

/**
 * Bilibili Blue Television Icon (16x16)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const BILIBILI_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="8" fill="#00AEEC"/><path d="M5.2 4.2L6.6 5.6M10.8 4.2L9.4 5.6" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/><rect x="3.8" y="5.6" width="8.4" height="6" rx="1.5" fill="#FFFFFF"/><circle cx="6.3" cy="8.6" r="0.75" fill="#00AEEC"/><circle cx="9.7" cy="8.6" r="0.75" fill="#00AEEC"/></svg>`; /* exempt-ui03 */

/**
 * Xiaohongshu Red Bookmark Icon (16x16)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const XIAOHONGSHU_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="8" fill="#FF2442"/><path d="M5 4.5h6v7.5l-3-1.8-3 1.8v-7.5z" fill="#FFFFFF"/></svg>`; /* exempt-ui03 */

/**
 * Instagram Gradient Icon (16x16)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const INSTAGRAM_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="8" fill="#E1306C"/><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="2.2" stroke="#FFFFFF" stroke-width="1.2"/><circle cx="8" cy="8" r="1.8" stroke="#FFFFFF" stroke-width="1.2"/><circle cx="10.2" cy="5.8" r="0.6" fill="#FFFFFF"/></svg>`; /* exempt-ui03 */

/**
 * X / Twitter Icon (16x16)
 */
/* exempt-ui03: 官方品牌矢量商标标准色 */
export const X_TWITTER_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="8" fill="#111111"/><path d="M4.8 4.2L7.3 7.8L4.6 11.8H5.6L7.8 8.6L9.6 11.8H11.8L9.1 8L11.5 4.2H10.5L8.5 7.1L6.9 4.2H4.8Z" fill="#FFFFFF"/></svg>`; /* exempt-ui03 */

/**
 * Generic Web Globe Icon (16x16) - Strictly Vector SVG, zero emoji
 */
export const GENERIC_WEB_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7.25" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="8" rx="3.5" ry="7.25" stroke="currentColor" stroke-width="1.1"/><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.1"/></svg>`;

export interface PlatformConfig {
  readonly platform: string;
  readonly defaultTitle: string;
  readonly iconSvg: string;
}

const PLATFORM_RULES: readonly {
  readonly pattern: RegExp;
  readonly config: PlatformConfig;
  readonly extractTitle?: (url: string) => string | null;
}[] = [
  {
    pattern: /(?:tiktok\.com|douyin\.com)/i,
    config: {
      platform: 'TikTok',
      defaultTitle: 'TikTok - Make Your Day',
      iconSvg: TIKTOK_ICON_SVG,
    },
    extractTitle: (url: string) => {
      // If URL contains /@username/video/id, format as "TikTok - @username" or fallback to "TikTok - Make Your Day"
      const userMatch = url.match(/@([\w.-]+)/);
      if (userMatch && userMatch[1]) {
        return `TikTok - @${userMatch[1]}`;
      }
      return 'TikTok - Make Your Day';
    },
  },
  {
    pattern: /(?:youtube\.com|youtu\.be)/i,
    config: {
      platform: 'YouTube',
      defaultTitle: 'YouTube · 视频',
      iconSvg: YOUTUBE_ICON_SVG,
    },
  },
  {
    pattern: /(?:bilibili\.com|b23\.tv)/i,
    config: {
      platform: 'B站',
      defaultTitle: '哔哩哔哩 · 视频',
      iconSvg: BILIBILI_ICON_SVG,
    },
  },
  {
    pattern: /(?:xiaohongshu\.com|xhslink\.com)/i,
    config: {
      platform: '小红书',
      defaultTitle: '小红书 · 笔记',
      iconSvg: XIAOHONGSHU_ICON_SVG,
    },
  },
  {
    pattern: /instagram\.com/i,
    config: {
      platform: 'Instagram',
      defaultTitle: 'Instagram',
      iconSvg: INSTAGRAM_ICON_SVG,
    },
  },
  {
    pattern: /(?:twitter\.com|x\.com)/i,
    config: {
      platform: 'X',
      defaultTitle: 'X (Twitter)',
      iconSvg: X_TWITTER_ICON_SVG,
    },
  },
];

/**
 * Infer human-friendly title and branding from URL and optional explicit markdown title
 */
export function inferLinkMetadata(url: string, explicitTitle?: string): { title: string; platform: string; iconSvg: string } {
  const trimmedUrl = url.trim();

  // Find matching platform
  for (const rule of PLATFORM_RULES) {
    if (rule.pattern.test(trimmedUrl)) {
      const platform = rule.config.platform;
      const iconSvg = rule.config.iconSvg;
      let title = explicitTitle?.trim() || (rule.extractTitle ? rule.extractTitle(trimmedUrl) : null) || rule.config.defaultTitle;
      return { title, platform, iconSvg };
    }
  }

  // Fallback for generic websites
  let domain = '网页链接';
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`);
    domain = parsed.hostname.replace(/^www\./, '') || '网页链接';
  } catch {
    // Keep fallback
  }

  return {
    title: explicitTitle?.trim() || domain,
    platform: domain,
    iconSvg: GENERIC_WEB_ICON_SVG,
  };
}

/**
 * Extract all URLs and Markdown links from text
 */
export function detectMessageLinks(text?: string | null): readonly DetectedLinkItem[] {
  if (!text || typeof text !== 'string') return [];

  const items: DetectedLinkItem[] = [];
  LINK_DETECTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_DETECTION_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const isMarkdown = match[1] !== undefined && match[2] !== undefined;
    const explicitTitle = isMarkdown ? match[1] : undefined;
    const candidateUrl = isMarkdown ? match[2] : match[3];

    if (!candidateUrl) continue;

    const targetUrl = isMarkdown ? candidateUrl : trimUrlTrailingPunctuation(candidateUrl);
    if (!targetUrl) continue;

    const lengthDiff = candidateUrl.length - targetUrl.length;
    const finalRaw = isMarkdown ? raw : targetUrl;
    const end = match.index + (isMarkdown ? raw.length : targetUrl.length);

    // Rewind regex lastIndex if trailing punctuation was stripped from non-markdown match
    if (!isMarkdown && lengthDiff > 0) {
      LINK_DETECTION_REGEX.lastIndex -= lengthDiff;
    }

    const meta = inferLinkMetadata(targetUrl, explicitTitle);
    items.push({
      raw: finalRaw,
      url: targetUrl,
      title: meta.title,
      platform: meta.platform,
      iconSvg: meta.iconSvg,
      start: match.index,
      end,
    });
  }

  return items;
}
