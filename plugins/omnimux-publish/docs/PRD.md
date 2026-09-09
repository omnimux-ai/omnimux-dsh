# PRD：dsh-publish 内容发布中心插件（v1）

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境与合入前运行验收要求退役，产品和发布授权边界不变。当前流程见 [dev-pipeline](../../../docs/contracts/dev-pipeline.md) 和 [plugin-qa](../../../docs/contracts/plugin-qa.md)：worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120/ego 验收。历史结果不重标。

状态：Confirmed（2026-08-21 老板确认实施，进入 Phase 2 架构设计）
需求评审：许清楚（Phase 1 产出汇编）／边界定界：齐活林（Phase 0）

---

## 1. 背景与定位（Why）

老板做社媒运营（多品牌多账号、内容生产、审核发布），OmniMux 目前已有账号（omnimux-accounts）、素材（omnimux-assets）、生成（hub media）、发布执行通道（hub `omnimux_publish_*` 官方工具），但**缺一个面向运营者的发布编排层**：从草稿到多账号分发到审核跟进的完整闭环。

本插件补这个缺口。定位一句话：**dsh-publish = 发布流程的编排层 + 可视化层；执行走 hub 通道，自己不直连任何平台。**

| 边界项 | 结论 |
|---|---|
| 插件归属 | `personal/dsh-publish/`（自用打磨；明确对外发布时再迁 `product/`，迁入前提见 §10） |
| 是否改 hub | 否。chrome / auth / 模型路由 / hub UI 全不动 |
| 账号体系 | 不自建。读写 omnimux-accounts 数据（平台、分组、可用性） |
| 素材体系 | 不自建。本地上传 + 引用 omnimux-assets 产物路径 |
| 发布执行 | 只走 hub `omnimux_publish_presign / create / get`（official-only，需 OMNIMUX_ACCESS_TOKEN） |
| 凭证 | 本插件不存、不读、不转发任何 `OMNIMUX_*` secret 与平台 Cookie |

## 2. 竞品分析结论（业务逻辑推理）

对标对象：多平台社媒矩阵工具的发布中心（矩阵通 / 有客来一类）。五张竞品截图的解读与推理：

### 2.1 竞品的表面功能

- 列表页三类记录：发布记录 / 草稿箱 / 待审核
- 发布入口二选一：视频 / 图文
- 发布页：左侧账号列表面板（平台 → 账号两级勾选，三栏弹窗式选择器）
- 内容表单：视频（上传视频 + 描述）；图文（多图 + 封面 + 标题 + 描述 + 话题）
- 平台差异设置：定时发布、谁可以看、原创声明、AI 内容声明——**按所选账号的平台动态显示支持项**
- 顶部操作：保存到草稿 / 浏览器发布 / 一键发布

### 2.2 竞品背后的业务逻辑（推理）

**① 三类记录的本质是状态机的三个视图，不是三份数据。**

```
draft（草稿：只有记录级，账号是草稿的属性集合，不是任务）
  │ submit（一键发布：按账号物化 N 个 per-account 子任务）
  ▼
submitted（已提交执行通道，等待结果）
  │ 轮询/刷新
  ▼
reviewing（待审核：平台侧状态，本地永远不产生它，只能查询得到）
  ▼
published（已发布）/ failed（失败，可重试 → 回到 submitted）
```

- 「草稿箱」= draft 状态的记录
- 「发布记录」= 已 submit 的全部记录（含部分失败 / 已发布）
- 「待审核」= 存在 reviewing 子任务的记录（发布记录的过滤视图，不是独立实体）

**② 任务分发模型的本质：一份内容 → N 账号，拆分粒度是账号不是平台。**

同一平台两个账号对内容的要求可能不同（能力差异、限流节奏），且失败重试的天然粒度是账号。竞品的「一个视频发一个账号 / 多个视频发一个账号」矩阵模式是分发模型的升级版，v1 不做。

**③ 平台能力差异的本质：静态能力矩阵，不是每平台单独逻辑。**

竞品到处可见「不支持：快手、百家号…」「仅小红书支持原创声明」这类提示——背后是一张 `平台 → 能力` 矩阵表，驱动两件事：

