# 验证证据报告：新建项目前置初始化画布与错误转译修复 (Issue #2644)

## 验证结论：PASS
- 时间: 2026-09-24T14:54:08.367Z
- 截图证据: [fork-ws-init-verified.png](docs/evidence/fork-ws-init-verified.png)
- 演示单页: [fork-ws-init-demo.html](docs/evidence/fork-ws-init-demo.html)

## 修复核心
1. **前置初始化画布**：在 `createProjectForkFromManifest` 中，获取新建项目的 `canvasWorkspaceIds[0]` 后，先调用 `POST /api/workspaces` 完成物理快照落盘，杜绝后续 PUT 时触发 `requireSnapshot` 的 `workspace-not-found` 异常；
2. **大白话错误映射**：增加 `friendlyForkError`，将 `workspace-not-found` 转译为“未找到工程画布，请重试”，消除所有英文报错暴露。
