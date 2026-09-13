# 算法权威说明（PRD 附录 A 的唯一实现）

> **真源声明**：本文件描述的实现只存在于 `src/core/algorithm.js`。
> 全仓其余任何位置出现「时速 / 分级 / 曝光」公式均属缺陷，由 `test/algorithm.test.js` 的
> 「公式只出现在 core/algorithm.js（grep 计数为 1）」用例静态锁定。

## 1. 为什么公式必须本地实现

**【实测】** `opencli twitter timeline -f json` 的输出列只有：
`id, author, bio, text, likes, retweets, replies, views, created_at, url, has_media, media_urls, media_posters, card, quoted_tweet`。

**没有时速、没有分级、没有存活时长。** `created_at` 是唯一时间字段，`views` 是唯一浏览量字段。
因此采集层只做「搬运与解析」，全部业务公式在纯函数层计算 —— 这也是本插件存在的理由。

## 2. 公式（逐字实现，禁止改写）

设 `nowMs` 为当前时刻、`createdAtMs` 为推文创建时刻（均为 epoch ms，**显式注入**）：

| 量 | 公式 | 实现常量 |
| --- | --- | --- |
| 存活小时 `R` | `clamp((nowMs - createdAtMs) / 3_600_000, 1/60, 48)` | `HOURS_ALIVE_MIN=1/60`、`HOURS_ALIVE_MAX=48` |
| 时速 `j` | `views / R` | `R ≥ 1/60 > 0`，不存在除零 |
| 分级 | `j > 8000` → `viral`；`1000 ≤ j ≤ 8000` → `surging`；`j < 1000` → `normal` | `VIRAL_PACE_THRESHOLD=8000`、`SURGING_PACE_THRESHOLD=1000` |
| 时间衰减 | `clamp(6 - R * 0.35, 1.2, 6)` | `TIME_DECAY_MAX/MIN/RATE` |
| 时效加成 | `clamp(1.28 - R / 18, 0.55, 1.28)` | `FRESHNESS_MAX/MIN/DIVISOR` |
| 竞争折扣 | `clamp(1.14 - Math.log10(replies + 1) * 0.22, 0.42, 1.08)` | `COMPETITION_BASE/REPLY_WEIGHT/MAX/MIN` |
| 曝光预测 | `Math.max(20, Math.round(j * 时间衰减 * 时效加成 * 竞争折扣 * 0.04))` | `EXPOSURE_FLOOR=20`、`EXPOSURE_BASE_RATE=0.04` |

`clamp(v, min, max)` 语义为 `min(max(v, min), max)`；非有限输入回退到 `min`（保证输出恒可计算）。

## 3. 固定算例锚点（防实现漂移）

`nowMs` 全部显式注入，因此这四条在**任何机器、任何时刻**都得到同一结果。
`test/algorithm.test.js` 逐位断言下表，且已在本机实跑核对：

| # | 场景 | 输入 `(views, R 小时, replies)` | `j` | 分级 | 拆解 | 期望 `predicted` |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 极新爆款 | `(120000, 2, 3)` | `60000` | `viral` | 衰减 `5.3`、时效 `1.1688888888888889`、竞争 `1.0075468019078482` | `14980` |
| A2 | 老帖飙升 | `(200000, 40, 900)` | `5000` | `surging` | 衰减 `1.2`（触底）、时效 `0.55`（触底）、竞争 `0.48996054598460603`（**未触底**） | `65` |
| A3 | 零曝光兜底 | `(0, 10, 0)` | `0` | `normal` | 衰减 `2.5`、时效 `0.724444…`、竞争 `1.08`（上限） | `20`（`floored=true`） |
| A4 | 未来时间戳 | `(500, -3, 0)` | `30000` | `viral` | `R` 夹到 `1/60`，衰减 `5.994166666666667`（**未达 6 上限**） | 按公式计算，**不抛错** |

> A2 是本套算例中唯一「衰减与时效双触底、竞争项未触底」的组合，专门用于锁死两类实现错误：
> 把 `clamp` 写成 `Math.min/Math.max` 顺序颠倒，以及把 `log10` 误写成 `Math.log`。
> A4 专门用于锁死「未来时间直接报错」与「时间上限夹取方向写反」。

