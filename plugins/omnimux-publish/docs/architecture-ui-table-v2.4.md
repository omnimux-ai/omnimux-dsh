# dsh-publish Table 扩展 + 状态中文化架构（PRD-v2.4）

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境、旧 `dev start` 与合入前浏览器验收要求退役，产品和布局层级不变。当前流程见 [dev-pipeline](../../../docs/contracts/dev-pipeline.md) 和 [plugin-qa](../../../docs/contracts/plugin-qa.md)：worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120/ego 验收。历史结果不重标。

架构：高见远 ／ 输入：主理人转交「许清楚定界」——Table 14 列（含 8 维指标槽 + ⋮）、六态中文全链路、demo/index.html 与架构文档改动范围  
版本观察：沿用 `docs/architecture.md`（harness `141eb6fef8`）+ `docs/architecture-ui-slim.md`（v2.2 诚实空值）+ `docs/architecture-ui-layout-v2.3.md`（四层壳）  
核对日期：2026-08-25  
官方证据基线：Skill `build-deepseek-harness-plugin` / `official-practices.md`；Slot 仍是既有 `shell.overlay`；primitives `Menu` + `IconEllipsisOutline16` 已在本包 `dsh.client.inject` 的 `@deepseek-ai/dsh-client-ui-primitives` 中核实。

---

## 0. 选型结论（一句话可执行）

**挂载点 = 既有 `ctx.slots` `shell.overlay`（id `dsh-publish-stage`）内的 Table / Cards / Calendar / Drawer 投影层，形态 = 函数插件（Host/Client 双半边装配不变），产物 = dsh.bundle。**

本轮是**展示合同增量**，不是新插件、不是新工具、不是新 Service、不改账本 schema。Table 把 8 维指标列恢复为**诚实空槽**（无真源一律 `-`）；状态中文收口到唯一 locale map，Grid / Table / Calendar / Drawer 同源。

---

## 1. 归属映射（逐项排除 → 唯一选型）

| 候选 | 裁决 | 理由 |
|---|---|---|
| 新模型可见工具 `ctx.tools`（如 `publish_get_metrics`） | **否** | hub `omnimux_publish_get` 实证只有 `{id, status}`（`docs/hub-tool-contracts.md` §3）。新工具会把无真源字段写进 system prompt。 |
| 接 hub `omnimux_analytics_posts` 填 Likes/Views | **否（本轮）** | analytics 是另一条 official-only 产品面（`docs/contracts/hub.md`），不在 publish 账本契约内。跨插件硬接会在 analytics 不可用时继续撒谎。列槽位先稳住，真源来了再填同一 ViewModel。 |
| 把 metrics 写入 `records.json` | **否** | 账本字段闭合见 `src/store.js`；无接口的数字落盘 = 假快照，卸载/升级都会脏。 |
| 新用户命令 `ctx.commands` | **否** | 无新命令语义。 |
| 后台任务 `ctx.jobs` | **否** | 已有结论：账本在 `records.json`，不用 jobs。 |
| 会话事件 waterfall / serial | **否** | 无新增模型可见输入；不扩 SessionEventMap。 |
| 对外 Service 三层 | **否** | 不对外提供指标服务。 |
| LLM 适配器 | **否** | 与模型提供方无关。 |
| 新 Client Slot / 官方 `details` 列 | **否** | 详情走舞台内抽屉，禁止 `layout.openDetails`。 |
| 会话内 `cordis_define` 动态包 | **否** | 本包已是可安装 `dsh.bundle`，两套产物严禁混用。 |
| 改官方 `packages/` 或另起插件 | **否** | 官方包只读；发布中心已是 `personal/dsh-publish` Mixed bundle。 |
| 给 `dsh-ui-kit` 加 Menu | **否** | kit 无 Menu；primitives 已导出 `Menu`（`Menu.d.ts` 核实）。行菜单用 primitives，触发器用 kit `IconButton`。 |
| 新增 Config `ui.metricsEnabled` | **否** | 没有真源的开关仍会诱导后人接假数据（slim §6 仍成立）。列按截图合同**恒显**，值按空槽合同恒为 `-`。 |
| **既有 overlay 投影层：Table 列槽扩展 + 全局 `displayStatus`/`formatMetric`** | **是** | 可卸载（fiber 撤销 Slot/locale/CSS）、可组合（不抢 overlay id）、升级不翻车（Host 契约与账本零 diff）。 |

