---
title: "布局状态还原 · 实机预演证据"
id: "layout-state-restore-verify"
date: "2026-09-15"
subsystem: "client"
---

# 布局状态还原 · 实机预演证据

## 环境与方法

- 目标：Dev App（OmniMux 2.0.9，advanced/darwin），视口 1728×994，CDP 9229。
- 方法：把本工作树的 `workbench/fullscreen-collapse-sync.js` 与 `composer-width-guard.js`
  用 esbuild 打成一个 ESM bundle，注入运行中的渲染进程执行**真实代码**
  （`installFullscreenCollapseSync(document)` + `installComposerWidthGuard(window)`），
  再点面板右上角**原生模式按钮**切换全屏，逐步读取状态。
- 脚本：`tmp/verify-layout-restore.mjs`（入口 `tmp/verify-entry.js`）。
- 截图：`docs/evidence/layout-restore-1-fullscreen.png`、`layout-restore-2-restored.png`。

## 前置事实（改造前）

| 项 | 实测 |
| --- | --- |
| 面板模式 | `push`（分栏） |
| `html[data-omnimux-conversation-collapsed]` | **不存在** |
| 会话列宽度 | 670px |
| 输入框卡片计算上限 | **672px**（被残留偏好钉住） |
| 宽度偏好存档 | `dsh.conversation.contentWidth = 920.6796875` |

根因（问题二）：原生 `resolveContentWidth` 在有偏好时走
`min(max(偏好, 640), max(640, 列宽 − 176))`。列宽 668 时上限被压到 640，
于是卡片 = 640 + 32 = **672px**；换到宽列则直接顶到 `偏好 + 32`。原生自适应
`max(680, min(列宽 × 0.64, 920))` 完全失效。

## 改造后实测（点原生全屏按钮）

| 阶段 | 面板模式 | 折叠键 | 会话列宽度 | 卡片计算上限 | 宽度偏好 |
| --- | --- | --- | --- | --- | --- |
| 初始 | push | 不存在 | 670px | 672px | 920.6796875 |
| **进入全屏** | **fullscreen** | **存在** | **0px** | — | 已被护栏清除（null） |
| **退出全屏** | push | 不存在 | **670px（完整还原）** | **712px** | null |

- 会话栏在全屏时宽度归零、画布铺满；退出后精确回到 670px（±0）。
- 卡片计算上限由 672px 变为 **712px**，正好等于原生自适应公式
  `max(680, min(668 × 0.64, 920)) + 32 = 680 + 32 = 712`。
- 面板模式按钮实测存在两颗：`aria=分栏`、`aria=全屏`；脚本点的是 `data-sidebar-right-mode="fullscreen"`。

## 单元测试

| 文件 | 结果 |
| --- | --- |
| `src/client/composer-width-guard.test.js` | 6/6 通过 |
| `src/client/workbench/fullscreen-collapse-sync.test.js` | 4/4 通过 |

合计 10/10，含「用户自己收起的会话栏进出全屏后仍保持收起」「量不到列宽时绝不误删偏好」
「列宽变化后复检」等边界。

## 未覆盖

- 未在本工作树内启动完整应用；证据来自真实 Dev App 渲染进程执行本工作树模块的打包产物。
- 触屏与键盘路径未单独取证（全屏切换一律走面板模式按钮这一条。
