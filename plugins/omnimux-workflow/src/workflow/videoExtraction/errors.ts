/** Safe video extraction errors. */
export class VideoExtractionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'VideoExtractionError';
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-request': [400, '视频提取请求参数无效'],
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'needs-provider': [503, '视频提取执行中枢服务未注入，请检查 OmniMux 插件加载状态'],
  'needs-omnimux': [401, '请先登录 OmniMux 后重试视频提取'],
  'omnimux-unconfigured': [503, '视频提取服务尚未配置 OMNIMUX_API_KEY'],
  'capability-disabled': [403, '视频提取能力已被权限门禁禁用'],
  'unsupported-platform': [400, '不支持的社媒平台链接'],
  'no-video-found': [422, '社媒解析未提取到有效视频直链，请检查链接可访问性'],
  'extract-failed': [502, '社媒视频提取失败，请稍后重试'],
  'download-failed': [502, '视频文件下载落盘失败，请检查网络或存储空间'],
  'quota-exceeded': [402, 'OmniMux 服务额度不足，请检查账户额度'],
};

export function videoExtractionFailure(error: unknown) {
  let status = 500;
  let code = 'video-extraction-failed';
  let message = error instanceof Error && error.message ? error.message : '视频提取发生内部错误，请稍后重试';

  if (error instanceof VideoExtractionError) {
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
