# Spec · 精灵助手浮动工作台 postMessage 跨域目标源校验时机与安全防御修复

- **Scope**:
  - `plugins/omnimux-browser/extension/src/content/fab-companion.ts`
  - `plugins/omnimux-browser/extension/tests/e2e/fab-postmessage-origin.e2e.spec.ts`
- **Status**: Approved for implementation

---

## 1. 背景与问题定位

### 1.1 现状与用户问题
用户在访问 Twitter/X 网页（如 `https://x.com/...`）时，浏览器控制台抛出严重安全报错：
`Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('chrome-extension://inmgnhdibihgiobaoclifhmjgkheffeb') does not match the recipient window's origin ('https://x.com').`
堆栈指向 `content.js` 中创建 `#omnimux-panel-iframe` 并通信的逻辑。

### 1.2 根本原因分析
1. **iframe 初始导航具有异步性**：
   - `#omnimux-panel-iframe` 创建时的初始地址为 `src="about:blank"`，其受浏览器同源策略约束，窗口 origin 继承自当前网页宿主域（`https://x.com`）；
   - 在用户点击展开或触发浮动工作台时，代码调用 `ensureWorkstationFrame()` 将 `iframe.src` 改为扩展页面地址（`chrome-extension://...`）；
   - 浏览器的跨源导航是完全异步的。在 `src` 赋值后到页面真正 `load` 完毕前，`iframe.contentWindow` 的 origin 仍然停留在父域 `https://x.com`；
   - 原代码在 `openWorkstation()` 中，修改 `src` 之后立即同步调用了 `syncContextToIframe()`，且页面 DOM 变动防抖监听（`throttledContentCheck`）也会在 SPA 路由变动时尝试调用 `broadcastContextUpdate()`；
   - 原代码仅根据 `iframe.getAttribute('src') === panelUrl` 判断（该条件在赋值属性瞬间即为 true），误以为 iframe 已经就绪，遂直接传入 `targetOrigin = panelOrigin`（`chrome-extension://...`）发送 `postMessage`；
   - 浏览器检测到目标窗口 origin（`https://x.com`）与指定的 `targetOrigin` 不匹配，直接硬性抛错并中断执行。

---

## 2. 验收标准（Given / When / Then）

1. **iframe 就绪前绝不盲目发送 postMessage**：
   - Given: 浮动工作台 iframe 刚被创建或正在从 `about:blank` 导航到 `panelUrl`。
   - When: 外部触发 `openWorkstation()`、DOM 内容变动或上下文广播 `broadcastContextUpdate()`。
   - Then: 检查显式就绪标志 `isFrameReady`，当且仅当 iframe 真实完成 `load` 且确认加载扩展页面后才发送消息，不得在导航中途向处于父域状态的 iframe 派发带有扩展 targetOrigin 的 postMessage。
2. **全流程 postMessage 安全防御机制**：
   - Given: 所有向 `iframe.contentWindow` 发送 postMessage 的调用点（上下文广播、媒体嗅探回执、表单与DOM填充回执）。
   - When: 发送跨源消息。
   - Then: 均受 `isFrameReady === true` 防护，并附带 `try / catch` 异常防崩溃保护，绝不产生控制台红字报错。
3. **折叠卸载时状态严谨重置**：
   - Given: 浮动工作台折叠并将 iframe 卸载回 `about:blank`（`collapseWorkstationForDock`）。
   - When: iframe 卸载。
   - Then: `isFrameReady` 立即同步重置为 `false`，后续更新自动转由扩展后台通信处理，不向空白 iframe 倾倒消息。
4. **测试与实机验证**：
   - 补齐自动化端到端测试，模拟父子跨域窗口握手与生命周期时序；
   - 在真实浏览器环境中验证无任何 postMessage origin 报错。

---

## 3. 修改计划

1. `plugins/omnimux-browser/extension/src/content/fab-companion.ts`：
   - 新增 `let isFrameReady = false`；
   - 在 `handleIframeLoad` 中设置 `isFrameReady = true`，并在此时按需同步上下文；
   - 在 `collapseWorkstationForDock` 中将 `isFrameReady = false`；
   - 在 `openWorkstation` 中移除同步过早的 `syncContextToIframe()` 调用，改由 `handleIframeLoad` 或后续状态接管；
   - 在所有 `iframe.contentWindow.postMessage` 处增加 `isFrameReady` 守卫与 `try / catch`。
2. 编写端到端测试并执行构建与回归。
