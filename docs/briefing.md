---
title: "Briefing"
id: "log-briefing"
type: "log"
status: "living"
authority: "L3"
date: "2026-08-15"
updated: "2026-08-31"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# Briefing

> Memory, not current truth or authority. Product direction: [product positioning](contracts/product-positioning.md). Facts and permissions are arbitrated separately under [docs governance](contracts/docs-governance-standard.md); historical summaries cannot override current instructions or prove runtime availability.
> Process: `docs/contracts/briefing.md`.

## Index

| id | date | status | topic |
|---|---|---|---|
| 2026-08-15-briefing-log | 2026-08-15 | decided | 项目级协同简报 |
| 2026-08-15-omnimux-identity | 2026-08-15 | decided | dsh-omnimux 身份独立于 CLI |
| 2026-08-15-app-marketplace | 2026-08-15 | superseded | OmniMux 应用市场 MVP：故事已收，server 待设计 |
| 2026-08-16-hub-io | 2026-08-16 | decided | 执行中枢 I/O；不再称中枢为网关 |
| 2026-08-16-harness-consume | 2026-08-16 | decided | 消费官方 dsh，不整仓 fork |
| 2026-08-17-apps-catalog-json | 2026-08-17 | decided | 官方货架用 bundled + 远程 JSON，不做应用表 |
| 2026-08-16-text-complete | 2026-08-16 | decided | 一次性专家补全；白名单不是第二套 chat |
| 2026-08-30-physical-materialization | 2026-08-30 | decided | 画布/主体库导入全部物理实体化 |
| 2026-08-31-workbench-split | 2026-08-31 | decided | 工作台挂 better-sidebar；对话不卸载；库页 overlay |
| 2026-08-31-workbench-libraries-318 | 2026-08-31 | proposed | #318 一级库页迁入右栏；默认开态分流；toggleCluster 对话开关 |

## 2026-08-15-briefing-log

- **status:** decided
- **topic:** 项目级人–agent 协同简报
- **decision:** 讨论主题与已确认决策记入本文件。流程见 `docs/contracts/briefing.md`。本文件是记忆，不是真源。
- **why:** 跨会话需要共享工作记忆；不能把聊天纪要做成第四层仓规。
- **not:** 不替代 `series/`、contracts、CONTEXT、AGENTS hard bounds、稀有 ADR。不自动记录每轮聊天。
- **authority:** `docs/contracts/briefing.md`, `AGENTS.md`
- **updated:** —

## 2026-08-15-omnimux-identity

- **status:** decided
- **topic:** dsh-omnimux 设置登录不绑定 OmniMux CLI
- **decision:** 插件直连 OmniMux device-login HTTP；PAT 存在 `OMNIMUX_ACCESS_TOKEN`。启动只探活。侧栏「应用」和设置「个人资料」都可以发起登录；个人资料展示剥过的账户字段。
- **why:** 用户环境可以没有 CLI。CLI 与 dsh 各登各的，和 Codex App/CLI 同一模型。
- **not:** 不是云端插件市场；不是读 CLI 钥匙串；登录票不是 `sk-` / `OMNIMUX_TOKEN`。
- **authority:** `plugins/dsh-omnimux/README.md`
- **updated:** —

### Amendments
- 2026-08-15 — 计划确认后落地。
- 2026-08-15 — 设置入口由「我的插件」改为「插件」。
- 2026-08-15 — 为与 dsh「插件」区分，入口改为「应用」/ Apps。
- 2026-08-15 — 「应用」从设置挪到左侧栏新会话下方（`sidebar.lead.action`）。
- 2026-08-15 — 设置「个人资料」也可登录；页标题改为「个人资料」。
- 2026-08-16 — 「应用」改挂官方 `sidebar.footer.action`（设置上方）；不再改官方壳。
- 2026-08-18 — 「应用」改成和任务看板同一挂法：插在侧栏「新会话」正下方（任务看板上方）。不再用 `sidebar.footer.action`。不新开官方 `sidebar.lead.action`。

## 2026-08-15-app-marketplace

