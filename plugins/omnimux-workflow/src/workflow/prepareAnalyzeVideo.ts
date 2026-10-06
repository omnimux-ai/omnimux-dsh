import { existsSync, mkdirSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { WorkspaceStore } from './workspace/WorkspaceStore.ts';

/**
 * 视频理解（video_analyze）前置预处理。
 *
 * `assertLocalVideo`（omnimux-video understand/pack-video.js）只接受
 * 本地 mp4/m4v/webm/mov 且 ≤ maxVideoBytes（默认 20MiB）的绝对路径；
 * 远程 URL 或超限文件会被直接拒为 `video-invalid-input`。
 *
 * 本函数在调用 video_analyze 之前兜底：远程 URL 或超限本地文件先经
 * video_process 的 `video_inline_analysis_prepare` 能力转码压缩为
 * ≤9MiB 的 mp4 样片（引擎内部对 http(s) 自动下载），返回可用于分析的
 * 本地路径。无 ffmpeg/无 videoProcess 或压缩仍超限时返回 null，
 * 由调用方维持原有错误文案。
 */

export const ANALYZE_MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const PREPARE_MAX_REQUEST_BYTES = 9 * 1024 * 1024;

interface VideoProcessLike {
  execute?: (args: Record<string, unknown>) => Promise<any>;
}

export interface PrepareAnalyzeVideoDeps {
  store: WorkspaceStore;
  getTool?: (name: string) => unknown;
  getSeam?: (name: string) => unknown;
  mediaDir?: string;
}

/**
 * 返回可直接传给 video_analyze 的本地路径；不需要预处理时返回 null，
 * 预处理不可用时同样返回 null（保持原路径交由 analyze 报错）。
 */
export async function prepareVideoForAnalyze(
  deps: PrepareAnalyzeVideoDeps,
  workspaceId: string,
  resolvedPath: string,
): Promise<string | null> {
  const isRemote = /^https?:\/\//i.test(resolvedPath);
  let oversized = false;
  if (!isRemote && isAbsolute(resolvedPath) && existsSync(resolvedPath)) {
    try {
      oversized = statSync(resolvedPath).size > ANALYZE_MAX_VIDEO_BYTES;
    } catch {}
  }
  if (!isRemote && !oversized) return null;

  const videoProcess = (deps.getSeam?.('videoProcess') ?? deps.getTool?.('video_process')) as
    | VideoProcessLike
    | undefined;
  if (!videoProcess || typeof videoProcess.execute !== 'function') return null;

  const destDir = deps.mediaDir
    ? join(deps.mediaDir, 'analyze-samples')
    : join(deps.store.workspacesDir, workspaceId, '.omnimux', 'media', 'analyze-samples');
  try {
    mkdirSync(destDir, { recursive: true });
  } catch {
    return null;
  }
  const destPath = join(destDir, `analyze-${workspaceId.slice(0, 8)}-${Date.now()}.mp4`);

  try {
    const res = await videoProcess.execute({
      capability: 'video_inline_analysis_prepare',
      input: {
        videoUrl: resolvedPath,
        maxRequestBytes: PREPARE_MAX_REQUEST_BYTES,
      },
      dest: destPath,
    });
    const file = Array.isArray(res?.files) ? res.files[0] : undefined;
    const outPath = typeof file?.path === 'string' ? file.path : destPath;
    if (file?.meta?.overshoot) return null;
    if (existsSync(outPath) && statSync(outPath).size > 0 && statSync(outPath).size <= ANALYZE_MAX_VIDEO_BYTES) {
      return outPath;
    }
    return null;
  } catch {
    return null;
  }
}
