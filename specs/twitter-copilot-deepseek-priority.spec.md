# 规范：推特就地助手优先调度 DeepSeek 大模型 (Prioritize DeepSeek Live Model)

## 1. 业务目标
针对推特复杂社交生态（流行梗、网络亚文化、技术工具探讨），优先调度深度思考能力最强的 DeepSeek 官方大模型通道（`deepseek-flash`），以提供最接地气、有梗有信息增量的高赞神评，并保持秒级响应。
备选通道为 `apikey.fun` 的 `kimi-k2.6`，两者均经过自动化真实推理验证。