被否决后的唯一可执行句：**不新增 Host 能力；Client 增加 Table 列槽与行菜单，locale 收口六态中文；demo 先验收；生产按同一合同落地。**

### 1.1 与 v2.2 / v2.3 的覆盖关系（必须写死，避免工程师各执一词）

| 条款 | v2.2 slim | **v2.4 本文件** |
|---|---|---|
| Table 8 维指标**列** | 删除 | **恢复为展示槽**（截图对齐） |
| 指标**数字** / 账本字段 / analytics 接入 | 禁止 | **继续禁止** |
| 空值展示 | 当时用「删列」避免 `-` 冒充已接入 | **允许且只允许 `-`**，颜色 `--dsw-alias-label-tertiary`；禁止 `0`、`--`、空白、`N/A` |
| Cards 8 格指标看板 | 删除 | **继续禁止** |
| Drawer 互动数据看板 | 删除 | **继续禁止** |
| Calendar pill 阅读数 | 删除 | **继续禁止** |
| CSV 导出指标列 | 禁止 | **继续禁止**（导出仍是编排快照，不把空槽固化成数据） |
| Profile 列 | 删除 | **继续禁止** |
| 四层壳 / 五 Tab / 三视图 | v2.3 | **不动** |

一句话：**v2.4 只覆盖「Table 不许出现指标列」；不覆盖「不许假装有数据」。** `-` 是「无真源」的诚实字形，不是已接入的占位。

---

## 2. 真源核对（禁止凭记忆补数列）

### 2.1 账本有什么（`src/store.js`）

记录：`id, type, status, title, description, topics, media_ids, cover_media_id, settings, account_ids, uploads, error, subtasks[], created_at, updated_at, submitted_at`

子任务：`id, record_id, account_id, platform, status, post_id, raw_status, error, attempts, submitted_at, settled_at`

列表投影额外：`aggregate`、`subtask_summary`

**没有**：`likes / comments / shares / saves / clicks / views / impressions / reach`

`aggregateStatus` 返回值闭合为 `draft | publishing | partial_failed | failed | published`。**没有** `reviewing`（审核中是 in-flight 覆盖层，见 §4.2）。

### 2.2 hub 发布通道有什么

`omnimux_publish_get`：`{ data: { id, status } }`。无互动指标。

### 2.3 现状违约（本轮要修）

| 表面 | 现状 | 合同 |
|---|---|---|
| demo Table | 5 列，无指标槽、无 ⋮ | 14 列 |
| demo 状态文案 | pill 直接渲染英文 `rec.status` | 中文六态 |
| `src/client/locales.js` | `agg.publishing=正在发布`、`agg.failed=发布失败`、缺 `agg.reviewing` | `发布中` / `失败` / `审核中` |
| `aggregateOf` / `StatusChip` | reviewing in-flight 显示成「正在发布」 | 覆盖层显示「审核中」 |
| 生产列表 | 只有扁卡片，无 Table | v2.3 已规划 `RecordsTable`；本轮列合同改为 14 列 |
| 行操作 | 草稿卡内嵌删除按钮；无统一 ⋮ | 四动作按状态显隐 |

---

## 3. 架构图（文字版层级）

