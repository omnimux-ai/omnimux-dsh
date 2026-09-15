# 自动物化与实机重载工程化规格（Auto-Materialize and Live Reload on Ship）

- 任务分支：`feat/auto-materialize-on-ship`
- 涉及文件：`scripts/worktree.sh`、`scripts/worktree-delivery.test.mjs`
- 关联问题：彻底解决 Agent 合并后遗漏本地物化（sync）与桌面应用热重载，导致用户验收时界面未生效的严重断层。

## 一、背景与问题根因

### 1.1 现状与痛点
在现行流程中：
1. Agent 完成 PR 并经 GitHub Merge Queue 合并入 `origin/main`；
2. Agent 执行 `worktree.sh ship` 或 `worktree.sh remove`，命令在主检出完成 `git pull` 后直接结束；
3. **物化断层**：桌面应用（Dev App，端口 45120）加载的是 `~/.omnimux-dev/profiles/omnimux` 中的本地静态产物，Git 合并不等于应用生效；
4. Agent 频繁遗漏执行 `yarn omnimux:sync`（或 `./scripts/sync-to-app.sh`），且遗漏触发 Dev App 界面刷新，导致用户一打开桌面应用依然是旧界面，用户体验极差。

### 1.2 改造目标
1. **收尾命令自动触发物化**：
   - 当 `scripts/worktree.sh ship` 校验 PR MERGED 并拉取最新主干后，自动分析改动文件；
   - 若改动涉及 `plugins/`，自动调用 `./scripts/sync-to-app.sh` 进行增量/全量编译物化；
2. **Dev App 自动静默热重载**：
   - 物化成功后，自动探测本地运行的 Dev App（通过 CDP 9229 端口或服务端口 45120）；
   - 若应用在运行，自动发送 `Page.reload` 静默刷新，使最新代码在用户的屏幕上即刻呈现；
3. **清理命令（remove）自动兜底**：
   - 若 Agent 直接调用 `worktree.sh remove <task> --pr <num>`，自动确保主检出对齐最新远端，并自动执行物化与热重载；
4. **终端清晰可信看板**：
   - 终端打印物化结果、生效插件列表与实机刷新状态，让交付闭环 100% 具备机器证据。
