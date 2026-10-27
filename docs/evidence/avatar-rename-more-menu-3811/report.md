---
title: "数字人改名 AI网红工作室 + 入口收敛进「更多」菜单 · 真机验收（#3811）"
id: "evidence-avatar-rename-more-menu-3811"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-27"
authors: ["agent"]
subsystem: "omnimux-avatar"
---

# 数字人改名 AI网红工作室 + 入口收敛进「更多」菜单 · 真机验收（#3811）

## 结论

任务工作树内完整应用 `ui` 合成模式下，真实浏览器 16 项断言全过，其中 4 项是本轮专属功能路径。侧栏常驻行确实消失，入口只出现在官方「更多」菜单，页面与 Tab 标题同步改名。

## 运行方式

```bash
node scripts/worktree-app-qa.mjs --journey=.tmp/more-menu-journey.mjs
```

## 逐项断言

| 断言 | 结果 | 说明 |
|---|---|---|
| 侧栏不再有数字人常驻行 | 通过 | `[data-omnimux-avatar-entry]` 与 `.omnimux-avatar-entry` 均不存在，侧栏行文案里无「数字人」 |
| 更多菜单含 AI网红工作室且无旧名称 | 通过 | 菜单项实际渲染，旧名称未残留 |
| 菜单点击可打开工作台 | 通过 | 点击后 `.omx-avatar-page` 正几何挂载 |
| 页面标题与 Tab 标题同步改名 | 通过 | 两者均为「AI网红工作室」 |

## 截图

- [侧栏无常驻行](sidebar-no-avatar-row.png)
- [「更多」菜单里的新入口](more-menu-with-avatar.png)
- [改名后的工作台页面](avatar-page-renamed.png)

## 改名边界

只改面向用户的产品表面（侧栏入口、页面标题、Tab 标题、动作按钮文案）。**未改**资产库「数字人」分类标签与 Agent 工具描述——它们是数据类型标识，改名会让既有资产的分类与工具语义对不上。

## 边界（不证明的事）

- 不证明真实模型生成质量：全程合成上游。
- 不证明老宿主回退路径的真实表现：无 `sidebar.panellist.actions` seat 时回落到工作台 Tab 入口，该分支由单测覆盖，未在真机复现老宿主。