```
dsh-publish（既有 Mixed bundle，本轮不改装配）
├── Host（零 diff：工具 / 账本 / HTTP）
│   ├── ctx.tools × 9 publish_*
│   ├── ctx.systemPrompt section publish:ops
│   ├── webServer prefix /dsh-publish
│   └── RecordStore records.json（schema 1，无指标字段）
│
└── Client shell.overlay#dsh-publish-stage
    ├── locale NS=dsh-publish（本轮改 agg.* 六态文案）
    ├── displayStatus(record)     ← 唯一状态投影
    ├── formatMetric(value)       ← 唯一空槽投影（恒 '-'）
    ├── rowActions(record)        ← 唯一 ⋮ 菜单投影
    ├── Layer 1–3（v2.3 四层壳，不动）
    └── Layer 4
          ├── Cards View     状态走 displayStatus；禁止指标格
          ├── Table View     14 列（本轮主改）
          ├── Calendar View  状态色条 + 中文 title；禁止指标
          └── Drawer         状态走 displayStatus；禁止指标看板
                ⋮ Menu（primitives Menu, portal）
```

数据流（无环）：

```
records.json ──GET /dsh-publish/records ──┐
GET /omnimux/accounts（标签 join，可选）───┤
                                          ▼
                         ViewModel { record, displayStatus, metrics: empty, actions }
                                          │
                    ┌───────────┬─────────┼──────────┐
                    ▼           ▼         ▼          ▼
                 Cards       Table    Calendar     Drawer
```

Host `listViews` **不**补 metrics 字段。Client 合成 `metrics = null` 对象；日后若接 analytics，只填同一 8 个 key，Table 列不必再改。

---

## 4. Table View 扩展合同

### 4.1 列结构（从左到右，闭合 14 列）

| # | 列 | 表头 | 数据 | 对齐 | 宽 | 排序 | 交互 |
|---|---|---|---|---|---|---|---|
| 1 | select | `[ ]` | 行 id | 中 | 32px | 否 | 批量勾选；全选只作用于当前过滤结果 |
| 2 | content | `Content` | 封面 + `title \|\| description` 截断 | 左 | 240–360px，sticky left | 否 | 点击行开抽屉 |
| 3 | platforms | `Platforms` | 已提交 `uniq(subtasks[].platform)` 图标簇；草稿 join 账号 platform，无则 `—` | 左 | 88px | 否 | — |
| 4 | date | `Date` | 定时 `settings.schedule_at` + Clock SVG；否则已提交 `submitted_at`、草稿 `updated_at` | 左 | 140px | 是，默认降序 | — |
| 5 | status | `Status` | `displayStatus` → 中文 pill | 左 | 96px | 是，按枚举序 | — |
| 6 | likes | Heart SVG + `aria-label="Likes"` | `formatMetric(metrics.likes)` | 中 | 56px | **否** | — |
| 7 | comments | MessageCircle SVG + `Cmts` | `formatMetric(metrics.comments)` | 中 | 56px | 否 | — |
| 8 | shares | Repeat2 SVG + `Shrs` | `formatMetric(metrics.shares)` | 中 | 56px | 否 | — |
| 9 | saves | Bookmark SVG + `Saves` | `formatMetric(metrics.saves)` | 中 | 56px | 否 | — |
| 10 | clicks | MousePointer SVG + `Clicks` | `formatMetric(metrics.clicks)` | 中 | 56px | 否 | — |
| 11 | views | Eye SVG + `Views` | `formatMetric(metrics.views)` | 中 | 56px | 否 | — |
| 12 | impressions | TrendingUp SVG + `Impr.` | `formatMetric(metrics.impressions)` | 中 | 56px | 否 | — |
| 13 | reach | Users SVG + `Reach` | `formatMetric(metrics.reach)` | 中 | 56px | 否 | — |
| 14 | actions | `⋮` 视觉 / `aria-label="更多操作"` | 行菜单触发器 | 中 | 40px，sticky right | 否 | 见 §4.4 |

空态 `colspan="14"`。容器 `overflow-x: auto`。禁止再加 Profile 列。禁止把指标列做成可点「已接入」的假链接。

### 4.2 表头图标（截图对齐，生产禁 emoji）

