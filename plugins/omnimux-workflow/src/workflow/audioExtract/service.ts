import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { resolveVideoAbsolutePath } from '../videoDeconstruct/service.ts';
import { AudioExtractError } from './errors.ts';
import type { ExtractAudioRequest, ExtractAudioResult } from './schema.ts';

export interface AudioExtractServiceDeps {
  store: WorkspaceStore;
  mediaDir?: string;
  getSeam?: (name: string) => unknown;
  getTool?: (name: string) => unknown;
  resolveProjectFile?: (workspaceId: string, rel: string) => string;
}

export function createAudioExtractService(deps: AudioExtractServiceDeps) {
  return async (workspaceId: string, input: Required<ExtractAudioRequest>): Promise<ExtractAudioResult> => {
    // 1. 验证工作区有效性
    deps.store.get(workspaceId);

    // 2. 解析源视频物理绝对路径
    const absVideoPath = resolveVideoAbsolutePath(deps, workspaceId, input.videoPath);
    if (!absVideoPath || !existsSync(absVideoPath)) {
      throw new AudioExtractError('video-not-found', '未找到指定视频文件', 404);
    }

    // 3. 准备目标音频目录与文件路径
    let audioDir: string;
    let getMediaUrl: (filename: string) => string;
    if (deps.mediaDir) {
      audioDir = join(deps.mediaDir, 'extracted-audio', workspaceId);
      getMediaUrl = (filename: string) => `/omnimux-workflow/media/extracted-audio/${workspaceId}/${filename}`;
    } else {
      const baseDir = deps.store.workspacesDir || process.cwd();
      audioDir = join(baseDir, workspaceId, '.omnimux', 'media', 'extracted-audio');
      getMediaUrl = (filename: string) => `/api/local-file?path=${encodeURIComponent(join(audioDir, filename))}`;
    }

    if (!existsSync(audioDir)) {
      try {
        mkdirSync(audioDir, { recursive: true });
      } catch {}
    }

    const filename = `audio_${Date.now()}_${randomUUID().slice(0, 8)}.${input.outputFormat}`;
    const destAudioPath = join(audioDir, filename);

    // 4. 获取视频处理执行器
    const videoProcess = (deps.getSeam?.('videoProcess') ?? deps.getTool?.('video_process')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    if (!videoProcess || typeof videoProcess.execute !== 'function') {
      throw new AudioExtractError('service-unavailable', '视频处理服务不可用，请检查视频插件配置', 503);
    }

    // 5. 调用 capability: 'audio_extract'
    let extractResult: any;
    try {
      extractResult = await videoProcess.execute({
        capability: 'audio_extract',
        input: {
          videoUrl: absVideoPath,
          outputFormat: input.outputFormat,
        },
        dest: destAudioPath,
      });
    } catch (err) {
      throw new AudioExtractError(
        'extract-failed',
        `音频提取执行失败: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }

    // 6. 检查无音轨边界场景
    if (extractResult?.result?.no_audio_stream === true) {
      return {
        noAudioStream: true,
        title: input.title,
      };
    }

    // 7. 成功返回产物信息
    const mediaUrl = getMediaUrl(filename);
    const previewUrl = `/api/local-file?path=${encodeURIComponent(destAudioPath)}`;
    const duration = typeof extractResult?.result?.duration === 'number'
      ? extractResult.result.duration
      : undefined;

    return {
      noAudioStream: false,
      audioPath: destAudioPath,
      mediaUrl,
      previewUrl,
      duration,
      format: input.outputFormat,
      title: input.title,
    };
  };
}