1. 表单动态裁剪：选了不支持封面的平台账号 → 封面区置灰并说明
2. 提交校验：内容设置与账号平台能力冲突 → 提交前拦截

矩阵是数据不是代码：平台能力变了改配置不改代码。

**④ 「一键发布」的本质价值：N 账号 × 平台差异 × 执行细节，一次操作全部消化。**

运营者只管「内容和选哪些账号」，上传（presign）、分发（create per account）、结果汇总（get）全部自动。单账号失败不阻塞其他账号（隔离性），每个账号有独立终态（可观测性）。

### 2.3 竞品功能吸收清单

| 竞品功能 | 吸收情况 |
|---|---|
| 三类记录列表、视频/图文二选一、平台→账号两级勾选、保存草稿、一键发布 | ✅ v1 全收（老板点名） |
| per-account 状态可观测、平台能力矩阵驱动的表单裁剪 | ✅ v1 收（业务逻辑核心） |
| 浏览器发布 | ❌ 永不做（与 hub 官方通道冲突，浏览器自动化违反编排层定位） |
| 多标题/多描述、多视频↔多账号矩阵分发 | ⏸ v2（依赖分发模型升级） |
| 原创声明、AI 内容声明、定时发布 | ⏸ v2（矩阵结构 v1 就预留槽位） |
| 素材库选封面、常用话题、快速填写、账号分组筛选 | ⏸ v2（便利性功能） |

## 3. 用户与场景

| 调用方 | 形态 | 典型场景 |
|---|---|---|
| 老板/运营者（主验收） | UI：侧边栏「发布」入口 → shell.overlay 一级页 | 「把这条视频发到小红书两个号和抖音一个号」「接着改上周那个图文草稿」「看下哪些还在审核」 |
| dsh agent | 工具调用（无 UI，聊天里直接说） | 「帮我建个图文草稿，用资产库里那张图，发小红书全部可用账号」「发布状态怎么样了」「把失败的抖音任务重试一下」 |

## 4. 用户故事

### 视角 A：运营者（UI）

| # | 故事 | 验收要点 |
|---|---|---|
| A1 | 从侧边栏进入发布中心，总览三类记录 | 侧边栏行符合 sidebar-extra-entries.md 契约（32px 行 / 14px icon / 14-20px label / 8px corner，marker 建议 `data-omnimux-publish-entry`）；页面走 `shell.overlay` 一级产品页（`dsh-product-stage` 互斥、盖住会话列、点会话行退出）；三个 tab：发布记录 / 草稿箱 / 待审核 |
| A2 | 点击「发布」，选视频或图文 | 类型选择后进入发布页，表单按类型分化；**不可中途切换类型**（切换 = 新建草稿） |
| A3 | 发布页左侧面板勾选目标账号（平台→账号两级） | 数据来自 omnimux-accounts；不可用账号（status 异常 / agent_usable=false）置灰并注明原因；底部「已选 N 个账号」；确认后挂到当前草稿 |
| A4 | 随时保存草稿 | 草稿出现在草稿箱；重新打开完整恢复（素材、内容、已选账号、类型） |
| A5 | 一键发布 | 提交前校验必填项 + 账号可用性 + 平台能力冲突（行内错误）；通过后按账号拆子任务逐个提交 hub；单账号失败不阻塞；每账号独立显示成功/失败 |
| A6 | 跟进每个账号的结果与审核状态 | 发布记录展开见 per-account 子任务状态；「待审核」tab 聚合审核中任务；手动刷新拉最新平台状态 |

### 视角 B：dsh agent（工具，无 UI）

