import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { VideoDepthError } from './errors.ts';
import type { VideoDepthRequest, VideoDepthResult } from './schema.ts';

export interface VideoDepthServiceDeps {
  store: WorkspaceStore;
  mediaDir?: string;
  getSeam?: (name: string) => unknown;
  getTool?: (name: string) => unknown;
  /** 源视频解析（与视频拆解/提取音频共用同一套实现，由路由层注入）。 */
  resolveVideoPath: (workspaceId: string, videoPath: string) => string;
}

/** Capability codes from omnimux-video → route-level actionable codes. */
const UPSTREAM_CODE_MAP: Record<string, [string, number]> = {
  'video-depth-deps-missing': ['deps-missing', 503],
  'ffmpeg-missing': ['ffmpeg-missing', 503],
  'video-timeout': ['timeout', 504],
  'video-canceled': ['canceled', 502],
  'video-invalid-input': ['invalid-request', 400],
};

const FAILURE_MESSAGES: Record<string, string> = {
  'deps-missing':
    '本机缺少深度图 Python 依赖（numpy / opencv-python / onnxruntime）。安装后重试，或把 OMNIMUX_VIDEO_PYTHON_PATH 指向已装依赖的解释器',
  'ffmpeg-missing': '本机缺少 ffmpeg/ffprobe，安装后重试（macOS: brew install ffmpeg）',
  timeout: '深度视频生成超时，请缩短视频后重试',
  canceled: '深度视频生成已取消',
  'invalid-request': '深度视频请求参数无效',
  'depth-failed': '深度视频生成失败，请重试',
};

function upstreamDetail(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const hint = typeof (error as { hint?: unknown }).hint === 'string' ? (error as { hint: string }).hint : '';
  const message = error instanceof Error ? error.message : '';
  return String(hint || message).slice(0, 400);
}

export function mapVideoDepthExecutionError(error: unknown): VideoDepthError {
  const code =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  const detail = upstreamDetail(error);
  const tried = Array.isArray((error as { tried?: unknown })?.tried)
    ? ((error as { tried: string[] }).tried)
    : [];
  const mapped = UPSTREAM_CODE_MAP[code];
  if (mapped) {
    const [routeCode, status] = mapped;
    const baseMessage = FAILURE_MESSAGES[routeCode] ?? '深度视频生成失败';
    // 自动发现失败时把尝试过的解释器带到用户可见的 message，而不是只留在 detail。
    const triedSuffix = routeCode === 'deps-missing' && tried.length > 0
      ? `（已尝试：${tried.join(' / ')}）`
      : '';
    return new VideoDepthError(routeCode, `${baseMessage}${triedSuffix}`, status, {
      code,
      detail,
    });
  }
  return new VideoDepthError(
    'depth-failed',
    FAILURE_MESSAGES['depth-failed'] ?? '深度视频生成失败，请重试',
    502,
    { code: code || 'unknown', detail },
  );
}

export function createVideoDepthService(deps: VideoDepthServiceDeps) {
  return async (workspaceId: string, input: Required<VideoDepthRequest>): Promise<VideoDepthResult> => {
    // 1. 验证工作区有效性
    deps.store.get(workspaceId);

    // 2. 解析源视频（与视频拆解共用同一套解析）。本地路径要求存在；远程
    //    http(s) 地址交给 video_depth 自带的 materialize 下载，不能按本地文件 404。
    const absVideoPath = deps.resolveVideoPath(workspaceId, input.videoPath);
    const isRemoteVideo = /^https?:\/\//i.test(String(absVideoPath || ''));
    if (!absVideoPath || (!isRemoteVideo && !existsSync(absVideoPath))) {
      throw new VideoDepthError('video-not-found', '未找到指定视频文件', 404);
    }

    // 3. 目标目录：与提取音频同源（mediaDir 优先，工作区本地目录兜底）
    let depthDir: string;
    let getMediaUrl: (filename: string) => string;
    if (deps.mediaDir) {
      depthDir = join(deps.mediaDir, 'video-depth', workspaceId);
      getMediaUrl = (filename: string) => `/omnimux-workflow/media/video-depth/${workspaceId}/${filename}`;
    } else {
      const baseDir = deps.store.workspacesDir || process.cwd();
      depthDir = join(baseDir, workspaceId, '.omnimux', 'media', 'video-depth');
      getMediaUrl = (filename: string) => `/api/local-file?path=${encodeURIComponent(join(depthDir, filename))}`;
    }

    if (!existsSync(depthDir)) {
      try {
        mkdirSync(depthDir, { recursive: true });
      } catch (error) {
        throw new VideoDepthError('depth-failed', '深度视频输出目录创建失败', 500, {
          code: 'mkdir-failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const filename = `depth_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
    const destDepthPath = join(depthDir, filename);

    // 4. 获取视频处理执行器（seam 优先，工具兜底）
    const videoProcess = (deps.getSeam?.('videoProcess') ?? deps.getTool?.('video_process')) as
      | { execute?: (args: Record<string, unknown>) => Promise<unknown> }
      | undefined;

    if (!videoProcess || typeof videoProcess.execute !== 'function') {
      throw new VideoDepthError('service-unavailable', '视频处理服务不可用，请检查视频插件配置', 503);
    }

    // 5. 复用本地 Depth Anything 能力
    try {
      await videoProcess.execute({
        capability: 'video_depth',
        input: {
          videoUrl: absVideoPath,
          keepAudio: true,
        },
        dest: destDepthPath,
      });
    } catch (error) {
      throw mapVideoDepthExecutionError(error);
    }

    if (!existsSync(destDepthPath)) {
      throw new VideoDepthError('depth-failed', '深度视频未生成有效文件，请重试', 502, {
        code: 'missing-output',
        detail: 'videoProcess returned without writing dest',
      });
    }

    return {
      depthPath: destDepthPath,
      mediaUrl: getMediaUrl(filename),
      previewUrl: `/api/local-file?path=${encodeURIComponent(destDepthPath)}`,
      title: input.title,
    };
  };
}
