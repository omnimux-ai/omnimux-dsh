# 项目创作页三栏可见（RC 右栏多会话挂载适配）

- 任务：`workflow-project-canvas-layout`
- 基线：`origin/main@021b762e6`（本任务基于该提交 rebase）
- 环境：worktree 隔离应用级 Web QA（mode=ui，Dev-backed 完整插件 Profile，全部插件取本工作树源码）
- 报告通道：legacy `--journey`（scope=smoke, contract=none）；完整应用截图与交互断言来自同一运行；task-binding 结构化检查由本任务 spec 与单测覆盖，本报告不声称 fresh/task 证明
- 旅程：`plugins/omnimux/tests/e2e/project-page-three-column.journey.mjs`
- 结果：16/16 断言通过（report.json `pass: true`），含 `journey:middle-column-visible`、`journey:canvas-visible`

## 修复前

隐藏会话的右栏面板仍带 `data-sidebar-right-panel="fullscreen"`，`host-fullscreen` 误判当前会话全屏，`fullscreen-collapse-sync` 持续写 `data-omnimux-conversation-collapsed`；中间栏 `centerCol` 宽 0、opacity 0。

## 修复后

打开创作页后：折叠键不存在；`centerCol` 宽 360、opacity 1；画布 tab 可见且画布岛已渲染。

证据文件：
- `project-page-three-column.png`：三栏截图
- `three-column-state.json`：折叠态与中间栏几何实测
- `app-qa-report.json`：完整应用级断言报告