| # | 故事 | 验收要点 |
|---|---|---|
| B1 | 列出发布记录/草稿/待审核 | `publish_list_records(status_filter, type?, page?)`：与 UI 列表页同一数据源 |
| B2 | 创建和修改草稿 | `publish_create_draft(type, payload)` / `publish_update_draft(draft_id, patch)`：素材可引 omnimux-assets 产物路径；**与 UI 发布页同一份校验**（含平台能力矩阵校验） |
| B3 | 查询账号并挂到草稿 | `publish_list_accounts(platform?)` / `publish_assign_accounts(draft_id, account_ids)`：能力等价于 A3 |
| B4 | 提交发布、查询状态、重试 | `publish_submit(draft_id)`（= A5）/ `publish_get_record(record_id)`（含子任务状态）/ `publish_retry_task(task_id)`：返回确定性 JSON，不依赖 UI |
| B5 | 删除草稿 | `publish_delete_draft(draft_id)`（删除语义带确认参数，Phase 2 定具体形态） |

**横切验收（核心约束）**：A1–A6 每个交互动作都能由 B 系列工具组合完成；不存在「只有 UI 能做」的功能。UI 与工具消费同一 Host 数据层（同源）。

## 5. 功能需求

### 5.1 模块清单

| 模块 | 内容 | 关键点 |
|---|---|---|
| M1 列表页 | 三 tab + 素材卡片（缩略图、标题、状态、账号覆盖数、时间） | 状态过滤准确；空态引导 |
| M2 类型选择 | 视频 / 图文 | 选定后表单分化 |
| M3 发布页-视频 | 视频上传 + 描述/话题 + 账号面板 | 视频来源：本地上传 + omnimux-assets 产物路径引用 |
| M4 发布页-图文 | 多图 + 封面 + 标题 + 描述/话题 + 账号面板 | 封面能力按所选账号平台动态置灰；图片数量受能力矩阵约束 |
| M5 账号选择面板 | 平台→账号两级勾选 | omnimux-accounts 数据源；可用性过滤；已选计数 |
| M6 任务创建与分发 | submit 时拆 per-account 子任务 | 提交前校验；失败隔离；可重试 |
| M7 草稿箱 | 草稿 CRUD + 完整恢复 | UI 与 agent 双入口 |
| M8 状态同步 | 从 hub 拉取子任务平台状态 | 手动刷新 + 打开列表页自动拉一次；**不做自动轮询** |

### 5.2 状态机（per-account 子任务级）

```
draft（记录级）→ submit → submitted →（查）→ reviewing → published / failed
failed → retry → submitted
```

- 记录状态 = 子任务聚合：任一 submitted → 发布中；全部 published → 已发布；部分 failed → 部分失败
- 三 tab 映射：草稿箱 = draft；发布记录 = 已 submit 全部；待审核 = 存在 reviewing 子任务
- 「待审核」终态判定以 hub `omnimux_publish_get` 返回的平台状态字段为准，具体映射 Phase 2 对照工具返回结构确定

### 5.3 任务分发模型

- 一次发布 = 1 个发布记录（素材 + 内容 + 账号集合）→ submit 物化 N 个 per-account 子任务
- v1 只支持「一份素材 → N 账号」；矩阵分发模式 v2
- 需求层约束：单账号失败不阻塞、每子任务独立终态；串行/并行提交是 Phase 2 实现细节

### 5.4 平台能力矩阵

```
platform → { media_types: [video|image], supports_cover, supports_schedule,
             max_images?, supports_original_declaration?, supports_ai_declaration? }
```

- 静态矩阵内置于插件（配置可覆盖，平台能力变更改配置不改代码）
- v1 落 3 个字段：media_types / supports_cover / supports_schedule；声明类槽位预留
- 同一矩阵驱动 UI 表单裁剪与 agent 工具校验（同源，保证行为一致）

### 5.5 数据与磁盘

- 插件自有可写区：`$DSH_HOME/omnimux/publish/`（草稿 + 发布记录 + 子任务账本，目录 0700 / JSON 0600，参考 omnimux-assets 惯例）
- hub 明确不存 posting calendar（hub.md），**账本归本插件**，taskId 提交成功即落盘

### 5.6 降级行为

