# 授权页改版规格（Issue #2116）

## 1. 用户意见
1. 授权页「太简单」：**要显示授权码**（已确认 A：**只显示用于核对，不做输入**）；插件面板等待时显示**同一串码**。
2. **增加「取消授权」按钮**：点击即作废本次请求，插件端停止等待并提示「已取消」。
3. **修复**：关闭授权页后**没有回到原来的页面**。

## 2. 核心改动规范

### AC-1 授权码（仅核对，不可输入）
- 码由 `requestId` 确定性派生：取 id 的末 6 位十六进制并大写（`shortCode(id)`），两侧无需额外状态。
- `POST /ext/pair/request` 响应增加 `code`；授权页显著位置显示该码；插件等待行显示同一码，供用户核对「正在授权的就是刚才那一次」。
- 授权页**不得**出现任何可输入的码输入框（用户明确否决）。

### AC-2 取消授权
- 新增 `POST /ext/pair/cancel`，准入与 approve 相同（仅回环、且 Origin 精确等于本机自身授权页来源）。
- 取消后请求作废：`GET /ext/pair/status` 返回 `state: "cancelled"`（一次性，读取后即失效为 `unknown`）。
- 授权页新增「取消授权」按钮：点击 → 调 cancel → 页面关闭；插件端收到 cancelled 即停止轮询并显示一行「已取消」。

### AC-3 关闭后回到原页面
- 插件在 `PAIR_START` 时记录发起配对时的活动标签页 id（`chrome.tabs.query({active:true, currentWindow:true})`）。
- 授权成功或取消后：先 `chrome.tabs.update(originTabId, { active: true })` 切回原标签页，再 `chrome.tabs.remove(approvalTabId)` 关闭授权页；取不到原标签页时退化为直接关闭。

### AC-4 安全不变
- 仅回环可发起/查询；approve 与 cancel 只认应用自身授权页 Origin；请求一次性、120 秒失效；令牌只经插件轮询下发，网页拿不到。

## 3. 验收证据
- 单测：`shortCode` 确定性；取消后 status 为 `cancelled` 且随后为 `unknown`；cancel 同样受 Origin 限制；授权页含码与两个按钮、且无可输入控件。
- 真机：授权页显示码 + 两个按钮；点「确认授权」→ 焦点回到原标签页且授权页关闭；点「取消授权」→ 插件显示已取消。先给用户过目成品。
