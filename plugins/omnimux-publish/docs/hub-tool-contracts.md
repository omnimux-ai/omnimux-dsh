# 发布插件使用的中枢合同

真源：[执行中枢合同](../../../docs/contracts/hub.md) 与 `src/hubtools.js`。
这是本地源码合同，不代表真实上游验收。

## 来源边界

发布插件固定 `provider=tiktok_direct`，只使用 `platform=tiktok` 的账号。
领域工具不开放来源切换；调用中枢时显式带来源。凭据与云端 HTTP 由中枢持有。

| 中枢工具 | 必填输入 | 云端入口 |
| --- | --- | --- |
| `omnimux_accounts_list` | `provider` | GET `/api/social/v1/accounts?provider=…` |
| `omnimux_accounts_connect` | `provider, platform` | POST `/api/social/v1/connect` |
| `omnimux_accounts_disconnect` | `provider, id` | DELETE `/api/social/v1/accounts/{id}?provider=…` |
| `omnimux_publish_create` | `provider, account_ids, content` | POST `/api/social/v1/posts` |
| `omnimux_publish_get` | `provider, id` | GET `/api/social/v1/posts/{id}?provider=…` |
| `omnimux_publish_presign` | `filename`，可选 `content_type` | POST `/api/social/v1/media/presign` |

创建正文使用 `content`，不是 `text`；媒体 URL 放在 `media_items`。
创建结果的 `data.id` 是云端 post ID。重试入口传本地 `task.id`，不传 record ID。

## 账号与失败语义

中枢账号工具返回裁剪后的 `{accounts}`，保留 `id/platform/provider`，不包含 token。
本包 `AccountSource` 再按白名单裁剪并叠加本地 metadata；overlay 不可伪造来源。
可用账号必须为官方 TikTok，状态 active/expiring，且 `agent_usable !== false`。

未登录、上游失败、格式错误都不能包装成成功空列表。
来源缺失/未知为 400；跨来源账号/任务为 409
`account-provider-mismatch` / `post-provider-mismatch`。
旧草稿保留内容与素材，不自动换号；非官方或来源不明的历史任务只读。
保存选择、分配、提交、重试共享服务端校验；重试检查早于计数、状态和上传副作用。

## 工具结果

`ctx.tools.execute({callId, name, arguments})` 返回 `{content, isError, value}`。
先检查工具失败及云端 `success:false`，再解析结果。
创建/查询使用 `{success:true,data:{id,provider,status,…}}`。
状态映射以 `statusMap` 为准；未知状态保留 raw_status，不推断成功。

## 媒体例外与剩余验收

媒体预签名仍依赖 Zernio，未增加来源参数，后续跟踪 #624。
上传 PUT 不携带网关凭据。本次不改计费、席位、官方撤销和 Zernio 402 政策。
真实授权、发布、状态回收、解绑，以及预签名 URL 有效期与复用能力均需独立证据。
fixture 和本地测试不证明官方发布全链路成功。

## 网关 TikTok Direct 联调对账单（Issue #3898）

当云端网关（`omnimux.ai/api/social/v1/*`）完成 TikTok 官方接口与自有对象存储接入时，按以下契约与本插件零代码改动咬合：

| 环节 | HTTP 入口 | 插件/中枢请求体或查询参数 | 网关成功响应（支持直返或 `{success:true, data}` 信封） |
| --- | --- | --- | --- |
| 1. 列出账号 | `GET /api/social/v1/accounts?provider=tiktok_direct` | Query: `provider=tiktok_direct` | `{ accounts: [{ id, platform: "tiktok", provider: "tiktok_direct", display_name, username, avatar_url, status: "active" \| "expiring" \| "expired", expires_at }] }`（注：`computeStatus` 仅认 `active/expiring/expired`，空值按 `expires_at` 推导为 `active`，切勿返回 `connected`） |
| 2. 发起授权 | `POST /api/social/v1/connect` | Body: `{ provider: "tiktok_direct", platform: "tiktok", redirect_url? }` | `{ auth_url: "https://www.tiktok.com/v2/auth/authorize?..." }`（仅接受 `https://`） |
| 3. 解绑账号 | `DELETE /api/social/v1/accounts/{id}?provider=tiktok_direct` | Query: `provider=tiktok_direct` | `{ success: true }` |
| 4. 媒体预签名 | `POST /api/social/v1/media/presign` | Body: `{ filename, content_type? }` | `{ upload_url: "https://...", public_url: "https://..." }`（插件以无鉴权头 `PUT` 字节至 `upload_url`） |
| 5. 创建帖子 | `POST /api/social/v1/posts` | Body: `{ provider: "tiktok_direct", account_ids: [id], content, media_items: [{ url: public_url }] }` | `{ id: "<post_id>", provider: "tiktok_direct", status?: "submitted" }`（ID 字段兼容 `id / post_id / taskId / task_id`） |
| 6. 查询状态 | `GET /api/social/v1/posts/{id}?provider=tiktok_direct` | Query: `provider=tiktok_direct` | `{ id: "<post_id>", provider: "tiktok_direct", status: "<raw_status>" }`（状态字段兼容 `status / platform_status / raw_status`） |

### 状态映射（`BUILTIN_STATUS_MAP`）

- **发布中（`submitted`）**：`scheduled`、`pending`、`queued`、`processing`、`in_progress`、`publishing`、`submitted`
- **审核中（`reviewing`）**：`review`、`reviewing`、`pending_review`、`under_review`、`in_review`、`audit`、`auditing`
- **已发布（`published`）**：`published`、`success`、`done`、`completed`（TikTok 沙盒未过审应用发出的私密帖 `SELF_ONLY` 完成后同样返回此组状态）
- **失败（`failed`）**：`failed`、`error`、`rejected`、`reject`、`blocked`、`removed`、`deleted`
- 未在表内的未知状态字符串：保留在子任务 `raw_status` 展示，不臆测为成功或失败。
