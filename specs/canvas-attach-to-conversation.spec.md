# 创作画布「添加到会话」自动开启会话栏并确认挂载

- 任务分支：`agent/workflow-attach-reveal`
- 涉及插件：`plugins/omnimux-workflow`（画布 island）、`plugins/omnimux`（执行中枢）
- 基线：`origin/main` = `eb95e47ea`

## 一、背景与根因

### 1.1 用户现象

用户原话：**在创作画布全屏模式下，点击任意工具栏的「添加会话」按钮，应检查会话栏是否开启，没开启则自动开启，并确保该文件已经作为附件挂载在会话输入框内。**

实际现象：绿色成功提示「已添加到会话：X」照常弹出，但会话栏保持全屏、附件区看不见，用户拿不到自己刚加的文件。

### 1.2 根因（已完成的只读取证结论，本次复用不再重复取证）

画布上 6 个「添加到会话」入口全部汇聚到 `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.ts`。该 hook 只做三件事：

1. `window.dispatchEvent(new CustomEvent('omnimux:add-to-conversation', { detail }))`；
2. 写剪贴板兜底；
3. **无条件** `toast.success('已添加到会话：<title>')`。

它**从不检查会话栏开合状态、从不打开会话栏、也从不确认附件是否真的落库**。而附件区（导轨 `omnimux-attachment-tray`）挂在官方槽位 `conversation.input.attachments` 上，只随原生 composer 渲染；会话列被折叠时该列被压成 `width:0` + `pointer-events:none`（槽位不卸载），于是「数据在、卡片也渲染了，但用户看不见也点不到」——用户唯一能感知的就是那句无条件 toast。

同仓已有三处正确范式（`omnimux-assets/src/client/add-to-chat.js`、`omnimux-workflow/src/client/projects/newProject.js` 的 `revealConversationAfterOpen`、`.../projectCanvas.js`）：先 `setConversationCollapsed(false)` + `setFocus('split')`，再同步 `addAttachment` 并用回执驱动提示。画布 island 与宿主同文档，能直接访问 `window.__omnimuxWorkbench`（此前零调用）。

### 1.3 本次要闭合的三处缺口

| # | 缺口 | 落脚点 |
| --- | --- | --- |
| ① | 派发前不检查、不开启会话栏 | `useAddToConversation.ts` |
| ② | 提示与真实落库结果脱钩（无条件成功） | 同上，改为「有回执按回执、无回执走旧行为」 |
| ③ | 加完之后不把视线带过去（附件区不滚动、不高亮、输入框不聚焦） | 中枢新增 `revealAttachments()` 能力 |

附带加固：payload 补可选 `sessionId`；中枢 `installGlobalEvents()` 幂等（当前被安装两次，同一事件被处理两次）。

## 二、用户可验证的验收标准

### 2.1 关键用户旅程 A（主场景：全屏画布点「添加到会话」）

| 步骤 | 操作 | 期望的视觉/状态结果 |
| --- | --- | --- |
| A1 | 进入创作画布，点顶部「全屏铺满右侧栏」，使**会话列不可见** | 画布铺满右侧工作区，会话列不可见（`html` 上存在 `data-omnimux-conversation-collapsed`），`getConversationCollapsed()` 返回 `true` |
| A2 | 在素材节点悬浮工具栏点末位纯图标按钮「添加到会话」 | ① 会话列**自动展开**（`data-omnimux-conversation-collapsed` 被清除，`getConversationCollapsed()` 返回 `false`）；② 提示为**成功**样式「已添加到会话：<文件名>」；③ 附件区内出现该文件卡片；④ 附件区被滚动到可见位置，**最新那张附件卡片**做一次克制的边框高亮脉冲（复用既有 `omx-att-card--highlight` / `omx-att-pulse`，约 0.6s，不新增颜色、不引入动效库）；⑤ 输入框获得焦点 |
| A3 | 观察提示与附件区 | 提示内容与附件区实际状态**一致**：卡片确实在，提示才报成功 |

### 2.2 关键用户旅程 B（已展开时不得有布局动作）

