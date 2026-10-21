# 拉起收敛与 Prod 受控重启（Issue #3478）

## 目标与成功标准
删除已废弃的 workflow deploy forwarder（及其 npm scripts），把 Dev/Prod 手动重启统一到可测试的受控重启模块：单实例核实、osascript 优雅退出、超时失败、`launchApp` 拉起、失败退出非 0，仓库内不再出现 `pkill -f 'OmniMux.app'`。成功标准：新模块单测覆盖未运行/多实例/退出超时/拉起失败/成功，omnimux.mjs restart 使用它，CI 与 governance 通过。

## 新用户基线
只影响开发/运维脚本，不进入产品运行时；无 GUI 会话或拉起失败时按原有方式报错并以非 0 退出。Prod 真实重启仍归人工授权，代码与测试不触发真实应用。

## 计划与项目结构
- `plugins/omnimux-workflow/scripts/deploy.mjs`：删除；`plugins/omnimux-workflow/package.json` 移除 `deploy`、`deploy:restart`。
- `scripts/app-restart.mjs`：导出 `restartDesktopApp(target, deps)`；内部用精确 bundle 路径严格检查主进程（pgrep 退出码 1 = 未运行，其它失败 → `inspect-failed`；ps 失败同样显式失败）、osascript quit（带超时与 stderr 诊断）、有界轮询退出、launchApp 拉起并回读新 PID；结果对象 `{ ok, status, detail?, pid? }`。
- `scripts/omnimux.mjs`：`restartApp` 调用该模块并按结果 `process.exit(1)`；保留 Agent 封印。
- `scripts/app-restart.test.mjs`：注入 runner 覆盖分支；quality-gate 回归行接入；governance ciRequired 登记。

## 命令
`node --test scripts/app-restart.test.mjs scripts/dev-launch-env.test.mjs scripts/worktree-delivery.test.mjs`；`node --test scripts/verify-governance-registry.test.mjs`；`pnpm check:boundaries`；`git diff --check`。

## 代码风格
沿用脚本的 ESM + 可注入 `run`/`sleep`/`launch` 模式与中文结果文案；不新增依赖；精确 bundle 路径字符串只在一处定义。

## 测试策略
纯注入：未运行→直接拉起并报告 launched；多实例→shared-instance 不动进程；quit 超时→quit-timeout 且不拉起；quit 成功+launch 失败→launch-failed；quit 成功+launch 成功→restarted；osascript 拒绝→quit-request-failed。断言不出现 pkill/强杀调用。

## 假设
受控重启依赖两个可观测前提：按精确 bundle 主进程路径（pgrep + ps command 前缀）能唯一识别应用实例；osascript quit 能在有界等待内让应用退出。未运行、多实例、退出超时、拉起失败都能通过进程表和退出码判定，不需要任何强杀信号。

## 证伪方式
若真实进程表中 helper/shell 进程被误判为主进程（出现 shared-instance 误报），说明精确路径过滤假设不成立；若 quit 成功后 pgrep 仍长期返回主进程而 `waitMs` 内未判 quit-timeout，说明有界等待假设不成立；若 `open` 返回 0 但回读不到新 PID 却仍报 restarted，说明成功核实假设不成立。可执行：`node --test scripts/app-restart.test.mjs`；删掉路径过滤、超时轮询或 PID 回读后，对应用例必须失败。

## 浏览器与 Electron 边界
不改 Electron 壳层与启动方式；Dev 物化后由 ship 的受控重启验证；Prod 真实重启人工执行。

## 边界与文档影响
始终：保留 Agent 封印与失败如实报告。先问：改应用启动参数、改 ship 流程、Prod 发布动作。绝不：未经核实的强杀、直推 main、把真实重启写进单测。文档影响：仅任务 spec 与相关脚本注释；dev-pipeline 契约无需改。
