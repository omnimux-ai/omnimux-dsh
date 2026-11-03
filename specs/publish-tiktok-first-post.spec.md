# 3913 打通 TikTok 官方直连首帖（账号 ID 类型对齐）并说清当前仅私密可见

Issue: #3913 · 分支 `agent/publish-tiktok-first-post-issue-3913` · 风险等级 **R1**（触及 hub 公共 I/O `plugins/omnimux/src/official/publish.js`）

## 背景

线上网关 `GET https://api.omnimux.ai/api/social/v1/status` 已返回 `tiktok_direct: { enabled: true, configured: true, active: true }`，说明官方直连已在生产生效。但两处摩擦导致第一条真帖发不出去、发出去也看不懂：

1. **账号 ID 类型不匹配（阻断）**：网关 `POST /api/social/v1/posts` 的请求体把 `account_ids` 绑定为 `[]int64`（网关 `controller/social.go` 的 `socialCreatePostRequest`），而本仓链路把账号 id 统一转成字符串：hub `pickAccount` 会 `String(row.id)`，`omnimux-publish` 的草稿账本也按字符串存。hub `createPost` 校验通过后原样把字符串数组放进请求体，网关 JSON 绑定失败，返回 `invalid request body`，用户点「确认发布」必然失败。
2. **私密态未说明**：TikTok 应用审核通过前，网关默认 `privacy_level = SELF_ONLY`（网关 `resolveTikTokPostOptions` 的空值默认）。桌面端发布成功后没有任何说明，用户去 TikTok 找不到视频，会以为发布失败并反复重试。

## 方案

1. **中枢发帖前把数字账号 ID 转成数字**（`plugins/omnimux/src/official/publish.js`）：
   - 校验仍按字符串进行（不改变既有 `account-provider-mismatch` / `account-agent-disabled` 语义与失败顺序）。
   - 在发出请求前做一次 `account_ids.map`：纯数字字符串 → `Number`；非数字字符串原样保留（保持既有 Zernio 夹具与历史测试行为，不引入新的拒绝路径）。
   - 只改 `createPost` 的请求体，不改工具 schema（`account_ids` 仍声明为 string 数组），因此桌面端与 Agent 侧无破坏性变更。
2. **发布详情页说明当前仅私密可见**（`plugins/omnimux-publish/src/client/RecordDetail.jsx` + `locales.js`）：
   - 当记录存在 `platform=tiktok && provider=tiktok_direct`、已拿到上游 `post_id` 且状态处于 `submitted / reviewing / published` 的子任务时，在详情页显示 `omnimux-publish-alert banner` 提示（复用既有 token 样式，不新增色值）。
   - 中英双语文案：中文「TikTok 应用审核通过前，新发布的视频在 TikTok 内为「仅自己可见」。请到 TikTok App 确认，必要时改为公开。」；英文对应。
   - 历史非官方任务、草稿、失败任务不显示该提示（避免误导）。

## 假设

- 网关账号 ID 即本地 `model.SocialAccount.ID`（正整数 int64），因此「纯数字字符串转 Number」对所有真实账号成立；非数字 ID 只可能出现在历史夹具或已下线的第三方来源中，原样透传不会制造新的失败面。
- 桌面端只通过 hub 工具 `omnimux_publish_create` 发帖，不存在第二条绕过 `createPost` 的请求路径，因此单点转换即可覆盖发布与重试。
- 审核通过前网关不会接受 `PUBLIC_TO_EVERYONE`，所以本轮只做「说清楚」，不做隐私等级选择器；等审核通过再单独加选择入口，避免上线一个必然失败的控件。
- 本仓当前没有 TikTok 应用审核状态的权威数据源（网关 `/api/social/v1/status` 也不暴露 review 状态），因此该提示是静态的：审核通过后需要随「隐私选择器」一起改文案或下线，不在本轮伪造一个本机开关。

## 证伪方式

- 在隔离 worktree 用本地模拟网关（严格按 `[]int64` 绑定校验）跑真实浏览器发帖：若中枢仍发送字符串 ID，网关会回 `invalid request body`，详情页停留在失败态；修复后同一流程应显示「已发布」。同时用单元测试断言 `createPost` 发出的 `account_ids` 为 `[12]` 而非 `['12']`，并断言非数字 ID 原样透传。
- 在详情页用含 `provider=tiktok_direct` 子任务的记录渲染：若提示不出现，或草稿/非官方记录也出现提示，则说明文案条件写错；用组件测试对四种记录（直连已发布、直连失败、草稿、非官方历史）逐条断言。
- 运行 `pnpm --filter omnimux-publish test`、`pnpm --filter omnimux test`、`pnpm check:boundaries`、`pnpm verify:product-baseline`：任一失败即本次改动不成立。

## 新用户基线

- 新用户安装并登录后，在【发布】里绑定 TikTok 官方账号并发帖，不需要任何本机代理、额外环境变量或 Zernio 租户；未登录时仍走既有 `needs-omnimux` 提示，不静默降级。
- 提示文案只描述平台行为，不暴露内部 provider 标识；未绑定账号或未登录时详情页不会出现该提示。

## 文档影响

更新 `plugins/omnimux-publish/docs/hub-tool-contracts.md`：在对账单中注明 `account_ids` 在网关侧为数字，由中枢在发送前完成字符串→数字转换，桌面端与 Agent 仍传字符串。
