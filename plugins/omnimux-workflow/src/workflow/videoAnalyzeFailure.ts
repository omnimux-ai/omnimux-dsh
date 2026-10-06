/**
 * 把 `video_analyze` 抛出的上游错误码翻译成可读的中文失败原因。
 *
 * 契约：路由错误不外发上游堆栈，但保留一条脱敏后的上游归因（错误码 +
 * 摘要），让响应体携带可定位的真因——排查不必再翻服务端日志。
 * 未知错误统一收敛为通用失败码。
 */

export interface VideoAnalyzeUpstream {
  /** 上游真实错误码（如 video-invalid-input / unknown-model / omnimux-invalid-request）。 */
  code: string;
  /** 脱敏后的上游报错摘要（剔除绝对路径、URL、密文，≤200 字符）。 */
  detail: string;
}

export interface VideoAnalyzeFailure {
  /** 路由层可识别的失败码。 */
  code: string;
  /** 面向用户的中文原因。 */
  message: string;
  /** 上游归因，仅在上游抛出带信息错误时存在。 */
  upstream?: VideoAnalyzeUpstream;
}

const DETAIL_LIMIT = 200;

/** 摘要脱敏：绝对路径、URL、Bearer/sk- 密文一律替换为占位符，超过上限截断。 */
function sanitizeUpstreamDetail(raw: string): string {
  return raw
    .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/(?:[A-Za-z]:)?[/\\][^\s"']+/g, '<path>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DETAIL_LIMIT);
}

function extractUpstream(error: unknown): VideoAnalyzeUpstream | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code =
    'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code?: unknown }).code).trim() || 'unknown'
      : 'unknown';
  const rawMessage =
    error instanceof Error
      ? error.message
      : 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message?: unknown }).message)
        : '';
  return { code, detail: sanitizeUpstreamDetail(rawMessage) };
}

const GENERIC: VideoAnalyzeFailure = {
  code: 'analyze-failed',
  message: '视频理解调用失败，请稍后重试',
};

export function describeVideoAnalyzeFailure(error: unknown): VideoAnalyzeFailure {
  const raw =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const upstream = extractUpstream(error);

  switch (raw) {
    case 'needs-provider':
      return {
        code: 'analyze-unavailable',
        message: '视频理解尚未接入可用的模型渠道，请先在设置中配置渠道后重试',
        upstream,
      };
    case 'needs-omnimux':
      return {
        code: 'analyze-unavailable',
        message: '视频理解依赖的执行中枢未就绪，请重启应用后重试',
        upstream,
      };
    case 'video-understand-unsupported':
      return {
        code: 'analyze-unsupported',
        message: '当前模型渠道不支持视频输入，请更换支持视频的渠道后重试',
        upstream,
      };
    case 'video-invalid-input':
      return {
        code: 'analyze-invalid-input',
        message: '视频文件不满足理解要求（格式、大小或路径），请更换视频后重试',
        upstream,
      };
    default:
      return { ...GENERIC, upstream };
  }
}
