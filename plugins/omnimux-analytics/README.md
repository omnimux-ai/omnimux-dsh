# omnimux-analytics

OmniMux 产品插件用量埋点。**一个 host 端 hook 插件**，观察 DSH 全局工具执行管线，把所有产品插件（omnimux-video / omnimux / omnimux-accounts / omnimux-assets / omnimux-gallery / omnimux-workflow / omnimux-market）的工具调用、会话启动上报到 **OmniMux 同款 Umami 实例**（`analytics.omnimux.ai`），在同一个后台管理。

无需改动任何被统计插件：新插件上线后自动被覆盖（按工具名前缀归属，未匹配的落 `other` 不丢数据）。

## 工作原理

- `tools/execute` — 记录每次派发的开始时间（管线全局，所有插件可见）；
- `tools/result` — 观察不可变最终结果（只读观察点，失败被管线隔离），上报：
  `plugin` / `tool` / `isError` / `durationMs` / `agent` / `errorName` / `errorCode`；
- `agent/session-start` — 上报会话启动：`agent` / `source`；
- 插件加载时上报一次 `plugin-load`（含插件版本）；
- `POST /omnimux-analytics/event` — 渲染层上报**首层页面使用**：渲染半边订阅枢纽以官方跨插件缝隙暴露的
  `window.__omnimuxStage`（事件名 `dsh-product-stage`），页面打开/关闭时上报 `stage-open` / `stage-close`
  （含页面标识与停留时长 `dwellMs`）。队列由宿主持有，渲染层不接触站点编号。

路由用**本插件自有路径**（`/omnimux-analytics/event`），不占用枢纽已在用的 `/omnimux/analytics`（社媒数据看板前缀）。

**隐私红线**：只发工具名、结果、耗时、错误名/错误码，以及经白名单校验的页面标识与停留时长；**永不发送 arguments、提示词、输出内容或错误 message**（错误 message 可能回显调用输入）。渲染层上报走**封闭白名单**：只接受 `stage-open` / `stage-close` 两个事件名与 `stage` / `dwellMs` 两个字段，其余一律 400 拒收。

## 配置

插件入口在 `cordis.patch.yml` 的 `omnimux-analytics` 行。启用：在 **profile 层**（user cordis.patch.yml）给该行加 `config`（不要改 bundle 层）：

```yaml
- insert:
    - id: omnimux-analytics
      name: omnimux-analytics
      config:
        enabled: true
        websiteId: 00000000-0000-0000-0000-000000000000   # ← 必填
        umamiUrl: https://analytics.omnimux.ai             # 可选，默认为此值
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | 见下 | 显式 `true` 且缺 `websiteId` → 加载失败（fail loud）；完全不配 → soft-disable 仅告警，不崩 profile |
| `websiteId` | `''` | Umami 后台（`analytics.omnimux.ai` → Settings → Websites → Add website）新建站点后取得；与 OmniMux 主站互不干扰 |
| `umamiUrl` | `https://analytics.omnimux.ai` | 自托管 Umami 基址（同一个实例 = 同一个后台） |
| `hostname` | `omnimux-plugins` | 上报事件的 hostname 维度 |
| `sampleRate` | `1` | 采样率 [0,1] |
| `flushIntervalMs` | `5000` | 批量刷新窗口；`0` = 立即发送 |
| `maxQueue` | `500` | 队列上限，溢出丢最旧 |
| `trackSessions` | `true` | 是否上报会话启动 |
| `trackSubCalls` | `false` | 是否上报 Code Mode 子派发（默认跳过，避免噪声） |
| `toolEventName` / `sessionEventName` / `loadEventName` | `tool-call` / `session-start` / `plugin-load` | 事件名 |
| `pluginMap` | 见 `src/config.js` | 工具名前缀 → 插件 id（最长前缀优先；`null` 删除某前缀）。默认覆盖 8 个产品插件 |

### 默认归属映射

