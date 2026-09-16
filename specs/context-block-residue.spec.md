# 规格说明：用户气泡「会话关联上下文」残留空行与孤立引用图标根治

Issue: #2074 · 插件: omnimux · 风险: R2

## 一、背景与问题

在新建会话首页点击「复刻」并发送后，用户消息气泡异常增高：用户正文下方出现多条空白行，每行左侧残留一个「方框带横杠」的小图标且右侧没有任何文字。

像素级复测（对用户截图逐行扫描）：气泡内 `/video-deconstruct 复刻这条爆款视频` 之下存在 **4 个 19×21px 元素**，等距 **52px** 竖排，其右侧内容区亮度为纯底色，确认无文字。

根因链路（代码路径 + 像素双重锁定）：

1. `plugins/omnimux/src/client/composer-add/AttachmentSubmitBridge.jsx` 的 `check()` 在每次发送前把 `assemblePromptWithAttachments(draft, attachments, sessionId)` 的结果 `setDraft` 回用户草稿，即在**消息正文尾部**拼上 `\n\n---\n### 会话关联上下文 (Attached Context):\n- [视频] …: @inspiration/xxx.mp4`。
2. DSH 渲染用户气泡时用 `projectUserText` 把 `@inspiration/…` 解析成「图标 + 文件名」的引用块（refChip + svg）。
3. `plugins/omnimux/src/client/attachments/attachedContextCleaner.ts` 事后擦除该数据块时**只处理 Text 节点**（截断 / 置空 / `remove()`），承载图标的**元素节点被留下**：文字被掏空、图标还在 → 只剩孤立图标与空行。

关键事实：**同一份数据已经走原生通道，模型不依赖草稿拼接。**

`plugins/omnimux/src/client/workbench/context.js` 的 `getUiContext()` 已把同一份 `buildAttachedContextBlock(attList, sessionId)` 放进 `attachedContextText`，经 `events-client.js` 的 2s 心跳送到宿主 mailbox，再由 `plugins/omnimux/src/workbench/context-injector.js` 在 `agent/pre-step` 注入为原生上下文消息 —— 即用户截图里可见的「上下文注入 · omnimux-workbench」。

本方案与仓库既有规格一致：`specs/unified-reference-architecture.spec.md` 已把「硬编码追加 `### 会话关联上下文` 再在前端强行擦除 DOM」列为反模式；`specs/fix-context-polluting-input.spec.md` 要求输入框与气泡零污染。本任务是该反模式的**收尾清除**，不新增产品能力。

## 二、验收标准与核心行为

### A. 发送链路（新消息）

1. 发送携带附件的消息时，**不得**把 `### 会话关联上下文` 数据块写回用户草稿或消息正文；不再调用 `assemblePromptWithAttachments` 改写草稿。
2. 发送后用户气泡的可见文本严格等于用户自己写的文字，不出现数据块标题、附件路径、孤立引用图标或多余空行。
3. 既有合法拼装行为不变：技能手势令牌（`/slug`）、视频链接令牌（`[视频](url)`）、营销模式创意预设（`compileCreativePrompt`）的写入时机与结果保持原样。

### B. 历史消息清洁（兼容旧数据）

4. 已落库的旧消息（正文里已含数据块）渲染后同样干净：数据块文本**与其残骸元素**（引用块节点、`<hr>` 分隔线、被掏空的包装元素）全部从可见 DOM 拆除。
5. 两种宿主渲染形态都要覆盖：单节点 pre-wrap 形态（整块与用户正文同处一个文本节点）与 Markdown 分段形态（`<p>` / `<hr>` / `<h3>` / `<ul><li>`）。
6. 幂等且不误伤：重复执行不产生新的 DOM 变化；用户自己写的正文、链接胶囊、附件导轨等既有增强结果不被删除。

### C. 模型侧能力零回退

7. `getUiContext().attachedContextText` 仍输出完整数据块（宿主侧对账凭据不变）。
8. `context-injector` 仍能在 `agent/pre-step` 的 step 1 注入该数据块为原生上下文消息。
9. 提交时补一次即时 viewport 心跳，关闭「新建会话后立即发送（<2s）」时宿主尚无该会话信封、导致原生注入落空的窗口。

## 三、测试与验证计划

1. 单元测试：
   - `attachedContextCleaner.test.ts`：新增「引用块元素必须随数据块一起拆除」「空行不留残骸」「幂等」「不误伤正文与链接胶囊」断言；保留既有两种渲染形态用例。
   - `attachment-bridge.test.js`：断言发送路径**不再**改写草稿（草稿保持用户原文），且技能手势 / 视频令牌路径仍生效。
   - `events-client` / `context-injector` 既有用例回归，确认 `attachedContextText` 与注入行为不变。
2. 定向验证：`pnpm --filter omnimux test`（含上述套件）与仓库门禁 `pnpm test:gates`。
3. 隔离工作树内真实浏览器 Web 验证：构造带附件的发送场景，断言气泡内可见文本等于用户正文、不存在孤立图标与空行；并保留截图证据。

## 四、非目标

- 不改动官方宿主前端发行包（`projectUserText`、气泡 CSS 属宿主渲染层，不改）。
- 不改动附件存储、附件导轨、影子上下文与 `agent/pre-step` 注入契约的**语义**（仅在提交时机上补一次心跳）。
- 不新增产品能力，不改变 `buildAttachedContextBlock` 的文本格式。

## 五、根因记录（2026-09-16 调查结论）

- 残留物经裁剪放大确认为 4 个「圆角方框内一道横杠」的引用图标，等距竖排、右侧无文字，与 `projectUserText` 中 `refChip` 的图标节点形态一致。
- `attachedContextCleaner.ts` 的擦除顺序为「截断标记节点 → 逐个移除其后的 Text 节点 → 清理孤立的 `<hr>`」，元素节点不在处理范围内，因此图标被留下。
- 用户截图中的「上下文注入 · omnimux-workbench」证明原生通道当时已在工作，草稿拼接属纯冗余。
- 已排除：气泡 CSS / 行高、附件导轨渲染、assistant 侧媒体增强器（其选择器限定 `assistantRow`）、tracking 心跳本身。