| 场景 | 行为 |
|---|---|
| 未登录 OmniMux / 无 OMNIMUX_ACCESS_TOKEN | 允许建草稿；「一键发布」/ `publish_submit` 报 `needs-omnimux` 明确指引，不静默失败。**修订（2026-08-21 T0 实证）**：账号列表站点侧必须登录、无本地缓存可用，未登录时 `publish_list_accounts` / 账号面板返回明确 `degraded:'needs-omnimux'` 报因（不静默、不假装空列表），建草稿不受影响 |
| omnimux-accounts 未装 | 账号面板空态提示安装；agent 工具 `publish_list_accounts` 同样明确报错 |
| 平台能力冲突 | 提交前拦截，行内错误（UI）或确定性错误 JSON（工具） |

## 6. Non-goals（v1 明确不做）

- 直连任何平台 API、存任何平台 Cookie / OMNIMUX_* secret
- 浏览器自动化发布（永不做）
- 账号登录 / 连接流程（归 omnimux-accounts + hub）
- 多标题/多描述、多视频↔多账号矩阵分发（v2）
- 原创声明 / AI 声明 / 定时发布（v2，矩阵槽位已预留）
- 素材库深度集成（封面素材库等，v2）
- 自动轮询状态同步（v1 手动 + 打开时拉一次）

## 7. 验收标准

**L2 聊天 E2E（agent 通道，核心约束验证）**：
1. 「帮我建一个图文草稿，标题 X，用 ~/Desktop/a.jpg，配上描述」→ 草稿落盘，草稿箱可见
2. 「把它发到小红书全部可用账号」→ assign + submit，per-account 子任务生成，无 UI 参与
3. 「发布状态怎么样」→ `publish_get_record` 返回各账号子任务状态
4. 「重试失败的那个账号」→ retry 后子任务回到 submitted

**L2 UI E2E**：
5. 侧边栏「发布」行 → 一级页三 tab 正常；空态、过滤准确
6. 新建视频发布：上传视频 → 左侧面板按平台勾选 3 个账号 → 保存草稿 → 重开完整恢复
7. 一键发布：单账号制造失败（如断 token），其余账号不受阻塞，失败账号可重试
8. 选含不支持封面平台的账号 → 封面区置灰并说明

**横切**：上述 5–8 每步操作均可用 B 系列工具组合完成（抽查映射）。

## 8. 已裁决的模糊点（2026-08-21 主理人裁决）

| # | 模糊点 | 裁决 |
|---|---|---|
| 1 | 「触发左侧侧边栏的账号列表」 | **发布页页面内**的左侧账号选择面板（竞品图2布局）；主侧边栏只加一个「发布」入口行 |
| 2 | 素材来源优先级 | v1 本地上传 + omnimux-assets 产物路径引用并行支持；assets 深度集成 v2 |
| 3 | 状态同步方式 | 手动刷新 + 打开列表页自动拉一次；不做自动轮询 |
| 4 | 「待审核」终态判定 | 以 hub `omnimux_publish_get` 平台状态字段为准；映射细节 Phase 2 对照确认 |

## 9. 里程碑

| 阶段 | 内容 | 出口 |
|---|---|---|
| M0 | 前置检查：`dev-doctor.sh` 环境校验；确认 hub `omnimux_publish_*` 在当前 profile 可用（工具注册 + 登录态） | 环境合规；hub 通道连通 |
| M1 | 插件骨架（含 cordis.patch.yml 装载件）+ 数据层（草稿/记录/子任务账本）+ 能力矩阵 + L1 单测 | `node --test` 绿；`--dump-config` 出现 dsh-publish |
| M2 | 工具面（B1–B5）+ dev profile 聊天 E2E 1–4 | agent 通道全通 |
| M3 | UI（侧边栏行 + shell.overlay 一级页 + 发布页 + 账号面板）+ UI E2E 5–8 | UI 通道全通 |
| M4 | 合规体检（严过关）+ 交付 | 体检报告通过 |

## 10. 后续（PRD 之外）

- personal → product 迁移前置条件：① 第三方 bundle 调用 hub official-only 工具（`omnimux_publish_*`）的合规性需在 hub 侧确认；② 独立 git 仓库；③ 自用期需求验证完毕。
- v2 候选池：矩阵分发、多标题/描述、定时发布（参考社区 dsh-cron / dsh-automation 基础设施，不引入依赖）、声明类设置、素材库深度集成、常用话题。
