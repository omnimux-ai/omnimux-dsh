/**
 * @file 单次运行的主编排 —— **唯一知道「顺序」的地方**，也是全仓**唯一取当前时间的入口**。
 *
 * 顺序：冷却闸 → 采集（opencli 子进程）→ 规范化 → 纯函数计算 → 稳定排序 → 过滤 minTier/minExposure
 * → 三级降级生成文案 → 双视图渲染 → 落盘 → 状态回写。
 *
 * 时间纪律（§7.1）：`const nowMs = options.nowMs ?? Date.now()` 是本文件的存在意义之一，
 * 其余任何模块出现 `Date.now()` 即视为缺陷。
 */

import { fetchTimeline } from './collect/timeline-fetcher.js'
import { generateComments } from './comment/comment-service.js'
import {
  DEFAULT_MIN_EXPOSURE,
  DEFAULT_MIN_TIER,
  DEFAULT_RANK_BY,
  DEFAULT_LIMIT,
  meetsMinTier,
  resolveConfig,
} from './config.js'
import { scoreTweets } from './core/algorithm.js'
import { ERROR_CODES, InterceptError, isRetryableError } from './core/errors.js'
import { rankTweets } from './core/sort.js'
import { checkCooldown, defaultSleep, describeCooldown, withRetry } from './guard.js'
import { buildDashboard } from './present/genui-dashboard.js'
import { renderMarkdownReport, writeReport } from './present/report-writer.js'
import { renderTable } from './present/table-renderer.js'
import {
  formatLogLine,
  formatShanghai,
  isAlreadyDrafted,
  loadState,
  makeRunId,
  markDrafted,
  recordRun,
  resolveLogPath,
  resolvePluginPaths,
  saveState,
} from './run-store.js'

/**
 * 运行选项。
 * @typedef {object} RunOptions
 * @property {number} [limit] 抓取条数（1..200）
 * @property {'for-you' | 'following'} [type] 时间线类型
 * @property {'exposure' | 'pace'} [rankBy] 排序主键
 * @property {'normal' | 'surging' | 'viral'} [minTier] 最低分级
 * @property {number} [minExposure] 最低预估曝光
 * @property {boolean} [genui] 是否构建 GenUI 看板 spec
 * @property {'auto' | 'off'} [llm] 文案通道开关
 * @property {'reply' | 'quote' | 'both'} [style] 草稿类型
 * @property {'zh' | 'en'} [lang] 草稿语言
 * @property {number} [maxChars] 草稿字数上限
 * @property {string} [outDir] 战报输出目录
 * @property {boolean} [dryRun] 只算不生成文案、不落盘
 * @property {boolean} [force] 无视冷却
 * @property {'opencli' | 'hub' | 'fixture'} [source] 数据源
 * @property {string} [fixturePath] 夹具路径（`--source fixture` 时必填）
 * @property {number} [nowMs] 当前时刻（测试注入；生产环境留空即用真实时钟）
 * @property {boolean} [allowHubFallback] 主源失败时是否降级到 hub
 * @property {boolean} [color] 终端表格是否着色（默认关闭，保证可管道）
 * @property {string} [stateRoot] 状态根目录覆盖
 * @property {import('./config.js').ConfigOverrides} [overrides] 阈值覆盖
 */