| 步骤 | 操作 | 期望的视觉/状态结果 |
| --- | --- | --- |
| B1 | 会话栏已展开（`getConversationCollapsed()` 返回 `false`），在画布点「添加到会话」 | **不调用** `setConversationCollapsed` / `setFocus`，界面零布局跳动；附件照常落库、提示照常成功、视线引导照常执行 |

### 2.3 关键用户旅程 C（提示如实）

| 步骤 | 操作 | 期望的视觉/状态结果 |
| --- | --- | --- |
| C1 | 当前会话附件已达 8 个上限时点「添加到会话」 | 警告样式的「附件最多 8 个，请先移除一个再添加」；**不**报成功 |
| C2 | 同一文件重复添加（指纹命中，且当前会话未满 8 条） | 视为成功：成功提示「已添加到会话：<文件名>」，附件区不重复追加 |
| C2b | 当前会话**已满 8 条**时重复添加同一文件 | 中枢的检查顺序是「先配额、后指纹」，故得到 C1 的「附件最多 8 个，请先移除一个再添加」而非成功——组合行为由中枢既有实现决定，本次不改变，按此记录 |
| C3 | 回执为其它失败原因（含 `invalid-payload`） | 警告样式的「添加失败，请重试」；**不**报成功 |
| C4 | 中枢 store 全局不存在（`window.__omnimuxAttachments` 缺失） | 回退到既有行为：派发 `omnimux:add-to-conversation` 事件 + 成功提示 + 剪贴板兜底，向后兼容不退化 |

### 2.4 非功能验收

| 编号 | 要求 |
| --- | --- |
| N1 | 任何全局 API 缺失（`__omnimuxWorkbench` / `__omnimuxAttachments` / `__omnimuxComposerActions`）都必须**静默跳过**，绝不抛错阻断后续添加 |
| N2 | 剪贴板兜底在所有分支保留 |
| N3 | 有回执时**不再派发** `omnimux:add-to-conversation`，避免二次入桶 |
| N4 | `omnimux:attachments:reveal` 的高亮 timer 完成后自行清理，组件卸载时移除监听并清理 timer |
| N5 | `installGlobalEvents()` 幂等：同一 store 实例重复调用只注册一次监听；`setDraft` / `getDraft` 既有行为不变 |
| N6 | 资产库、灵感库等其它插件走事件通道的「添加到会话」路径保持原样可用 |

### 2.5 全屏两种候选实现的覆盖声明（必须如实记录，不得宣称「已完全解决」）

用户所说的「创作画布全屏」在代码里有两个并列候选，二者都让会话列不可见：

- **候选 A（折叠位）**：workbench 焦点为 `gui` → 写 `html[data-omnimux-conversation-collapsed]`，会话列被 CSS 压成 0 宽。
- **候选 B（宿主原生 fixed 全屏覆盖）**：宿主写入 `[data-sidebar-right-panel="fullscreen"]`，用 `position:fixed` 覆盖在会话列之上，**可能不写折叠位**；该状态自 #1784 起已与折叠位解耦，且插件侧没有任何导出 API 能读到「宿主原生全屏正在覆盖会话列」。

本次实现要求：reveal 对候选 A 生效——先读折叠位，已展开则不做布局动作；否则调 `setConversationCollapsed(false)` + `setFocus('split')`，随后**再读一次**作退化路径守卫（若设置器抛错或未生效则再补一次；真实宿主下 `setConversationCollapsed` 同步写内存态，这次读回必为 `false`，因此该分支在真实宿主不会命中）。**该守卫不覆盖候选 B**。

| 候选 | 本次实现能否覆盖 | 判定所需证据 |
| --- | --- | --- |
| A（折叠位） | **能**：读折叠位 → 展开 → 读回确认，链路可自证 | 静态可推 + 单测覆盖 |
| B（宿主原生覆盖） | **不能**：`getConversationCollapsed()` 只回答「是否折叠」，不回答「是否可见」。当宿主原生全屏**未写折叠位**时，本函数会按「已展开」直接跳过，用户仍看不到附件（与修复前同症状） | 需在真实运行态观察 `[data-sidebar-right-panel]` 属性与右侧栏几何；**截至合入未取得该证据** |

## 三、非目标