截图字符 `♡ 💬 🔀 🔖 🖱 👁 📈 👥` 只作**视觉对照**，不是 DOM 文案。

| 列 | 对照字符 | 实现 | 来源 |
|---|---|---|---|
| Likes | ♡ | 14×14 线性心形，`stroke=currentColor` | 生产优先 primitives `IconLikeOutline16`；demo 内联 SVG |
| Cmts | 💬 | 气泡 | 本地 `metric-icons` 内联 SVG（lucide MessageCircle 路径） |
| Shrs | 🔀 | 分享/转发 | primitives `IconShareOutline16` 或内联 Repeat2 |
| Saves | 🔖 | 书签 | 内联 Bookmark |
| Clicks | 🖱 | 指针 | 内联 MousePointerClick |
| Views | 👁 | 眼睛 | 内联 Eye |
| Impr. | 📈 | 趋势 | 内联 TrendingUp |
| Reach | 👥 | 双人 | 内联 Users |
| ⋮ | ⋮ | 16×16 省略号 | primitives `IconEllipsisOutline16` |

约束：

- **禁止**把 emoji 写进生产 JSX / CSS `content`（`ui-design-guidelines.md` §1.2）。
- demo 是无 React 的静态页：表头必须用**同一套内联 SVG**，不得用 `♡` 字符偷懒（截图对照写在 `title`/`aria-label`）。
- 不新增 `lucide-react` 依赖（不在 Web ModuleLoader 共享表；bundling 会胀包）。缺的 6 个图标收敛在 `src/client/icons/metrics.js` 一份，demo 复制 path。
- 表头颜色 `--dsw-alias-label-tertiary`；hover 升 `--dsw-alias-label-secondary`。图标与英文缩写可「只图标 + tooltip」，缩写作为 `title`，避免 8 列把工具栏撑折。推荐：**图标在上/单独一格，不跟 Content 抢宽**；`th.metric` `text-align:center; width:56px;`。

### 4.3 数据展示规范（空值合同）

```
formatMetric(value):
  if value === null || value === undefined || value === '' || Number.isNaN(value) → '−' 的 ASCII 形态 '-'
  if typeof value === 'number' && Number.isFinite(value) → 紧凑数字（本轮不会走到）
  else → '-'
```

| 规则 | 值 |
|---|---|
| 无真源 / 草稿 / 未发表 / analytics 未接 | `'-'` |
| 禁止的伪空 | `''`、`'--'`、`'N/A'`、`'0'`（零也是一种声称）、`null` 渲染成空白 |
| 颜色 | `color: var(--dsw-alias-label-tertiary, #94a3b8)` |
| 字号 | 12px / tabular-nums（为以后真数字预留对齐） |
| 对齐 | 指标列全部 `text-align: center`；表头与单元格一致 |
| MOCK_DATA | **不准**再写 `likes: 12` 或 `likes: "-"` 字段。字段缺省 = 无真源。`formatMetric(rec.likes)` 自然得 `'-'` |

本轮 ViewModel 固定：

```
metrics = { likes:null, comments:null, shares:null, saves:null, clicks:null, views:null, impressions:null, reach:null }
```

### 4.4 行菜单 `⋮`（动作闭合）

触发：kit `IconButton` `size` 走 28px compact / ghost，`aria-label` 用 locale `records.more`。  
浮层：primitives `Menu`，`portal: true`（表格 overflow 会裁剪）、`align: 'end'`、`dense`。  
同一时间只开一行（`openMenuId`）。Esc / 点外部 / 选中后关。点 ⋮ `stopPropagation`，避免触发行点击开抽屉。

