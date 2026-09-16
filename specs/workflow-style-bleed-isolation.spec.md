# 规格：项目插件资产样式作用域隔离与跨页切换稳定性保障

## 一、背景与问题陈述
用户在不同页面（资产库、项目、数据分析、灵感社区等）之间来回切换时，界面出现严重的排版错乱（资产库顶部的“添加资产”与“导入资产包”两个按钮被横向拉得巨长，占满整行，搜索栏被挤至下方，页面大面积黑屏空缺）。刷新页面后暂时恢复正常，但在页面间切换后再次复现。

## 二、根因分析
1. **全局样式跨插件污染**：
   `plugins/omnimux-workflow/src/client/styles.js` 中的第 994 行定义了名为 `.omnimux-assets-action-row` 的全局样式规则（`display: grid; grid-template-columns: 1fr 1fr;`），该样式本意用于项目画布内部的资产小卡片，但由于选择器未加命名空间前缀，直接向全局注入。
   一旦用户访问过项目相关页面，该样式表即注入页面 `<head>`，直接覆写并篡改了官方资产库插件（`omnimux-assets`）的 `.omnimux-assets-action-row`（原本为 `display: flex; gap: 10px;`），导致两个操作按钮各占 50% 宽度，横跨整屏严重变形。
2. **快速切换时的调和锁去抖**：
   在频繁切换 Tab 时，模式切换需要与浏览器的动画帧及渲染周期对齐，避免并发触发导致状态振荡。

## 三、修复设计
1. **样式完全作用域收敛**：
   将 `omnimux-workflow` 中所有项目资产相关样式全面收敛至 `.omnimux-assets-tab` 容器作用域下，例如：
   `.omnimux-assets-tab .omnimux-assets-action-row`，彻底杜绝外溢至主资产库。
2. **防回归测试**：
   编写端到端及样式隔离测试，断言 `omnimux-workflow` 的样式表不再向全局暴露裸的 `.omnimux-assets-action-row` 选择器。
