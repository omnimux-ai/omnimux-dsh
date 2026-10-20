# 三处 Dev 拉起共享 devLaunchEnv（Issue #3452）

## 目标与成功标准
`scripts/reload-dev-app.mjs`、`scripts/omnimux.mjs`、`scripts/dev-app-unlock.mjs` 三处拉起 Electron 应用时都使用同一份 `devLaunchEnv`：复制当前环境并剔除 `ELECTRON_RUN_AS_NODE`，其余变量保留。成功标准：仓库内不再有裸 `open -a "OmniMux Dev"` / `open -a "OmniMux"` 调用；共享模块有行为单测；`worktree-delivery.test.mjs`、`dev-app-unlock.test.mjs` 等既有脚本测试通过。

## 新用户基线
仅开发交付脚本，不进入产品运行时；只依赖 macOS 自带 `open`。对终端用户无影响。缺少 GUI 会话时仍由 `open` 返回非 0，由各脚本按原有方式报错。

## 计划与项目结构
- 新增 `scripts/dev-launch-env.mjs`：`devLaunchEnv(env)` 纯函数 + `launchApp(name, { spawn, env })` 统一拉起（默认 `spawnSync(..., { stdio: 'inherit', env })`）。
- `reload-dev-app.mjs` 改为从共享模块导入并保留 re-export（兼容既有测试导入），内部仍走可注入 `run` 以便测试。
- `omnimux.mjs` 的 `restart dev` / `restart prod` 与 `dev-app-unlock.mjs` 的「未运行时拉起」改用 `launchApp`。
- 新增 `scripts/dev-launch-env.test.mjs`：纯函数行为 + launchApp 注入 spawn 断言 `open -a` 参数与环境。

## 命令
`node --test scripts/dev-launch-env.test.mjs scripts/worktree-delivery.test.mjs scripts/dev-app-unlock.test.mjs`；`git diff --check`。

## 代码风格
沿用脚本现有 ESM、K&R、可注入依赖（`spawn`/`run`）与中文注释，不新增依赖。

## 测试策略
纯函数覆盖：剔除目标变量、保留其他变量、不修改入参；`launchApp` 覆盖：命令/参数、stdio 继承、env 已剔除该变量、状态透传。静态检查：`rg` 确认三处源码均经共享 helper（无裸 open）。既有 AC-4~AC-11 用例保持通过。

## 边界与文档影响
始终：保持受控重启的实例核实、优雅退出、超时放弃与失败报告。先问：改 Dev 应用启动方式、单实例机制、Electron 壳层。绝不：强杀进程、直推 main、改 CI。文档影响：仅任务 spec 与脚本头注释；`docs/contracts/dev-pipeline.md` 引用脚本行为，无需改契约。授权：用户本轮明确要求修剩余两处裸 open。
