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
