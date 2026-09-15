# 画布「添加会话」在右侧栏全屏态下必须把会话栏带出来

- 任务分支：`agent/attach-reveal-host-fullscreen`
- 涉及插件：`plugins/omnimux`（执行中枢）、`plugins/omnimux-workflow`（画布 island）
- 基线：`origin/main`

## 一、缺陷与根因

### 1.1 用户实测现象

创作画布处于**右侧栏铺满（全屏）**状态时，点画布节点工具栏的「添加会话」：

- 弹出「已添加到会话：xxx.mp4」的成功提示；
- **会话栏不出现**，用户看不到刚加的文件。

对照：会话栏本来就展开时，同样的点击一切正常（附件卡片能看到）。

### 1.2 根因（两层状态，上一轮修复只覆盖了一层）

「会话栏不可见」有两个互不相同、由不同层拥有的状态：

| # | 状态 | 归属 | DOM 表现 | 清除方式 |
| --- | --- | --- | --- | --- |
| 1 | 插件折叠键 | 插件 | `html[data-omnimux-conversation-collapsed]` | `setConversationCollapsed(false)` / `setFocus('split')` |
| 2 | **宿主右侧栏全屏** | 宿主 | `[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]`、壳层镜像 `[data-rightbar-fullscreen="true"]` | 只有宿主自己的模式控件（`button[data-sidebar-right-mode="push"]`）能退出 |

PR #1867 在画布 hook 里只处理了第 1 层，且实现为「先读折叠键，读到 `false` 就直接跳过全部布局动作」。**全屏态下折叠键恰恰是 `false`**（全屏由宿主状态键驱动，不写折叠键），于是第二层完全没被尝试 → 提示成功、界面不动。

内核已有正确的三步链路 `ensureConversationVisible()`（`plugins/omnimux/src/client/conversation-box.js`）：先退出宿主全屏（`workbench/host-fullscreen.js` 的 `exitHostRightSidebarFullscreen`），再在折叠键为真时 `setFocus('split')`，最后同步激活仲裁。但它只在内核内部的「点会话行 / 新会话」手势里使用，**未对外暴露**，画布（另一个插件）拿不到。

## 二、验收标准（用户可观察）

### 2.1 关键旅程 A：右侧栏全屏态下点「添加会话」

| 步骤 | 操作 | 期望的视觉/状态结果 |
| --- | --- | --- |
| A1 | 画布全屏（右侧栏铺满、会话列不可见） | DOM 上存在 `[data-sidebar-right-panel="fullscreen"]`；`getConversationCollapsed()` 可能是 `false` |
| A2 | 点画布节点的「添加会话」 | ① **宿主右侧栏退出全屏铺满**（该属性不再为 `fullscreen`）；② 会话列可见（宽度 > 0）；③ 附件卡片出现在会话输入框附件区；④ 成功提示；⑤ 输入框获得焦点 |
| A3 | 观察提示与附件区 | 提示与附件区实际状态一致 |

### 2.2 关键旅程 B：会话栏已展开时点「添加会话」

| 步骤 | 操作 | 期望 |
| --- | --- | --- |
| B1 | 会话栏可见、无宿主全屏 | 照常添加；**不得**产生任何布局动作（既有验收 AC 不变） |

### 2.3 关键旅程 C：提示如实（沿用上一轮，不得回归）

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| C1 | 附件已达 8 条上限 | 警告「附件最多 8 个，请先移除一个再添加」，不报成功 |
| C2 | 同一文件重复添加 | 视为成功，不重复追加 |
| C3 | 其它失败原因 | 警告「添加失败，请重试」 |
| C4 | 中枢 store 全局不存在 | 回退旧事件通道 + 成功提示 + 剪贴板兜底 |

### 2.4 非功能

| 编号 | 要求 |
| --- | --- |
| N1 | 任何全局 API 缺失都必须静默跳过，绝不抛错打断添加 |
| N2 | 剪贴板兜底在所有分支保留 |
| N3 | 有回执时不再派发 `omnimux:add-to-conversation`（沿用） |
| N4 | 内核不复制第二份「让对话可见」实现：内核手势与全局 API 共用同一份逻辑 |
| N5 | 层级边界：画布只通过 `window.__omnimuxWorkbench` 调用，不 import 中枢内部实现（`docs/contracts/hub.md`） |
| N6 | 旧内核（无新 API）下画布仍走既有回退路径，行为不退化 |

## 三、非目标

1. 不关闭右侧面板、不清已开 Tab（面板展开态与 Tab 属于面板自身）。
2. 不改 `omnimux:add-to-conversation` 事件语义与中枢落库逻辑。
3. 不改其它插件（assets / inspiration / forms / products / clip）的「添加到会话」实现。
4. 不新增动效、不改视觉样式。
5. 不修「画布节点导入媒体 / 隔离环境造节点」等测试装置问题（与本次缺陷无关）。

## 四、涉及文件（预期）

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux/src/client/workbench/ensure-conversation-visible.js` | 新增：无环的三步链路实现（退出宿主全屏 + 清折叠键），返回可判定结果 |
| `plugins/omnimux/src/client/workbench.js` | 全局 API 新增 `ensureConversationVisible()` |
| `plugins/omnimux/src/client/conversation-box.js` | 内核手势改为复用同一实现（保留激活仲裁那一步） |
| `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.ts` | 优先调用新全局 API；不再因折叠键为 `false` 而跳过露出；保留回退路径 |
| 测试 | 内核新 API 单测；画布单测新增「全屏态仍必须尝试露出」用例 |

## 五、验证方式

| 层 | 手段 | 判定 |
| --- | --- | --- |
| 规格落地 | 本文件先于源码提交 | 存在且已提交 |
| 内核单测 | `node --test plugins/omnimux/src/client/workbench/*.test.js` | 新 API 在全屏 / 折叠 / 无状态三种情形下的行为与返回值正确 |
| 画布单测 | `pnpm --filter omnimux-workflow test` | 新增「折叠键为 false 且宿主全屏时仍调用露出」用例；既有 10 例全绿 |
| 套件对照 | `pnpm --filter omnimux test` | 与基线失败项逐条对照，无新增失败 |
| 真机 | 开发版由用户复验（本次修复目标就是用户报告的那条路径） | 人工 |
