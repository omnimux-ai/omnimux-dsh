/** Safe route errors; upstream messages and stacks are never sent to clients. */
export class VideoDeconstructError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'VideoDeconstructError';
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'not-local': [403, '拒绝跨来源的视频拆解请求'],
  'invalid-request': [400, '视频拆解请求参数无效'],
  'video-not-found': [404, '未找到指定视频文件'],
  'table-save-failed': [500, '表格文件保存失败'],
  'deconstruct-failed': [502, '视频内容拆解失败'],
};

export function videoDeconstructFailure(error: unknown) {
  let status = 500;
  let code = 'deconstruct-failed';
  let message = '视频内容拆解发生内部错误，请稍后重试';
  if (error instanceof VideoDeconstructError) {
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
