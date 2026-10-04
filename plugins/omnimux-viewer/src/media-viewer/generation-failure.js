/**
 * 媒体查看器生成失败原因映射（Issue #3011）
 * 文案白名单逐字来自 specs/viewer-failed-card-resume-3011.spec.md（PM 核定）：
 *   - 网关/网络（5xx、522、超时、连接失败、HTML 响应）→「生成服务暂时不可用，请稍后重试」
 *   - 服务端中文原因（含中文且无 HTML 标签）→ 原样透传
 *   - 其它未知 →「生成失败，请稍后重试」
 *   - 刷新后无法续上（任务记录缺失/已中断）→「任务已中断，请重新提交」（不可重试）
 */

export const GATEWAY_REASON = '生成服务暂时不可用，请稍后重试';
export const UNKNOWN_REASON = '生成失败，请稍后重试';
export const INTERRUPTED_REASON = '任务已中断，请重新提交';

const INTERRUPTED_CODES = new Set(['omnimux-task-not-found', 'omnimux-task-interrupted']);

const HAS_CJK = /[一-鿿]/;
const HAS_HTML = /<html|<!doctype|<\/?[a-z][\s\S]*?>/i;
const GATEWAY_SIGNALS = /522|502|503|504|timed\s*out|timeout|ETIMEDOUT|ECONN|fetch failed|Failed to fetch|GET request failed \(HTTP 5/i;

/**
 * 把服务端/网络层错误映射为失败卡原因。
 * @param {{ status?: number, code?: string, error?: string }} input
 * @returns {{ reason: string, retryable: boolean }}
 */
export function describeGenerationFailure({ status, code, error } = {}) {
  if (code && INTERRUPTED_CODES.has(code)) {
    return { reason: INTERRUPTED_REASON, retryable: false };
  }
  const text = String(error || '');
  // 含 HTML 一律视为网关类（即使夹杂中文描述）。
  if (HAS_HTML.test(text)) {
    return { reason: GATEWAY_REASON, retryable: true };
  }
  // 中文透传优先于「status ≥ 500」：服务端中文业务原因也是 500 返回。
  if (HAS_CJK.test(text)) {
    return { reason: text, retryable: true };
  }
  if (
    (Number.isFinite(status) && status >= 500)
    || GATEWAY_SIGNALS.test(text)
  ) {
    return { reason: GATEWAY_REASON, retryable: true };
  }
  return { reason: UNKNOWN_REASON, retryable: true };
}
