# 规范：推特就地助手运行时异常修复与端口优先路由 (Twitter Copilot Runtime Fix)

## 1. 业务背景与问题定义
- **问题现象**：
  在推特页面推文下方点击「推文回帖助手」（如「同行互关建联」）时，界面提示红色错误 `模型服务暂未响应，请检查 OmniMux 运行状态`，即使桌面端 OmniMux Dev (45120) 正常在线也无法生成回复。
- **根因分析**：
  1. `plugins/omnimux-browser/extension/src/content/twitter-copilot/menu.ts` 中的 `handleExecuteItem` 调用 `requestLlmGeneration` 时漏传了 `scene` 场景参数；
  2. `requestLlmGeneration` 顶层函数内部直接引用了未在当前作用域声明的 `scene` 变量（构建 `context: { scene, ... }`），导致运行时立即抛出 `ReferenceError: scene is not defined`；
  3. `requestLlmGeneration` 捕获异常后返回 `null`，调用方在捕获或空结果时统统提示“模型服务暂未响应”，误导用户认为是桌面端断开；
  4. 扩展后台 `DSH_TWITTER_COPILOT_GENERATE` 处理分支未优先读取用户在工作区选择器中持久化的 `omnimux_target_port`。

---

## 2. 修复契约与实现规范

### 2.1 推特助手菜单执行契约 (`menu.ts`)
1. **参数传递完备性**：
   `requestLlmGeneration` 函数签名显式增加 `scene: TwitterCopilotScene` 参数：
   ```ts
   async function requestLlmGeneration(
     systemPrompt: string,
     userMessage: string,
     ctx: TwitterContext,
     itemId: string,
     locale: 'zh' | 'en',
     scene: TwitterCopilotScene,
   ): Promise<string | null>
   ```
2. **调用处对齐**：
   `handleExecuteItem` 调用时将接收到的 `scene` 完整透传给 `requestLlmGeneration`。
3. **精准报错提示**：
   区分“本地前端执行异常”与“模型服务未响应”，当进入 catch 时明确输出调试日志并提供真实异常提示，不掩盖底层逻辑。

### 2.2 扩展后台端口优先路由契约 (`background/index.ts`)
1. 当收到 `DSH_TWITTER_COPILOT_GENERATE` 消息时：
   - 优先通过 `chrome.storage.local.get('omnimux_target_port')` 获取用户在实例选择器中激活的目标端口（如 45120）；
   - 将该端口拼装为候选基址首位 `http://127.0.0.1:${port}`；
   - 接着加入桥接推导地址及预设端口 `45120`, `43120`, `3080`；
   - 去重后依次请求 `/omnimux/text/complete`。

---

## 3. 验收标准
1. **类型检查**：`menu.ts` 无 TS18004 语法与作用域错误，`typecheck` 或构建通过；
2. **单元测试与回归**：扩展与工作区现有测试不破坏；
3. **真实产物构建**：`pnpm run build:extension` 顺利生成 `dist/content.js` 与 `dist/background.js`；
4. **运行时验证**：`dist/content.js` 中 `Dr`（即 `requestLlmGeneration`）函数正确接收并使用 `scene` 参数，不再产生未定义变量引用。