| id | 文案 | 可见条件 | 行为 | 危险 |
|---|---|---|---|---|
| `view` | 查看详情 | 恒显 | 打开舞台内 Drawer | 否 |
| `edit` | 编辑草稿 | `displayStatus==='draft'` 或 `record.status==='draft'` | 打开 Composer，载入该草稿 | 否 |
| `delete` | 删除草稿 | 仅 draft | `ConfirmModal` → 既有 `POST /dsh-publish/drafts/delete` `confirm:true` | 是（`danger: true`） |
| `retry` | 重试 | `displayStatus ∈ {failed, partial_failed}`，或存在 `subtasks[].status==='failed'` | 对失败子任务调既有 `POST /dsh-publish/tasks/retry`；多失败则逐个，不新开批量 API | 否 |

不可见的项**不渲染**（不要一排 disabled 占位）。若记录只剩「查看详情」，菜单仍在——保持每行都有 ⋮，截图对齐。

demo 无 React Menu：用绝对定位 `.row-menu` 面板模拟同一四项；全局只开一个；点外部关闭。生产禁止把这套 raw 菜单抄进 JSX，必须换 primitives `Menu`。

---

## 5. 全局状态中文化（全链路唯一 map）

### 5.1 文案表（闭包，禁止第三套同义词）

| 内部 key | 中文（zh） | 英文（en） | 色 token |
|---|---|---|---|
| `draft` | 草稿 | Draft | `--dsw-alias-label-secondary` + draft-subtle 底 |
| `publishing` | 发布中 | Publishing | `--dsw-alias-state-publishing`（既有 demo token，生产用 brand/info 等价，带 fallback） |
| `reviewing` | 审核中 | In Review | `--dsw-alias-state-warn` |
| `published` | 已发布 | Published | `--dsw-alias-state-success` |
| `partial_failed` | 部分失败 | Partial Failure | `--dsw-alias-state-error` 的橙红变体（既有 `.partial_failed`） |
| `failed` | 失败 | Failed | `--dsw-alias-state-error` |

locale key 统一为 `agg.<key>`：

| key | 旧 zh（删） | 新 zh |
|---|---|---|
| `agg.publishing` | 正在发布 | **发布中** |
| `agg.failed` | 发布失败 | **失败** |
| `agg.reviewing` | （缺） | **审核中** |
| `agg.draft` / `agg.published` / `agg.partial_failed` | 已正确 | 不动 |

子任务 `task.reviewing` 保持「平台审核中」（Drawer 子任务行需要比记录级更具体）。记录级 pill **只用** `agg.*`。

禁止再写死 `'draft'`/`'published'` 当 UI 字符串。demo 抽 `STATUS_LABEL` 与 locale 同表。

### 5.2 `displayStatus(record)`（覆盖层，不改 Host `aggregateStatus`）

```
displayStatus(record):
  if record.status === 'draft' → 'draft'
  agg = record.aggregate || aggregateOf(record)   // draft|publishing|partial_failed|failed|published
  reviewingCount = record.subtask_summary?.reviewing || count(subtasks, s => s.status==='reviewing')
  if reviewingCount > 0 and agg === 'publishing' → 'reviewing'
  return agg
```

理由：Host 聚合「有 in-flight 就是 publishing」，与「审核中」Tab 同源的黄 pill 是 **UI 覆盖**，不是第七种账本态。改 `aggregateStatus` 会让 `publish_list_records` 语义漂移，升级翻车。

`scheduled` 仍不是状态。

### 5.3 四表面一致性清单

| 表面 | 状态怎么画 | 禁止 |
|---|---|---|
| Grid / Cards | 右上或页脚 `status-pill-badge ${displayStatus}` + `STATUS_LABEL[displayStatus]` | 英文 raw status；指标格 |
| Table | Status 列同一 pill | 英文；指标列出现数字 |
| Calendar | pill **左侧 3px 色条**映射 displayStatus；`title` 含「中文状态 · 标题」 | pill 内塞完整中文胶囊（会撑破 110px）；👁 数字 |
| Drawer | 发布模式行右侧记录级 pill + 子任务行 `agg.*`/`task.*` | 英文 raw；8 格看板 |

