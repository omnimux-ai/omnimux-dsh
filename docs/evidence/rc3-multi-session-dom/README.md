# rc.3 多会话右栏 DOM 串台修复

- 任务：`cross-rc3-multi-session-dom`（Issue #4009）
- 基线：`origin/main@c18764515`
- 应用级旅程：项目库 → 创作页 → 三栏；`plugins/omnimux/tests/e2e/project-page-three-column.journey.mjs`
- 结果：16/16 断言通过；`html[data-omnimux-rightbar-open]="true"`，`centerCol` 360px/opacity 1，画布岛已渲染
- 报告通道：legacy `--journey` smoke；完整应用截图与交互断言来自同一运行；task-binding 结构化检查由单测覆盖

证据文件：`project-page-three-column.png`、`three-column-state.json`、`app-qa-report.json`、`audit.md`。