1. **不给创作画布加 composer 投影**：`conversation-collapse.js` 的投影规则只认图像画布身份，且被 `plugins/omnimux/tests/e2e/canvas-layout-alignment.spec.js` 锁死；不扩展该规则。
2. **不退出宿主原生全屏**：插件侧没有该能力（官方 `sidebarRight` 只有 `toggleExpanded()`，且作用面是右侧栏、不是中间会话列）。本规格只如实记录，不新增绕过手段。
3. **不改 `omnimux:add-to-conversation` 的事件语义**：中枢 `handleAdd` 的落库语义与迁移逻辑保持原样；本次只让调用方拿到同步回执。
4. **不改其它插件的「添加到会话」实现**（assets / inspiration / forms / products / clip）：它们各自的通道保持原样。
5. **不修**：`relativePath` 常为占位路径、跨插件 payload 缺 `absolutePath`、空白新会话附件滞留等既有问题——只在实现报告中记录，不在本次修复。
6. 不新增动效库、不新增颜色令牌、不新增全局 API 命名空间（只在既有 `window.__omnimuxComposerActions` 上新增一个方法）。

## 四、验证方式

| 层 | 手段 | 判定 |
| --- | --- | --- |
| 规格落地 | 本文件在 `specs/` 下先于业务源码提交 | 规格存在且已提交 |
| 画布侧单测 | `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.test.mjs`（esbuild 打包 + mock `react`/toast，沿用 `bootOwnership.test.mjs` 的做法） | 折叠触发 reveal / 未折叠零布局动作 / `ok:true` 成功提示 / `quota-exceeded` 与 `duplicate` 分支提示 / 回执存在时不派发事件 / store 缺失时回退派发 / 全局 API 缺失不抛错 |
| 中枢侧单测 | `plugins/omnimux/src/client/attachments/*.test.ts`（`node --test`，与 `store.test.ts` 同目录同框架） | `installGlobalEvents` 幂等（重复调用只注册一次）；reveal 事件对 DOM 的实际效果（滚动可见、末张卡片加高亮类、timer 后清理、卸载移除监听） |
| 跨插件端到端 | `plugins/omnimux-workflow/tests/attach-to-conversation-reveal.e2e.test.mjs` | 用真实 DOM（JSDOM）+ 真实中枢 store/桥接模块，跑通「画布 hook → 会话栏展开 → 附件落库 → 回执提示 → 视线引导事件」全链路，并断言 UI 侧实际 DOM 状态 |
| 真实浏览器 | 工作树内 `pnpm verify:app`（真实浏览器 + CDP，动态端口 59043，产出截图与结构化报告） | **仅证明应用本体可运行**：该入口 `evidenceLevel: core-only`、`taskPluginsInstalled: false`，**不装载任务插件、不证明**「展开会话栏 / 滚动 / 高亮 / 焦点」任一行为；本改动的真实浏览器场景级验收**未取得**，由 Dev 真机人工复验补齐 |
| 构建 | `pnpm --filter omnimux build` + `pnpm --filter omnimux-workflow build` | 客户端产物无编译错误 |

## 五、涉及文件清单

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.ts` | reveal + 回执驱动提示 + `sessionId` |
| `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.test.mjs` | 新增单测 |
| `plugins/omnimux/src/client/attachments/AttachmentTray.tsx` | 导出 `focusEditorElement`；监听 reveal 事件 |
| `plugins/omnimux/src/client/attachments/AttachmentCard.tsx` | 卡片根节点加 `data-omnimux-attachment-id`（供精确定位最新卡片） |
| `plugins/omnimux/src/client/attachments/focusEditorElement.ts` | 新增：composer 选择器与聚焦的单一实现（导轨与提交桥接共用） |
| `plugins/omnimux/src/client/attachments/store.globalEvents.test.ts` | 新增单测：`installGlobalEvents` 幂等 |
| `plugins/omnimux/src/client/composer-add/AttachmentSubmitBridge.jsx` | `revealAttachments()` |
| `plugins/omnimux/src/client/attachments/store.ts` | `installGlobalEvents()` 幂等 |
| `plugins/omnimux-workflow/tests/attach-to-conversation-reveal.e2e.test.mjs` | 新增跨插件端到端测试 |
