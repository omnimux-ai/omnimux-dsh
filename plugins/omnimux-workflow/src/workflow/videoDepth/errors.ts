/** Safe route errors; upstream messages and stacks are never sent to clients. */
export class VideoDepthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly upstream?: { code: string; detail: string };

  constructor(code: string, message: string, status: number, upstream?: { code: string; detail: string }) {
    super(message);
    this.name = 'VideoDepthError';
    this.code = code;
    this.status = status;
    this.upstream = upstream;
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'not-local': [403, '拒绝跨来源的深度视频请求'],
  'invalid-request': [400, '深度视频请求参数无效'],
  'video-not-found': [404, '未找到指定视频文件'],
  'service-unavailable': [503, '视频处理服务不可用，请检查视频插件配置'],
  'deps-missing': [
    503,
    '本机缺少深度图 Python 依赖（numpy / opencv-python / onnxruntime）。安装后重试，或把 OMNIMUX_VIDEO_PYTHON_PATH 指向已装依赖的解释器',
  ],
  'ffmpeg-missing': [503, '本机缺少 ffmpeg/ffprobe，安装后重试（macOS: brew install ffmpeg）'],
  'timeout': [504, '深度视频生成超时，请缩短视频后重试'],
  'canceled': [502, '深度视频生成已取消'],
  'depth-failed': [502, '深度视频生成失败，请重试'],
};

export function videoDepthFailure(error: unknown) {
  let status = 500;
  let code = 'depth-failed';
  let message = '深度视频生成发生内部错误，请稍后重试';
  let upstream: { code: string; detail: string } | undefined;
  if (error instanceof VideoDepthError) {
    ({ status, code, message, upstream } = error);
  } else if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const known = Object.hasOwn(FAILURES, error.code) ? FAILURES[error.code] : undefined;
    if (known) {
      code = error.code;
      [status, message] = known;
    }
  }
  const body: Record<string, unknown> = { ok: false, code: status, data: null, error: code, message };
  if (upstream) body.upstream = upstream;
  return { status, body };
}
