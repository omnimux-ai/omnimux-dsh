/**
 * @file OpenCLI 输出信封解析与失败分类 —— 从 omnimux-intercept 生产验证逻辑泛化。
 *
 * 泛化点：站点名不再硬编码 x.com，由调用方传入 `siteLabel` 用于错误文案与 hint。
 * 本文件属 `src/core/**`：不得 import 任何 `node:*` 模块，不得访问时钟与网络。
 */

import { ERROR_CODES, HarvestError } from './errors.js'

/** OpenCLI 可执行文件名（由 dsh.manifest.json 的 systemBinaries 声明）。 */
export const OPENCLI_BIN = 'opencli'

/** 可执行文件缺失特征（opencli 没装或不在 PATH）。 @type {RegExp} */
export const BINARY_MISSING_PATTERN =
  /ENOENT|command not found|not recognized as an internal|No such file or directory|spawn .* ENOENT/i

/** 浏览器桥接失败特征（本机实测串，见 intercept 文件头）。 @type {RegExp} */
export const BRIDGE_FAILURE_PATTERN =
  /attach failed|chrome-extension:\/\/|Pre-navigation[^\n]*failed|browser bridge|Browser Bridge|extension may be interfering|无法连接浏览器|桥接|EX_UNAVAILABLE/i

/** 登录态失败特征。 @type {RegExp} */
export const AUTH_FAILURE_PATTERN =
  /not\s+logged\s+in|login\s+required|unauthoriz|unauthenticated|\b401\b|\b403\b|未登录|需要登录|登录态|AUTH_REQUIRED/i

const YAML_ERROR_ENVELOPE = /^ok:\s*false\b/m
const YAML_ERROR_CODE = /^\s*code:\s*([A-Z_]+)\s*$/m
const YAML_ERROR_MESSAGE = /^\s*message:\s*(?:>-?|\|)?\s*([\s\S]*?)(?=\n\s{2}[a-z]+:|$)/m

/**
 * 解析 OpenCLI stdout。识别三种形态：JSON 数组、含数组的 JSON 信封、失败信封。
 * @param {string} text stdout 原文
 * @returns {{ kind: 'array', items: unknown[] }
 *   | { kind: 'error', code: string | null, message: string }
 *   | { kind: 'invalid', reason: string }}
 */
export function parseEnvelope(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (raw === '') return { kind: 'invalid', reason: 'stdout 为空' }

  if (YAML_ERROR_ENVELOPE.test(raw)) {
    const codeMatch = YAML_ERROR_CODE.exec(raw)
    const messageMatch = YAML_ERROR_MESSAGE.exec(raw)
    return {
      kind: 'error',
      code: codeMatch?.[1] ?? null,
      message: (messageMatch?.[1] ?? raw).replace(/\s+/g, ' ').trim(),
    }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'stdout 不是合法 JSON' }
  }

  if (Array.isArray(parsed)) return { kind: 'array', items: parsed }

  if (parsed !== null && typeof parsed === 'object') {
    const envelope = /** @type {Record<string, unknown>} */ (parsed)
    if (envelope.ok === false) {
      const error = envelope.error
      const detail =
        error !== null && typeof error === 'object'
          ? /** @type {Record<string, unknown>} */ (error)
          : {}
      return {
        kind: 'error',
        code: typeof detail.code === 'string' ? detail.code : null,
        message:
          typeof detail.message === 'string' ? detail.message : 'OpenCLI 返回 ok: false',
      }
    }
    for (const key of ['data', 'items', 'tweets', 'results', 'list', 'pins', 'videos', 'notes']) {
      const candidate = envelope[key]
      if (Array.isArray(candidate)) return { kind: 'array', items: candidate }
    }
    // whoami 登录探针或单对象实体响应
    if (envelope.logged_in !== undefined) {
      return { kind: 'array', items: [envelope] }
    }
  }

  return { kind: 'invalid', reason: 'stdout 是 JSON，但不是数组也不含数组字段' }
}

/**
 * 把一次失败调用映射为携带可执行 hint 的 HarvestError。
 * 判定顺序（不可调换）：
 *   1. 可执行文件缺失 → NOT_INSTALLED（不可重试）
 *   2. 桥接失败特征 / exit 69 → UNAVAILABLE（可重试）
 *   3. 登录态特征 / exit 77 → AUTH（不可重试，引导去浏览器登录）
 *   4. exit 66 → 由调用方按合法空态处理，本函数不接收
 *   5. 其它 → UNAVAILABLE（可重试）
 * @param {{ code?: number, stdout?: string, stderr?: string, message?: string }} failure
 * @param {{ siteLabel?: string }} context
 * @returns {HarvestError}
 */
export function classifyFailure(failure, context = {}) {
  const siteLabel = context.siteLabel ?? '目标站点'
  const combined = [failure?.stderr, failure?.stdout, failure?.message]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('\n')
  const exitCode = typeof failure?.code === 'number' ? failure.code : null

  if (BINARY_MISSING_PATTERN.test(combined)) {
    return new HarvestError(ERROR_CODES.NOT_INSTALLED, '未找到 OpenCLI 可执行文件', {
      hint: '请先安装 OpenCLI（桌面版 OpenCLIApp 或 npm i -g @jackwener/opencli），装好后重开终端再试',
      retryable: false,
      cause: combined.slice(0, 500),
    })
  }

  if (BRIDGE_FAILURE_PATTERN.test(combined) || exitCode === 69) {
    return new HarvestError(ERROR_CODES.UNAVAILABLE, 'OpenCLI 浏览器桥接不可用', {
      hint: '检查浏览器桥接：执行 opencli doctor；确认 Chrome 已打开且 OpenCLI 扩展已连接',
      retryable: true,
      cause: combined.slice(0, 500),
    })
  }

  if (AUTH_FAILURE_PATTERN.test(combined) || exitCode === 77) {
    return new HarvestError(ERROR_CODES.AUTH, `${siteLabel} 登录态无效或已过期`, {
      hint: `先在浏览器登录 ${siteLabel}，再用「去登录」重新连接后重试`,
      retryable: false,
      cause: combined.slice(0, 500),
    })
  }

  const detail = combined.trim().split('\n').slice(0, 3).join(' ').slice(0, 200)
  return new HarvestError(
    ERROR_CODES.UNAVAILABLE,
    `OpenCLI 执行失败${exitCode === null ? '' : `（退出码 ${exitCode}）`}`,
    {
      hint: `可重试；持续失败请执行 opencli doctor 检查桥接与登录态${detail ? `。原始诊断：${detail}` : ''}`,
      retryable: true,
      cause: combined.slice(0, 500),
    },
  )
}
