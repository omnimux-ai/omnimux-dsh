/**
 * @file 错误码契约 —— 本文件是社媒采集「失败语义」的唯一真源。
 *
 * 铁律（沿用 omnimux-intercept §7.2）：
 * 1. 「取不到数据」绝不返回空数组——空数组只表示「真的没有结果」。
 * 2. `hint` 必须可执行——禁止「未知错误」这类无信息文案。
 * 3. 失败分类顺序固定（BINARY_MISSING → BRIDGE → AUTH → 其它），不可调换：
 *    OpenCLI 失败时 stdout 为空、诊断在 stderr，顺序错了会把桥接故障误报成登录失效。
 */

/** @typedef {'ARG_INVALID'|'NOT_INSTALLED'|'DISABLED'|'AUTH'|'UNAVAILABLE'|'BAD_PAYLOAD'|'INTERNAL'} HarvestErrorCode */

/** 错误码常量。 @type {Readonly<Record<string, HarvestErrorCode>>} */
export const ERROR_CODES = Object.freeze({
  ARG_INVALID: 'ARG_INVALID',
  NOT_INSTALLED: 'HARVEST_NOT_INSTALLED',
  DISABLED: 'HARVEST_DISABLED',
  AUTH: 'HARVEST_AUTH',
  UNAVAILABLE: 'HARVEST_UNAVAILABLE',
  BAD_PAYLOAD: 'HARVEST_BAD_PAYLOAD',
  INTERNAL: 'INTERNAL',
})

export class HarvestError extends Error {
  /**
   * @param {HarvestErrorCode} code
   * @param {string} message 给用户看的一句话
   * @param {{ hint: string, retryable?: boolean, cause?: string }} extra
   */
  constructor(code, message, extra) {
    super(message)
    this.name = 'HarvestError'
    this.code = code
    this.hint = extra?.hint ?? ''
    this.retryable = extra?.retryable === true
    if (extra?.cause) this.cause = extra.cause
  }
}

/**
 * 把未知异常收敛为 HarvestError（不吞原始信息）。
 * @param {unknown} err
 * @returns {HarvestError}
 */
export function toHarvestError(err) {
  if (err instanceof HarvestError) return err
  const message = err instanceof Error ? err.message : String(err)
  return new HarvestError(ERROR_CODES.INTERNAL, `社媒采集内部错误：${message}`, {
    hint: '这是内部缺陷，请提交 issue 并附上此信息',
    cause: message.slice(0, 500),
  })
}
