/** Safe route errors; upstream messages and stacks are never sent to clients. */
export class VideoStoryboardError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'VideoStoryboardError';
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'not-local': [403, '拒绝跨来源的视频分镜表请求'],
  'invalid-request': [400, '视频分镜表请求参数无效'],
  'video-not-found': [404, '未找到指定视频文件'],
  'table-save-failed': [500, '分镜表格文件保存失败'],
  'storyboard-failed': [502, '视频分镜表生成失败'],
  'analyze-unavailable': [502, '视频理解能力不可用，请确认已启用视频理解能力后重试'],
  'analyze-failed': [502, '视频理解调用失败，请检查模型渠道配置后重试'],
  'analyze-empty': [502, '视频理解未返回可用的分析内容，请重试'],
  'analyze-unsupported': [502, '当前模型渠道不支持视频输入，请更换支持视频的渠道后重试'],
  'analyze-invalid-input': [502, '视频文件不满足理解要求（格式、大小或路径），请更换视频后重试'],
  'shots-empty': [502, '未能从视频理解结果中解析出分镜镜头，请重试'],
};

export function videoStoryboardFailure(error: unknown) {
  let status = 500;
  let code = 'storyboard-failed';
  let message = '视频分镜表生成发生内部错误，请稍后重试';
  if (error instanceof VideoStoryboardError) {
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
