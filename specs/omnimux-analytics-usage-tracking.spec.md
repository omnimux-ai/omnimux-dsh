# omnimux-analytics 埋点契约对齐 + 功能页面使用埋点

Issue: #1658 · Track B · 插件：`omnimux-analytics` · 风险初判 R2

## 1. 目标

让 `omnimux-analytics` 的使用埋点**真的能发出去**，并补上「功能页面使用」这一类事件。

现状（已取证）：插件自落地起从未成功上报过任何事件。报文使用旧版字段 `websiteId`，线上自托管 Umami 实例（`https://analytics.omnimux.ai`）要求 `payload` 中三选一提供 `website` / `link` / `pixel`；非 2xx 被队列静默丢弃，因此故障不可见。

用户已确认的范围：**只动本仓库插件侧**，独立站点，不碰桌面壳、不影响安装包。

## 2. 验收标准（可观察）

| # | 标准 | 判定方式 |
| --- | --- | --- |
| A1 | 上报报文结构与线上实例契约一致 | 以全零站点编号向线上 `POST /api/send` 发送**新报文**，返回 `400 Website not found.`（结构通过、进入站点查找）；若返回 `Exactly one of website, link, or pixel must be provided` 则视为失败 |
| A2 | 报文不再出现旧字段 | 单测断言 payload 含 `website` 且 **不**含 `websiteId` |
| A3 | 首层页面打开上报 | 派发 `dsh-product-stage` 事件（`detail.id = 'omnimux-assets'`）后，宿主队列收到 `stage-open`，数据含 `stage=omnimux-assets` |
| A4 | 首层页面关闭上报并带停留时长 | 随后派发 `detail.id = ''`，宿主队列收到 `stage-close`，数据含 `stage` 与 `dwellMs ≥ 0` |
| A5 | 汇聚路由只接受白名单 | 未知事件名 / 未知字段 / 超长值 / 非 POST → 拒绝（4xx），不入队；合法请求 → 200 且入队 |
| A6 | 埋点失败永不影响产品 | 队列发送失败、路由异常均不得抛出到调用方；插件缺站点编号时 soft-disable，路由仍可用但只计数不发送 |
| A7 | 线上契约可自检 | `node plugins/omnimux-analytics/scripts/contract-probe.mjs` 输出 `CONTRACT OK`（须联网，手动执行；CI 不联网） |
| A8 | 插件测试全绿 | `pnpm --filter omnimux-analytics test` 退出码 0 |

## 3. 命令

```sh
# 单测（离线，CI 用）
pnpm --filter omnimux-analytics test

# 线上契约自检（手动，联网，不写真实站点）
node plugins/omnimux-analytics/scripts/contract-probe.mjs

# 静态检查（仓库级）
pnpm test:gates
```

## 4. 结构

| 路径 | 作用 |
| --- | --- |
| `plugins/omnimux-analytics/src/queue.js` | 宿主侧事件队列与 Umami 上报（契约真源） |
| `plugins/omnimux-analytics/src/stage-events.js` | 页面事件的**白名单校验**（新增，纯函数） |
| `plugins/omnimux-analytics/src/http-routes.js` | 宿主汇聚路由 `POST /omnimux/analytics/event`（新增） |
| `plugins/omnimux-analytics/src/index.js` | 组装：队列 + 路由 + 管线埋点 |
| `plugins/omnimux-analytics/src/client/stage-tracker.js` | 渲染层：订阅 `window.__omnimuxStage` 的 `dsh-product-stage`（新增） |
| `plugins/omnimux-analytics/scripts/contract-probe.mjs` | 线上契约自检（新增） |

## 5. 数据契约

**线上实例（权威）**：`POST ${umamiUrl}/api/send`

```json
{ "type": "event",
  "payload": { "website": "<站点编号>", "hostname": "…", "url": "…", "title": "…",
               "language": "en-US", "referrer": "", "screen": "", "name": "…", "data": { } } }
```

**跨插件页面缝隙（枢纽官方暴露，非 hub 内部）**：`window.__omnimuxStage` = `{ claim, release, PRODUCT_STAGE_EVENT, readBox }`，
`PRODUCT_STAGE_EVENT === 'dsh-product-stage'`，在 `window` 上以 `CustomEvent` 派发，`detail = { id }`；`id` 为空串表示离开。

**事件白名单**：`stage-open` / `stage-close`；字段白名单：`stage`（1–64 安全字符）、`dwellMs`（0–86400000 整数）。

## 6. 隐私边界（不变，且加强）

- 永不发送 arguments、提示词、输出内容、错误 message。
- 渲染层可上报的只有白名单事件名与白名单字段，宿主**不接受自由载荷**；`stage` 值经字符集校验，避免注入任意文本。
- 站点编号只在宿主侧配置与使用，不注入渲染层。

## 7. 非目标

- 不改桌面壳仓库（安装 / 启动 / 运行时长属第二步，另一轮授权）。
- 不引入安装编号或 `identify`（第二步）。
- 不改站点归属（同实例、独立站点）。
- 不向任何真实站点写入事件。

## 8. 验证步骤（本任务）

1. `pnpm --filter omnimux-analytics test` → 全绿（A2/A3/A4/A5/A6）。
2. `node scripts/contract-probe.mjs` → `CONTRACT OK`（A1/A7）。
3. 隔离工作树内真实浏览器验证：页面加载无报错、渲染层实际发出的请求到达 `POST /omnimux/analytics/event`（A3–A5 的运行时形态）。
4. `pnpm test:gates` → 0 违规。
