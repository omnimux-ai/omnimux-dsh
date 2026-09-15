/**
 * 把 `video_analyze` 抛出的上游错误码翻译成可读的中文失败原因。
 *
 * 契约：路由错误不得外发上游消息与堆栈，因此这里只按错误码映射固定文案，
 * 原始报错仅保留在服务端日志。未知错误统一收敛为通用失败码。
 */

export interface VideoAnalyzeFailure {
  /** 路由层可识别的失败码。 */
  code: string;
  /** 面向用户的中文原因。 */
  message: string;
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

  switch (raw) {
    case 'needs-provider':
      return {
        code: 'analyze-unavailable',
        message: '视频理解尚未接入可用的模型渠道，请先在设置中配置渠道后重试',
      };
    case 'needs-omnimux':
      return {
        code: 'analyze-unavailable',
        message: '视频理解依赖的执行中枢未就绪，请重启应用后重试',
      };
    case 'video-understand-unsupported':
      return {
        code: 'analyze-unsupported',
        message: '当前模型渠道不支持视频输入，请更换支持视频的渠道后重试',
      };
    case 'video-invalid-input':
      return {
        code: 'analyze-invalid-input',
        message: '视频文件不满足理解要求（格式、大小或路径），请更换视频后重试',
      };
    default:
      return GENERIC;
  }
}
