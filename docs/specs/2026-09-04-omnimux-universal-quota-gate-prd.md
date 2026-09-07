---
title: "OmniMux 全局额度不足与统一充值弹窗 - 产品需求文档 (PRD)"
id: "prd-omnimux-universal-quota-gate"
type: "prd"
status: "proposed"
authority: "L2"
date: "2026-09-04"
updated: "2026-09-04"
authors: ["齐活林", "许清楚"]
subsystem: "omnimux"
version: "1.0.0"
related:
  - "docs/specs/2026-08-28-omnimux-universal-login-gate-prd.md"
  - "docs/specs/2026-08-20-omnimux-login-gate.md"
  - "docs/contracts/hub.md"
---

# OmniMux 全局额度不足与统一充值弹窗

## 1. 项目信息

- Language：中文；Project Name：`omnimux_universal_quota_gate`
- 产品经理：许清楚（Xu）。
- 原始需求：增加共享的“余额不足→提示充值”能力；所有插件调用 OmniMux 云 API 在余额不足、预扣费失败或 402 时统一弹出同一充值窗，而非各自 toast、节点报错或静默失败；本 PRD 盘点触发面、定义交互和实施边界，不含代码。
- 云 API 指 `api.omnimux.ai` 或 `omnimux.ai` 托管接口；本地 Host CRUD、文件系统和 OpenReel 不算计费调用。

## 2. 产品定义

### Product Goals
1. **统一识别**：所有云调用统一识别 402、`insufficient_user_quota`、预扣费失败及 Harness `QUOTA`。
2. **统一体验**：中枢单点提供充值门，垂直插件只消费 `window.__*` seam，不 import hub、不自建 HTTP 或 UI。
3. **安全恢复**：展示可理解原因并保留业务失败态；充值外部站点不可确认到账，本期不自动重试原请求，避免重复扣费/发布/生成。

### User Stories
- As a 创作者，I want 生成额度不足时看到统一充值窗，so that 我能立即进入钱包。
- As a 工作流用户，I want 节点保留失败态且同时得到全局提示，so that 我能知道该节点未完成。
- As a 账号/发布/分析用户，I want 云错误使用同一套提示，so that 不必理解插件内部错误术语。
- As a Agent 用户，I want 工具得到稳定结构化额度错误，so that Agent 可解释失败而不被 UI 打断。

## 3. 现状与断层

登录门已统一为 `window.__omnimuxAuth.ensureLogin()`，登录门架构规定垂直不得 import hub；Agent 的 `needs-omnimux` 遵循“dsh 不会替插件弹窗”。额度当前只有 `quota-failure.js` 的 turn 尾检测和 `QuotaTopUpLink` 轻量链接，未跨插件去重。`official/client.js` 把 401/403 都变成 `needs-omnimux`，402 并入 `omnimux-request-failed`；`media/job.js` 非 2xx 统一为下载失败；各垂直 `authGuard` 只处理 401。因此存在 official 402 映射、Host→client 错误传递、全局 seam 和去重四个断层。

## 4. 触发场景全量盘点

盘点依据已读代码中的 `ctx.get`、`withPat`、`omnimux_*`、Host client 及 `hub.md` 合同。P0“是”仅指**客户端可见云调用**；Agent 同一调用面按“否”处理。

