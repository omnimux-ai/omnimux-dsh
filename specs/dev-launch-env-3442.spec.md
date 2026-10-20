# Dev 受控重启清除 Electron 运行环境变量（Issue #3442）

## 目标与成功标准
`worktree.sh ship` 在 Electron 宿主（DeepSeek Harness / OmniMux 桌面）里运行时，`reload-dev-app.mjs --restart` 必须能把 Dev 应用重新拉起来：拉起环境不得携带 `ELECTRON_RUN_AS_NODE`，否则 Electron 以 Node 模式秒退，Dev 被留在已退出状态、`dev-smoke` blocked。成功标准：`restartDevApp` 的 `open -a` 调用使用剔除该变量的环境；其余环境变量（PATH 等）保留；单测覆盖纯函数与成功重启路径；真实 ship 在 Electron 宿主 shell 中能完成受控重启并通过 dev-smoke。

## 新用户基线
这是仓库开发交付脚本，不进入产品运行时、不改变用户侧行为；对终端用户无影响。脚本本身只依赖 macOS 自带 `open`、`pgrep`、`ps`、`lsof`、`osascript`。

## 计划与项目结构
只改 `scripts/reload-dev-app.mjs` 与紧邻的 `scripts/worktree-delivery.test.mjs`：
- 新增可导出的纯函数 `devLaunchEnv(env)`：返回剔除 `ELECTRON_RUN_AS_NODE` 的副本，不修改入参；
- `defaultRun(command, args, options)` 支持可选 `env`；`restartDevApp` 的 `open -a "$DEV_APP_NAME"` 显式传 `devLaunchEnv()`；
- 不改变进程核实、超时、单实例与失败报告逻辑。

## 命令
`node --test scripts/worktree-delivery.test.mjs`；`git diff --check`；合入后真实 `bash scripts/worktree.sh ship <task> --pr <n>` 验证受控重启。

## 代码风格
沿用现有可注入 `run`、`sleep`、`probePort` 的依赖注入与纯函数导出；JSDoc 说明为什么必须剔除该变量（引用本次 #3437 收尾的真实失败现象）。

## 测试策略
- 纯函数：`devLaunchEnv` 剔除目标变量、保留其他变量、不修改入参；
- 成功重启路径：包装注入 `run` 记录 `open` 调用的第三个参数，断言 `env.ELECTRON_RUN_AS_NODE === undefined` 且 `PATH` 保留；
- 既有 AC-4/5/6/7/8/9 用例保持通过，确保没有放宽进程核实与安全边界。

## 边界与文档影响
始终：保持受控重启的实例核实、优雅退出、超时放弃与失败如实报告。先问：改 Dev 应用启动方式、单实例机制、Electron 壳层。绝不：强杀进程、直推 main、改 CI。文档影响：仅任务 spec；脚本注释与既有 contract（`docs/contracts/dev-pipeline.md` 仅引用脚本行为，无需改契约）。授权：用户本轮明确要求修复该启动环境问题。
