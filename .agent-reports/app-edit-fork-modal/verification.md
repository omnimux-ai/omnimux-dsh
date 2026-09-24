# 验证证据报告：应用编辑弹窗与版本号校验修复 (Issue #2630)

## 验证结果：PASS
- 时间: 2026-09-24T12:04:25.793Z
- 截图证据: [app-edit-fork-modal-verified.png](docs/evidence/app-edit-fork-modal-verified.png)
- 演示单页: [app-edit-fork-modal-demo.html](docs/evidence/app-edit-fork-modal-demo.html)

## 验证要点
1. **解决 version-required 根因**：调用 `createProjectForkFromManifest` 时显式注入 `expectedVersion: 0`，通过后端乐观锁校验；
2. **轻量交互弹窗**：`ForkAppProjectDialog` 提供优雅深色极简弹窗，符合规范 Token；
3. **自适应模式分诊**：当前已有绑定项目时默认选择追加创作页，无项目时在当前工作区新建独立项目；
4. **进阶定制能力**：允许更改副本名称，允许在自选工作区目录新建项目。
