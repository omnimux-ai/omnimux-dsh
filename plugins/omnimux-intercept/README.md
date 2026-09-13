# omnimux-intercept · 推特推文爆速检测与智能截流

按**存活小时数**计算推文时速，三档判定爆速等级，预估抢评曝光，并为高价值推文生成
高赞评论 / 引用转发**草稿**（只出草稿，不自动发帖）。

- **零 npm 运行时依赖**：全部使用 Node 内置能力（`node:util.parseArgs`、`node:child_process`、`node:fs`、`node:path`、`node:test`）。
- **算法可审计**：PRD 附录 A 的公式只出现在 `src/core/algorithm.js`，是纯函数、可复现、有固定算例锚点。
- **失败可区分**：「抓取失败」（退出码 3）与「今天没有爆款」（退出码 0）严格分开，绝不互相伪装。

---

## 快速开始

```bash
# 在仓库根目录
corepack pnpm --filter omnimux-intercept test       # 跑单测
node plugins/omnimux-intercept/src/cli.js --help    # 看用法

# 抓一轮首页时间线（每批 20 条），列出待截流目标并生成草稿
node plugins/omnimux-intercept/src/cli.js scan

# 离线验收（不需要网络与浏览器登录态）
node plugins/omnimux-intercept/src/cli.js scan \
  --source fixture \
  --fixture plugins/omnimux-intercept/test/fixtures/timeline.json \
  --now 2026-09-13T07:00:00Z

# 只看不写：不生成文案、不落盘
node plugins/omnimux-intercept/src/cli.js scan --dry-run

# 输出 GenUI 看板 spec（交给宿主 / Agent 渲染）
node plugins/omnimux-intercept/src/cli.js scan --format genui
```

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--limit <N>` | `20` | 每批抓取条数，`1..200` |
| `--type <类型>` | `for-you` | `for-you` 或 `following` |
| `--rank-by <主键>` | `exposure` | `exposure`（预估曝光）或 `pace`（时速） |
| `--min-tier <分级>` | `surging` | `normal` / `surging` / `viral`，低于该档不进入候选清单 |
| `--min-exposure <N>` | `0` | 预估曝光下限 |
| `--format <格式>` | `table` | `table` / `json` / `genui` / `md` |
| `--source <数据源>` | `opencli` | `opencli` / `hub` / `fixture` |
| `--fixture <路径>` | — | `--source fixture` 时必填 |
| `--style <类型>` | `reply` | `reply` / `quote` / `both` |
| `--lang <语言>` | `zh` | `zh` / `en` |
| `--max-chars <N>` | `220` | 草稿字数上限（中文） |
| `--out-dir <目录>` | `$DSH_HOME/omnimux-intercept/reports` | 战报输出目录 |
| `--dry-run` | 关 | 只算不生成文案、不落盘 |
| `--force` | 关 | 无视冷却闸（会留痕） |
| `--no-llm` | 关 | 关闭模型通道，直接用离线模板出草稿 |
| `--no-genui` | 关 | 不构建 GenUI 看板 spec |
| `--now <时间>` | 真实时钟 | 覆盖当前时刻（回放核对用） |
| `--verbose` | 关 | 把原始错误原因打到 stderr |

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（**含「本轮无待截流目标」**） |
| `2` | 参数错误 |
| `3` | 数据源不可用或载荷不可解析 |
| `4` | 冷却中且未加 `--force` |
| `5` | 内部错误 |

> `0` 与 `3` 的区别是本系统的业务底线：**绝不让「抓取失败」伪装成「今天没有爆款」**。

## 输出位置

| 产物 | 路径 |
| --- | --- |
| 状态（冷却戳 / 草稿去重表 / 运行台账） | `$DSH_HOME/omnimux-intercept/state.json` |
| 运行日志（JSON Lines） | `$DSH_HOME/omnimux-intercept/logs/run-<runId>.jsonl` |
| Markdown 战报 | `<--out-dir>/report-<runId>.md` |
| 运行台账（追加） | `<--out-dir>/runs.jsonl` |

## 数据源

- **主源**：`opencli twitter timeline -f json --limit 20`（由 `opencli` 负责登录态与反爬）。
  失败时退出码 `3`，`hint` 会给出可执行建议（例如 `opencli doctor` 与 x.com 登录态）。
- **降级源**：OmniMux hub 社媒数据（`omnimux_social_data`，`platform=x`）。
- **离线源**：`--source fixture`，用于测试与回归，不需要任何外部依赖。

## 文案通道（三级降级）

1. **宿主补全**：注入的 `complete()`（`omnimux_text_complete` / `ctx.llm.stream`）
2. **HTTP 直连**：`/v1/chat/completions`（凭据 `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN`，或 `$DSH_HOME/.credentials.yaml`）
3. **离线模板**：内置兜底骨架，无需任何凭据

任一级失败都会**降级并留痕**（写 `warnings`），不会让整条链路失败。

提示词单一真源在 `presets/tiktok-agent/skills/sopilot-social-agents/`，本插件**不复制**它的提示词，
只在运行时按路径读取；读不到时用内置精简模板并写 `TEMPLATE_FALLBACK`。

## 安全与合规

| 护栏 | 参数 |
| --- | --- |
| 请求冷却 | 默认 `90` 秒（`--force` 可越过并留痕） |
| 指数退避 | 3 次重试，延时 `1000 / 2000 / 4000` + ±20% 抖动 |
| 条数硬上限 | `200` 条 |
| 子进程超时 | `30` 秒 |
| 写入面 | 只写 `$DSH_HOME/omnimux-intercept/` 与显式 `--out-dir` |
| 动作面 | **仅产出草稿**，不自动发布 / 点赞 / 关注 |

## 文档

- [`docs/algorithm.md`](docs/algorithm.md) —— 附录 A 公式的权威实现说明 + 边界算例表
- [`docs/shared/README.md`](docs/shared/README.md) —— 对外共享契约：实体字段、错误码、退出码、状态目录
- [`docs/system_design.md`](docs/system_design.md) —— 系统设计与任务分解（架构真源）

## 开发

```bash
node --test                                            # 全部单测
npx tsc -p plugins/omnimux-intercept/tsconfig.json --noEmit   # JSDoc 契约门禁
```