| 前缀 | 插件 |
|---|---|
| `video_` | omnimux-video |
| `assets_` | omnimux-assets |
| `plaza_` | omnimux-market |
| `workflow_` | omnimux-workflow |
| `skillhub`（含 `skillhub_*`） | omnimux-market |
| `omnimux_` | omnimux |

## 上报协议

每个事件一条 `POST ${umamiUrl}/api/send`（Umami collection API）：

```json
{
  "type": "event",
  "payload": {
    "website": "...",
    "hostname": "omnimux-plugins",
    "url": "omnimux://plugins",
    "name": "tool-call",
    "data": { "plugin": "omnimux-workflow", "tool": "workflow_run", "isError": false, "durationMs": 1234, "agent": "alpha" }
  }
}
```

**线上契约以实例自己的 `/script.js` 为准**：`payload` 必须且只能提供 `website` / `link` / `pixel` 之一。
曾经的实现把后台属性名 `websiteId` 当成线上字段发送，结果是**每一条事件都被 `400 bad-request` 拒收**，而队列对非 2xx 静默丢弃 —— 采集静默死亡且无任何可见报错。任何凭据名与线上字段名的混淆都会重现这个故障，因此：

```sh
node scripts/contract-probe.mjs            # 手动执行，需联网；CI 不联网
```

探针用**不存在的站点编号**发送队列真实生成的报文：结构通过则实例回 `Website not found.`（`CONTRACT OK`），并附带一次反向校验确认旧字段仍被拒收。不会向任何真实站点写入数据。

并发上限 4、单请求 8s 超时、失败仅计入 `stats.failed`（默认日志级别不可见，异常不外抛）——**埋点永不影响工具管线**。

## 开发与发布

在隔离 worktree 执行相关测试与静态检查，并完成独立评审：

```sh
pnpm --filter omnimux-analytics test
node plugins/omnimux-analytics/scripts/contract-probe.mjs   # 手动，联网
```

PR 通过 required CI/MQ 合入 `main` 后，按[开发环境合同](../../docs/contracts/dev-pipeline.md)从正式 fork 入口 `yarn omnimux:sync omnimux-analytics` 物化 Dev。需要重新加载 Host 时核对目标和占用情况，再按授权重启 Dev；浏览器验收在 45120 使用 ego-browser 与共享 `verify:live`。没有合入前独立运行环境，Dev/Prod 不接收未合并 worktree，生产发布仍需独立授权。

需要采集时，在已授权 Dev profile 配置上文的 `config.websiteId`；站点创建与账号写入按现有授权边界执行。

## 看数据

Umami 后台（`https://analytics.omnimux.ai`）→ 选择为该插件建的 Site → **Events** 页：

- `tool-call`：各插件的工具调用量、失败率（`data.isError`）、耗时（`data.durationMs`）、agent 分布；
- `session-start`：会话启动量（哪些 agent 在用什么）；
- `plugin-load`：插件装载次数 / 版本分布（可发现旧版本仍在跑）；
- `stage-open` / `stage-close`：首层页面使用（`data.stage` 是页面标识，`stage-close` 另带 `data.dwellMs` 停留时长）。

按 `data.plugin` 过滤即可对比各插件的使用情况；按 `data.stage` 过滤即可看各功能页面的打开次数与停留时长。

**数据口径（务必先读）**：`stage-open` / `stage-close` 只覆盖 **claim 产品舞台的「舞台型」一级页面**。按 workbench-split 合同，资产 / 产品 / 账号 / 灵感 / 发布 / 分析 等一级页面以 workbench Tab 承载且**不得 claim 产品舞台**，因此**不计入**这两类事件（也不产生停留时长）。请把它们读作「舞台型一级页面使用率」，**不要**当作全站页面覆盖率；workbench Tab 的打开统计需另立事件，本插件暂无。离开页面（关闭标签页 / 导航）时会补报最后一段停留时长；切到后台**不算**离开，时间仍计入同一次访问。
