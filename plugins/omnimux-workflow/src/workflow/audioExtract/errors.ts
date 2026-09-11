/** Safe route errors; upstream messages and stacks are never sent to clients. */
export class AudioExtractError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'AudioExtractError';
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'not-local': [403, '拒绝跨来源的音频提取请求'],
  'invalid-request': [400, '音频提取请求参数无效'],
  'video-not-found': [404, '未找到指定视频文件'],
  'service-unavailable': [503, '视频处理服务不可用，请检查视频插件配置'],
  'extract-failed': [502, '音频提取失败'],
};

export function audioExtractFailure(error: unknown) {
  let status = 500;
  let code = 'extract-failed';
  let message = '音频提取发生内部错误，请稍后重试';
  if (error instanceof AudioExtractError) {
    ({ status, code, message } = error);
  } else if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const known = Object.hasOwn(FAILURES, error.code) ? FAILURES[error.code] : undefined;
    if (known) {
      code = error.code;
      [status, message] = known;
    }
  }
  return { status, body: { ok: false, code: status, data: null, error: code, message } };
}
