# 3943 预签名头大小写重复与 Host 透传导致 SigV4 不匹配

Issue: #3943 · 分支 `agent/publish-presign-headers2-issue-3943` · 风险等级 **R2**（单插件 `omnimux-publish` 修复）

## 背景

#3938 让 `putBytes` 回放预签名响应的 `headers` 后，生产重试仍 403。网关侧抓到 R2 返回 `SignatureDoesNotMatch`，实际请求头键为：

```
content-type, Content-Type, Host, If-None-Match
```

两个问题：

1. `putBytes` 先写小写 `content-type`，再展开 ticket 里的 `Content-Type`，同一头大小写重复；fetch 合并后可能变成 `image/png, image/png`，与签名值不一致。
2. `PresignResult.Headers` 来自 AWS SDK `SignedHeader`，其中包含 `Host`。Host 由 HTTP 客户端自行生成并隐式签名，手工透传会与实际 Host 冲突。

## 方案

`plugins/omnimux-publish/src/hubtools.js`

1. `presign()`：把 `data.headers` 归一化为小写键；丢弃 `host`；同键后值覆盖前值（签名值优先），返回去重后的对象。
2. `putBytes()`：以 `content-type` 为底，逐条合并 ticket headers（小写键、跳过 `host`），保证每个头只出现一次。

## 假设

- R2/签名服务只要求业务签名头（`content-type`、`if-none-match` 等）出现在请求中；`Host` 由 HTTP 栈生成且签名隐式包含，显式回放反而破坏签名。网关 `pkg/storage/r2.go` 的 `SignedHeader` 遍历会带出 Host，因此客户端必须过滤。
- 头键大小写在 HTTP 上不敏感，但重复键会导致值合并；统一小写并覆盖是唯一稳定写法。

## 证伪方式

- 单测：ticket 含 `Host`、`Content-Type`、`If-None-Match` 时，`presign()` 只返回 `content-type`/`if-none-match`，无 host；`putBytes` 发送的 headers 只有一个 `content-type` 且无 `host`。
- 生产沙盒重试：同一失败子任务点「重试此渠道」，若仍 403 或仍出现重复头，则方案不成立（网关诊断日志会打印实际键列表与 R2 错误体）。

## 新用户基线

- 新用户无本机对象存储配置，仍走网关预签名；本修复只影响请求头构造，不新增失败路径。
- 上传失败仍明确报 `upload-failed`，不静默重试。

## 文档影响

无需改契约文档：`headers` 必须原样回放（除 host 由 HTTP 栈生成）已在 `hub-tool-contracts.md` 记录，本次是对该句的实现修正。
