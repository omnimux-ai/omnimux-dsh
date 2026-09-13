# 对外共享契约

本文件是 `omnimux-intercept` 对外的**稳定契约**：字段语义、错误码、退出码、状态目录。
其他插件、Agent、脚本都可以依赖这里的内容；改动它们属于破坏性变更。

## 1. 领域实体

### `TweetRecord` —— 采集层的规范实体

所有字段都已是干净类型，下游不再做解析。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 推文 id（源缺失时为空串） |
| `author` | `string` | 显示名 |
| `authorHandle` | `string` | 不含 `@`；缺失时依次从 `author`（`@xxx`）、`url` 兜底 |
| `text` | `string` | 推文正文 |
| `createdAtMs` | `number` | epoch ms（UTC），**已解析**；不可解析时等于注入的 `nowMs` |
| `url` | `string` | 推文链接 |
| `metrics` | `TweetMetrics` | 互动指标，见下 |
| `hasMedia` | `boolean` | 是否有媒体（含从 `mediaUrls` 推断） |
| `mediaUrls` | `string[]` | 媒体直链 |
| `quotedTweetId` | `string \| null` | 被引用推文 id |
| `source` | `'opencli' \| 'hub' \| 'fixture'` | 数据源 |
| `anomalies` | `DataAnomaly[]` | 采集阶段发现的数据缺陷，**码点升序**（保证可比对） |

### `TweetMetrics`

`{ views, likes, retweets, replies, bookmarks }`，每一项都是 `number | null`。

> **`null` 与 `0` 不可互换**：`null` = 源未提供（输出显示 `—` 并标 degraded）；
> `0` = 源明确给了 0。两者参与计算时都按 0 处理，但输出层必须能区分。
> `bookmarks` 在 OpenCLI 的 timeline 列表面未提供，允许恒为 `null`，且**不参与任何计算**。

### `DataAnomaly`

| 值 | 触发条件 |
| --- | --- |
| `VIEWS_MISSING` | `views` 字段缺失 / `null` / 空串 / 语义占位符（`—`、`N/A`、`null`…） |
| `VIEWS_UNPARSEABLE` | `views` 有值但解析不出（如 `abc`、`-5`） |
| `CLOCK_SKEW_FUTURE` | `created_at` 晚于 `nowMs`（时钟偏移） |
| `CREATED_AT_INVALID` | `created_at` 无法解析 |
| `AUTHOR_MISSING` | 作者名与 handle 都缺失，且 url 也取不到作者 |

### `TweetStats` —— 算法层输出（可审计，便于回放核对）

| 字段 | 说明 |
| --- | --- |
| `hoursAlive` | `R`，已夹取到 `[1/60, 48]` |
| `hoursAliveRaw` | 未经夹取的原始差值（诊断用，可为负） |
| `pace` | `j = views / R` |
| `tier` | `'viral' \| 'surging' \| 'normal'` |
| `exposure` | `{ timeDecay, freshnessBonus, competition, baseRate, predicted, floored }` |

### `ScoredTweet` —— 核心层对外的唯一产物

| 字段 | 说明 |
| --- | --- |
| `record` | `TweetRecord` |
| `stats` | `TweetStats` |
| `degraded` | 任一 anomaly 存在 |
| `score` | `= stats.exposure.predicted`（排序主键之一） |

## 2. 错误码

| 错误码 | 退出码 | 致命 | 可重试 | 含义 |
| --- | --- | --- | --- | --- |
| `ARG_INVALID` | `2` | 是 | 否 | 参数错误 |
| `SOURCE_UNAVAILABLE` | `3` | 是 | **是** | 源不可用（进程起不来 / x.com 不可达 / 浏览器桥接失败） |
| `SOURCE_BAD_PAYLOAD` | `3` | 是 | 否 | 载荷不可解析 |
| `SOURCE_AUTH` | `3` | 是 | 否 | 未登录 x.com |
| `COOLDOWN_ACTIVE` | `4` | 是 | 否 | 冷却中 |
| `INTERNAL` | `5` | 是 | 否 | 未预期异常 |
| `LLM_UNAVAILABLE` | `0` | 否 | — | 文案降级（只写 `warnings`） |
| `TEMPLATE_FALLBACK` | `0` | 否 | — | 用了内置模板（只写 `warnings`） |

**三条铁律**

