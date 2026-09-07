/** Safe route errors; upstream messages and stacks are never sent to clients. */
export class SpeechToTextError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'SpeechToTextError';
  }
}

const FAILURES: Record<string, [number, string]> = {
  'invalid-id': [400, '工作区标识无效'],
  'workspace-not-found': [404, '工作区不存在'],
  'needs-provider': [503, '语音转写服务未注入，请启用中枢 speechToText 服务'],
  'needs-omnimux': [401, '请先登录 OmniMux 后重试语音转写'],
  'omnimux-unconfigured': [503, '语音转写服务尚未配置'],
  'capability-disabled': [403, '语音转写能力已禁用'],
  'unknown-model': [400, '语音转写模型不可用'],
  'unknown-provider': [503, '语音转写供应商未配置'],
  'unknown-protocol': [503, '语音转写协议不可用'],
  'omnimux-invalid-request': [400, '音频或模型参数不符合语音转写要求，请检查素材与设置'],
  'omnimux-download-failed': [502, '源音频读取失败，请检查音频地址后重试'],
  'omnimux-request-failed': [502, '上游语音转写请求失败，请稍后重试'],
  'omnimux-invalid-response': [502, '语音转写服务未返回有效文本'],
  'quota-exceeded': [402, '语音转写额度不足，请检查账户额度'],
  'omnimux-aborted': [409, '语音转写请求已取消'],
};

export function speechToTextFailure(error: unknown) {
  let status = 500;
  let code = 'speech-to-text-failed';
  let message = '语音转写发生内部错误，请稍后重试';
  if (error instanceof SpeechToTextError) {
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
