#!/usr/bin/env node
/**
 * @file 命令行入口 —— 参数解析、依赖装配、退出码。
 *
 * 三条装配纪律（§1.3）：
 * 1. 外部世界只有三个注入点：`{ run, complete, writeFile }`；**默认实现在本文件装配**，
 *    其余模块一律不 import 默认实现。
 * 2. 全仓唯一取时钟的入口在 `pipeline.js`（`options.nowMs ?? Date.now()`）。
 * 3. stdout 只输出业务结果，诊断与日志走 stderr（保证 `--format json | jq` 可管道）。
 *    唯一例外：冷却提示按 T05 交付标准走 stdout（它是该次运行的最终答案，而非诊断）。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { OPENCLI_BIN } from './collect/opencli-source.js'
import { loadPromptTemplate } from './comment/prompt-templates.js'
import { createHostComplete, resolveCompleteChannel } from './comment/complete-gateway.js'
import {
  COOLDOWN_MS,
  DEFAULT_LIMIT,
  DEFAULT_MIN_EXPOSURE,
  DEFAULT_MIN_TIER,
  DEFAULT_RANK_BY,
  LIMIT_MAX,
  LIMIT_MIN,
  MAX_TWEETS,
  TIMEOUT_MS,
  parseFormat,
  parseLimit,
  parseMinExposure,
  parseMinTier,
  parseRankBy,
  parseSource,
  parseTimelineType,
} from './config.js'
import { ERROR_CODES, InterceptError, exitCodeForError, toInterceptError } from './core/errors.js'
import { runOnce } from './pipeline.js'
import { renderDrafts, renderHeader, renderSummary } from './present/table-renderer.js'

/** 插件版本（与 `package.json` 对齐）。 */
export const VERSION = '0.1.0'

/** 中文帮助文本（含全部参数与退出码说明）。 */
export const HELP_TEXT = `推特推文爆速检测与智能截流 · omnimux-intercept v${VERSION}

用法：
  intercept scan [选项]        扫描首页时间线，找出爆速推文并生成抢评草稿
  intercept --help             显示本帮助

选项：
  --limit <N>            每批抓取条数，${LIMIT_MIN}..${LIMIT_MAX}（默认 ${DEFAULT_LIMIT}）
  --type <类型>          for-you（默认）| following
  --rank-by <主键>       exposure（预估曝光，默认）| pace（时速）
  --min-tier <分级>      normal | surging（默认）| viral —— 低于该分级不进入候选清单
  --min-exposure <N>     预估曝光下限，低于该值不进入候选清单（默认 ${DEFAULT_MIN_EXPOSURE}）
  --format <格式>        table（默认）| json | genui | md
  --source <数据源>      opencli（默认）| hub | fixture
  --fixture <路径>       --source fixture 时必填的夹具文件路径
  --style <类型>         reply（默认）| quote | both
  --lang <语言>          zh（默认）| en
  --max-chars <N>        草稿字数上限（默认中文 220 字）
  --out-dir <目录>       战报输出目录（默认 $DSH_HOME/omnimux-intercept/reports）
  --dry-run              只算不生成文案、不落盘
  --force                无视冷却闸强制运行（会留痕）
  --no-llm               关闭模型通道，直接用离线模板出草稿
  --no-genui             不构建 GenUI 看板 spec
  --now <毫秒/ISO时间>   覆盖当前时刻（用于回放核对，正常不需要）
  --verbose              打印原始错误原因到 stderr
  -h, --help             显示本帮助

退出码：
  0  成功（含「本轮无待截流目标」）
  2  参数错误（非法 --limit / 未知子命令等）
  3  数据源不可用或载荷不可解析（浏览器桥接失败、x.com 不可达、JSON 损坏）
  4  冷却中且未加 --force（默认冷却 ${COOLDOWN_MS / 1000} 秒）
  5  内部错误（stack 只进日志，不进 stdout）

示例：
  intercept scan --limit 20 --min-tier surging
  intercept scan --format genui --dry-run
  intercept scan --source fixture --fixture plugins/omnimux-intercept/test/fixtures/timeline.json
`

/**
 * 解析命令行参数。
 *
 * `parseArgs` 的解析异常（未知选项、缺少取值）一律映射为 `ARG_INVALID`（退出码 2）。
 * @param {string[]} argv 参数（不含 node 与脚本路径）
 * @returns {{ command: string, options: Record<string, any> }}
 */
