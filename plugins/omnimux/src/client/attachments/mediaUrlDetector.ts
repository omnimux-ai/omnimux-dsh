const VIDEO_DOMAINS_AND_EXTENSIONS: readonly string[] = [
  'tiktok.com',
  'douyin.com',
  'youtube.com',
  'youtu.be',
  'bilibili.com',
  'instagram.com',
  'xiaohongshu.com',
  'xhslink.com',
  '.mp4',
  '.mov',
  '.webm',
];

const PLATFORM_MAP: readonly (readonly [string, string])[] = [
  ['tiktok.com', 'TikTok'],
  ['douyin.com', '抖音'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['bilibili.com', 'B站'],
  ['instagram.com', 'Instagram'],
  ['xiaohongshu.com', '小红书'],
  ['xhslink.com', '小红书'],
];

export function isVideoCategory(category?: string | null): boolean {
  if (!category || typeof category !== 'string') return false;
  const lower = category.toLowerCase();
  return (
    category === '创作视频' ||
    category === 'video-creation' ||
    category === '搜索爆款视频' ||
    category === 'search-viral-video' ||
    lower.includes('视频') ||
    lower.includes('video')
  );
}

export function isValidUrl(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed);
}

export function isVideoUrl(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  const lower = trimmed.toLowerCase();
  return VIDEO_DOMAINS_AND_EXTENSIONS.some((pattern) => lower.includes(pattern));
}

export function resolvePlatformName(url: string): string {
  if (!url || typeof url !== 'string') return '链接';
  const lower = url.toLowerCase();
  const match = PLATFORM_MAP.find(([domain]) => lower.includes(domain));
  if (match) return match[1];

  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!host || !host.includes('.')) {
      return '链接';
    }
    return host;
  } catch {
    return '链接';
  }
}