Tab 文案已是中文（草稿箱 / 审核中 / 已发布 / 失败待重试），与 pill 用词对齐：「失败待重试」Tab 滤 `failed|partial_failed`，pill 仍区分「失败」与「部分失败」。

---

## 6. 扩展点清单（本轮实际改动面）

| 挂载点 | 作用 | 清理方式 |
|---|---|---|
| `ctx.slots` `shell.overlay` / id `dsh-publish-stage` | 一级舞台；本轮只改舞台内 Table 投影与状态文案 | 既有 register，fiber 卸载自动摘 |
| `ctx.locale` NS `dsh-publish` | 六态中文 / 行菜单文案 | `ctx.effect(() => ctx.locale.register(...))` disposer |
| `ctx.effect` `dsh-publish: styles` | Table 指标列 / 行菜单 / 空槽颜色 | `ensureCss()` 既有释放 |
| primitives `Menu`（值导入，已在 `dsh.client.inject`） | 行 ⋮ 下拉 | 组件卸载即关；无全局监听泄漏（Menu 自带 outside/Escape） |
| kit `IconButton` / `ConfirmModal` | 触发器 + 删草稿确认 | 无注册项 |
| Host `ctx.tools` × 9 | **不改签名** | — |
| `webServer` `/dsh-publish` | **不增 metrics 路由** | — |
| 官方 `details` / `layout.openDetails` | **继续禁用** | — |
| `ctx.theme` | 不新增 token；指标空槽用已有 `--dsw-alias-label-tertiary` | — |
| 会话内 `cordis_define` | **禁用** | — |

副作用边界：无新长生命周期 `ctx.effect`。禁止为指标加轮询 / setInterval。行菜单的 `pointerdown` 必须随组件 unmount 释放（primitives Menu 已做；demo 手写菜单要在关页时 `removeEventListener`）。

---

## 7. Config 字段表

本轮**无新增 Config**。沿用 `docs/architecture.md` §2.3 + v2.3 `ui.*`（若尚未落地，不在本轮夹带实现）。

| 字段 | 类型 / 默认 | 本轮关系 |
|---|---|---|
| `dataDir` | string / `$DSH_HOME/omnimux/publish` | 不动 |
| `platforms` | object / 内置矩阵 | 不动 |
| `statusMap` | object / 内置 | **不动**。它映射的是 hub raw → 子任务 `submitted\|reviewing\|published\|failed`，不是 UI 中文。中文只活在 locale。 |
| `maxMediaMb` | number / 512 | 不动 |
| `submitTimeoutSeconds` | number / 120 | 不动 |
| `accountsOverlayPath` | string | 不动 |
| `ui.defaultView` 等（v2.3） | 见 layout 文档 | 本轮不夹带；Table 列与它无关 |
| ~~`ui.metricsEnabled`~~ | — | **禁止新增** |
| ~~`ui.emptyGlyph`~~ | — | 空槽字形 `'-'` 写死在 `formatMetric` + locale `metrics.empty='-'`，不进 Config |

坏配置显式失败的纪律不变：不准为了本轮去放宽 `statusMap` 的 value 枚举。

---

## 8. 模块切分（给工程师，禁止把逻辑写进 JSX 三份）

```
src/client/
  status-display.js      ← displayStatus + STATUS_ENUM 序（纯函数，node --test）
  metrics-display.js     ← METRIC_KEYS + formatMetric（纯函数）
  row-actions.js         ← rowActions(record) → [{id, labelKey, danger}]
  icons/metrics.js       ← 8 个 14px SVG 组件（无 lucide 依赖）
  RecordsTable.jsx       ← 14 列 + sticky + Menu（生产；本轮可先 demo）
  locales.js             ← agg.* / records.more / records.view / metrics.empty
demo/index.html          ← 合同验收件，必须先绿
```

`status-display.js` 必须同时被 Cards / Table / Calendar / Drawer import。demo 内联同一算法，注释标明「与 status-display.js 同源，生产落地后删重复」。

---

## 9. 文档与 demo 改动范围（闭合，禁止顺手重构）

