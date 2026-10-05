# Edge 私网拦截导致「保存到灵感库」失败修复 (Issue #3088)

## 1. 目标与背景 (Objective)
用户在 Edge 浏览器中使用 OmniMux 侧边栏时，点击「保存到灵感库」按钮一直报「保存失败，请检查 OmniMux 运行状态」，但「连接实例」明明显示已连上。
根因：插件面板（extension page）`fetch http://127.0.0.1:*` 在 Edge 被 Private Network Access 策略拦截，`TypeError: Failed to fetch`，所有候选端口均无法触达。后台 service worker 的 `fetch` 不受此限制。

## 2. 关键用户旅程 (User Journey)
1. 用户在 X.com 浏览一条带媒体的帖子；
2. 点击「保存到灵感库」；
3. 面板不再直接 `fetch http://127.0.0.1:*`，改发 `chrome.runtime.sendMessage` 给后台；
4. 后台（service worker）走 `saveMediaToHostInspiration` / `saveMediaToLocalInspiration` 写库；
5. 成功时提示「已保存到 OmniMux 灵感素材库」。

## 3. 验收标准与契约断言 (Acceptance Criteria)
1. `handleSaveToInspiration` 不再包含 `fetch(`${targetBase}` 直连调用；
2. 面板通过 `chrome.runtime.sendMessage({ type: 'DSH_MEDIA_TO_INSPIRATION', ... })` 调用；
3. 后台接收消息并复用既有 `saveMediaToHostInspiration` + `appendMediaInspiration` 逻辑；
4. 后台写库成功时面板收到 `ok: true`，失败时收到结构化错误并弹「保存失败」提示；
5. 单元测试覆盖：面板调用改为 sendMessage、后台继续保留写库逻辑。

## 4. 影响范围 (Affected Files)
- `plugins/omnimux-browser/extension/src/panel/App.tsx`
- `plugins/omnimux-browser/extension/src/background/index.ts`
- `plugins/omnimux-browser/extension/tests/save-inspiration-rpc.spec.ts`
