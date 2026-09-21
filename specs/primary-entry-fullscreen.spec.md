# 规格：一级入口按意图全屏（Issue #2516）

## 1. Objective（目标）

左侧一级入口默认全屏，且全屏分两种：点会话是「聊天铺满」，点资产库 / 应用 / 项目等是「右侧页面铺满」。只有用户亲手打开聊天，才把该页记住为三栏。每个会话各自记住上次是不是三栏。

**新品基线**：不依赖开发机私有服务。记忆只存在本机该会话下（现有 `localStorage` 按会话隔离）。新用户没有任何记忆时走默认全屏。缺会话时打开右侧页面仍走既有「需要工作区」提示，不得静默建会话。

### 三种布局

| 名称 | 用户看到的 | 对应焦点 |
|---|---|---|
| 会话全屏 | 导航 + 聊天铺满，右侧页面收起（页签仍留在该会话，再点页面可回来） | `chat`（`panelOpen: false`），聊天可见 |
| 右侧全屏 | 导航 + 右侧页面铺满，聊天收起 | `gui` + 宿主右侧全屏 |
| 三栏 | 导航 + 聊天 + 右侧页面并排 | `split`，聊天可见 |

### 两把钥匙（互不顶替）

1. **会话钥匙**：这个会话上次是不是三栏。仅用户亲手切换全屏 / 分栏时写入。新会话空 → 会话全屏。
2. **页面钥匙**：这个会话里的这个页面，用户有没有亲手打开过聊天（`explicit === true && mode === split`）。默认全屏不写。

### 入口

- 左侧点会话 / 新对话 → 进聊天意图
- 左侧点资产库、应用、项目等 → 进页面意图
- 右边内部换页签 → 不是入口，维持当前布局
- 智能体打开 → 不改布局、不写记忆

### 互斥（必须）

1. 点会话 vs 该会话上次右侧全屏 → 点会话赢，必须看见聊天
2. 点页面 vs 当前正是三栏 → 点页面赢，按该页默认 / 记忆
3. 内部换页签 vs 页面默认全屏 → 当前布局赢
4. 系统默认 vs 亲手打开过聊天 → 用户赢
5. 新对话 vs 上一条会话的三栏 → 新对话赢

### 成功标准（可测）

1. 第一次点资产库、某个应用、项目、灵感社区等右侧页面 → 右侧全屏。关掉再打开同一页面，仍是右侧全屏（图 1）。
2. 在该页亲手打开聊天（退出全屏 / 展开对话）→ 三栏；下次再点这个页面仍是三栏。
3. 点另一个从没打开过聊天的页面 → 仍是右侧全屏，不把上一个页面的三栏带过去。
4. 点「新对话」→ 会话全屏，不继承上一条会话的三栏（图 2）。
5. 点一条上次是三栏的旧会话 → 恢复三栏。
6. 正在右侧全屏时点会话 → 必须看见聊天：有三栏记忆则三栏，否则会话全屏。绝不把右侧全屏跟着会话点击带回来。
7. 已经在三栏里，只换右边内部页签 → 继续三栏，不重新全屏。
8. 智能体自动打开页面 → 不改布局、不当作用户选择。

「打开了会话栏」= 用户点官方退出全屏，或点展开对话。不包括点会话（点会话只读该会话记忆）。

## 2. Commands（命令）

在本任务工作树根执行：

- `git diff --check`
- `pnpm --filter omnimux test`
- 触及的契约测：`plugins/omnimux/src/client/workbench/tab-viewport-reconciler.test.js`、`plugins/omnimux/tests/e2e/tab-viewport-memory.spec.js`、`plugins/omnimux/tests/e2e/tab-viewport-native-reconciler.spec.js`、`plugins/omnimux/tests/e2e/session-click-conversation-layout.spec.js`、`plugins/omnimux/src/client/workbench/ensure-conversation-visible.test.js`
- `pnpm verify:stages`
- `pnpm verify:product-baseline`
- 隔离工作树真实浏览器走通图 1 / 新对话 / 点会话三条主路径，留截图。不以开发版真机验收作为交付门槛。

## 3. Project Structure（项目结构）

- `specs/primary-entry-fullscreen.spec.md`：本规格（本任务真源）
- `docs/contracts/workbench-split.md`：默认焦点、进页面 / 进聊天意图、记忆写入
- `docs/contracts/sidebar-extra-entries.md`：会话点击不关页签，布局按互斥走
- `plugins/omnimux/src/client/workbench/sidebar-controller.js`：打开序列带进页面意图
- `plugins/omnimux/src/client/workbench/split-layout.js`：默认打开不得落盘为用户选择
- `plugins/omnimux/src/client/workbench/focus-state.js`：默认 gui；会话布局钥匙
- `plugins/omnimux/src/client/workbench/tab-viewport-reconciler.js`：删除「未标记就拉回三栏」
- `plugins/omnimux/src/client/workbench/ensure-conversation-visible.js`：进聊天意图按会话钥匙
- `plugins/omnimux/src/client/conversation-box.js`：新对话会话全屏；旧会话按记忆
- `plugins/omnimux/src/client/chat-toggle.js`：展开聊天必须写页面三栏记忆
- 旧规格 `specs/tab-viewport-memory.spec.md`、`specs/session-viewport-memory.spec.md`、`specs/tab-viewport-native-reconciler.spec.md`：改为被本规格替代

## 4. Code Style（代码风格）

仓库 ESM、单引号、无分号。复用宿主全屏按钮，不发明第二套三栏壳。默认打开与智能体打开不得把 `explicit` 写成 true。

```js
const targetMode = resolveTargetFocusMode(sessionId, tabId)
setWorkbenchFocus(targetMode, store, {}, tabId, { persistUserIntent: false })
if (targetMode === WORKBENCH_FOCUS.gui) enterHostRightSidebarFullscreen(doc)
```

该样例只说明默认打开不落盘；用户点官方全屏 / 分栏或展开对话时 `persistUserIntent` 为 true。

## 5. Testing Strategy（测试策略）

先改与新产品相反的旧断言（红），再改打开序列 / 记忆 / 调和器 / 会话点击（绿）。同一套 JSDOM 夹具，不新造壳。

必须覆盖：

1. 进页面无记忆 → 右侧全屏
2. 全屏后再从左侧点同一页 → 仍全屏（图 1）
3. 亲手打开聊天 → 记三栏 → 再点该页仍三栏
4. 三栏时点另一个无记忆页面 → 该页全屏
5. 三栏时只换右边内部页签 → 仍三栏
6. 新对话 → 会话全屏
7. 点回记过三栏的会话 → 三栏
8. 右侧全屏时点无三栏记忆的会话 → 会话全屏（聊天可见）
9. 智能体打开 → 布局不变、不写记忆

真实浏览器验证图 1 / 新对话 / 点会话三条主路径。单测验证意图与记忆，浏览器验证几何可见性。

## 6. Boundaries（边界）

- **总是**：先规格后代码；隔离工作树实施；默认打开不写用户选择；点会话必须看见聊天；内部换页签不重新全屏；相关测试与 `git diff --check` 通过后再合入。
- **先问**：改官方宿主源码、改生产环境、把应用重新做成整页遮罩。
- **绝不**：拆掉中间聊天区；发明第二套三栏壳；把「当前是三栏」写成全局偏好；把智能体打开当成用户选择；镜像规格到主仓；未合入代码链到开发版 / 生产。