/**
 * 一次运行的完整产物。
 * @typedef {object} RunPayload
 * @property {string} runId
 * @property {number} startedAtMs
 * @property {number} finishedAtMs
 * @property {string} source
 * @property {number} fetchedAtMs
 * @property {import('./core/sort.js').ScoredTweet[]} rows 候选清单（已过滤、已排序）
 * @property {import('./core/sort.js').ScoredTweet[]} allRows 全部打分行
 * @property {Array<Record<string, any>>} drafts 草稿列表（顺序与 `rows` 一致）
 * @property {import('./collect/tweet.js').TweetRecord[]} records 归一后的实体
 * @property {string} table 终端表格文本
 * @property {{ title: string, gap: number, items: Array<Record<string, unknown>> } | null} genui 看板 spec
 * @property {string} markdown Markdown 战报
 * @property {string[]} warnings 非致命降级留痕
 * @property {string[]} logLines 本轮 JSONL 日志
 * @property {import('./run-store.js').PluginPaths} paths 路径集合
 * @property {{ markdownPath: string, jsonlPath: string } | null} reportPaths 落盘结果
 * @property {import('./run-store.js').PersistedState} state 运行后的状态
 * @property {Record<string, any>} meta 运行元信息
 */

/**
 * 注入依赖集合（外部世界只有三个注入点，其余为测试便利项）。
 * @typedef {object} PipelineDeps
 * @property {(argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) => Promise<{ stdout: string, stderr: string, code: number }>} [run] OpenCLI 子进程执行器
 * @property {(tool: string, args: object) => Promise<unknown>} [request] 宿主工具调用器
 * @property {import('./comment/complete-gateway.js').CompleteFn | null} [complete] 模型补全函数（`null` = 不可用）
 * @property {string} [channel] 文案通道标签（`host` / `http`）
 * @property {{ system: string, kind?: string, source?: string }} [template] 提示词模板
 * @property {Record<string, { system: string }>} [templates] 按类型区分的模板
 * @property {(p: string) => Promise<string>} [readFile] 读文件
 * @property {(p: string, content: string) => Promise<void>} [writeFile] 写文件
 * @property {(p: string, content: string) => Promise<void>} [appendFile] 追加文件
 * @property {(p: string) => Promise<void>} [ensureDir] 建目录
 * @property {(ms: number) => Promise<void>} [sleep] 休眠实现
 * @property {() => number} [random] 随机数发生器
 * @property {Record<string, string | undefined>} [env] 环境变量
 * @property {(line: string) => void} [log] 日志行回调（默认仅收集，不写盘）
 */

/**
 * 组装一次运行的产物（泛型透传，保持调用点的精确类型）。
 * @template T
 * @param {T} payload 运行产物
 * @returns {T} 同一对象（便于链式使用）
 */
function finalize(payload) {
  return payload
}

/**
 * 执行一轮爆速检测与截流编排。
 *
 * @param {RunOptions} [options] 运行选项
 * @param {PipelineDeps} [deps] 注入依赖
 * @returns {Promise<{
 *   runId: string,
 *   startedAtMs: number,
 *   finishedAtMs: number,
 *   source: string,
 *   rows: import('./core/sort.js').ScoredTweet[],
 *   allRows: import('./core/sort.js').ScoredTweet[],
 *   drafts: Array<Record<string, any>>,
 *   table: string,
 *   genui: object | null,
 *   markdown: string,
 *   warnings: string[],
 *   logLines: string[],
 *   paths: object,
 *   reportPaths: { markdownPath: string, jsonlPath: string } | null,
 *   state: object,
 *   meta: Record<string, any>,
 * }>}
 */
