# 社媒自动化最小闭环：需要哪些关键应用

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../../docs/contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


日期：2026-08-19。
性质：研究文档，不定死实现。活能力和包边界以 `docs/capabilities.md`、`docs/contracts/hub.md`、`docs/contracts/apps-catalog.md` 为准。
问题：基于 OmniMux 产品定位，要支撑「社交媒体自动化」最小闭环，需要哪几个**应用**（有独立 UI 的插件），各自整合 OmniMux 的哪些能力。

## TL;DR

最小闭环 = **4 个应用 + agent 编排层**。闭环形状：

```text
账号就绪 (Accounts) → 内容生产 (Studio) → 发布分发 (Publish) → 数据回收 (Analytics) → 复盘 → 再生产
```

| # | 应用 | 环节 | 状态 |
|---|---|---|---|
| 1 | 账号 `accounts` | 入口 | ✅ 已有（`omnimux-accounts`） |
| 2 | 内容工作室 `studio` | 生产 | 新建 |
| 3 | 发布台 `publish` | 分发 | 新建 |
| 4 | 数据中心 `analytics` | 回收 | 新建 |

排期发布、账号矩阵、预热**不是**最小闭环；它们也只能做在应用自己的磁盘上（中枢明确不做）。国内平台（小红书/抖音/B站/视频号）不在 OmniMux 社交 API 范围，仍走内容工作台（oil-creator）那条线。

## 产品定位回顾

- OmniMux 的产品句：**面向 AI Agent 的社交媒体全链路 API——内容制作 + 多平台编排，按调用付费，无订阅**。交付形态：REST、CLI、Agent Skill、MCP。
- 不是端到端自动内容工厂：方向盘留在用户/Agent。dsh 落地公式 `Agent = OmniMux（灵魂面）+ dsh（借来的 harness）`。
- 社交平台范围：X、LinkedIn、YouTube、Instagram、TikTok、Threads（全球，公开矩阵不含中国大陆平台）。
- `omnimux` 是**执行中枢**：身份、模型路由、图/视频缝、官方独有工具（连账户/发帖/社交数据）。它不存储账号矩阵、排期日历、预热名单——这些不是中枢的职责，是应用/垂直自己磁盘上的东西。
- 短剧（`omnimux-drama`）是第一条垂直方案，不是本仓唯一产品；电商视频/设计是同一条线上的后续包。

## 应用 vs 插件

| | 插件 | 应用（Apps） |
|---|---|---|
| 定义 | 挂在 harness 上的能力包（工具、缝、配置） | 有**独立可交互 UI** 的插件 |
| 形态 | 工具 + Host 逻辑，如 `omnimux-drama`（纯工具，无 UI） | 货架行（catalog.json `client: true`）+ 独立页面 + Host 路由 |
| 打开方式 | 会话内被 agent 调用 | 侧栏「应用」货架点开，claim 产品舞台（`APP_OPEN_EVENT`） |
| 例子 | `omnimux-drama`、`dsh-better-sidebar` | `accounts`（`omnimux-accounts`） |

应用插件的既有模式（以 `accounts` 为模板）：

- **客户端**：React 组件注册进官方 UI（Settings → 插件 tab，或独立页 claim stage）。浏览器只打本机 Host 路由（`/omnimux/accounts`），不碰 OmniMux 域、不读密钥。
- **Host 侧**：账号类官方数据路由由中枢持有（`omnimux/src/official/http-routes.js`）；应用自己的领域路由与磁盘由应用包持有。
- **安装**：货架 catalog（bundled + 远程 JSON）→ `dsh plugin add <钉版本名>`。安装后重启 Host。

## 最小闭环拆解

闭环的每一步都有人机交互点，这是「应用」（UI）存在的理由；纯工具能跑通的部分交给 agent 编排：

| 环节 | 人必须确认/查看什么 | 为什么需要 UI |
|---|---|---|
| 账号 | 授权连接、断开、哪个平台哪组账号 | OAuth 授权流天然是页面；矩阵需要浏览 |
| 生产 | 文案/配图/视频草稿，素材复用 | 生成前审 prompt、生成后挑片，聊天流太散 |
| 发布 | 选平台+账号、确认媒体与文案、看发布结果 | 发布是不可逆动作，发布前必须可视化复核 |
| 回收 | 帖子表现、账号涨跌、趋势 | 指标用图表/表格比聊天文本直观得多 |