export function parseCliArgs(argv) {
  /** @type {{ values: Record<string, any>, positionals: string[] }} */
  let parsed
  try {
    parsed = /** @type {any} */ (
      parseArgs({
        args: Array.isArray(argv) ? argv : [],
        options: {
          limit: { type: 'string' },
          type: { type: 'string' },
          'rank-by': { type: 'string' },
          'min-tier': { type: 'string' },
          'min-exposure': { type: 'string' },
          format: { type: 'string', short: 'f' },
          source: { type: 'string' },
          fixture: { type: 'string' },
          style: { type: 'string' },
          lang: { type: 'string' },
          'max-chars': { type: 'string' },
          'out-dir': { type: 'string' },
          now: { type: 'string' },
          'dry-run': { type: 'boolean' },
          force: { type: 'boolean' },
          'no-llm': { type: 'boolean' },
          'no-genui': { type: 'boolean' },
          verbose: { type: 'boolean' },
          help: { type: 'boolean', short: 'h' },
        },
        allowPositionals: true,
        strict: true,
      })
    )
  } catch (error) {
    throw new InterceptError(
      ERROR_CODES.ARG_INVALID,
      `参数解析失败：${error instanceof Error ? error.message : String(error)}`,
      { hint: '运行 intercept --help 查看全部可用参数' },
    )
  }

  const values = parsed.values
  const positionals = parsed.positionals
  const command = positionals[0] ?? (values.help === true ? 'help' : 'scan')

  if (values.help === true) {
    return { command: 'help', options: {} }
  }

  return {
    command,
    options: {
      limit: values.limit === undefined ? undefined : parseLimit(values.limit),
      type: values.type === undefined ? undefined : parseTimelineType(values.type),
      rankBy: values['rank-by'] === undefined ? undefined : parseRankBy(values['rank-by']),
      minTier: values['min-tier'] === undefined ? undefined : parseMinTier(values['min-tier']),
      minExposure:
        values['min-exposure'] === undefined ? undefined : parseMinExposure(values['min-exposure']),
      format: values.format === undefined ? 'table' : parseFormat(values.format),
      source: values.source === undefined ? undefined : parseSource(values.source),
      fixturePath: values.fixture,
      style: parseStyle(values.style),
      lang: values.lang === 'en' ? 'en' : 'zh',
      maxChars: parsePositiveInt(values['max-chars'], '--max-chars'),
      outDir: values['out-dir'],
      dryRun: values['dry-run'] === true,
      force: values.force === true,
      llm: values['no-llm'] === true ? 'off' : 'auto',
      genui: values['no-genui'] !== true,
      nowMs: parseNow(values.now),
      verbose: values.verbose === true,
    },
  }
}

/**
 * 校验 `--style`。
 * @param {unknown} raw 原始取值
 * @returns {'reply' | 'quote' | 'both'}
 */
export function parseStyle(raw) {
  if (raw === undefined) return 'reply'
  if (raw === 'reply' || raw === 'quote' || raw === 'both') return raw
  throw new InterceptError(ERROR_CODES.ARG_INVALID, '参数 --style 必须是 reply、quote 或 both', {
    hint: '例如 --style reply（默认）或 --style both',
  })
}

/**
 * 校验正整数型参数。
 * @param {unknown} raw 原始取值
 * @param {string} flag 参数名（用于报错文案）
 * @returns {number | undefined}
 */
export function parsePositiveInt(raw, flag) {
  if (raw === undefined) return undefined
  const numeric = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof numeric === 'number' && Number.isInteger(numeric) && numeric > 0) return numeric
  throw new InterceptError(ERROR_CODES.ARG_INVALID, `参数 ${flag} 必须是正整数`, {
    hint: `例如 ${flag} 220`,
  })
}

/**
 * 解析 `--now`（毫秒时间戳或 ISO 8601）。
 * @param {unknown} raw 原始取值
 * @returns {number | undefined}
 */
export function parseNow(raw) {
  if (raw === undefined) return undefined
  const text = String(raw).trim()
  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    if (Number.isFinite(numeric)) return numeric
  }
  const parsed = Date.parse(text)
  if (Number.isFinite(parsed)) return parsed
  throw new InterceptError(ERROR_CODES.ARG_INVALID, '参数 --now 必须是毫秒时间戳或 ISO 8601 时间', {
    hint: '例如 --now 2026-09-13T06:34:07Z',
  })
}

