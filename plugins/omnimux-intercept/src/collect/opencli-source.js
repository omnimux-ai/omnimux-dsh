/**
 * @file OpenCLI 子进程适配（主数据源）。
 *
 * 硬边界（见系统设计 §7.1）：本文件**不直接 `spawn`**，外部进程一律经注入的 `run` 触达，
 * 因此单测可以在零子进程、零网络下全绿。
 *
 * 本机实测（opencli v1.8.8，2026-09-13）：
 * ```
 * $ opencli twitter timeline -f json --limit 3
 * → exit code 1，stdout 为空，stderr 为 YAML：
 *   ok: false
 *   error:
 *     code: COMMAND_EXEC
 *     message: >-
 *       Pre-navigation to https://x.com failed: attach failed: Cannot access a
 *       chrome-extension:// URL of different extension. …
 *     exitCode: 1
 * ```
 * 关键结论：**失败时 stdout 为空、诊断在 stderr**。若只按「stdout 不是 JSON」判为
 * `SOURCE_BAD_PAYLOAD`，就会把「浏览器桥接挂了」误报成「载荷坏了」，让用户按错误方向排查。
 * 因此本模块先按 exit code 判失败，再用 stderr 文本细分 `SOURCE_UNAVAILABLE` / `SOURCE_AUTH`。
 */

import { DEFAULT_LIMIT, TIMEOUT_MS, clampLimit } from '../config.js'
import { ERROR_CODES, InterceptError } from '../core/errors.js'
import { normalizeRecords } from './tweet.js'

/** OpenCLI 可执行文件名（由 `dsh.manifest.json` 的 `systemBinaries` 声明）。 */
export const OPENCLI_BIN = 'opencli'

/**
 * 浏览器桥接失败特征（本机实测串）。
 * @type {RegExp}
 */
export const BRIDGE_FAILURE_PATTERN =
  /attach failed|chrome-extension:\/\/|Pre-navigation[^\n]*failed|browser bridge|extension may be interfering|无法连接浏览器|桥接/i

/**
 * 登录态失败特征。
 * @type {RegExp}
 */
export const AUTH_FAILURE_PATTERN =
  /not\s+logged\s+in|login\s+required|unauthoriz|unauthenticated|401|403|未登录|需要登录|登录态/i

/**
 * 可执行文件缺失特征（`opencli` 没装或被 PATH 排除）。
 * @type {RegExp}
 */
export const BINARY_MISSING_PATTERN =
  /ENOENT|command not found|not recognized as an internal|No such file or directory|spawn .* ENOENT/i

/** 可执行文件缺失的可执行建议。 */
export const BINARY_MISSING_HINT =
  '未找到 opencli：确认它已安装且在 PATH 中（which opencli）；若刚装好，重开终端后再试'

/** 桥接失败的可执行建议。 */
export const BRIDGE_HINT =
  '检查 OpenCLI 浏览器桥接（opencli doctor）与 x.com 登录态'

/** 登录态失败的可执行建议。 */
export const AUTH_HINT =
  '先在浏览器登录 x.com，再执行 opencli doctor 确认桥接与登录态正常后重试'

/**
 * 是否应当截断（`--limit 20` 而 CLI 返回 >20 条）。
 * @type {RegExp}
 */
const YAML_ERROR_ENVELOPE = /^ok:\s*false\b/m
const YAML_ERROR_CODE = /^\s*code:\s*([A-Z_]+)\s*$/m
const YAML_ERROR_MESSAGE = /^\s*message:\s*(?:>-?|\|)?\s*([\s\S]*?)(?=\n\s{2}[a-z]+:|$)/m

/**
 * 构造 `twitter timeline` 的参数数组。
 *
 * 默认（`type` 非 `following`）时精确为
 * `['twitter','timeline','-f','json','--limit', String(limit)]` —— 被单测逐位断言。
 * @param {{ limit?: number, type?: 'for-you' | 'following' }} [options] 抓取选项
 * @returns {string[]} 参数数组（不含可执行文件名）
 */
export function buildTimelineArgv(options = {}) {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT)
  /** @type {string[]} */
  const argv = ['twitter', 'timeline', '-f', 'json', '--limit', String(limit)]
  if (options.type === 'following') argv.push('--type', 'following')
  return argv
}

/**
 * 解析源返回的时间基准：必须由调用方显式注入，禁止使用真实时钟（§7.1 时间纪律）。
 * @param {{ nowMs?: number }} options 抓取选项
 * @param {{ nowMs?: number }} [deps] 依赖（允许从依赖侧传入）
 * @returns {number}
 */
export function resolveNowMs(options, deps) {
  const candidate = options?.nowMs ?? deps?.nowMs
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  throw new InterceptError(
    ERROR_CODES.INTERNAL,
    '采集层缺少显式注入的 nowMs',
    {
      hint: '这是内部缺陷：nowMs 必须由 pipeline.js 单一时钟入口注入（§7.1 时间纪律），请提交 issue',
    },
  )
}

/**
 * 解析 OpenCLI stdout。识别三种形态：JSON 数组、含数组的 JSON 信封、失败信封。
 *
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
    for (const key of ['data', 'items', 'tweets', 'results', 'list']) {
      const candidate = envelope[key]
      if (Array.isArray(candidate)) return { kind: 'array', items: candidate }
    }
  }

  return { kind: 'invalid', reason: 'stdout 是 JSON，但不是数组也不含数组字段' }
}

/**
 * 把一次失败调用映射为携带可执行 `hint` 的 `InterceptError`。
 *
 * 判定顺序（不可调换，否则桥接失败会被误判为登录失败或载荷损坏）：
 * 1. 桥接失败特征 → `SOURCE_UNAVAILABLE`
 * 2. 登录态失败特征 → `SOURCE_AUTH`
 * 3. 其它非 0 退出 / `ok: false` 信封 → `SOURCE_UNAVAILABLE`
 * @param {{ code?: number, stdout?: string, stderr?: string, message?: string }} failure 失败信息
 * @returns {InterceptError}
 */