## 关键应用清单

### 1. 账号 `accounts`（已有）

- **UI**：列表 + 平台/分组筛选 + 连接（弹授权 URL）+ 断开。未登录提示走中枢登录。
- **OmniMux 能力**：`identity`（身份门）+ `omnimux_accounts_connect/list/disconnect`（官方独有）。
- **Host**：`/omnimux/accounts`（中枢持有）。
- **状态**：货架第一行，keyless 已测；真实账号列表待手工验证。

### 2. 内容工作室 `studio`（新建）

- **UI**：选题/文案编辑区、配图与视频生成面板、草稿列表、素材网格（生成产物可视化、可复用）。
- **OmniMux 能力**（均为中性缝，可换兼容 endpoint）：
  - `textComplete`：写文案/脚本/标题/标签/爆点（白名单 8 模型，默认 gemini-3.7-flash；识图模型可传图）。
  - `imageGenerate`：配图/封面/商品图（默认 gpt-image-2）。
  - `videoGenerate`：短视频/口播数字人（默认 seedance-2-0-fast；支持 i2v、speech）。
- **磁盘**：`studio/`（草稿 + 素材索引），只写自己的目录。
- **Host**：`/omnimux/studio/*` 由应用包持有，Host 侧经 `ctx.get('textComplete' / 'imageGenerate' / 'videoGenerate')` 调缝，dest 落在自己磁盘。`mode: "submitted"` 时把 `taskId` 写进草稿，续取用 `{ dest, taskId }`。
- **与 drama 的关系**：`omnimux-drama` 是短剧垂直（无 UI、`series/` 磁盘）；`studio` 是通用社媒内容应用（有 UI）。两者并存，drama 可视为 studio 在短剧场景的领域化版本。

### 3. 发布台 `publish`（新建）

- **UI**：草稿队列（来自 studio 或 agent）、每篇选平台+账号、媒体 presign 上传、发帖、发布状态（已发布/失败/链接）。
- **OmniMux 能力**（官方独有，只能走 OmniMux）：
  - `omnimux_accounts_list`：可发布账号。
  - `omnimux_publish_presign`：媒体预签名上传（filename + content_type）。
  - `omnimux_publish_create`：创建帖子（body 透传，含 account_ids + media_items + content）。
  - `omnimux_publish_get`：按 id 查帖子。
- **磁盘**：`publish/`（草稿 + 已发布记录：platform、account_id、post_id、url、status）。这是「发布历史」真源，analytics 依赖它。
- **Host**：`/omnimux/publish/*` 由应用包持有，Host 侧走中枢 official HTTP（或经官方工具同层封装），密钥仍在中枢。
- **非目标（最小闭环）**：定时排期、批量矩阵。排期是 Phase 2 增强（可挂官方 `dsh-schedule` 的 after/at/every ≥5min，或应用自己的调度），状态只能在应用磁盘。

### 4. 数据中心 `analytics`（新建）

- **UI**：已发布帖子表现（播放/点赞/评论/分享/涨粉）、账号概览、简单趋势图、按平台过滤。数据只读展示 + 手动/定时同步。
- **OmniMux 能力**（官方独有）：
  - `omnimux_social_data`：`tiktok/video`、`tiktok/user`、`instagram/post`（当前 catalog；后续平台+能力随云扩展）。
- **磁盘**：`analytics/`（同步快照：每帖 metric 时间点、账号快照）。同步模型对齐内容工作台的「已发布数据回收」（oil_sync_publish：按标题/URL 匹配，写回计数）。
- **Host**：`/omnimux/analytics/*`，Host 侧拉取后剥敏感字段写盘，浏览器只读展示。

## 能力整合映射