| ID | 插件/表面 | 调用链 | 计费面 | 今日表现 | P0统一弹窗 | 排除理由 |
|---|---|---|---|---|---|---|
| T-01 | Chat | dsh `llm-pi-ai` → OmniMux chat completions | sk- gateway | turn 尾 QUOTA，显示 `quota.hint/topUp` 链接 | 是 | 现有能力升级为全局门 |
| T-02 | workflow 文本节点 | `ctx.get('textComplete')` → hub → chat completions | sk- gateway | 节点失败 | 是 | 云调用 |
| T-03 | workflow 图片节点 | `ctx.get('imageGenerate')` → media route/job → images API | sk- gateway | request-failed | 是 | 云调用 |
| T-04 | workflow 视频节点 | `ctx.get('videoGenerate')` → submit/poll/download → video API | sk- gateway | submit/poll/download 无额度码 | 是 | 云调用 |
| T-05 | workflow 音频节点 | `ctx.get('audioGenerate')` → media job → audio API | sk- gateway | request-failed | 是 | 云调用 |
| T-06 | Agent media submit | `omnimux_video/image/audio_submit` → seam/job → 云 | sk- gateway | 结构化工具错误 | 否 | Agent 只结构化返回，不自动弹窗 |
| T-07 | Agent text | `omnimux_text_complete` → textComplete → 云 | sk- gateway | 结构化工具错误 | 否 | 同上 |
| T-08 | Agent reader | `omnimux_page_fetch` → `POST /v1/reader` | sk- gateway | request-failed | 否 | Agent 无合适 UI 上下文 |
| T-09 | Agent social | `omnimux_social_data` → social-data API | sk- gateway | request-failed | 否 | 同上 |
| T-10 | accounts | client → Host `/omnimux/accounts` → `withPat` → accounts API | PAT site | 页面错误；authGuard 仅 401 | 是 | 客户端云面 |
| T-11 | inspiration 云灵感 | client → Host `/omnimux/inspiration` → `withPat` → inspirations API | PAT site | 加载/编辑错误；仅 401 登录门 | 是 | `local/*` 不纳入 |
| T-12 | analytics 概览/洞察/粉丝/帖子 | client → Host `/omnimux/analytics/*` → aggregate → analytics API | PAT site | dashboard/HTTP 错误 | 是 | 云面 |
| T-13 | analytics 同步 | client → `/omnimux/analytics/sync` → hub → sync API | PAT site | 同步失败 | 是 | 云面 |
| T-14 | publish 预签名 | publish → Host → `omnimux_publish_presign` → social API | PAT site | upload/hub-tool-error | 是 | 云面 |
| T-15 | publish 创建/查询 | publish → `publish_create/get` → `withPat` | PAT site | 子任务/发布错误 | 是 | 云面，不自动重试 |
| T-16 | publish 账号读取 | publish → `omnimux_accounts_list` → `withPat` | PAT site | 加载错误 | 是 | 云面；与 accounts 去重 |
| T-17 | Agent official 全量 | Agent → `accounts/publish/inspiration/analytics_*` → PAT API | PAT site | 结构化错误 | 否 | 遵循 Agent 决策 |
| T-18 | products AI 辅助（P1） | UI → textComplete/imageGenerate → 云 | sk- gateway | 功能失败 | 是（P1接入后） | 本地 CRUD 不计费 |
| T-19 | inspiration 本地分析/视频理解 | 页面 → textComplete/video analyze → 云 | sk- gateway | analyze/provider 错误 | 是 | 分析是云调用 |
| T-20 | omnimux-video 理解 | `ctx.get('textComplete')` → chat completions | sk- gateway | video-analyze-failed | 是（客户端触发） | 计费 textComplete |
| T-21 | Host 代理上述能力 | client → `/omnimux/*` → hub → 云 → `{status,body}` | sk-/PAT | 402 被通用错误吞掉 | 是 | 主要传输边界 |
| T-22 | media 原始响应 | Host → `withPatRaw`/job → 云 | PAT/sk- | 仅 401/403 特殊处理 | 是（客户端） | 需保留额度信息 |
| T-23 | assets | client → Host `/omnimux/assets` → 磁盘 | 无 | 413 磁盘不足等 | 否 | 本地能力 |
| T-24 | products 本地 CRUD | client → Host `/omnimux/products` → 本地库 | 无 | 本地错误 | 否 | 本地能力 |
| T-25 | clip | OpenReel 本地管线 → 本地持久化 | 无 | 解码/导出错误 | 否 | 非云 |
| T-26 | market | 本地目录/SkillHub | 无 | 网络/安装错误 | 否 | 非 OmniMux 计费 |
| T-27 | video-preview | 本地预览流 | 无 | 预览错误 | 否 | 非云 |
| T-28 | Host/local 其他 CRUD | Host `/omnimux/*` 本地写入 | 无 | 数据/磁盘错误 | 否 | 本地能力，不误报充值 |

