# 规格：官方文本模型与本地 Agent 正交共存与独立放行 (Issue #2694)

## 一、问题背景与根因
当前全局设置包含 \`runtimeMode: 'agent'\`（用于将主会话对话或文本任务委托给本地安装的 CLI，如 \`codex\`、\`claude\`、\`kimi\`、\`qwen\`）。
但在文本执行层 \`plugins/omnimux/src/text/execute.js\` 中存在隐式强盗截胡逻辑：
只要全局满足 \`runtime.mode === 'agent' && runtime.textReady\`，不管调用方在工作流画布文本节点中选择了什么模型（例如中枢官方目录模型 \`gemini-3.8-flash\`、\`claude-opus-4-6\` 等），也不管是否登录了官方账号，文本执行一律无条件截胡并强行调用本地 CLI 执行（如 \`codex exec -m gemini-3.8-flash -- ""\`）。

这导致两大严重故障：
1. **模型不兼容报 400 失败**：本地 CLI（如 Codex 登录 ChatGPT 账号）根本不识别、不支持 Google Gemini 等外部模型，导致直接抛出 400 \`invalid_request_error\`。
2. **破坏正交共存治理**：用户在画布上显式选择了中枢官方模型（或中枢分组），系统具备官方凭据，本应由官方中枢执行，却被全局本地 Agent 隐式绑架。

## 二、架构设计原则：正交共存与显式意图优先
1. **显式意图优先（Channel & Model Intent Priority）**：
   - 提取请求中的渠道意图与模型信息；
   - 若请求显式指定了官方渠道（如 \`@official\`、\`@standard\`），或请求的模型属于官方已知中枢白名单模型且系统具备官方 Token，**无条件走官方路由 \`resolveTextRoute\` 执行**，扣除官方额度或使用官方凭据；
   - 绝不被全局 \`runtimeMode === 'agent'\` 截胡。
2. **本地 Agent 适用范围收敛**：
   - 仅当请求显式指定走 Agent（如 \`@agent\`），或者请求属于无显式指定渠道、且系统未配置官方凭据、处于纯本地 Agent 运行模式时，才交由本地 CLI（\`runAgentText\`）承接；
   - 传递给本地 CLI 的模型必须与该 CLI 的支持列表匹配，或使用用户在 settings 中配置的 \`runtimeAgentModel\`。
3. **空 Prompt 假死防御**：
   - 当文本请求的 \`prompt\` 为空且没有文本引用时，直接抛出合规校验错误，禁止向本地 CLI 发送空参数导致 CLI 挂起等待控制台输入（stdin）。

## 三、门禁与验证
- 单元测试：在 \`runtimeMode === 'agent'\` 下请求官方模型 \`gemini-3.8-flash\` 时，在具备官方 Token 时直接走官方中枢路由，不被 \`codex\` 截胡；
- 保证已登录官方账号的用户在任何运行模式下均可正常使用官方文本模型。