export function classifyFailure(failure) {
  const combined = [failure?.stderr, failure?.stdout, failure?.message]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('\n')

  if (BINARY_MISSING_PATTERN.test(combined)) {
    return new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, '未找到 OpenCLI 可执行文件', {
      hint: BINARY_MISSING_HINT,
      retryable: false,
      cause: combined.slice(0, 500),
    })
  }

  if (BRIDGE_FAILURE_PATTERN.test(combined)) {
    return new InterceptError(
      ERROR_CODES.SOURCE_UNAVAILABLE,
      'OpenCLI 浏览器桥接不可用，未能打开 x.com 页面',
      { hint: BRIDGE_HINT, retryable: true, cause: combined.slice(0, 500) },
    )
  }

  if (AUTH_FAILURE_PATTERN.test(combined)) {
    return new InterceptError(
      ERROR_CODES.SOURCE_AUTH,
      'x.com 登录态无效或已过期',
      { hint: AUTH_HINT, retryable: false, cause: combined.slice(0, 500) },
    )
  }

  const exitCode = typeof failure?.code === 'number' ? failure.code : null
  const detail = combined.trim().split('\n').slice(0, 3).join(' ').slice(0, 200)
  return new InterceptError(
    ERROR_CODES.SOURCE_UNAVAILABLE,
    `OpenCLI 抓取失败${exitCode === null ? '' : `（退出码 ${exitCode}）`}`,
    {
      hint: `先执行 opencli twitter timeline -f json --limit 3 手动复现；若报浏览器相关错误，再执行 opencli doctor${detail ? `。原始诊断：${detail}` : ''}`,
      retryable: true,
      cause: combined.slice(0, 500),
    },
  )
}

/**
 * 经注入的 `run` 抓取首页时间线并归一为 `TweetRecord[]`。
 *
 * 契约（T03 交付标准 2）：**严禁返回空数组**。非 0 退出 → `SOURCE_UNAVAILABLE`；
 * stdout 非 JSON 或无数组 → `SOURCE_BAD_PAYLOAD`。
 * @param {{
 *   limit?: number,
 *   type?: 'for-you' | 'following',
 *   nowMs?: number,
 *   timeoutMs?: number,
 *   chunkDelayMs?: number,
 *   signal?: AbortSignal,
 * }} options 抓取选项（`nowMs` 必填，由 pipeline 的单一入口注入）
 * @param {{
 *   run: (argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) => Promise<{ stdout: string, stderr: string, code: number }>,
 *   nowMs?: number,
 * }} deps 注入依赖
 * @returns {Promise<{
 *   records: import('./tweet.js').TweetRecord[],
 *   source: 'opencli',
 *   fetchedAtMs: number,
 *   rawCount: number,
 *   warnings: string[],
 * }>}
 */
export async function fetchTimelineFromOpencli(options, deps) {
  if (typeof deps?.run !== 'function') {
    throw new InterceptError(
      ERROR_CODES.INTERNAL,
      'fetchTimelineFromOpencli 需要注入 run 依赖',
      { hint: '这是内部缺陷：默认 run 实现只在 src/cli.js 装配，请提交 issue' },
    )
  }

  const nowMs = resolveNowMs(options, deps)
  const limit = clampLimit(options?.limit ?? DEFAULT_LIMIT)
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? options.timeoutMs
      : TIMEOUT_MS
  const argv = buildTimelineArgv({ limit, type: options?.type })

  const result = await deps.run(argv, {
    timeoutMs,
    ...(options?.signal ? { signal: options.signal } : {}),
  })

  const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result?.stderr === 'string' ? result.stderr : ''
  const code = typeof result?.code === 'number' && Number.isFinite(result.code) ? result.code : 0

  if (code !== 0) {
    throw classifyFailure({ code, stdout, stderr })
  }

  const envelope = parseEnvelope(stdout)

  if (envelope.kind === 'error') {
    // 少数情况下 OpenCLI 用退出码 0 + `ok: false` 表达失败，按同一套规则归类。
    throw classifyFailure({ code, stdout, stderr, message: envelope.message })
  }

  if (envelope.kind === 'invalid') {
    throw new InterceptError(
      ERROR_CODES.SOURCE_BAD_PAYLOAD,
      `OpenCLI 返回的载荷无法解析：${envelope.reason}`,
      {
        hint: '先执行 opencli twitter timeline -f json --limit 3 确认输出形态；若版本升级改变了输出结构，请更新 docs/algorithm.md 与测试夹具',
        retryable: false,
        cause: stdout.slice(0, 200),
      },
    )
  }

  const warnings = []
  const rawCount = envelope.items.length
  let items = envelope.items
  if (rawCount > limit) {
    items = items.slice(0, limit)
    warnings.push(`数据源返回 ${rawCount} 条，已按 --limit ${limit} 截断`)
  }

  return {
    records: normalizeRecords(items, nowMs, 'opencli'),
    source: 'opencli',
    fetchedAtMs: nowMs,
    rawCount,
    warnings,
  }
}
