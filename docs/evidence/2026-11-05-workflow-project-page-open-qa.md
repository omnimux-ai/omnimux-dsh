---
title: "Workflow 创作页打开 QA — 2026-11-05"
id: "evidence-workflow-project-page-open-20261105"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-11-05"
authors: ["agent"]
subsystem: "omnimux/workflow"
tags: ["qa", "worktree-web", "issue-3928"]
---

# Workflow 创作页打开 QA — 2026-11-05（Issue #3928）

## 运行身份

| 字段 | 值 |
|---|---|
| 任务 | `workflow-session-navigation`（branch `agent/workflow-session-navigation-issue-3928`，PR #3929） |
| 环境 | 隔离工作树 `.worktrees/workflow-session-navigation`，`scripts/worktree-app-qa.mjs --mode=ui`，动态端口、随机 CDP、自清理 |
| 旅程 | `plugins/omnimux-workflow/tests/e2e/project-page-session-navigation.journey.mjs` |
| 结果 | 17 项断言全 PASS（应用级脚本 12 项 + 功能旅程 5 项） |
| HEAD 绑定 | 提交时以 PR #3929 当前 head 为准；本轮证据对应的运行 id 与 state 见下 |

## 断言与现场

- 种子项目经 `POST /omnimux-workflow/api/projects` 创建（只写隔离 profile 的私有库根）。
- 打开项目库 → 进入项目详情 → 点创作页卡片后：
  - 项目 `sessionId` 已绑定，且主区 `__omnimuxWorkbench.getSnapshot().sessionId` 等于该会话；
  - `[data-omnimux-canvas-tab][data-visible="true"]` 出现；
  - 画布岛真实渲染：`.omnimux-workflow-canvas-root` 有子节点、`.omnimux-workflow-canvas-loading` 消失；
  - 官方主区选择 `localStorage['dsh.sessions.current'].sessionId` 与绑定会话一致；
  - 页面无错误横幅，console.error 为空。
- 负向（真实 DOM 测试）：画布被宿主拒绝时项目详情页出现「无法打开创作画布」横幅；新建项目成功但 `canvasOpened === false` 时出现「项目已创建，但创作画布未能打开」。
- 入库证据：`docs/evidence/2026-11-05-workflow-project-page-open-canvas.png`（画布已渲染：工具条 + 画布点阵）。
- 运行证据（未入库，按运行 id 留在工作树内）：`.workbuddy/evidence/app-qa/<runId>/open-page-state.json`。

## 结论

修复前同一旅程在点击后无法出现画布 tab（会话未切 + 右栏拒绝 openTab），修复后会话切换与画布岛渲染均成立。
同时通过：`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:product-baseline`、`pnpm lint:i18n`。