**合计 28 条：P0 纳入 18 条（T-01~05、T-10~16、T-18~22，T-18 为 P1能力接入后的纳入）；明确排除 10 条（T-06~09、T-17、T-23~28）。** Agent 面即使不弹，也必须可返回结构化额度错误。

## 5. 判定规则

### 算作余额不足
满足任一即产生额度事件：HTTP 402；JSON 任意常见层（`code`、`error.code`、`data.code`）为 `insufficient_user_quota`；消息含“预扣费额度失败”；失败对象 `code === QUOTA`；或与现有 `isQuotaFailure` 对齐的 `insufficient quota/balance/credits`、`quota/usage-limit exceeded|exhausted|reached`、`exceeded current quota`、`balance/credits exhausted|depleted`。

判定必须读取嵌套 `error/data`、JSON 字符串及 `cause` 链。现有实现只读对象的 `code/message`，不识别 primitive 字符串、嵌套 code 或 status 402，且未覆盖 media/job、official client，属于明确缺口。额度证据优先于裸 403。

### 明确不是充值
真 401（先登录）；没有额度证据的真 403（模型/分组权限）；429（限流）；`capability-disabled`、`needs-provider`、`omnimux-unconfigured`、未知模型/协议、参数错误、网络错误、磁盘不足；附件或 sessionStorage 的本地 `quota-exceeded`。裸“quota”不足以判定云余额。

## 6. 功能与交互逻辑

### seam 与触发
推荐中枢安装 `window.__omnimuxQuota`（与 `__omnimuxAuth` 平级），垂直只懒读取。能力面建议 `notify(failure, context?)`、`subscribe`、`getSnapshot`、`walletUrl`，由中枢唯一渲染 modal；技术名由架构师裁定。更优先在 Host/client 统一拦截，垂直仅补充无法经过 wrapper 的 seam。不得新增 Settings section。

客户端额度确认后立即弹；同一操作的 submit/poll/download 只通知一次；同一时刻多失败合并一个门，建议 2 秒冷却。非额度不弹。未登录先 `__omnimuxAuth.ensureLogin()`，登录后最多重试一次，随后若 402 才弹充值门。

Modal 文案：标题“可用额度不足”；说明“当前操作需要更多额度，充值后即可继续使用 OmniMux。”；主 CTA“去充值”；次 CTA“关闭”。可补充能力名称，不展示 JSON、prompt、token 或 key。CTA 打开 `walletUrl`：默认 `https://omnimux.ai/wallet`，有 profile.base_url 则安全拼接 `/wallet`。

关闭、ESC、遮罩和 SVG close 均关闭；不自动重试、不清除业务失败态；焦点进出可访问。**充值后不自动重试**：支付在外部站点且到账不可确认，自动重试会导致重复扣费/发布/生成；返回后由业务提供显式重试。登录门仍按原 PRD自动恢复，二者不能混淆。

Chat 保留 turn 失败，modal 置顶；Tab 保留加载/同步错误和表单；画布节点为 failed 且有显式重试，同时弹全局窗。Agent 工具不弹，返回 `code: QUOTA`/`quota-exceeded`、`retryable:false` 和安全可读 message；与 2026-08-14 “dsh 不会替插件弹窗”一致。

## 7. UI 设计稿

```text
+------------------------------------------+
| [额度 SVG]  可用额度不足          [关闭 SVG] |
| 当前操作需要更多额度，充值后即可继续使用 OmniMux。 |
|                          [去充值] [关闭] |
+------------------------------------------+
```

单列约 420px、窄屏自适应、Modal 圆角 16px；比登录门轻量，因为本门是操作反馈，不需要深海海报、设备码和品牌叙事。消费 `--dsw-alias-bg-mask-1`、`--dsw-alias-bg-elevated`、`--dsw-alias-label-primary/secondary`、`--dsw-alias-border` 与语义 warning token，禁止 raw hex/rgba；控件高 32px、控件圆角 8px、间距 8/16px、SVG 图标、WCAG AA。文案 key 预留 `quota.gate.title/description/topUp/close/context.*`。

## 8. 需求池与验收

