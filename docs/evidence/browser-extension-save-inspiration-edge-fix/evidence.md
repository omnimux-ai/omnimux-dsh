# Edge 私网拦截导致「保存到灵感库」失败修复 实测证据 (Issue #3088)

## 1. 验证目标
验证在 Edge 浏览器安全模型下（Private Network Access / PNA），侧边栏面板点击「保存到灵感库」时，请求通过 `chrome.runtime.sendMessage` 委托给插件后台 Service Worker 执行，彻底避免页面直接 fetch 导致的私网拦截失败。同时验证服务端 `Access-Control-Allow-Private-Network: true` 响应头支持。

## 2. 复现与排查数据
- 问题现象：用户在 Edge 中侧边栏已连接 `:45120`，点击「保存到灵感库」报错「保存失败，请检查 OmniMux 运行状态」。
- 根因：
  1. 扩展面板页面（DOM context）直接 `fetch http://127.0.0.1:45120/...` 触发 Edge Private Network Access 校验阻断，报错 `TypeError: Failed to fetch`。
  2. 即使走直连，服务端未声明 `Access-Control-Allow-Private-Network: true`。
  3. 后台 Service Worker 不受页面 DOM 级私网拦截影响，且具备完整的扩展 host_permissions。

## 3. 修复方案验证
1. `plugins/omnimux-inspiration/src/http-routes.js` 增加 `'Access-Control-Allow-Private-Network': 'true'` CORS 响应头。
2. `plugins/omnimux-browser/extension/src/panel/App.tsx` 中的 `handleSaveToInspiration` 改造为优先调用 `chrome.runtime.sendMessage({ type: 'DSH_SAVE_INSPIRATION_PANEL', ... })`。
3. `plugins/omnimux-browser/extension/src/background/index.ts` 监听 `DSH_SAVE_INSPIRATION_PANEL` 消息，执行 `import-url` 及本地直存，并同步写入扩展本地灵感缓存。
4. 单元与组件回归测试全绿通过。
