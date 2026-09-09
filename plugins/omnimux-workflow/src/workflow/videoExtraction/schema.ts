import { VideoExtractionError } from './errors.ts';

export interface ExtractVideoRequest {
  nodeId?: string;
  url: string;
}

export interface ExtractVideoResult {
  videoPath: string;
  mediaUrl: string;
  previewUrl: string;
  title?: string;
  duration?: number;
  coverUrl?: string;
  platform?: string;
}

export interface ExtractVideoResponse {
  ok: boolean;
  code: number;
  data: ExtractVideoResult;
  message: string;
  videoPath: string;
  mediaUrl: string;
  previewUrl: string;
  title?: string;
  duration?: number;
  coverUrl?: string;
}

function invalid(message: string): never {
  throw new VideoExtractionError('invalid-request', message, 400);
}

export function parseExtractVideoRequest(raw: unknown): Required<ExtractVideoRequest> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid('请求体必须是 JSON 对象');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.url !== 'string' || !body.url.trim()) {
    invalid('缺少 url 参数');
  }
  const url = body.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    invalid('url 必须是有效 HTTP(S) 地址');
  }

  const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : undefined;
  return {
    url,
    nodeId: nodeId || '',
  };
}