/**
 * 创建真实的 OpenCLI 子进程执行器。
 *
 * 子进程的 stdout / stderr / 退出码原样回传，分类逻辑留在 `collect/opencli-source.js`
 * （这样「失败归类」规则可以被单测覆盖，而不必真的起进程）。
 * @param {{ bin?: string, cwd?: string, env?: Record<string, string | undefined> }} [options] 执行器选项
 * @returns {(argv: string[], runOptions: { timeoutMs: number, signal?: AbortSignal }) => Promise<{ stdout: string, stderr: string, code: number }>}
 */
export function createSpawnRunner(options = {}) {
  const bin = options.bin ?? OPENCLI_BIN
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env

  return (argv, runOptions = { timeoutMs: TIMEOUT_MS }) =>
    new Promise((resolve) => {
      /** @type {import('node:child_process').ChildProcess} */
      let child
      try {
        child = spawn(bin, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        resolve({
          stdout: '',
          stderr: `ENOENT: 无法启动 ${bin}（${error instanceof Error ? error.message : String(error)}）`,
          code: -1,
        })
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      const timeoutMs =
        typeof runOptions?.timeoutMs === 'number' && runOptions.timeoutMs > 0
          ? runOptions.timeoutMs
          : TIMEOUT_MS

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        resolve({
          stdout,
          stderr: `${stderr}\n子进程超时（${timeoutMs}ms），已终止 ${bin}`.trim(),
          code: -1,
        })
      }, timeoutMs)

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
          code: -1,
        })
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, code: typeof code === 'number' ? code : -1 })
      })
    })
}

/**
 * 装配运行依赖：真实世界的能力在这里注入，其余模块一律拿到函数。
 * @param {Record<string, any>} options 运行选项
 * @param {Record<string, any>} [overrides] 测试覆盖（**只覆盖显式给了值的键**）
 * @returns {Promise<Record<string, any>>}
 */
export async function assembleDeps(options, overrides = {}) {
  const env = overrides.env ?? process.env
  const templates = {
    reply: await loadPromptTemplate('reply-high', {
      env,
      ...(typeof overrides.readFile === 'function' ? { readFile: overrides.readFile } : {}),
    }),
    quote: await loadPromptTemplate('quote', {
      env,
      ...(typeof overrides.readFile === 'function' ? { readFile: overrides.readFile } : {}),
    }),
  }

  const complete =
    overrides.complete !== undefined
      ? overrides.complete
      : resolveCompleteChannel({ env, fetcher: globalThis.fetch })

  /** @type {Record<string, any>} */
  const base = {
    run: createSpawnRunner({ env }),
    request: undefined,
    complete,
    channel: 'http',
    templates,
    template: templates.reply,
    readFile: (/** @type {string} */ filePath) => fs.readFile(filePath, 'utf8'),
    writeFile: (/** @type {string} */ filePath, /** @type {string} */ content) =>
      fs.writeFile(filePath, content, 'utf8'),
    appendFile: (/** @type {string} */ filePath, /** @type {string} */ content) =>
      fs.appendFile(filePath, content, 'utf8'),
    ensureDir: (/** @type {string} */ dirPath) =>
      fs.mkdir(dirPath, { recursive: true }).then(() => undefined),
    sleep: (/** @type {number} */ ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    env,
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) base[key] = value
  }

  // 宿主通道优先：注入了 textComplete 就用它，并把通道标签标成 host。
  if (typeof overrides.textComplete === 'function') {
    base.complete = createHostComplete({ textComplete: overrides.textComplete })
    base.channel = 'host'
  }

  void options
  return base
}

/**
 * 把运行产物打印到 stdout。
 * @param {Record<string, any>} payload 运行产物
 * @param {Record<string, any>} options 运行选项
 * @param {(text: string) => void} write 写 stdout
 * @returns {void}
 */