| OmniMux 能力 | 缝/工具 | 类型 | 被哪个应用用 |
|---|---|---|---|
| 身份 | `identity` / `/omnimux/auth/*` | 官方 | 全部（门） |
| 连账户 | `omnimux_accounts_*` | 官方独有 | accounts、publish |
| 发帖 | `omnimux_publish_*` | 官方独有 | publish |
| 社交数据 | `omnimux_social_data` | 官方独有 | analytics |
| 文案/专家 | `textComplete` | 中性缝 | studio |
| 生图 | `imageGenerate` | 中性缝 | studio |
| 生视频 | `videoGenerate` | 中性缝 | studio |
| 能力门 | `GET /omnimux/capabilities` | 官方 | 应用页按 capabilities 字段展示可用性 |

## 集成规则（每个新应用照此执行）

1. **包**：`plugins/omnimux-<id>/`，catalog 加一行：`id`、`title`、`summary`、`capabilities`（⊆ `identity`/`videoGenerate`/`imageGenerate`/`official`）、`client: true`、`spec`（bundled 或钉版本 npm）。
2. **客户端**：React 组件注册官方槽位（独立页 claim stage；如需设置项用 `settings.plugins.tab`，禁止一级 `settings.section`）。浏览器只打本机 `GET/POST /omnimux/<app>/*`。
3. **Host 侧**：应用自己的路由 + 磁盘。账号/发布/社交数据这类官方独有数据的 Host 路由，照现有模式由中枢 `official/` 持有（避免每个应用各写一份 OmniMux HTTP + 密钥）。
4. **缝优先**：生产类能力走 `ctx.get` 中性缝（可换第三方兼容 endpoint）；官方独有能力只能走 OmniMux。应用不得 import 中枢内部、不得存 `OMNIMUX_*` 密钥。
5. **状态落盘**：草稿、发布历史、同步快照都在应用自己的磁盘；中枢不存账号矩阵/排期/预热。
6. **未登录/未配置**：抛/返回 `needs-omnimux` 提示，不假装成功。

## 落地顺序建议

| 步骤 | 内容 | 为什么 |
|---|---|---|
| 0 | accounts 验证真实账号列表 | 现有应用，先跑通真实链路 |
| 1 | `publish` 应用 | 最薄，纯文本帖即可闭环「发出去」，发布历史成为数据回收的输入 |
| 2 | `analytics` 应用 | 接上 social_data 后闭环闭合：发出去 → 看到数据 |
| 3 | `studio` 应用 | 最重；把生产环节 UI 化，素材成为 publish 的媒体来源 |
| 4 | 排期/批量等增强 | 最小闭环之外，能力与云端 API 就绪后再说 |

顺序上「先 publish 后 studio」的理由：publish 不需要新缝（账号+发布工具已挂），能最快把闭环两头（入口、出口）接起来；生产环节先由 agent + 工具顶着，UI 后补。

## 边界与非目标

- 中枢不做：账号矩阵、排期日历、预热名单、Drama Center 传片。这些只能出现在应用/垂直自己的磁盘。
- 最小闭环不含：定时发布、内容日历、批量多账号矩阵、A/B 测试、国内平台。
- 国内平台（小红书/抖音/B站/视频号）走内容工作台（oil-creator + Ego Browser）；OmniMux 应用面向全球平台。两条产品线闭环形状相同（选题→制作→发布→数据），可互相借鉴流程模式，但不共用执行层。
- 社交数据当前只证明 `tiktok/video`、`tiktok/user`、`instagram/post` 三对；其余平台/能力以 OmniMux 云发布为准，analytics 按 catalog 驱动，不写死。

## 来源

- 产品定位与包边界：`research/dsh/POSITIONING.md`、`research/omnimux/PLUGIN.md`
- 中枢 I/O 与能力表：`docs/contracts/hub.md`、`docs/capabilities.md`
- 货架合同与现状：`docs/contracts/apps-catalog.md`、`plugins/omnimux/apps/catalog.json`
- 应用模板：`plugins/omnimux-accounts/`（client + catalog 行）、`plugins/omnimux/src/official/`（Host 路由）
- 定时能力调研（Phase 2 参考）：`research/dsh/community-scheduled-task-plugins.md`（官方 `dsh-schedule` after/at/every ≥5min）
