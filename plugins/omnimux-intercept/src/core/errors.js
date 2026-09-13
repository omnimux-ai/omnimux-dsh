/**
 * @file 错误码与退出码契约 —— 本文件是「失败语义」的唯一真源。
 *
 * 三条铁律（见系统设计 §7.2）：
 * 1. 「取不到数据」绝不返回空数组 —— 空数组只能表示「真的没有推文」。
 * 2. 非致命降级必须留痕 —— 每次降级写 `warnings`，不允许静默降级。
 * 3. `hint` 必须可执行 —— 禁止「未知错误」这类无信息文案。
 *
 * 本文件属 `src/core/**`：不得 import 任何 `node:*` 模块，不得访问时钟。
 */

/**
 * 全部错误码。前六个为致命码（决定退出码），后两个为非致命码（只写 warnings）。
 * @typedef {'ARG_INVALID'
 *   | 'SOURCE_UNAVAILABLE'
 *   | 'SOURCE_BAD_PAYLOAD'
 *   | 'SOURCE_AUTH'
 *   | 'COOLDOWN_ACTIVE'
 *   | 'INTERNAL'
 *   | 'LLM_UNAVAILABLE'
 *   | 'TEMPLATE_FALLBACK'} ErrorCode
 */

/**
 * 错误码常量（避免字符串字面量散落各处）。
 * @type {Readonly<Record<string, ErrorCode>>}
 */
export const ERROR_CODES = Object.freeze({
  ARG_INVALID: 'ARG_INVALID',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  SOURCE_BAD_PAYLOAD: 'SOURCE_BAD_PAYLOAD',
  SOURCE_AUTH: 'SOURCE_AUTH',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  INTERNAL: 'INTERNAL',
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  TEMPLATE_FALLBACK: 'TEMPLATE_FALLBACK',
})

/** 成功退出码。 */
export const EXIT_OK = 0

/**
 * 错误码 → 进程退出码。
 * `0` 成功（含「无待截流目标」）；`2` 参数错误；`3` 数据源不可用/载荷不可解析；
 * `4` 冷却中；`5` 内部错误。
 * @type {Readonly<Record<ErrorCode, number>>}
 */
export const EXIT_CODES = Object.freeze({
  ARG_INVALID: 2,
  SOURCE_UNAVAILABLE: 3,
  SOURCE_BAD_PAYLOAD: 3,
  SOURCE_AUTH: 3,
  COOLDOWN_ACTIVE: 4,
  INTERNAL: 5,
  LLM_UNAVAILABLE: 0,
  TEMPLATE_FALLBACK: 0,
})

/** 非致命错误码：只写 `warnings`，不改变退出码。 @type {ReadonlyArray<ErrorCode>} */
export const NON_FATAL_ERROR_CODES = Object.freeze([
  ERROR_CODES.LLM_UNAVAILABLE,
  ERROR_CODES.TEMPLATE_FALLBACK,
])

/** 允许进入指数退避重试的错误码。 @type {ReadonlyArray<ErrorCode>} */
export const RETRYABLE_ERROR_CODES = Object.freeze([ERROR_CODES.SOURCE_UNAVAILABLE])

/**
 * 插件统一错误类型。携带机器可读的 `code`、面向用户可执行的 `hint`、
 * 以及决定是否进入重试的 `retryable`。
 */
export class InterceptError extends Error {
  /**
   * @param {ErrorCode} code 错误码
   * @param {string} message 面向用户的简短说明（中文）
   * @param {{ hint?: string, retryable?: boolean, cause?: unknown }} [options]
   *   `hint` 必须是可执行的下一步动作；`cause` 只进日志，不进 stdout。
   */
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'InterceptError'
    /** @type {ErrorCode} */
    this.code = code
    /** 给用户的可执行建议（中文，必须可操作）。 @type {string | undefined} */
    this.hint = options.hint
    /** 决定是否进入重试。 @type {boolean} */
    this.retryable =
      typeof options.retryable === 'boolean'
        ? options.retryable
        : RETRYABLE_ERROR_CODES.includes(code)
    /** 原始错误，仅进日志，不进 stdout。 @type {unknown} */
    this.cause = options.cause
  }
}

/**
 * 判断任意值是否为 `InterceptError`（类型谓词，供 tsc 收窄）。
 * @param {unknown} value
 * @returns {value is InterceptError}
 */
export function isInterceptError(value) {
  return value instanceof InterceptError
}

/**
 * 把任意抛出物归一为 `InterceptError`（未预期的异常一律归为 `INTERNAL`）。
 * @param {unknown} error 原始抛出物
 * @param {string} [message] 覆盖消息（默认取原始错误消息）
 * @returns {InterceptError}
 */
export function toInterceptError(error, message) {
  if (isInterceptError(error)) return error
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return new InterceptError(
    ERROR_CODES.INTERNAL,
    message ?? (raw || '发生未预期的内部错误'),
    {
      hint: '这是内部缺陷，请附上 stderr 中的 runId 提交 issue；重跑加 --verbose 可看到完整日志',
      cause: error,
    },
  )
}

/**
 * 取某个抛出物对应的进程退出码（非 `InterceptError` 一律 `5`）。
 * @param {unknown} error
 * @returns {number}
 */
export function exitCodeForError(error) {
  if (!isInterceptError(error)) return EXIT_CODES.INTERNAL
  return EXIT_CODES[error.code] ?? EXIT_CODES.INTERNAL
}

/**
 * 是否应当重试该错误。
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRetryableError(error) {
  return isInterceptError(error) && error.retryable === true
}

/**
 * 该错误码是否为非致命码（降级留痕，不改变退出码）。
 * @param {ErrorCode} code
 * @returns {boolean}
 */
export function isNonFatalCode(code) {
  return NON_FATAL_ERROR_CODES.includes(code)
}