export function emitPayload(payload, options, write) {
  const format = options.format ?? 'table'

  if (format === 'json') {
    write(`${JSON.stringify(toJsonView(payload), null, 2)}\n`)
    return
  }
  if (format === 'genui') {
    write(`${JSON.stringify(payload.genui ?? { title: '推特爆速截流看板', items: [] }, null, 2)}\n`)
    return
  }
  if (format === 'md') {
    write(`${payload.markdown}\n`)
    return
  }

  const blocks = [
    renderHeader({
      runId: payload.runId,
      startedAtMs: payload.startedAtMs,
      source: payload.source,
      fetchedCount: payload.meta.fetchedCount,
      candidateCount: payload.rows.length,
      dryRun: payload.meta.dryRun,
      formatShanghai: payload.meta.formatShanghai,
    }),
    '',
  ]

  if (payload.rows.length === 0) {
    blocks.push('本轮无待截流目标。', '')
  } else {
    blocks.push(payload.table, '')
  }

  blocks.push(
    renderSummary(payload.allRows, payload.rows, {
      channel: payload.meta.channel,
      warnings: payload.warnings,
    }),
  )

  if (payload.drafts.length > 0) {
    blocks.push('', renderDrafts(payload.drafts, payload.rows))
  }

  if (payload.reportPaths) {
    blocks.push('', `战报已写入：${payload.reportPaths.markdownPath}`)
  }

  write(`${blocks.join('\n')}\n`)
}

/**
 * 生成 JSON 视图（面向管道消费，剔除函数与内部大对象）。
 * @param {Record<string, any>} payload 运行产物
 * @returns {Record<string, any>}
 */
export function toJsonView(payload) {
  return {
    runId: payload.runId,
    startedAtMs: payload.startedAtMs,
    source: payload.source,
    meta: {
      ...payload.meta,
      formatShanghai: undefined,
    },
    warnings: payload.warnings,
    candidates: payload.rows.map((/** @type {import('./core/sort.js').ScoredTweet} */ row) => ({
      id: row.record.id,
      author: row.record.author,
      authorHandle: row.record.authorHandle,
      url: row.record.url,
      tier: row.stats.tier,
      hoursAlive: row.stats.hoursAlive,
      pace: row.stats.pace,
      predictedExposure: row.stats.exposure.predicted,
      degraded: row.degraded,
      anomalies: row.record.anomalies,
      metrics: row.record.metrics,
    })),
    drafts: payload.drafts,
    reportPaths: payload.reportPaths,
  }
}

/**
 * CLI 主流程（返回退出码，不直接结束进程，便于测试在进程内断言）。
 * @param {string[]} [argv] 参数
 * @param {Record<string, any>} [deps] 注入依赖（`stdout` / `stderr` / 以及 pipeline 的全部依赖）
 * @returns {Promise<number>} 退出码
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const write =
    typeof deps.stdout === 'function'
      ? deps.stdout
      : (/** @type {string} */ text) => process.stdout.write(text)
  const writeErr =
    typeof deps.stderr === 'function'
      ? deps.stderr
      : (/** @type {string} */ text) => process.stderr.write(text)

  /** @type {Record<string, any>} */
  let options = {}

  try {
    const parsed = parseCliArgs(argv)
    options = parsed.options

    if (parsed.command === 'help') {
      write(HELP_TEXT)
      return 0
    }
    if (parsed.command !== 'scan') {
      throw new InterceptError(
        ERROR_CODES.ARG_INVALID,
        `未知子命令：${parsed.command}`,
        { hint: '可用子命令只有 scan；运行 intercept --help 查看全部参数' },
      )
    }

    const resolved = await assembleDeps(options, deps)
    const payload = await runOnce(options, resolved)
    emitPayload(payload, options, write)
    return 0
  } catch (error) {
    const normalized = toInterceptError(error)

    // 冷却提示是该次运行的最终答案，按交付标准走 stdout。
    if (normalized.code === ERROR_CODES.COOLDOWN_ACTIVE) {
      write(`${normalized.hint ?? normalized.message}\n`)
      return exitCodeForError(normalized)
    }

    writeErr(`错误：${normalized.message}\n`)
    if (normalized.hint) writeErr(`建议：${normalized.hint}\n`)
    if (options.verbose === true && normalized.cause) {
      writeErr(`原始错误：${String(normalized.cause)}\n`)
    }
    return exitCodeForError(normalized)
  }
}

/** 是否由 node 直接执行本文件（而非被 import）。 */
function isDirectRun() {
  const entry = process.argv[1]
  if (typeof entry !== 'string' || entry === '') return false
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectRun()) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`内部错误：${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 5
    })
}

export { MAX_TWEETS, DEFAULT_MIN_TIER, DEFAULT_RANK_BY }