## 4. 分级边界（闭区间 / 开区间混合）

| `j` | 分级 | 备注 |
| --- | --- | --- |
| `7999.99` | `surging` | |
| `8000` | `surging` | **闭区间上界**，最易判错 |
| `8000.01` | `viral` | |
| `999.99` | `normal` | |
| `1000` | `surging` | **闭区间下界**，最易判错 |

## 5. 边界与降级语义

| 场景 | 行为 |
| --- | --- |
| 未来时间戳 | **不报错**；`R` 夹到 `1/60`，打 `CLOCK_SKEW_FUTURE` 标记。绝不因时钟偏移丢弃数据 |
| `views` 缺失 / 空串 / 占位符 | 打 `VIEWS_MISSING`；按 `views = 0` 参与计算，输出层显示 `—` |
| `views` 是非数字串（如 `abc`） | 打 `VIEWS_UNPARSEABLE`；同样按 `0` 参与计算 |
| `views = 0`（真实值） | **不打标记**，`null` 与 `0` 语义严格区分 |
| `replies = 0` | `log10(0 + 1) = 0`，天然安全，竞争折扣取上限 `1.08` |
| `j = 0` | `predicted` 命中 `20` 下限，`floored = true` |

> **为什么解析失败不静默转 0**：静默转 0 会把爆款判成哑帖（时速归零 → 正常档 → 不进候选清单），
> 是本系统最严重的业务事故。因此解析失败返回 `null` 且**必须**打标记透传到输出层，
> 由 `degraded` 与表格的 `!` 列显式可见。

## 6. 数值与排序约定

- 所有对外数字经 `Number.isFinite` 校验，非法值按契约取默认。
- 排序：主键（预估曝光 / 时速）降序 + `id` **码点升序**兜底。
  刻意不用 `localeCompare`（依赖 ICU 版本，跨机可能不同序），保证同一输入在任何机器上输出同序、可做快照回归。
- 单位显示：超过 1 万用「万」；分级显示 `viral→爆款`、`surging→飙升`、`normal→正常`。

## 7. 时间字段格式（设计文档 U1 的核实结论）

**【实测·未消除】2026-09-13 在本机执行真实抓取确认 `created_at` 实际格式时，OpenCLI 返回：**

```
exit code 1，stdout 为空，stderr 为 YAML：
ok: false
error:
  code: COMMAND_EXEC
  message: >-
    Pre-navigation to https://x.com failed: attach failed: Cannot access a
    chrome-extension:// URL of different extension. …
  exitCode: 1
```

属**本机浏览器桥接态问题**（扩展冲突 / 未登录），非适配器缺失。
因此 **U1 至今仍未消除** —— 无法确认 `created_at` 的真实格式。

**实现采取的对策（防御式，两种格式都支持）**：

| 输入形态 | 处理 |
| --- | --- |
| ISO 8601（如 `2026-09-13T06:00:00.000Z`） | `Date.parse` |
| epoch 毫秒 / 秒（10 位数字按秒） | 直接换算 |
| 中文相对时间（`30 分钟前` / `2 小时前` / `3 天前` / `刚刚`） | 以**注入的 `nowMs`** 为基准回推 |
| 英文相对时间（`5m` / `2 hours` / `3d` / `just now`） | 同上 |
| `Sep 13` / `Sep 13, 2026` | 缺年份时用 `nowMs` 的 UTC 年份，按 UTC 解析 |
| 无法解析 | 打 `CREATED_AT_INVALID`，按 `R = 1/60` 继续，**不抛错** |

相对时间的基准**必须是注入的 `nowMs`**，禁止使用真实时钟 —— 由 `test/algorithm.test.js` 的
时间解析用例与纯函数门禁共同锁定。

**给后续维护者**：一旦本机桥接恢复，请执行一次真实抓取，把真实片段写进
`test/fixtures/timeline.json`，并回来更新本节结论。

## 8. 验证方式

```bash
node --test plugins/omnimux-intercept/test/algorithm.test.js
```

该文件同时承担**纯函数门禁**：扫描 `src/core/**` 源码文本，断言不出现
`Date.now`、`process.`、`require(`、`from 'node:`、`import fs`、`setTimeout`、`console.`。
