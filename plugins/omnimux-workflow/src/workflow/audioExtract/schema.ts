import { AudioExtractError } from './errors.ts';

function invalid(message: string): never {
  throw new AudioExtractError('invalid-request', message, 400);
}

export interface ExtractAudioRequest {
  nodeId: string;
  videoPath: string;
  outputFormat?: 'mp3' | 'm4a';
  title?: string;
}

export function parseExtractAudioRequest(raw: unknown): Required<ExtractAudioRequest> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid('请求体必须是 JSON 对象');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.nodeId !== 'string' || !body.nodeId.trim() || /[\x00-\x1f]/.test(body.nodeId)) {
    invalid('nodeId 必须是非空节点标识');
  }
  if (typeof body.videoPath !== 'string' || !body.videoPath.trim() || /[\x00-\x1f]/.test(body.videoPath)) {
    invalid('videoPath 必须是非空视频路径或可访问地址');
  }

  let outputFormat: 'mp3' | 'm4a' = 'mp3';
  if (body.outputFormat !== undefined) {
    if (body.outputFormat !== 'mp3' && body.outputFormat !== 'm4a') {
      invalid('outputFormat 必须是 mp3 或 m4a');
    }
    outputFormat = body.outputFormat;
  }

  let title = '视频原声';
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      invalid('title 必须是字符串');
    }
    const trimmed = body.title.trim();
    if (trimmed) title = trimmed;
  }

  return {
    nodeId: body.nodeId.trim(),
    videoPath: body.videoPath.trim(),
    outputFormat,
    title,
  };
}

export interface ExtractAudioResult {
  noAudioStream?: boolean;
  audioPath?: string;
  mediaUrl?: string;
  previewUrl?: string;
  duration?: number;
  format?: 'mp3' | 'm4a';
  title: string;
}

export interface ExtractAudioResponse {
  ok: boolean;
  code: number;
  data: ExtractAudioResult | null;
  message: string;
  error?: string;
}
