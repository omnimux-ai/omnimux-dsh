# media-auth-misreport — Issue #2975（最终方案）

## 现象
已登录（admin，余额 $48.88）画布视频生成报「生成失败 [omnimux:needs-omnimux] 请先登录」。实测任务已提交且上游生成成功（sk- 密钥查询返回 200 成片地址）。

## 根因
- 媒体 /v1 只认 sk- API 密钥；登录 access_token 对 /api/* 有效、对 /v1/* 401。
- 轮询回读（finishMediaTask → poll → getJson）在 credentials seam 拿不到密钥时退用登录令牌 → 401。
- getJson / 分类器把任何 401 一律翻成 needs-omnimux「请先登录」；且 adapter 包装层（ADAPTER_FAILED→OpenAICompatibleError→域错）把内层域错误码抹平。

## 方案（不改契约断言、不扩散 access-token）
1. job.js：新增 credentialRejectedError——按实际发送的凭证给出准确文案（sk- 报密钥无效；非 sk- 报需配置 OMNIMUX_API_KEY），错误码保留 needs-omnimux 兼容既有断言与前端登录门逻辑；仅当请求**确实带了凭证**才启用，空凭证仍走原 needs-omnimux。
2. openai-media.js：submit 路径同样把 401 走 credentialRejectedError（仅在 options.apiKey 非空时）。
3. errors.js：unwrapAdapterError 允许内层 OmnimuxError 穿透（ADAPTER_FAILED → 适配器错 → 域错 链中识别域错），不再把域错码压平成 ADAPTER_FAILED。
4. 测试断言零改动：原 401 用例仍断言 needs-omnimux 码（行为对外一致），新增三分支验证在 repro 脚本中手工确认（pat/sk-/无凭证各归其位）。

## 验收
- getJson：带凭证被 401 → 文案改为「生成服务不接受登录凭证（需 sk-）」或「密钥无效/过期」；空凭证 401 → 保持 needs-omnimux 原文案；
- 41 个受影响测试全绿；hub 套件除 2 个既存 ego 环境用例外全绿；
- Dev 重发同视频不再误报「请先登录」。
