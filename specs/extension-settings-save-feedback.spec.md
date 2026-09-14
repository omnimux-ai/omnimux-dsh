# 规格说明：扩展设置「保存并连接」保存反馈、超时上限与设置态兜底

工单 #1651。落点：`plugins/omnimux-browser/extension/src/panel/App.tsx`（设置视图与保存流程）、`plugins/omnimux-browser/extension/src/panel/api.ts`（保存请求超时）、`plugins/omnimux-browser/extension/src/panel/strings.ts`（双语文案）、`plugins/omnimux-browser/extension/src/panel/styles.css`（反馈条与按钮忙碌态样式）。

## 1. 背景与缺陷

用户实测：在扩展设置页点击「保存并连接」，**界面无任何响应**——不提示、不报错、窗口保持打开。代码走查确认三条独立静默路径，任一条命中都表现为「点了等于没点」：

1. **失败无展示位**：`saveSettings` 捕获异常后调用 `setError(...)`，而 `error` 仅在会话主视图渲染；设置视图走 early return，其 JSX 内不存在任何渲染 `error` 的位置。→ 失败信息产生后无处显示。
2. **等待无上限**：`api.updateSettings` 返回的 Promise 只在收到 `settings.result` 时 settle（成功 resolve、失败 reject），**没有计时器**。回执丢失或后台未应答时永久 pending。→ 点击后永远无反应。
3. **设置态为空时静默返回**：`settings` 初值为 `null`，由 `chrome.storage.local.get('dshSettings').then(...)` 填充，且**该 Promise 无 catch**。读取失败或未完成时 `settings` 恒为 `null`：保存函数首行 `if (settings === null) return` 直接返回；同时全部受控输入的 `onChange` 均写成 `prev === null ? prev : {...}`，输入被静默丢弃。→ 整页静默失效。

附带缺口：`saveRelayProfiles()` 返回 false（档案名称为空或写入失败）时只设置 `relayNotice`，该文案渲染在设置页底部的中转线路区内，易被滚动位置掩盖。

## 2. 目标与非目标

### 目标

- 保存动作在**任何**结果下都对用户可见：进行中、失败、成功三种状态均有明确表现。
- 失败时窗口保持打开、原因就地可见、可直接重试。
- 保存请求具备有界等待，超时以明确文案失败而非无限挂起。
- 设置项读取失败或未完成时，表单以默认值保持可用，保存不再静默返回。
- 反馈条与按钮忙碌态复用既有配色与圆角，不引入新视觉风格。

### 非目标

- 不改动任何设置项的语义、默认值与持久化字段。
- 不重构设置页版式、信息层级与既有控件样式。
- 不改动中转线路（relay）档案的业务逻辑与模型选择逻辑。
- 不处理 #1645 引入的密钥与直连分支问题。

## 3. 方案

### 3.1 设置态（`App.tsx`）

`settings` 由 `PanelSettings | null` 改为非空 `PanelSettings`，初值由同步函数按当前 `targetPort` 生成（桥地址 `ws://127.0.0.1:<port>/ext/bridge`、token 空、页面共享 `auto`、完全控制 `true`、免确认域名空、审批通知 `true`、自动续接 `true`）。storage 读取仍然进行，仅用于覆盖默认值，并补 catch：读取失败保留默认值。

由此消除 `if (settings === null) return` 与全部 `prev === null ? prev` 分支；输入框在任何时刻都可编辑，保存恒有明确去向。

### 3.2 保存流程（`App.tsx`）

新增设置保存状态 `{ kind: 'idle' | 'saving' | 'error' | 'saved', message?: string }`：

- 点击保存 → 置 `saving`（按钮锁定并显示「保存中…」，附 currentColor 描边的转圈指示，杜绝重复提交）。
- 中转档案校验/写入返回 false → 置 `error`，文案取 `relayNotice`（同一提示区），不再只写在中转区。
- 主保存失败（含超时）→ 置 `error`，文案为「保存失败：<原因>」，窗口保持打开，按钮回到可点击并显示「重试保存」。
- 主保存成功 → 置 `saved`，显示「设置已保存，已按新的连接配置重新连接。」，短暂停留后自动关闭设置视图返回会话。
- 进入设置视图与点击取消时重置为 `idle`；成功后自动关闭的定时器在取消、重新进入或卸载时清除，避免陈旧定时器再次关闭视图。

### 3.3 超时上限（`api.ts`）

`updateSettings` 复用同文件已有模式（`pendingResponses` 的 `timer` + `clearTimeout`）：新增 10 秒计时器，超时即从 `pendingSettings` 中移除该条目并以明确的双语文案 reject；`settings.result` 到达与 `failAll` 清理时均 `clearTimeout`。抛出文案：「未收到本地服务的回执，设置可能未保存，请稍后重试。」

### 3.4 反馈展示（`App.tsx` + `styles.css`）

反馈条渲染在 `.settings-actions` 粘性操作条内、两个按钮**之前**，作为跨列网格项（`grid-column: 1 / -1`），因此始终紧贴按钮可见，不受滚动位置影响。

样式新增两组类，全部复用既有 token：

- 失败：`--danger` / `--danger-soft` / `--danger-border`；
- 成功：新增 `--success` / `--success-soft` / `--success-border` 三枚 token（`#10b981` 及同色透明度）。该绿色已在 `.engine-dot.online`、`.dom-fill-btn.success` 等既有规则中使用，token 命名与取值沿用 `--danger-*` 三件套的既有结构，深浅色各自定义。
- 忙碌指示：描边取 `currentColor`，随主按钮的纯黑白墨水配色自动对比。

### 3.5 文案（`strings.ts`）

`PanelCopy.settings` 新增 `saving`、`retrySave`、`saveOk`、`saveFailed(reason)` 四项，中英各一份。

## 4. 验收标准

| 编号 | 场景 | 可观察结果 |
| --- | --- | --- |
| A1 | 点击保存后、回执到达前 | 按钮 `disabled`，文案为「保存中…」，出现忙碌指示 |
| A2 | 主保存失败 | 设置视图内出现含原因的错误提示，`.settings-actions` 仍在（窗口未关闭），按钮文案为「重试保存」且可点击 |
| A3 | 回执超过超时上限 | 以「未收到本地服务的回执」失败，而非无限等待 |
| A4 | storage 读取失败/未完成 | 表单仍可编辑，点击保存仍发出保存请求（不静默返回） |
| A5 | 主保存成功 | 出现成功提示，随后设置视图关闭，会话视图可见 |
| A6 | 中转档案校验失败 | 原因显示在同一反馈条，而非仅出现在页面底部中转区 |
| A7 | 既有连接流程 | e2e「保存并连接后完成连接并创建会话」仍通过 |

## 5. 测试策略

- 组件级（jsdom + 真实 `App`，沿用 `tests/panel-settings-switches-ui.spec.ts` 的 `connectPanel` 注入方式）覆盖 A1–A6，断言以 DOM 文本与按钮属性为准。
- 既有 `plugins/omnimux-browser/tests/e2e/bridge-extension.e2e.spec.ts` 覆盖 A7（真实 Chromium + 扩展 dist + 真实 WebSocket 桥）。
- `pnpm --filter @omnimux/browser test`（插件单测）与扩展 `vitest run` 全量回归。
