import { VideoDepthError } from './errors.ts';

function invalid(message: string): never {
  throw new VideoDepthError('invalid-request', message, 400);
}

export interface VideoDepthRequest {
  nodeId: string;
  videoPath: string;
  title?: string;
}

export function parseVideoDepthRequest(raw: unknown): Required<VideoDepthRequest> {
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

  let title = '深度视频';
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
    title,
  };
}

export interface VideoDepthResult {
  depthPath: string;
  mediaUrl: string;
  previewUrl: string;
  title: string;
}

export interface VideoDepthResponse {
  ok: boolean;
  code: number;
  data: VideoDepthResult | null;
  message: string;
  error?: string;
  upstream?: { code: string; detail: string };
}
