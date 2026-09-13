/**
 * @file 端到端编排测试：注入假数据源 + 假模型，覆盖全部退出码与两条旁路（冷却 / dry-run）。
 *
 * 全程零子进程、零网络、零真实文件系统：`readFile` / `writeFile` / `appendFile` 走内存实现。
 */

import assert from 'node:assert/strict'
import { readFile as fsReadFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { builtinTemplate } from '../src/comment/prompt-templates.js'
import { main } from '../src/cli.js'
import { ERROR_CODES } from '../src/core/errors.js'
import { runOnce } from '../src/pipeline.js'
import {
  displayWidth,
  renderDrafts,
  renderSummary,
  renderTable,
  truncateToWidth,
} from '../src/present/table-renderer.js'
import { STATE_VERSION } from '../src/run-store.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_MAIN = path.join(TEST_DIR, 'fixtures/timeline.json')
const FIXTURE_DIRTY = path.join(TEST_DIR, 'fixtures/timeline-dirty.json')

const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')
const STATE_ROOT = '/tmp/intercept-test-state'
const OUT_DIR = '/tmp/intercept-test-out'
/** 状态文件真实路径：`resolveStateRoot` 会在 $DSH_HOME 下再拼一层插件目录名。 */
const STATE_FILE = path.join(STATE_ROOT, 'omnimux-intercept', 'state.json')

/** 本机实测的 OpenCLI 桥接失败原文。 */
const BRIDGE_STDERR = `ok: false
error:
  code: COMMAND_EXEC
  message: >-
    Pre-navigation to https://x.com failed: attach failed: Cannot access a chrome-extension:// URL of different extension.
  exitCode: 1
`

/**
 * 内存文件系统 + 注入依赖。
 * @returns {Record<string, any>}
 */
function createHarness() {
  /** @type {Map<string, string>} */
  const files = new Map()
  /** @type {string[]} */
  const stdoutChunks = []
  /** @type {string[]} */
  const stderrChunks = []
  /** 已「创建」的目录集合：内存 FS 复刻真实语义 —— 未建目录就写文件会 ENOENT。 */
  const createdDirs = new Set()
  let completeCalls = 0

  /**
   * 断言目标文件的父目录已存在（否则抛真实 fs 同款错误）。
   * @param {string} filePath 目标文件
   */
  function requireDir(filePath) {
    const dir = path.dirname(filePath)
    if (!createdDirs.has(dir)) {
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`)
      // @ts-expect-error 复刻 Node 的 errno 形状
      error.code = 'ENOENT'
      throw error
    }
  }

  const harness = {
    files,
    createdDirs,
    stdoutChunks,
    stderrChunks,
    get stdoutText() {
      return stdoutChunks.join('')
    },
    get stderrText() {
      return stderrChunks.join('')
    },
    get completeCalls() {
      return completeCalls
    },
    readFile: async (filePath) => {
      const normalized = String(filePath)
      if (files.has(normalized)) return String(files.get(normalized))
      // 非内存文件（例如 presets 下的 SoPilot 提示词）走真实仓库读取。
      return fsReadFile(normalized, 'utf8')
    },
    writeFile: async (filePath, content) => {
      requireDir(String(filePath))
      files.set(String(filePath), String(content))
    },
    appendFile: async (filePath, content) => {
      const key = String(filePath)
      requireDir(key)
      files.set(key, `${files.get(key) ?? ''}${String(content)}`)
    },
    ensureDir: async (dirPath) => {
      createdDirs.add(String(dirPath))
    },
    sleep: async () => {},
    random: () => 0.5,
    env: { DSH_HOME: STATE_ROOT },
    complete: async () => {
      completeCalls += 1
      return '延迟翻倍在批处理场景里其实可以摊平，我实测过同样的曲线。'
    },
    channel: 'host',
    template: builtinTemplate('reply-high'),
    templates: { reply: builtinTemplate('reply-high'), quote: builtinTemplate('quote') },
    stdout: (text) => void stdoutChunks.push(String(text)),
    stderr: (text) => void stderrChunks.push(String(text)),
  }
  return harness
}

/**
 * 基础运行选项。
 * @param {Record<string, any>} [overrides] 覆盖
 * @returns {Record<string, any>}
 */
function baseOptions(overrides = {}) {
  return {
    source: 'fixture',
    fixturePath: FIXTURE_MAIN,
    nowMs: NOW_MS,
    limit: 20,
    minTier: 'surging',
    outDir: OUT_DIR,
    ...overrides,
  }
}

/** 预置一份「87 秒前刚跑过」的状态。 */
function seedCooldownState(harness) {
  harness.files.set(
    STATE_FILE,
    JSON.stringify({
      version: STATE_VERSION,
      lastRunAtMs: NOW_MS - 87_000,
      draftedTweetIds: [],
      runs: [],
    }),
  )
}

// ── 端到端主链路 ────────────────────────────────────────────────────────────

test('端到端：20 条夹具按预估曝光降序输出候选清单', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)

  assert.equal(payload.source, 'fixture')
  assert.equal(payload.allRows.length, 20)
  assert.equal(payload.rows.length, 14, '爆款 5 + 飙升 9 = 14 条候选')
  assert.equal(payload.meta.viral, 5)
  assert.equal(payload.meta.surging, 9)
  assert.equal(payload.meta.normal, 6)

  for (let index = 0; index < payload.rows.length - 1; index += 1) {
    assert.ok(
      payload.rows[index].score >= payload.rows[index + 1].score,
      `第 ${index} 行应不低于第 ${index + 1} 行`,
    )
  }
  assert.equal(payload.runId, '20260913T070000Z-8000')
})

test('端到端：viral 条目全部带草稿，normal 条目零草稿', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)

  const viralRows = payload.rows.filter((row) => row.stats.tier === 'viral')
  const normalRows = payload.allRows.filter((row) => row.stats.tier === 'normal')

  assert.ok(viralRows.length > 0)
  for (const row of viralRows) {
    const draft = payload.drafts.find((item) => item.tweetId === row.record.id)
    assert.ok(draft, `爆款 ${row.record.id} 应有草稿`)
    assert.ok(draft.reply?.text, `爆款 ${row.record.id} 的草稿正文不能为空`)
    assert.equal(draft.usedChannel, 'host')
  }

  assert.ok(normalRows.length > 0)
  for (const row of normalRows) {
    assert.equal(
      payload.drafts.some((item) => item.tweetId === row.record.id),
      false,
      `正常档 ${row.record.id} 不应有草稿`,
    )
  }
})

test('端到端：草稿顺序与候选清单顺序严格一致（防两视图各算一遍）', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)

  assert.deepEqual(
    payload.drafts.map((draft) => draft.tweetId),
    payload.rows.map((row) => row.record.id),
  )
})

test('端到端：--llm off 与 --dry-run 都不生成草稿', async () => {
  const llmOff = createHarness()
  const offPayload = await runOnce(baseOptions({ llm: 'off' }), llmOff)
  assert.deepEqual(offPayload.drafts, [])
  assert.equal(offPayload.meta.channel, 'off')
  assert.equal(llmOff.completeCalls, 0)

  const dry = createHarness()
  const dryPayload = await runOnce(baseOptions({ dryRun: true }), dry)
  assert.deepEqual(dryPayload.drafts, [])
  assert.equal(dry.completeCalls, 0)
})

test('端到端：脏夹具产出 degraded 候选且不被丢弃', async () => {
  const harness = createHarness()
  const payload = await runOnce(
    baseOptions({ fixturePath: FIXTURE_DIRTY, minTier: 'normal', minExposure: 0 }),
    harness,
  )

  const degraded = payload.allRows.filter((row) => row.degraded)
  assert.ok(degraded.length >= 5, `应有多条 degraded 行，实际 ${degraded.length}`)
  assert.equal(payload.meta.degradedCount, degraded.length)

  const codes = new Set()
  for (const row of degraded) for (const code of row.record.anomalies) codes.add(code)
  assert.ok(codes.has('VIEWS_MISSING'))
  assert.ok(codes.has('VIEWS_UNPARSEABLE'))
  assert.ok(codes.has('CLOCK_SKEW_FUTURE'))
})

// ── 退出码逐条断言 ──────────────────────────────────────────────────────────

test('退出码 0：正常一轮', async () => {
  const harness = createHarness()
  const code = await main(
    ['scan', '--source', 'fixture', '--fixture', FIXTURE_MAIN, '--now', String(NOW_MS), '--out-dir', OUT_DIR],
    harness,
  )
  assert.equal(code, 0)
  const output = harness.stdoutText
  assert.ok(output.includes('推特推文爆速检测与智能截流'))
  assert.ok(output.includes('爆款'))
  assert.ok(output.includes('草稿区'))
  assert.deepEqual(harness.stderrChunks, [])
})

test('退出码 0：本轮无待截流目标（与源不可用严格区分）', async () => {
  const harness = createHarness()
  const code = await main(
    [
      'scan',
      '--source', 'fixture',
      '--fixture', FIXTURE_MAIN,
      '--now', String(NOW_MS),
      '--out-dir', OUT_DIR,
      '--min-exposure', '99999999',
    ],
    harness,
  )
  assert.equal(code, 0)
  assert.ok(harness.stdoutText.includes('本轮无待截流目标'))
})

test('退出码 2：非法 --limit', async () => {
  const harness = createHarness()
  const code = await main(['scan', '--limit', 'abc'], harness)
  assert.equal(code, 2)
  assert.ok(harness.stderrText.includes('参数 --limit 必须是 1..200 的整数'))
})

test('退出码 2：未知子命令与未知选项', async () => {
  const unknownCommand = createHarness()
  assert.equal(await main(['bogus'], unknownCommand), 2)
  assert.ok(unknownCommand.stderrText.includes('未知子命令'))

  const unknownFlag = createHarness()
  assert.equal(await main(['scan', '--definitely-not-a-flag'], unknownFlag), 2)
  assert.ok(unknownFlag.stderrText.includes('参数解析失败'))
})

test('退出码 3：源不可用（假 run 抛桥接错误）', async () => {
  const harness = createHarness()
  harness.run = async () => ({ stdout: '', stderr: BRIDGE_STDERR, code: 1 })
  const code = await main(
    ['scan', '--source', 'opencli', '--now', String(NOW_MS), '--out-dir', OUT_DIR],
    harness,
  )
  assert.equal(code, 3)
  const err = harness.stderrText
  assert.ok(err.includes('错误：'))
  assert.ok(err.includes('opencli doctor'), '必须给出可执行建议')
  assert.ok(!harness.stdoutText.includes('本轮无待截流目标'), '抓取失败不得伪装成「今天没有爆款」')
})

test('退出码 4：冷却中且未加 --force', async () => {
  const harness = createHarness()
  seedCooldownState(harness)
  const code = await main(
    ['scan', '--source', 'fixture', '--fixture', FIXTURE_MAIN, '--now', String(NOW_MS), '--out-dir', OUT_DIR],
    harness,
  )
  assert.equal(code, 4)
  assert.ok(harness.stdoutText.includes('距上次运行 87 秒，冷却 90 秒；加 --force 强制'))
})

test('退出码 5：注入未预期异常', async () => {
  const harness = createHarness()
  harness.run = async () => {
    throw new Error('boom: unexpected internal failure')
  }
  const code = await main(
    ['scan', '--source', 'opencli', '--now', String(NOW_MS), '--out-dir', OUT_DIR],
    harness,
  )
  assert.equal(code, 5)
  assert.ok(harness.stderrText.includes('内部缺陷'))
})

// ── 冷却闸 ──────────────────────────────────────────────────────────────────

test('冷却闸：命中冷却时抛 COOLDOWN_ACTIVE（可执行 hint 逐字匹配）', async () => {
  const harness = createHarness()
  seedCooldownState(harness)

  await assert.rejects(
    () => runOnce(baseOptions(), harness),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, ERROR_CODES.COOLDOWN_ACTIVE)
      assert.equal(/** @type {any} */ (error).retryable, false)
      assert.equal(
        /** @type {any} */ (error).hint,
        '距上次运行 87 秒，冷却 90 秒；加 --force 强制',
      )
      return true
    },
  )
})

test('冷却闸：连续两次运行，第二次被拦、越过窗口后自动放行', async () => {
  const harness = createHarness()

  const first = await runOnce(baseOptions(), harness)
  assert.equal(first.rows.length, 14)
  const stateAfterFirst = JSON.parse(String(harness.files.get(STATE_FILE)))
  assert.equal(stateAfterFirst.lastRunAtMs, NOW_MS, '第一轮结束必须写冷却戳')

  await assert.rejects(
    () => runOnce(baseOptions({ nowMs: NOW_MS + 3000 }), harness),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, ERROR_CODES.COOLDOWN_ACTIVE)
      return true
    },
  )

  const third = await runOnce(baseOptions({ nowMs: NOW_MS + 91_000 }), harness)
  assert.ok(third.rows.length > 0, '越过冷却窗口后应放行')
})

test('冷却闸：--force 放行并写 warnings += COOLDOWN_OVERRIDDEN', async () => {
  const harness = createHarness()
  seedCooldownState(harness)

  const payload = await runOnce(baseOptions({ force: true }), harness)
  assert.ok(payload.warnings.includes('COOLDOWN_OVERRIDDEN'))
  assert.equal(payload.rows.length, 14)
})

// ── 去重（跨运行） ──────────────────────────────────────────────────────────

test('去重：同一推文连续两轮命中时，第二轮标注「已生成过」且不重复生成', async () => {
  const harness = createHarness()

  const first = await runOnce(baseOptions(), harness)
  const firstCalls = harness.completeCalls
  assert.ok(firstCalls > 0)
  assert.equal(first.drafts.every((draft) => draft.alreadyDrafted !== true), true)

  // 越过冷却窗口后再跑一轮。注意：时间前进会让恰好卡在 j=1000 边界的那条推文
  // 掉到 normal 档（时速随时长下降），因此第二轮的候选数可能少于第一轮。
  const second = await runOnce(baseOptions({ nowMs: NOW_MS + 120_000 }), harness)

  assert.equal(harness.completeCalls, firstCalls, '第二轮不得再次调用模型')
  assert.equal(second.drafts.length, second.rows.length)
  for (const draft of second.drafts) {
    assert.equal(draft.alreadyDrafted, true)
    assert.ok(draft.warnings.some((warning) => warning.includes('已生成过')))
  }

  // 状态里记录的是**第一轮**已开草稿的全部推文（去重表按累积而非本轮候选计算）。
  const state = JSON.parse(String(harness.files.get(STATE_FILE)))
  assert.equal(state.draftedTweetIds.length, first.rows.length)

  // 草稿区（终端视图）必须显示「已生成过」。
  assert.ok(renderDrafts(second.drafts, second.rows).includes('已生成过'))
})

// ── 落盘 ────────────────────────────────────────────────────────────────────

test('落盘：生成 report-<runId>.md 与 runs.jsonl 并推进冷却戳', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)

  assert.ok(payload.reportPaths)
  assert.equal(payload.reportPaths.markdownPath, path.join(OUT_DIR, `report-${payload.runId}.md`))
  assert.equal(payload.reportPaths.jsonlPath, path.join(OUT_DIR, 'runs.jsonl'))

  const markdown = String(harness.files.get(payload.reportPaths.markdownPath))
  assert.ok(markdown.includes('# 推特推文爆速检测与智能截流 · 战报'))
  assert.ok(markdown.includes('## 候选清单'))
  assert.ok(markdown.includes('## 草稿区'))
  assert.ok(markdown.includes('## 数据健康度'))

  const jsonl = String(harness.files.get(path.join(OUT_DIR, 'runs.jsonl')))
  assert.equal(jsonl.trim().split('\n').length, 1)
  const entry = JSON.parse(jsonl.trim())
  assert.equal(entry.runId, payload.runId)
  assert.equal(entry.fetched, 20)
  assert.equal(entry.candidates, 14)
  assert.equal(entry.viral, 5)

  const state = JSON.parse(String(harness.files.get(STATE_FILE)))
  assert.equal(state.lastRunAtMs, NOW_MS)
  assert.equal(state.runs.length, 1)

  // 日志按 runId 分文件写入。
  const logPath = path.join(STATE_ROOT, 'omnimux-intercept', 'logs', `run-${payload.runId}.jsonl`)
  const log = String(harness.files.get(logPath) ?? harness.files.get(path.join(STATE_ROOT, 'logs', `run-${payload.runId}.jsonl`)))
  assert.ok(log.includes('"event":"run.done"'))
})

test('落盘：状态根目录不存在时先建目录（新机器首次运行不得 ENOENT）', async () => {
  const harness = createHarness()
  // 内存 FS 复刻真实语义：未建目录就写文件会抛 ENOENT。
  assert.equal(harness.files.has(STATE_FILE), false)

  const payload = await runOnce(baseOptions(), harness)

  assert.ok(harness.createdDirs.has(path.join(STATE_ROOT, 'omnimux-intercept')))
  assert.equal(harness.files.has(STATE_FILE), true, 'state.json 必须真实写入')
  assert.equal(
    payload.warnings.some((warning) => warning.includes('状态写入失败')),
    false,
    `不得出现状态写入失败：${payload.warnings.join('；')}`,
  )
  assert.ok(payload.reportPaths, '战报同样必须落盘')
})

test('落盘：--dry-run 不产生任何文件', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions({ dryRun: true }), harness)

  assert.equal(payload.reportPaths, null)
  assert.equal(harness.files.size, 0, 'dry-run 不得写任何文件（含状态与日志）')
  assert.equal(payload.meta.dryRun, true)
})

test('落盘：--out-dir 独立于状态目录', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions({ outDir: '/tmp/another-out' }), harness)
  assert.equal(
    /** @type {any} */ (payload.reportPaths).markdownPath,
    path.join('/tmp/another-out', `report-${payload.runId}.md`),
  )
})

// ── 表格视图 ────────────────────────────────────────────────────────────────

test('表格视图：每一行（含表头、分隔行、截断提示行）显示宽度完全相等', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)
  const lines = payload.table.split('\n')

  assert.ok(lines.length >= 3)
  const widths = lines.map((line) => displayWidth(line))
  const expected = widths[0]
  for (const [index, width] of widths.entries()) {
    assert.equal(width, expected, `第 ${index} 行宽度 ${width} 应等于 ${expected}`)
  }
})

test('表格视图：CJK 全角字符（万 / 中文列头）参与宽度对齐', () => {
  const rows = [
    {
      record: {
        id: 'a',
        author: '作者甲',
        authorHandle: 'jia',
        text: '这是一条很长的推文正文'.repeat(6),
        metrics: { likes: 12_000, retweets: 3400, replies: 3 },
        anomalies: [],
      },
      stats: {
        hoursAlive: 2,
        pace: 60_000,
        tier: 'viral',
        exposure: { predicted: 14_980 },
      },
      degraded: false,
      score: 14_980,
    },
    {
      record: {
        id: 'b',
        author: '作者乙',
        authorHandle: 'yi',
        text: '短推文',
        metrics: { likes: 0, retweets: 0, replies: 0 },
        anomalies: ['VIEWS_MISSING'],
      },
      stats: { hoursAlive: 0.5, pace: 900, tier: 'normal', exposure: { predicted: 20 } },
      degraded: true,
      score: 20,
    },
  ]

  const table = renderTable(/** @type {any} */ (rows), { maxRows: 20 })
  const lines = table.split('\n')
  const widths = new Set(lines.map((line) => displayWidth(line)))
  assert.equal(widths.size, 1, `所有行宽度应一致，实际 ${[...widths].join('/')}`)
  assert.ok(table.includes('万'), '超过 1 万的数字用「万」显示')
})

test('表格视图：degraded 行带 ! 警示列，可关闭', () => {
  const rows = [
    {
      record: { id: 'x', author: 'a', authorHandle: 'h', text: 't', metrics: {}, anomalies: ['VIEWS_MISSING'] },
      stats: { hoursAlive: 1, pace: 100, tier: 'normal', exposure: { predicted: 20 } },
      degraded: true,
      score: 20,
    },
  ]

  const withFlag = renderTable(/** @type {any} */ (rows), { showDegraded: true })
  const withoutFlag = renderTable(/** @type {any} */ (rows), { showDegraded: false })

  assert.ok(withFlag.split('\n')[2].startsWith('!'), `实际：${withFlag.split('\n')[2]}`)
  assert.ok(!withoutFlag.split('\n')[2].startsWith('!'))
  assert.ok(!withoutFlag.split('\n')[0].startsWith('! '))
})

test('表格视图：超长推文按 40 字符截断加省略号', () => {
  const rows = [
    {
      record: {
        id: 'x',
        author: 'a',
        authorHandle: 'h',
        text: '这是一条非常长的推文正文'.repeat(10),
        metrics: {},
        anomalies: [],
      },
      stats: { hoursAlive: 1, pace: 100, tier: 'normal', exposure: { predicted: 20 } },
      degraded: false,
      score: 20,
    },
  ]
  const table = renderTable(/** @type {any} */ (rows), { maxRows: 5 })
  assert.ok(table.includes('…'))
  assert.ok(!table.includes('这是一条非常长的推文正文'.repeat(10)), '不得整段输出')
})

test('表格视图：超出 maxRows 时显示截断提示行', () => {
  const rows = Array.from({ length: 5 }, (_value, index) => ({
    record: { id: `r${index}`, author: 'a', authorHandle: 'h', text: 't', metrics: {}, anomalies: [] },
    stats: { hoursAlive: 1, pace: 100, tier: 'normal', exposure: { predicted: 20 } },
    degraded: false,
    score: 20,
  }))
  const table = renderTable(/** @type {any} */ (rows), { maxRows: 2 })
  assert.ok(table.includes('共 5 条，仅显示前 2 条'))
})

test('truncateToWidth / displayWidth 基础契约', () => {
  assert.equal(displayWidth('abc'), 3)
  assert.equal(displayWidth('中文'), 4)
  assert.equal(displayWidth('万'), 2)
  assert.equal(displayWidth('：'), 2)
  assert.equal(displayWidth(''), 0)
  assert.equal(truncateToWidth('abcdefghij', 5), 'abcd…')
  assert.equal(truncateToWidth('中文测试内容', 5), '中文…')
  assert.equal(displayWidth(truncateToWidth('中文测试内容', 5)), 5)
  assert.equal(truncateToWidth('short', 10), 'short')
  assert.equal(truncateToWidth('x', 0), '')
})

test('renderSummary 报告分级分布与数据健康度', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions({ fixturePath: FIXTURE_DIRTY, minTier: 'normal' }), harness)
  const summary = renderSummary(payload.allRows, payload.rows, {
    channel: payload.meta.channel,
    warnings: payload.warnings,
  })
  assert.ok(summary.includes('分级分布：'))
  assert.ok(summary.includes('待截流候选：'))
  assert.ok(summary.includes('数据健康度：'))
  assert.ok(summary.includes('! '))
})

// ── 两视图等价 ──────────────────────────────────────────────────────────────

test('两视图等价：GenUI 表格行数与条目顺序与主清单一致', async () => {
  const harness = createHarness()
  const payload = await runOnce(baseOptions(), harness)

  const tableNode = /** @type {any} */ (payload.genui).items.find(
    (item) => item.type === 'table',
  )
  assert.ok(tableNode)
  assert.equal(tableNode.rows.length, payload.rows.length, '行数必须一致')
  assert.equal(tableNode.total, payload.rows.length)

  for (const [index, row] of payload.rows.entries()) {
    const expectedAuthor = row.record.authorHandle ? `@${row.record.authorHandle}` : row.record.author
    assert.equal(tableNode.rows[index][1], expectedAuthor, `第 ${index} 行作者应一致`)
  }
})

// ── 真实子进程退出码（不依赖网络） ───────────────────────────────────────────

test('真实子进程：--help 退出码 0 且输出中文用法', async () => {
  const { spawnSync } = await import('node:child_process')
  const cliPath = path.join(TEST_DIR, '../src/cli.js')
  const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' })

  assert.equal(result.status, 0)
  assert.ok(result.stdout.includes('推特推文爆速检测与智能截流'))
  assert.ok(result.stdout.includes('--limit'))
  assert.ok(result.stdout.includes('退出码'))
})

test('真实子进程：scan --limit abc 退出码 2', async () => {
  const { spawnSync } = await import('node:child_process')
  const cliPath = path.join(TEST_DIR, '../src/cli.js')
  const result = spawnSync(process.execPath, [cliPath, 'scan', '--limit', 'abc'], { encoding: 'utf8' })

  assert.equal(result.status, 2)
  assert.ok(result.stderr.includes('参数 --limit 必须是 1..200 的整数'))
})