### 9.1 新建

| 文件 | 作用 |
|---|---|
| `docs/architecture-ui-table-v2.4.md` | **本文件**，本轮唯一真源 |

### 9.2 修补（只加 v2.4 修正条，不重写全文）

| 文件 | 改什么 | 不改什么 |
|---|---|---|
| `docs/PRD-v2.md` | 文首版本 → v2.4；新增 §0.3：Table 14 列 + 空槽 `-` + ⋮ 四动作；§3.2 列定义替换为 §4.1 表；§3.5 状态 pill 改走中文 map。Tab / 四层壳 / Cards / Calendar 结构不动 | 不恢复 Cards 8 格、不恢复 Drawer 看板、不改 CSV 列 |
| `docs/architecture-ui-slim.md` | 文首加 5 行「v2.4 部分覆盖」：Table 列恢复为空槽；§4.1 删除清单对 Table 指标列作废，对 Cards/Drawer/CSV/日历仍有效 | 不删原文（保留决策史） |
| `docs/architecture-ui-layout-v2.3.md` | §7.5 Table 那一行改为 14 列合同，指向本文件；任务 7 验证标准改为「有指标空槽、有 ⋮、无假数字」 | 不改四层壳任务 |
| `docs/architecture.md` | **不改**（Host 装配真源） | — |
| `docs/hub-tool-contracts.md` | **不改** | — |

### 9.3 `demo/index.html`（验收件，先于生产）

**改：**

1. `<thead>`：在 Status 后插入 8 个 `th.metric`（内联 SVG + `title`）+ 1 个空 `th`（⋮ 列无文字）。
2. `renderTable`：每行补 8 个 `<td class="td-metric">-</td>` + ⋮ 按钮；`colspan` 5 → **14**。
3. 新增 `STATUS_LABEL` + `displayStatus(rec)` + `formatMetric()`；`renderGrid` / `renderTable` / `openRecordDrawer` 的 pill 文本全部改 `STATUS_LABEL[displayStatus(rec)]`，class 仍用 key。
4. `renderCalendar`：pill 加 `data-status` 与 3px 左边框；`title` 含中文状态。
5. 行菜单 DOM/CSS/JS：四动作按 §4.4 显隐；删除草稿走已有 `batchDelete` 同确认语义（单行可用 `confirm()`）。
6. CSS：`.td-metric` 居中、tertiary、tabular-nums；`.th-metric svg` 14px；sticky 可选但 demo 至少 `overflow-x:auto` 不折行。

**不改：**

- MOCK_DATA **不**加 likes/views 字段（缺省即空槽）。
- 不恢复 `.card-metrics-grid`。
- 不在 Drawer 加 8 格看板。
- `exportData` 表头保持 `ID, Title, Type, Platforms, Date, Status, Mode`。
- 不改五段式布局壳、Tab、Composer。

### 9.4 生产源码（可与 demo 分 PR，但合同相同）

| 文件 | 改动 |
|---|---|
| `src/client/locales.js` | §5.1 文案；加 `records.more` / `records.view` / `records.editDraft` / `metrics.empty` |
| `src/client/status-display.js` | 新建 + 单测 |
| `src/client/metrics-display.js` | 新建 + 单测（全部 null → `'-'`） |
| `src/client/RecordsList.jsx` / 未来 `RecordsTable.jsx` | StatusChip 改 `displayStatus`；Table 14 列 |
| `src/client/RecordDetail.jsx` | 记录级 pill 中文（已走 `t('agg.*')` 的对齐新文案） |
| `src/store.js` / `src/index.js` / `src/http-routes.js` | **零 diff** |

---

## 10. 任务清单（按依赖，每条可独立验收）