export async function runOnce(options = {}, deps = {}) {
  // ── 全仓唯一的取时钟入口 ────────────────────────────────────────────────
  const injectedNowMs =
    typeof options.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : null
  const clock = () => (injectedNowMs === null ? Date.now() : injectedNowMs)
  const nowMs = clock()

  const env = deps.env ?? process.env
  const random = typeof deps.random === 'function' ? deps.random : Math.random

  const config = resolveConfig(
    {
      limit: options.limit,
      type: options.type,
      rankBy: options.rankBy,
      minTier: options.minTier,
      minExposure: options.minExposure,
      source: options.source,
      ...(options.overrides ?? {}),
    },
    env,
  )

  const paths = resolvePluginPaths({ stateRoot: config.stateRoot, outDir: options.outDir }, env)
  const runId = makeRunId(nowMs, random)
  const dryRun = options.dryRun === true
  const llmOff = options.llm === 'off'

  /** @type {string[]} */
  const warnings = []
  /** @type {string[]} */
  const logLines = []
  /** @type {(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void} */
  const log = (level, event, data = {}) => {
    const line = formatLogLine(clock(), level, event, data)
    logLines.push(line)
    if (typeof deps.log === 'function') deps.log(line)
  }

  log('info', 'run.start', {
    runId,
    source: config.source,
    limit: config.limit,
    dryRun,
    rankBy: config.rankBy,
    minTier: config.minTier,
  })

  // ── 冷却闸 ─────────────────────────────────────────────────────────────
  const canWriteState = typeof deps.writeFile === 'function'
  const state = await loadState(paths, {
    readFile: /** @type {any} */ (deps.readFile),
  })

  const guardDecision = checkCooldown(state, nowMs, config)
  log('info', 'guard.check', {
    allowed: guardDecision.allowed,
    waitMs: guardDecision.waitMs ?? 0,
  })

  if (!guardDecision.allowed && options.force !== true) {
    log('warn', 'guard.block', { reason: guardDecision.reason ?? 'cooldown-active' })
    await flushLogs(paths, runId, logLines, deps, dryRun)
    throw new InterceptError(ERROR_CODES.COOLDOWN_ACTIVE, '距上次运行过近，冷却中', {
      hint: describeCooldown(guardDecision, { cooldownMs: config.cooldownMs, nowMs }),
    })
  }
  if (!guardDecision.allowed) {
    warnings.push('COOLDOWN_OVERRIDDEN')
    log('warn', 'guard.check', { overridden: true })
  }

  // ── 采集（含指数退避重试） ───────────────────────────────────────────────
  log('info', 'fetch.start', { source: config.source, limit: config.limit })
  const sleep = typeof deps.sleep === 'function' ? deps.sleep : defaultSleep

  const fetchResult = await withRetry(
    () =>
      fetchTimeline(
        {
          source: config.source,
          limit: config.limit,
          type: config.type,
          nowMs,
          timeoutMs: config.timeoutMs,
          maxTweets: config.maxTweets,
          chunkDelayMs: config.chunkDelayMs,
          fixturePath: options.fixturePath,
          allowHubFallback: options.allowHubFallback,
        },
        {
          run: deps.run,
          request: deps.request,
          readFile: deps.readFile,
          sleep,
          nowMs,
        },
      ),
    {
      attempts: config.retryAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      isRetryable: isRetryableError,
      sleep,
      random,
      onRetry: ({ attempt, delayMs, error }) => {
        log('warn', 'fetch.retry', {
          attempt,
          delayMs,
          code: /** @type {any} */ (error)?.code ?? 'UNKNOWN',
        })
      },
    },
  )

  warnings.push(...fetchResult.warnings)
  log('info', 'fetch.done', {
    rawCount: fetchResult.rawCount,
    records: fetchResult.records.length,
    actualSource: fetchResult.source,
  })

  // ── 纯函数计算与排序 ─────────────────────────────────────────────────────
  const allRows = scoreTweets(fetchResult.records, nowMs)
  log('info', 'parse.done', { records: fetchResult.records.length })

  const ranked = rankTweets(allRows, config.rankBy)
  log('info', 'score.done', { scored: allRows.length })
  log('info', 'rank.done', { by: config.rankBy, first: ranked[0]?.record?.id ?? null })

  const candidates = ranked.filter(
    (row) =>
      meetsMinTier(row.stats.tier, config.minTier) && row.score >= config.minExposure,
  )

  // ── 文案生成（三级降级阶梯；已开过草稿的推文不重复生成） ──────────────────
  const generateEnabled = !dryRun && !llmOff && candidates.length > 0
  /** @type {Map<string, Record<string, any>>} */
  const generatedByTweet = new Map()

  if (generateEnabled) {
    const fresh = candidates.filter((row) => !isAlreadyDrafted(state, String(row.record.id)))
    const reused = candidates.filter((row) => isAlreadyDrafted(state, String(row.record.id)))

    if (fresh.length > 0) {
      log('info', 'llm.call', { count: fresh.length, channel: deps.channel ?? 'host' })
      const generated = await generateComments(
        fresh.map((row) => ({
          tweet: row,
          style: options.style ?? 'reply',
          language: options.lang === 'en' ? 'en' : 'zh',
          ...(typeof options.maxChars === 'number' ? { maxChars: options.maxChars } : {}),
        })),
        {
          complete: /** @type {any} */ (deps.complete ?? null),
          channel: deps.channel === 'http' ? 'http' : 'host',
          template: deps.template,
          templates: /** @type {any} */ (deps.templates),
          language: options.lang === 'en' ? 'en' : 'zh',
        },
      )
      for (const draft of generated) {
        generatedByTweet.set(draft.tweetId, draft)
        for (const warning of draft.warnings) warnings.push(warning)
        if (draft.usedChannel === 'template') {
          log('warn', 'llm.fallback', { tweetId: draft.tweetId, channel: 'template' })
        }
      }
    }

    for (const row of reused) {
      generatedByTweet.set(String(row.record.id), {
        tweetId: String(row.record.id),
        reply: null,
        quote: null,
        usedChannel: 'template',
        alreadyDrafted: true,
        warnings: ['已生成过：本轮跳过重复生成'],
      })
    }
  }

  // 草稿顺序必须与候选清单一致（T05 交付标准 7：两视图 id 顺序一致）。
  const drafts = generateEnabled
    ? candidates
        .map((row) => generatedByTweet.get(String(row.record.id)))
        .filter((draft) => draft !== undefined)
    : []

  // ── 双视图渲染 ───────────────────────────────────────────────────────────
  const table = renderTable(candidates, {
    maxRows: config.limit,
    color: options.color === true,
  })
  log('info', 'render.table', { rows: candidates.length })

  const meta = {
    runId,
    startedAtMs: nowMs,
    finishedAtMs: nowMs,
    source: fetchResult.source,
    fetchedCount: fetchResult.rawCount,
    allCount: allRows.length,
    candidateCount: candidates.length,
    viral: allRows.filter((row) => row.stats.tier === 'viral').length,
    surging: allRows.filter((row) => row.stats.tier === 'surging').length,
    normal: allRows.filter((row) => row.stats.tier === 'normal').length,
    degradedCount: allRows.filter((row) => row.degraded).length,
    channel: resolveChannelLabel(drafts, llmOff),
    dryRun,
    rankBy: config.rankBy,
    minTier: config.minTier,
    minExposure: config.minExposure,
    limit: config.limit,
    runOptions: {
      source: config.source,
      limit: config.limit,
      rankBy: config.rankBy,
      minTier: config.minTier,
      minExposure: config.minExposure,
      dryRun,
      force: options.force === true,
      llm: llmOff ? 'off' : 'auto',
      style: options.style ?? 'reply',
    },
    formatShanghai,
  }

  const genui =
    options.genui === false
      ? null
      : buildDashboard(candidates, drafts, { ...meta, warnings, formatShanghai })
  log('info', 'render.genui', { roots: genui ? genui.items.length : 0 })

  /** @type {RunPayload} */
  const payload = finalize({
    runId,
    startedAtMs: nowMs,
    finishedAtMs: clock(),
    source: fetchResult.source,
    fetchedAtMs: fetchResult.fetchedAtMs,
    rows: candidates,
    allRows,
    drafts,
    records: fetchResult.records,
    table,
    genui,
    markdown: '',
    warnings,
    logLines,
    paths,
    reportPaths: null,
    state,
    meta,
  })

  payload.markdown = renderMarkdownReport(payload)

  // ── 落盘（`--dry-run` 一律不落盘；落盘依赖必须由装配层显式注入） ──────────
  if (!dryRun && canWriteState) {
    // 新机器首次运行时 $DSH_HOME/omnimux-intercept/ 尚不存在，必须先建目录，
    // 否则 state.json 与 logs/ 的写入会以 ENOENT 失败（冷却与去重会静默失效）。
    if (typeof deps.ensureDir === 'function') {
      try {
        await deps.ensureDir(paths.stateRoot)
      } catch (error) {
        warnings.push(
          `状态目录创建失败：${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    try {
      const reportPaths = await writeReport(payload, {
        outDir: paths.outDir,
        writeFile: /** @type {any} */ (deps.writeFile),
        appendFile: /** @type {any} */ (deps.appendFile),
        ensureDir: /** @type {any} */ (deps.ensureDir),
      })
      payload.reportPaths = reportPaths
      log('info', 'report.written', { outDir: paths.outDir })
    } catch (error) {
      // 落盘失败不致命：结果已经算出来并会打到 stdout，只留痕。
      warnings.push(`战报落盘失败：${error instanceof Error ? error.message : String(error)}`)
    }

    let nextState = markDrafted(state, drafts.map((draft) => draft.tweetId))
    nextState = recordRun(nextState, {
      runId,
      startedAtMs: nowMs,
      finishedAtMs: payload.finishedAtMs,
      source: fetchResult.source,
      fetched: fetchResult.rawCount,
      candidates: candidates.length,
      viral: meta.viral,
      surging: meta.surging,
      warnings: warnings.slice(0, 20),
    })
    try {
      await saveState(paths, nextState, { writeFile: /** @type {any} */ (deps.writeFile) })
      payload.state = nextState
    } catch (error) {
      warnings.push(`状态写入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('info', 'run.done', {
    candidates: candidates.length,
    drafts: drafts.length,
    warnings: warnings.length,
  })
  await flushLogs(paths, runId, logLines, deps, dryRun)

  return payload
}

/**
 * 解析文案通道标签（供输出层展示）。
 * @param {Array<Record<string, any>>} drafts 草稿列表
 * @param {boolean} llmOff 是否显式关闭模型
 * @returns {string}
 */
function resolveChannelLabel(drafts, llmOff) {
  if (Array.isArray(drafts) && drafts.length > 0) {
    const modelDrafts = drafts.filter((draft) => draft.usedChannel !== 'template')
    if (modelDrafts.length === 0) return 'template'
    const channels = [...new Set(modelDrafts.map((draft) => String(draft.usedChannel)))]
    return channels.sort().join('/')
  }
  return llmOff ? 'off' : 'none'
}

/**
 * 把本轮日志追加到 `logs/run-<runId>.jsonl`。
 *
 * 未注入 `appendFile`（例如单测）或 `--dry-run` 时只保留在内存里，不碰文件系统。
 * @param {import('./run-store.js').PluginPaths} paths 路径集合
 * @param {string} runId 运行 id
 * @param {string[]} logLines 日志行
 * @param {PipelineDeps} deps 注入依赖
 * @param {boolean} dryRun 是否试运行
 * @returns {Promise<void>}
 */
async function flushLogs(paths, runId, logLines, deps, dryRun) {
  if (dryRun || logLines.length === 0) return
  if (typeof deps.appendFile !== 'function') return
  try {
    if (typeof deps.ensureDir === 'function') await deps.ensureDir(paths.logDir)
    await deps.appendFile(resolveLogPath(paths, runId), `${logLines.join('\n')}\n`)
  } catch {
    // 日志写失败不影响业务结果。
  }
}

/** 默认最低分级（供 CLI 帮助文本复用）。 */
export { DEFAULT_MIN_TIER, DEFAULT_MIN_EXPOSURE, DEFAULT_RANK_BY, DEFAULT_LIMIT }