1. **「取不到数据」绝不返回空数组** —— 空数组只能表示「真的没有推文」。
2. **非致命降级必须留痕** —— 每次降级写 `warnings`，并出现在输出与 `runs.jsonl`。
3. **`hint` 必须可执行** —— 禁止「未知错误」这类无信息文案；必须给出下一步动作。

## 3. 退出码

| 退出码 | 含义 | 典型场景 |
| --- | --- | --- |
| `0` | 成功（**含「无待截流目标」**） | 正常一轮 |
| `2` | 参数错误 | 非法 `--limit` / 未知子命令 |
| `3` | 数据源不可用或载荷不可解析 | 浏览器桥接失败、x.com 不可达、JSON 损坏 |
| `4` | 冷却中且未加 `--force` | 距上次运行 < 90 秒 |
| `5` | 内部错误 | stack 只进日志，不进 stdout |

## 4. 输出流约定

- **stdout 只输出业务结果**（表格 / JSON / GenUI spec / Markdown），保证可管道。
- **诊断与日志走 stderr** 与 JSONL 日志文件。
- **唯一例外**：冷却提示（退出码 `4`）走 stdout —— 它是该次运行的最终答案而非诊断。

## 5. 状态目录

只写 `$DSH_HOME/omnimux-intercept/`（`$DSH_HOME` 缺省为 `~/.dsh`）与显式 `--out-dir`。

| 文件 | 内容 |
| --- | --- |
| `state.json` | `{ version, lastRunAtMs, draftedTweetIds[], runs[] }` |
| `logs/run-<runId>.jsonl` | 单轮运行日志（JSON Lines） |
| `reports/report-<runId>.md` | Markdown 战报（默认输出目录） |
| `reports/runs.jsonl` | 运行台账（追加） |

- `runId` 格式：`YYYYMMDDTHHmmssZ-<4 位十六进制>`（UTC + 随机后缀）。
- 日志单行结构：`{"ts":"…ISO 8601 UTC…","level":"info","event":"fetch.done","data":{…}}`。
- `event` 命名空间（**仅这些**）：`run.start` `guard.check` `guard.block` `fetch.start`
  `fetch.done` `fetch.retry` `parse.done` `score.done` `rank.done` `llm.call` `llm.fallback`
  `render.table` `render.genui` `report.written` `run.done` `run.error`。
- **脱敏**：日志与 stdout 严禁出现 token、cookie、`OMNIMUX_API_KEY` 值、credential 文件内容；
  `data` 里最多出现键名（敏感键值统一替换为 `[redacted]`）。
- 损坏或版本不符的 `state.json` 一律回退为空状态，**不抛错**。

## 6. 依赖注入契约（供测试与宿主复用）

外部世界只有三个注入点，其余模块一律不 import 默认实现：

```js
// 主数据源（OpenCLI 子进程）
run(argv: string[], options: { timeoutMs, signal? }) -> Promise<{ stdout, stderr, code }>

// 模型补全
complete(input: { system, prompt, maxTokens?, signal? }) -> Promise<string>

// 落盘（仅 report-writer 与 run-store 使用）
writeFile(path, content) -> Promise<void>
appendFile(path, content) -> Promise<void>
ensureDir(path) -> Promise<void>
```

- 未注入 `run` 时采集层抛 `INTERNAL`（并说明「默认 run 实现只在 `src/cli.js` 装配」）。
- 未注入 `writeFile` 时，编排层视为「不落盘」（单测因此天然无副作用）。
- 未注入 `nowMs` 时采集层抛 `INTERNAL` —— 全仓只有一个取时钟的入口：`pipeline.js` 的
  `options.nowMs ?? Date.now()`。

## 7. GenUI 看板 spec

`--format genui` 输出符合 `dsh-ui` 白名单的 spec：

- 组件取自白名单：`stat` / `table` / `list` / `callout` / `badge` / `keyvalue` / `code`
  + 必要布局容器 `row` / `col` / `text` / `divider`。
- 根节点 ≤ 8、嵌套 ≤ 8 层、组件节点总数 ≤ 200。
- 结构：1 个 `stat`（待截流条数）+ 分级 `badge` 行 + 1 个 `table`（候选清单，主组件）
  + 1 个 `callout`（数据健康度，有 anomaly 时 `tone = 'warning'`）+ 1 个 `keyvalue`（运行元信息）。
- 表格行数与候选清单**严格相等**，条目顺序一致（防两个视图各算一遍）。