### P0
- 统一分类覆盖 402、嵌套 `insufficient_user_quota`、预扣费、QUOTA、cause 与既有正则。
- 中枢唯一全局 seam/modal，客户端云调用全接入、并发去重。
- official 402 与 media submit/poll/download 保留可判定 status/code/message；Host 安全传递。
- 401、裸403、429、capability-disabled 不误触发；wallet URL、关闭行为统一。
- Chat/Tab/画布失败态保留；Agent 只结构化错误；垂直不 import hub/自建 UI/HTTP。
### P1
- correlation id 和跨 Tab 去重；统一中英文文案与焦点可访问性；显式业务重试；QuotaTopUpLink 收敛到共享门；埋点仅记录能力/计费面/结果，不记录 prompt/secret。
### P2
- 钱包返回后的余额刷新与用户确认重试；额度展示/预估；转化漏斗看板。

### Given/When/Then
- Given 客户端云请求 HTTP 402，When 收到失败，Then 只显示一个“可用额度不足” modal，业务保持失败态。
- Given 403 同时含 403 与 `insufficient_user_quota`，When 分类，Then 为 QUOTA 而非 AUTH；裸 403/401/429 不弹充值。
- Given 三插件同刻额度失败，When 事件抵达，Then 只有一个 modal。
- Given 未登录请求，When 返回 401，Then 先登录；登录重试一次后 402 才充值。
- Given profile.base_url 为空/自定义，When 点去充值，Then 分别打开默认/该站点 `/wallet`。
- Given 用户关闭或 ESC，When 门消失，Then 不重试且保留节点/Tab/turn 失败态。
- Given Agent 工具额度失败，When 执行结束，Then 无 modal，返回结构化 QUOTA 且无 secret。

## 9. 非目标

不内嵌支付收银台、不做余额实时预检/套餐页、不改云计费、不把 429 当余额、不允许垂直自建充值页、不把资产/产品本地 CRUD、clip、市场、预览或磁盘不足算触发源、不因充值成功自动重试。

## 10. Open Questions（≤5）

1. 钱包是否统一用系统浏览器打开？**产品建议**复用登录门 `openAuthUrl`。
2. 关闭后的抑制窗口是否为默认 2 秒，还是同能力 30 秒？**产品建议**先 2 秒并按操作 correlation 去重。
3. `profile.base_url` 是否仅信任已登录 profile 字段？**产品建议**是，不接受错误 payload 覆盖。
4. 后续是否做“返回钱包→刷新余额→用户确认重试”？**产品建议**作为 P1/P2，不改变本期不自动重试。

## 11. 给架构师的输入摘要

1. 归属 `plugins/omnimux`，推荐 `window.__omnimuxQuota` 平级 seam；垂直懒读、不得 import hub。
2. 客户端计费云调用 P0；Agent 不弹，仅结构化 QUOTA，沿用既有边界。
3. 402/`insufficient_user_quota`/预扣费/QUOTA 统一，额度证据优先裸 403；401、真403、429 严格排除。
4. official 402 映射、media job 多阶段、Host→client status/code/message 是首要技术断层。
5. 单门去重，Chat/Tab/节点失败态保留；充值不自动重试，显式重试。
6. 使用 DSH `--dsw-*` token、32px、8px/16px、SVG、无 Settings section。
7. 实施顺序：错误分类→官方/媒体映射→Host传递→全局 seam/modal→逐面接线与测试。

## 12. 核验真源

`docs/specs/2026-08-28-omnimux-universal-login-gate-prd.md`、`docs/specs/2026-08-20-omnimux-login-gate.md`、`plugins/omnimux/src/client/quota-failure.js`、`QuotaTopUpLink.jsx`、`plugins/omnimux/src/official/client.js`、`plugins/omnimux/src/media/job.js`、`plugins/omnimux/src/media/errors.js`、`plugins/omnimux/src/client/api-auth.js`、`docs/contracts/hub.md`、`research/omnimux/sources/official/15-connection-usage.md`、[历史额度补丁与现行替代合同](../contracts/quota-error-compatibility.md)、`docs/harness-pin.md`、`docs/decisions/2026-08-14-execution-hub.md`、`design.md`。
