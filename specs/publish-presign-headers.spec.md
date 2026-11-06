# 3938 预签名上传漏传签名头导致 R2 403

Issue: #3938 · 分支 `agent/publish-presign-headers-issue-3938` · 风险等级 **R2**（单插件 `omnimux-publish` 非破坏性修复）

## 背景

生产桌面端对 TikTok 官方沙盒账号发图文：`POST /api/social/v1/media/presign` 200，随后 PUT 字节得到 **403**，子任务 `media upload failed (HTTP 403)`，帖子无法创建。

网关 `pkg/storage` 的 R2 预签名把 `If-None-Match: *` 签进 URL（防止同名对象覆盖），并在响应里返回 `headers`（含 `if-none-match` 与 `content-type`）与 `upload_method`。本插件：

- `hubtools.presign()` 只取 `upload_url` / `public_url`，丢弃 `headers` / `upload_method`；
- `putBytes()` 只发 `content-type`。

SigV4 要求所有 SignedHeader 都出现在请求里；缺 `If-None-Match` 即签名不匹配，R2 返回 403。

## 方案

1. `plugins/omnimux-publish/src/hubtools.js`
   - `presign()` 额外返回 `headers`（对象，仅字符串值）与 `upload_method`（字符串，缺省 `PUT`）。
   - `putBytes(uploadUrl, buffer, contentType, opts, headers)`：以预签名 `headers` 为准合并发送，`content-type` 作为回退；`upload_method` 不是 `PUT` 时抛 `upload-failed`（不猜测）。
2. `plugins/omnimux-publish/src/submit-media.js`
   - `ensureUploaded` 把 `headers` / `upload_method` 一并传给 `putBytes`。
3. 契约文档 `docs/hub-tool-contracts.md` 补一句「预签名响应的 headers 必须原样发送」。

## 假设

- 网关对 `media/presign` 返回的 `headers` 覆盖全部 SignedHeader，因此客户端只要原样回放即可通过校验；本条已由网关 `pkg/storage/r2.go` 的 `SignedHeader` 遍历证实。
- `upload_method` 目前恒为 `PUT`；非 `PUT` 时失败而不是退回 PUT，避免静默发错请求。
- 旧网关若不返回 `headers`，`presign()` 退化为空对象，`putBytes` 保持仅发送 `content-type` 的旧行为，不破坏老版本兼容。

## 证伪方式

- 单测：断言 `presign()` 透传 `headers`/`upload_method`；`putBytes` 请求头包含 `if-none-match: *` 与 `content-type`；`upload_method: 'POST'` 时抛 `upload-failed` 且不发请求。
- 用本地假网关（与生产同形：严格校验 `If-None-Match`）跑 `pnpm --filter omnimux-publish test`；若把 `headers` 回放删掉，上传用例必须转红。
- 生产沙盒实测（人为触发）：同一账号重试子任务，403 消失、子任务进入 submitted/published；若仍 403 则本方案不成立。

## 新用户基线

- 新用户安装后直传走网关预签名，无需本机任何对象存储凭据；网关未返回 `headers` 时沿用旧行为，不新增失败路径。
- 上传失败仍以 `upload-failed` 明确报出，不静默重试或降级。

## 文档影响

更新 `plugins/omnimux-publish/docs/hub-tool-contracts.md`：预签名响应 `headers` 必须随 PUT 原样发送，`upload_method` 非 PUT 明确失败。

## 旧标准变更

- `plugins/omnimux-publish/src/hubtools.test.js` :: `presign returns upload_url + public_url from the data envelope`

原断言为 `deepEqual(result, { upload_url, public_url })`；因为 `presign()` 现在按契约额外返回 `headers`（签名头）与 `upload_method`，原断言对新返回形状不再成立。新期望为 `deepEqual(result, { upload_url, public_url, headers: {}, upload_method: 'PUT' })`，并保留原两条工具入参断言不变。这不是放宽，而是把新增必填字段纳入同一断言。

