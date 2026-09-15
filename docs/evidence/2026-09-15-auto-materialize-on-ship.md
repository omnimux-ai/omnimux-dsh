# 合并后自动物化与桌面 Dev 应用热重载改造验证证据（Issue #1906 / PR）

- 任务分支：`feat/auto-materialize-on-ship`
- 涉及文件：
  - `scripts/worktree.sh`（ship 与 remove 命令注入自动物化与 CDP 热重载闭环）
  - `scripts/reload-dev-app.mjs`（通过 CDP 9229 向本地 Dev 桌面应用发送 Page.reload）
  - `scripts/worktree-delivery.test.mjs`（新增插件改动自动触发物化单测）
- 规格文档：`specs/auto-materialize-on-ship.spec.md`

## 一、改造背景与解决痛点

在先前的协作流程中，代码合并（GitHub 远端主库）与本地物化（更新本地开发版桌面应用 `~/.omnimux-dev`）彼此脱节。Agent 经常在 PR MERGED 之后误以为任务结束，直接请用户验收，但用户打开桌面应用时看到的依然是旧缓存界面，体验极差。

## 二、解决方案实现

1. **内嵌自动增量物化**：
   - 在 `scripts/worktree.sh` 的 `cmd_ship` 中，主检出执行 `pull --ff-only` 成功后，自动比对本次合并改动的插件（`plugins/` 目录）；
   - 若改动涉及插件，自动调用 `./scripts/sync-to-app.sh` 进行增量构建与物化；若未涉及插件则如实提示跳过；
2. **桌面应用静默热重载**：
   - 新增 `scripts/reload-dev-app.mjs`，通过原生 WebSocket 连接本地 Dev App 的 CDP 调试端口（9229）；
   - 物化完成后自动发送 `Page.reload` 静默刷新，使最新代码在用户屏幕上即刻生效；若应用未开启则平滑跳过；
3. **清理命令（remove）自动兜底**：
   - 在 `cmd_remove` 中，若带 `--pr` 且主检出落后于远端，自动补全同步拉取与物化刷新，彻底堵死所有漏网路径。

---

## 三、测试与实机验证结果

| 测试项 | 执行命令 | 结果 | 关键事实数据 |
| :--- | :--- | :--- | :--- |
| worktree-delivery 全套单测 | `node --test scripts/worktree-delivery.test.mjs` | **5 / 5 全部通过** | 新增 auto-triggers materialization 测试用例成功通过 |
| CDP 热重载探针实测 | `node scripts/reload-dev-app.mjs` | **通过** | 成功连接 Dev App（端口 45120/9229）并成功发送 Page.reload |
| 代码空白与格式规范 | `git diff --check` | **通过** | 零格式错误与多余空白 |