- **status:** superseded
- **topic:** OmniMux 应用市场 MVP：故事已收，server 待设计
- **decision:** 应用带 WebUI、点开即用。实现单位仍是 dsh 插件。货架和云接口在 OmniMux。`dsh-omnimux` 是原生底座。管理员用 CLI 上下架，不做后台 WebUI。用户故事和前置约束以 `docs/logs/2026-08-15-app-marketplace-mvp.md` 为准。Server 设计在 OmniMux 仓另做，确认后再写代码。
- **why:** MVP 可以糙，目录、打开方式、身份、官方/个人必须先定，否则后迁。公开 `@omnimux/cli` 现网禁止管理员路由前缀，上下架 CLI 怎么挂要在 server 设计里先选。
- **not:** 不是官方 dsh 商店；不是每人一台云函数；不是管理员 Web 后台；不是本仓实现应用目录服务（属 OmniMux 云）。
- **authority:** `docs/logs/2026-08-15-app-marketplace-mvp.md`
- **superseded_by:** `2026-08-17-apps-catalog-json` / `docs/contracts/apps-catalog.md`
- **updated:** 2026-08-17

### Amendments
- 2026-08-17 — 官方货架改为 bundled + 远程 JSON。不再等 OmniMux 应用表。个人「我的」与管理员写接口仍不做。

## 2026-08-16-hub-io

- **status:** decided
- **topic:** 执行中枢 I/O；不再称中枢为网关
- **decision:** `dsh-omnimux` 只叫执行中枢。垂直包向中枢输入请求、接收结果或错误，不写 OmniMux HTTP。词表和缝名单在 `docs/contracts/hub.md`。落地分期在 `docs/decisions/2026-08-16-hub-io-and-facilities.md`。
- **why:** 「网关」会诱使代理在插件里再做一层路由计费。扩展单位是中性缝和官方独有工具。
- **not:** 不推翻「账号排期不进中枢」。不在本轮写 `imageGenerate` 代码。
- **authority:** `docs/contracts/hub.md`, `docs/decisions/2026-08-16-hub-io-and-facilities.md`
- **updated:** —

### Amendments
- 2026-08-16 — 规范落地。
- 2026-08-16 — 媒体四层写入 `docs/contracts/hub.md`；脚手架：`src/media/route.js` + `protocols/` + `vendors/`。
- 2026-08-16 — `videoGenerate` 支持 `wait: false` 与 `{ dest, taskId }` 续取；drama 提交当下写 `job_id`。
- 2026-08-16 — `ctx.provide('identity')`；`require()` 抛 `needs-omnimux`。
- 2026-08-16 — `imageGenerate` + `omnimux_image_submit`；默认 `gpt-image-2`（同步出图；`gpt-image2` 是另一条异步渠）。
- 2026-08-16 — P3–P7：能力门、official 客户端、社交数据第一刀、连账户/发帖、口播 metadata。
- 2026-08-16 — 分期计划真源：`docs/logs/2026-08-16-hub-capability-mount.md`。

## 2026-08-16-harness-consume

- **status:** decided
- **topic:** 消费官方 dsh，不整仓 fork
- **decision:** 不 fork `deepseek-harness`。版本单位是官方 pin × 产品仓 × 相对 pin 的补丁。官方 clone 只读。「应用」挂官方 `sidebar.footer.action`。桌面是新产品面，不是 fork。
- **why:** 整仓 fork 把上游预览期抖动焊进产品历史。设置上方已是官方加法位，不必改壳。
- **not:** 不搬 `apps/desktop` 独立仓。不向上游提功能 PR。不新开 `sidebar.lead.action`。
- **authority:** `docs/decisions/2026-08-16-harness-consume-not-fork.md`, `docs/harness-pin.md`
- **updated:** 2026-08-16

## 2026-08-17-apps-catalog-json

- **status:** decided
- **topic:** 官方货架用 bundled + 远程 JSON，不做应用表
- **decision:** Apps 列表只来自 `omnimux.app` 标记过的官方目录。底是中枢自带的 `apps/catalog.json`。可选再拉 `{siteBaseUrl}/apps/catalog.json`，缓存在 `$DSH_HOME/omnimux/apps/`。浏览器只打本机 `GET /omnimux/apps`。安装仍是钉版本的 `dsh plugin add`。不扫 profile 里全部 dsh 插件。
- **why:** 要躲的是应用管理后端，不是 OmniMux 云。不发 Desktop 也能改官方上架，但第一期可以只读 bundled。
- **not:** 不是个人「我的」；不是管理员写 API；不是远程代码；不是自动装卸。
- **authority:** `docs/contracts/apps-catalog.md`
- **updated:** 2026-08-17

