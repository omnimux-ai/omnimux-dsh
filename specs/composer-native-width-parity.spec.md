---
title: "欢迎页输入框宽度回归原生上限并保留用户偏好"
id: "composer-native-width-parity"
issue: 2062
type: "fix"
status: "draft"
date: "2026-09-16"
subsystem: "client"
---

# 欢迎页输入框宽度回归原生上限并保留用户偏好

## 1. 背景与问题

官方 DSH 会话输入框与正文宽度遵循原生自适应体系：
- 正文宽度 = `clamp(680px, 列宽 * 0.64, 920px)`
- 输入框卡片上限 = `正文宽度 + 32px`，通过 CSS 变量 `--dsh-composer-card-max-width` 声明于根容器
- 用户拖拽宽度手柄所产生的偏好存储于 `dsh.conversation.contentWidth`，合法区间为 `[640, max(640, 列宽 - 176)]`

在当前插件实现中，存在两处偏离官方原生的行为：
1. **新会话欢迎页（引导态）输入框被强行收窄**：`plugins/omnimux/src/client/session-guide/styles.js` 对 `[data-omnimux-starter-host]` 下的 `[data-composer-card]` 和 `[class*="heroWorkspaceRow"]` 强制设置了 `max-width: min(780px, calc(100% - 24px))!important`，将原生 `--dsh-composer-card-max-width` 压制，导致新会话页在宽屏下显著比原生窄（780px vs 原生 952px）。
2. **插件强行清除偏宽的有效宽度记录**：`plugins/omnimux/src/client/composer-width-guard.js` 在列宽变窄时，只要用户保存的宽度超过当前列宽的自适应值就执行 `removeItem(dsh.conversation.contentWidth)`。原生 DSH 在列宽变窄时仅在渲染层动态钳制宽度，绝不清除持久化的用户偏好。插件删档导致用户设置丢失。

## 2. 核心改动契约

1. **引导态输入框与工作区行宽度回归原生**：
   - 在 `plugins/omnimux/src/client/session-guide/styles.js` 中，移除对 `[data-composer-card]` 和 `[class*="heroWorkspaceRow"]` 的 780px 强制收窄。
   - `[data-composer-card]` 统一使用 `max-width: var(--dsh-composer-card-max-width, 952px)!important; margin-inline: auto!important;`。
   - `[class*="heroWorkspaceRow"]` 统一使用 `max-width: var(--dsh-chat-content-width, 920px)!important; margin-inline: auto!important;`。
   - 严禁任何规则声明 `max-width: 100%!important` 命中输入框卡片。
2. **停止删除用户的宽度偏好记录**：
   - 修改 `plugins/omnimux/src/client/composer-width-guard.js` 中的 `isStaleWidthPreference`：对任何合法的正有限数值（如 640、768、900、920.68 等）均返回 `false`，绝不判定为 stale，不执行 `removeItem`。
   - 仅对损坏的非法值（非有限数值或 `<= 0`）返回 `true` 进行安全兜底清理。
   - 避免破坏 `chrome.js` 装配层生命周期接口。

## 3. 验收标准与测试矩阵

1. **欢迎态宽度回归原生上限**：
   - 宽屏无偏好时，卡片计算宽度等于 `var(--dsh-composer-card-max-width)`（会话列 1448px 时为 952px）。
   - 工作区行计算宽度等于 `var(--dsh-chat-content-width)`（会话列 1448px 时为 920px）。
   - 卡片与工作区行水平居中对齐，左右留白差 `<= 2px`。
2. **用户宽度偏好坚决不删**：
   - 当 `localStorage` 中存在有效的宽度记录（包括偏宽数值如 `920.6796875` 或 `900`），在任何列宽（包括窄列 668px）下运行护栏，`guardComposerWidthPreference` 均返回 `{ cleared: false }`，且存储键完整保留。
3. **门禁与全量测试**：
   - `plugins/omnimux/tests/e2e/composer-native-cap.spec.js` 全绿，并扩展对欢迎页 780px 消除的回归断言。
   - `plugins/omnimux/src/client/composer-width-guard.test.js` 全绿，断言更新为偏宽值不删。
   - `plugins/omnimux/tests/e2e/layout-state-restore.spec.js` 全绿，断言更新为偏宽值完整保留。
