import { createWriteStream, existsSync, mkdirSync, unlinkSync, openSync, readSync, closeSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Detect extension from URL or mime type.
 * @param {string} url
 * @param {string} [defaultExt]
 */
export function detectExt(url, defaultExt = '.mp4') {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase();
    if (['.mp4', '.mov', '.webm', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return ext;
    }
  } catch {
    // fallback
  }
  return defaultExt;
}

/**
 * Download a remote URL into a target local destination safely.
 * Rejects HTML error/anti-bot responses masquerading as media.
 * @param {string} url
 * @param {string} destDir
 * @param {{ prefix?: string, ext?: string, fetcher?: typeof fetch }} [opts]
 * @returns {Promise<string>} absolute path of saved file
 */
export async function downloadMedia(url, destDir, opts = {}) {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  const fetcher = opts.fetcher ?? fetch;
  const ext = opts.ext || detectExt(url, '.mp4');
  const prefix = opts.prefix || 'vid_';
  const filename = `${prefix}${randomUUID().slice(0, 8)}${ext}`;
  const targetPath = join(destDir, filename);
  const tempPath = `${targetPath}.${randomUUID().slice(0, 4)}.tmp`;

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: HTTP ${response.status} from ${url}`);
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`Refused to download HTML content (${contentType}) as media file from ${url}`);
  }

  try {
    if (response.body && typeof response.body.getReader === 'function') {
      const nodeStream = Readable.fromWeb(/** @type {any} */ (response.body));
      await pipeline(nodeStream, createWriteStream(tempPath));
    } else if (typeof response.arrayBuffer === 'function') {
      const buf = Buffer.from(await response.arrayBuffer());
      const { writeFileSync } = await import('node:fs');
      writeFileSync(tempPath, buf);
    }

    // Inspect file header: fail fast if response was HTML anti-bot challenge
    if (existsSync(tempPath)) {
      let isHtml = false;
      try {
        const fd = openSync(tempPath, 'r');
        const headBuf = Buffer.alloc(256);
        readSync(fd, headBuf, 0, 256, 0);
        closeSync(fd);
        const headStr = headBuf.toString('utf8', 0, 100).toLowerCase();
        if (headStr.includes('<!doctype') || headStr.includes('<html') || headStr.includes('<head')) {
          isHtml = true;
        }
      } catch {}

      if (isHtml) {
        try { unlinkSync(tempPath); } catch {}
        throw new Error(`Downloaded payload for ${url} is HTML page, not a valid media binary`);
      }
    }

    const { renameSync } = await import('node:fs');
    renameSync(tempPath, targetPath);
    return targetPath;
  } catch (err) {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch {}
    }
    throw err;
  }
}

/**
 * Fallback direct resolver for social media video links (TikTok, etc.)
 * Provides resilient extraction when cloud gateway upstream scraper encounters 422/rate-limits.
 * @param {{ platform: string, capability?: string, url: string }} params
 */
export async function fallbackResolveSocial({ platform, capability = 'video', url }) {
  if (!url || typeof url !== 'string') return null;

  if (platform === 'tiktok' || /tiktok\.com/i.test(url)) {
    try {
      const resp = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.data) {
          const d = json.data;
          const videoUrl = d.play || d.wmplay || d.hdplay || (Array.isArray(d.videos) ? d.videos[0] : '');
          if (videoUrl) {
            return {
              platform: 'tiktok',
              capability: 'video',
              data: {
                title: d.title || url,
                text: d.title || '',
                cover_url: d.cover || d.origin_cover || '',
                video_url: videoUrl,
                duration: d.duration || 0,
                author: {
                  name: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
                  handle: d.author?.unique_id || '',
                  avatar: d.author?.avatar || '',
                },
                stats: {
                  likes: d.digg_count || 0,
                  comments: d.comment_count || 0,
                  shares: d.share_count || 0,
                  views: d.play_count || 0,
                },
              },
            };
          }
        }
      }
    } catch {}
  }

  return null;
}
