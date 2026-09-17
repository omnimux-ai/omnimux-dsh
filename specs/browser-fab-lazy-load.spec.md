# Spec: 浏览器插件浮动工作台按需懒加载（规避与 OpenCLI CDP 冲突）

## Objective

将 OmniMux 浏览器插件浮动工作台（`fab-companion`）由「初始化时立即挂载真实插件 URL 的 iframe」改造为「按需懒加载（默认 `about:blank`，展开时动态装载真实插件地址）」。
根因：网页初始化时直接塞入 `src="chrome-extension://.../panel/index.html?mode=float"` 导致网页常驻了一个属于扩展的专属子页面，当 OpenCLI 等 CDP 自动化工具接管网页时被 Chrome 安全机制拦截（报错：`attach failed: Cannot access a chrome-extension:// URL of different extension`）。
目标：在保持浮标显示与拖拽能力不变的前提下，收起状态下零常驻插件页面；点击展开或唤起时再动态装载真实插件地址。

## Success criteria

1. **初始挂载状态**：打开普通网页且浮标收起时，宿主网页内部仅存在空白占位 iframe（`src="about:blank"`），严禁存在任何 `chrome-extension://` 子页面目标。
2. **按需激活展开**：用户点击浮标或外部调用触发工作台展开时，判断 iframe 若未装载 `panelUrl`，动态设置 `iframe.src = panelUrl` 完成真实工作台加载。
3. **收起与状态保持**：普通收起工作台时保持已装载内容，二次展开无需重复加载；在 dock 模式卸载时允许清空为 `about:blank`，并在下次展开时重新装载。
4. **上下文与消息同步**：未展开时不向空白 iframe 发送无效上下文 postMessage；首次展开加载完成及收到 `GET_PAGE_CONTEXT` 时正常同步页面上下文。
5. **自动化兼容**：浮标收起状态下，OpenCLI 等自动化程序接管网页不再报 `Cannot access a chrome-extension:// URL` 冲突。

## Testing strategy

- 单元测试：在 `tests/fab-lazy-load.spec.ts` 中断言初始状态为 `about:blank`，点击展开后动态变为 `panelUrl`，收起与再次展开逻辑正确。
- 构建与单测回归：`plugins/omnimux-browser/extension` 编译及相关测试用例 100% 通过。
