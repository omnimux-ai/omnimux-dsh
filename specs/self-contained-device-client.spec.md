# 规格：消除客户端对外部 dsh-ui-kit 的未编译依赖，自包含构建 lib/client.js

## 一、 背景与根因
DSH 客户端启动时抛出致命错误：
`client-modules: require("dsh-ui-kit") missed the module table - not a platform seed word, not a materialized module`
根因是在 `build-client.mjs` 中如果把 `dsh-ui-kit` 列为 external，客户端并没有全局注册此模块；而如果尝试源码引入，`dsh-ui-kit` 源码含有 CSS Modules 导致打包失败。

## 二、 修复方案
1. 在 `src/client/sidebar-entry.js` 中直接内联标准 `createSidebarEntry` 实现（基于标准原生 DOM 与 `window.__omnimuxSidebar` 协调器）；
2. 在 `src/client/DeviceStage.jsx` 中内联基于 `design.md` L1 规范的 `PageHeader` 组件（20px/600 主标题 + 13px 副标题 + 右侧 32px 按钮插槽）；
3. 在 `package.json` 与 `build-client.mjs` 中彻底解耦对外部 `dsh-ui-kit` 的依赖，保持编译产物 100% 自包含。

## 三、 验收标准
- [ ] `lib/client.js` 编译自包含，不包含任何 `require("dsh-ui-kit")`；
- [ ] DSH Desktop 启动直接进入主界面，无任何 loader 崩溃错误。