### Amendments
- 2026-08-17 — Phase 1–3 landed in `dsh-omnimux`: bundled catalog, Host cache/refresh, Apps overlay reads `/omnimux/apps`. First real row is still a later PR.
- 2026-08-16 — First official row `accounts` (`dsh-omnimux-accounts`) + Host `/omnimux/accounts`. Bundled source: the package ships with the Desktop seed (or a local add); the shelf installs the bare name without a registry lookup. Isolated add/remove: `scripts/accept-apps-install.sh`.

## 2026-08-16-text-complete

- **status:** decided
- **topic:** 一次性专家补全；白名单不是第二套 chat
- **decision:** `textComplete` / `omnimux_text_complete` 走 `ctx.llm.stream` 一次。可调 `cordis.patch.yml` 里 8 个 chat 模型，用户可关。`model` 可省略，默认 `gemini-3.7-flash`（`OMNIMUX_TEXT_DEFAULT_MODEL` 覆盖）。不弹确认。图不进父会话。
- **why:** flash 等大脑缺识图或用户点名旗舰时，需要和生图同构的单次任务，而不是子代理或平行 chat。
- **not:** 不开放定价 94 个模型；本期不把 haiku / mini / flash-lite 写入 chat 目录；不直接打 `/v1/chat/completions`。
- **authority:** `docs/contracts/hub.md`
- **updated:** 2026-08-18

### Amendments
- 2026-08-18 — 识图模型按实测矩阵开放（gpt-5.6-sol / grok-4.6 / kimi-k3 / gemini-3.7-flash），默认模型改为 `gemini-3.7-flash`。证据：`docs/evidence/omnimux-modality-2026-08-18.md`。claude-opus-5 走 `/v1/messages` 支持图，但 chat-completions 分组 403，待分组升级后接入。

## 2026-08-30-physical-materialization

- **status:** decided
- **topic:** 画布与资产库 100% 物理实体化
- **decision:** 导入/拖入/生成不再只记外部 `real_path`。全局主体落 `$DSH_HOME/omnimux/assets/data/files/`；项目资产与画布绑作品包 `assets/` + `artifacts/`；JSON 只记相对路径。用户原文件永不删；删除项目不 `rm` 文件夹。
- **why:** 零拷贝导致断链与作品包无法离线打包。用户 2026-08-30 明确要求全部实体化。
- **not:** 本轮不改产品库、不改 OpenReel、不做 hardlink 去重、不隐式另存无项目画布。
- **authority:** `docs/contracts/project-assets-contract.md`, `docs/decisions/2026-08-30-physical-materialization.md`, `docs/specs/2026-08-30-omnimux-physical-materialization.md`
- **updated:** 2026-08-30

## 2026-08-31-workbench-split

- **status:** decided
- **topic:** 工作台挂 better-sidebar；对话不卸载；库页 overlay
- **decision:** 不发明三栏壳。剪辑 / 画布坐 `dsh-better-sidebar`；库页继续 overlay。`setFocus(split|gui|chat)` 只写右栏几何。无 better-sidebar 不回退 overlay。无当前会话不 `sessions.create`。
- **why:** 官方 `conversation` 不可卸载，`details` 只有 520px。用户要人机同面。
- **not:** 不把库页搬进右栏；不 shadow conversation；不改生产 profile。
- **authority:** `docs/contracts/workbench-split.md`, `docs/decisions/2026-08-31-workbench-split.md`
- **updated:** 2026-08-31

## 2026-08-31-workbench-libraries-318

- **status:** proposed
- **topic:** 一级库页全量迁入右侧工作台与顶部对话开关注入（Issue #318）
- **decision:** （待架构 ADR）产品倾向：废除「库页 = overlay」例外；8 个库页 + 广场 `registerTab`；画布默认 split、其余默认 gui；记忆按会话×Tab；`toggleCluster` 首位插入 gui↔split 对话开关；无 better-sidebar 仍不回退 overlay。
- **why:** overlay 遮会话、藏右栏，人机无法同面；#313 只覆盖剪辑/画布。
- **not:** 不迁 Apps/Settings；不卸载 conversation；不发明三栏壳；不改生产 profile。
- **authority:** `docs/specs/2026-08-31-workbench-libraries-and-toggle-prd.md`
- **updated:** 2026-09-02

### Amendments
- 2026-09-02 — #381：广场产品名改为「插件市场」；左栏入口从新会话 extra row 迁回 `sidebar.footer.action`（设置正上方）。右栏仍是 `omnimux-market:plaza` Tab，不 claim overlay。其它库页继续走 extra row，禁止 footer.action。
