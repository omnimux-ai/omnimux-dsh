---
title: "会话栏滚动条按需显示 · 实机预演证据"
id: "conversation-scrollbar-on-demand-verify"
date: "2026-09-15"
subsystem: "client"
---

# 会话栏滚动条按需显示 · 实机预演证据

## 环境与方法

- 目标：Dev App（OmniMux 2.0.9，advanced/darwin），视口 1728×994，CDP 9229。
- 方法：把本工作树 `plugins/omnimux/src/client/conversation-scrollbar.js` 的**源码本体**以 Blob ESM
  注入运行中的渲染进程并调用其导出函数（模块无依赖，可直接加载），再逐状态读取
  `getComputedStyle(container, '::-webkit-scrollbar-thumb')` 的 `background-color`，
  并留存整帧截图。
- 脚本：`tmp/probe-thumb-css.mjs`、`tmp/verify-scrollbar-live.mjs`。
- 截图：`docs/evidence/conversation-scrollbar/*.png`（3456×1988，2× 缩放）。

## 前置事实（改造前）

| 项 | 实测 |
| --- | --- |
| 滚动容器 | `[data-conversation-scroll]`（宿主渲染的 `uPhUma_scrollBody`） |
| 容器几何 | `offsetWidth 668 / clientWidth 652` → 装订线共 16px（`scrollbar-gutter: stable both-edges`） |
| 滑块计算背景色 | `rgb(84, 85, 87)` —— 常驻可见 |
| 可滚动 | `scrollHeight 1584 > clientHeight 918` |

宿主**没有**任何 `::-webkit-scrollbar*` 规则，滚动条是 Chromium 默认样式。

## CSS 机制 A/B（决定实现方式）

| 方案 | 装订线宽度 | 结论 |
| --- | --- | --- |
| `scrollbar-color: transparent transparent` | **16 → 0** | 装订线整体塌缩，滚动条显隐会让内容横向跳动 8px，**否决** |
| `::-webkit-scrollbar-thumb{background:transparent}` | 16 → 16 | 几何零变化，**采用** |
| 两者同时 | 16 → 0 | 同上，**否决** |

## 改造后逐状态实测（注入本工作树源码）

| 状态 | 滑块 `background-color` | 容器 `offsetW/clientW` |
| --- | --- | --- |
| 未注入（基线） | `rgb(84, 85, 87)` 可见 | 668 / 652 |
| 注入后静置 | `rgba(0, 0, 0, 0)` 透明 | 668 / 652 |
| 滚动中 | `rgba(255, 255, 255, 0.16)` 浮现 | 668 / 652 |
| 静置 > 900ms 后 | `rgba(0, 0, 0, 0)` 透明 | 668 / 652 |
| 指针停在装订线 1.5s 后 | 保持浮现（`data-omnimux-scroll-active` 为真） | 668 / 652 |

装订线宽度全程 16px 不变，滚动条显隐不引起任何布局跳动。

截图对照：

- `verify-1-base.png`：改造前，滚动条常驻。
- `verify-3-scrolling.png`：滚动中，滑块浮现。
- `verify-4-idle-again.png`：静置后，滑块消失。
- `verify-5-grab-zone.png`：指针停在装订线上，滑块保持可见可抓。

## 单元测试

`plugins/omnimux/src/client/conversation-scrollbar.test.js`：6/6 通过
（含「样式表只用伪元素、禁用会塌缩装订线的标准属性」的回归断言）。

## 未覆盖

- 未在本工作树内启动完整应用；证据来自真实 Dev App 渲染进程执行本工作树模块源码。
- 触屏惯性滚动与键盘 PageUp/PageDown 未单独取证（二者同样触发容器 scroll 事件，走同一路径）。
