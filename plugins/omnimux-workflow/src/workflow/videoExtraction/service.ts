import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { extractSocialVideoUrl } from '../../canvas/editor/utils/socialMediaVideoUrl.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { ExtractVideoRequest, ExtractVideoResult } from './schema.ts';
import { VideoExtractionError } from './errors.ts';

export interface VideoExtractionServiceDeps {
  store: Pick<WorkspaceStore, 'get'>;
  mediaDir: string;
  getSeam?: (name: string) => unknown;
  getTool?: (name: string) => unknown;
  fetcher?: typeof fetch;
}

/**
 * 探测 URL 对应扩展名，兜底 .mp4
 */
function detectVideoExt(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase();
    if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
      return ext;
    }
  } catch {
    // fallback
  }
  return '.mp4';
}

/**
 * 下载远程多媒体文件到指定目录（原子重命名防残缺）
 */
async function downloadVideoToDisk(
  url: string,
  destDir: string,
  fetcher: typeof fetch,
): Promise<string> {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  const ext = detectVideoExt(url);
  const filename = `video_${randomUUID().slice(0, 8)}${ext}`;
  const targetPath = join(destDir, filename);
  const tempPath = `${targetPath}.${randomUUID().slice(0, 4)}.tmp`;

  const response = await fetcher(url);
  if (!response.ok) {
    throw new VideoExtractionError(
      'download-failed',
      `视频文件下载失败：HTTP ${response.status}`,
      502,
    );
  }

  try {
    if (response.body && typeof response.body.getReader === 'function') {
      const nodeStream = Readable.fromWeb(response.body as any);
      await pipeline(nodeStream, createWriteStream(tempPath));
    } else if (typeof response.arrayBuffer === 'function') {
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(tempPath, buffer);
    } else {
      throw new VideoExtractionError('download-failed', '不支持的响应数据流格式', 502);
    }

    renameSync(tempPath, targetPath);
    return filename;
  } catch (err) {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch {}
    }
    if (err instanceof VideoExtractionError) throw err;
    throw new VideoExtractionError(
      'download-failed',
      `视频写入磁盘失败: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }
}

/**
 * 创建社媒视频提取服务，适配执行中枢提供的社媒解析接口
 */
export function createVideoExtractionService(deps: VideoExtractionServiceDeps) {
  const fetcher = deps.fetcher ?? globalThis.fetch;

  return async (workspaceId: string, input: Required<ExtractVideoRequest>): Promise<ExtractVideoResult> => {
    // 1. 校验工作区存在性
    deps.store.get(workspaceId);

    const targetUrl = input.url.trim();
    const detected = extractSocialVideoUrl(targetUrl);
    const platform = detected?.platform || 'tiktok';

    let extractedVideoUrl = '';
    let title: string | undefined;
    let coverUrl: string | undefined;
    let duration: number | undefined;

    // 2. 适配执行中枢能力：优先消费官方 omnimux_social_data 工具或 socialData 接缝
    const socialTool = (deps.getTool?.('omnimux_social_data') ?? deps.getSeam?.('socialData')) as {
      execute?: (args: Record<string, unknown>) => Promise<any>;
    } | undefined;

    if (socialTool && typeof socialTool.execute === 'function') {
      try {
        const capability = platform === 'x' ? 'tweet' : platform === 'instagram' ? 'post' : 'video';
        const res = await socialTool.execute({
          platform,
          capability,
          url: targetUrl,
        });

        const data = res?.data;
        if (data && typeof data === 'object') {
          const videoCandidate =
            data.video_url ||
            data.play_url ||
            data.play ||
            data.download_url ||
            data.video ||
            (Array.isArray(data.videos) ? data.videos[0] : '') ||
            data.media?.video?.[0]?.variants?.[0]?.url ||
            data.entities?.media?.[0]?.video_info?.variants?.find((v: any) => v.content_type === 'video/mp4')?.url;

          if (typeof videoCandidate === 'string' && /^https?:\/\//i.test(videoCandidate)) {
            extractedVideoUrl = videoCandidate;
          }

          title = typeof data.title === 'string' ? data.title : typeof data.desc === 'string' ? data.desc : typeof data.text === 'string' ? data.text : undefined;
          coverUrl = typeof data.cover_url === 'string' ? data.cover_url : typeof data.thumbnail_url === 'string' ? data.thumbnail_url : typeof data.origin_cover === 'string' ? data.origin_cover : undefined;
          if (typeof data.duration === 'number') duration = data.duration;
        }
      } catch (toolError) {
        // 工具调用抛错时（如限流或解析失败），继续尝试备用直连提取
      }
    }

    // 3. 弹性备用降级：针对 TikTok 的开源/公开解析网关兜底
    if (!extractedVideoUrl && (platform === 'tiktok' || /tiktok\.com/i.test(targetUrl))) {
      try {
        const fallbackResp = await fetcher(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (fallbackResp.ok) {
          const json = (await fallbackResp.json()) as any;
          if (json && json.data) {
            const d = json.data;
            const playUrl = d.play || d.wmplay || d.hdplay || (Array.isArray(d.videos) ? d.videos[0] : '');
            if (typeof playUrl === 'string' && /^https?:\/\//i.test(playUrl)) {
              extractedVideoUrl = playUrl;
              title = title || d.title;
              coverUrl = coverUrl || d.cover || d.origin_cover;
              duration = duration || (typeof d.duration === 'number' ? d.duration : undefined);
            }
          }
        }
      } catch {
        // Fallback ignore
      }
    }

    // 4. 若传入链接本身即为直链视频（如 .mp4 / .webm）
    if (!extractedVideoUrl && /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(targetUrl)) {
      extractedVideoUrl = targetUrl;
    }

    // 5. 无法提取出视频直链时阻断
    if (!extractedVideoUrl) {
      throw new VideoExtractionError(
        'no-video-found',
        '未能从此链接提取到有效视频，请检查该社媒链接是否有效且公开可见',
        422,
      );
    }

    // 6. 下载视频至工作区媒体目录
    const videosDir = join(deps.mediaDir, 'videos');
    const savedFilename = await downloadVideoToDisk(extractedVideoUrl, videosDir, fetcher);
    const targetVideoPath = join(videosDir, savedFilename);
    const relativeMediaUrl = `${WORKFLOW_ROUTE_PREFIX}/media/videos/${savedFilename}`;

    return {
      videoPath: targetVideoPath,
      mediaUrl: relativeMediaUrl,
      previewUrl: relativeMediaUrl,
      title: title || (detected?.platformName ? `${detected.platformName} 视频` : '提取视频'),
      duration,
      coverUrl,
      platform,
    };
  };
}