| 序号 | 任务 | 依赖 | 验证标准 |
|---|---|---|---|
| 1 | PRD-v2.md 升 v2.4：§0.3 + 替换 §3.2 列定义；slim / layout 文首加覆盖条 | — | 文中 Table 列为 14 列；Cards/Drawer/CSV 仍写「禁止指标数字」；出现「空槽 `-`」 |
| 2 | `locales.js` 改 `agg.publishing/failed`、补 `agg.reviewing` 与菜单 key；中英成对 | 1 | 源码无「正在发布」「发布失败」；`agg.reviewing` 中英都在 |
| 3 | 新建 `status-display.js` + `metrics-display.js` + 单测 | 2 | `node --test src/client/status-display.test.js src/client/metrics-display.test.js`：draft/publishing/reviewing 覆盖/published/partial_failed/failed 各 1 例；`formatMetric(undefined)==='-'`；`formatMetric(0)==='-'` 本轮也成立（无真源不得用 0）——**更正**：无真源走 null 不是 0；`formatMetric(0)` 若未来有真零可显示 `0`，本轮测试只锁 null/undefined/NaN/'' → `'-'` |
| 4 | 改 `demo/index.html`：14 列表头 SVG、空槽、STATUS_LABEL、四表面中文、⋮ 菜单 | 1 | 浏览器打开 demo：Table 表头能对上 ♡💬🔀🔖🖱👁📈👥 的**图形**而非 emoji 字符；8 列全是居中灰色 `-`；Grid/Table/Drawer pill 为「草稿/发布中/审核中/已发布/部分失败/失败」；无英文 `published` 露在 pill 里 |
| 5 | demo 行菜单：查看详情 / 编辑草稿 / 删除草稿 / 重试 按状态显隐 | 4 | 草稿行菜单无「重试」；已发布无「编辑/删除」；失败行有「重试」；点 ⋮ 不误开抽屉 |
| 6 | demo 日历：状态色条 + title 中文；pill 仍无指标 | 4 | 审核中日格左边框为 warn token；title 含「审核中」；无 👁 |
| 7 | （生产）`RecordsTable` 按 §4 落地；`StatusChip` 改 `displayStatus`；⋮ 用 primitives `Menu` | 2, 3 | 无 raw `<button>` 做可见菜单项；无 emoji；`layout.openDetails` 零命中 |
| 8 | 回归：Host 账本 / 工具 schema / HTTP **零 diff** | 4, 7 | `git diff -- src/store.js src/index.js src/http-routes.js src/config.js` 空 |
| 9 | 样式扫描：指标空槽颜色走 token；demo/生产无裸 emoji 表头 | 4, 7 | rg 表头区域无 `♡|💬|🔀|🔖|🖱|👁|📈|👥` 作为 text node；CSS 指标色含 `--dsw-alias-label-tertiary` |
| 10 | L2 Web 验视（`node scripts/omnimux.mjs dev start <task> dsh-publish`），**禁止**杀桌面进程 | 7, 8 | 浅/深色下 8 列 `-` 仍可读；横向滚动不挡 sticky 操作列；卸载插件后面无残留 Menu portal |

任务 1–6 + 8 的 demo 半边是本轮交付门禁。任务 7/9/10 给工程师按同一合同落生产，避免 demo 与生产再分叉。

---

## 11. 风险与非目标

- **不在本轮做**：analytics 接入、指标排序、指标 CSV、Cards/Drawer 指标看板、改 `aggregateStatus`、改 `statusMap`、改官方 packages、新 Slot、cordis_define。
- 14 列会在窄窗横向滚动——这是截图合同的成本，不在本轮做列显隐 Config。
- 前提：`Menu` 在当前 Web 共享模块表由 `dsh-client-ui-primitives` 提供。若现场 `lib/client.js` 的 `require('...')` 对不上，**待工程师现场核对** boot manifest，降级为舞台内自绘菜单（仍禁止 raw 系统菜单），不要改 Host。
- 本计划假设许清楚要的是「列结构对齐截图」而不是「数字已接通」。若产品改口要真数字，必须另开 analytics 合同 + 新工具 + 会话事件，不得在本 PR 偷偷填 MOCK 数字。
