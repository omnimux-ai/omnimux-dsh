# 收尾硬化三项（Issue #3470）

## 目标与成功标准
1) 静态守卫能抓住带任意 options 的裸 `open` 拉起，并把已废弃的 workflow `deploy.mjs` 纳入；该脚本独立拉起 Prod 时剔除 `ELECTRON_RUN_AS_NODE`。2) `dev-app-unlock` 通过注入 `spawn` 验证 env 真实传给 `launchApp`。3) `isUserCancel` 收紧为只识别 runner 非零退出且 stderr 为 osascript 执行错误 `(-128)` 的取消，普通 message 含 `-128` 不再误判取消。成功标准：上述行为有单测锁定，既有成功/取消/错误码契约不变。

## 新用户基线
仅开发交付脚本与 hub 取消识别；不进入产品运行时、不改 HTTP/UI 契约。既无 GUI 会话时拉起仍按原逻辑报错。

## 计划与项目结构
- `plugins/omnimux-workflow/scripts/deploy.mjs`（已废弃 forwarder）：保留兼容转发，但 `open -a OmniMux` 使用本地剔除 `ELECTRON_RUN_AS_NODE` 的 env（插件不能 import 仓库根脚本，避免打包/边界问题），头注释说明。
- `scripts/dev-launch-env.test.mjs`：静态守卫改为逐行检查 `spawnSync/execFileSync/execSync('open'` 行必须含 `env`；文件清单加入 `plugins/omnimux-workflow/scripts/deploy.mjs`；三入口仍断言 `launchApp`。
- `scripts/dev-app-unlock.mjs`：注入点由整函数 `launch` 改为 `spawn`，内部固定 `launchApp('OmniMux Dev', { spawn })`；测试注入 spawn 记录 `open` 参数与 env，断言不含 `ELECTRON_RUN_AS_NODE` 且保留 PATH。
- `plugins/omnimux/src/host/native-picker.js`：`isUserCancel` 只在 `error.code` 为非 0 数字且 `error.stderr` 匹配 `/execution error:[\s\S]*\(-128\)/` 时返回 true；其它（含 message 内的 -128）走 `picker-failed`。
- 单测：deploy 裸 open 守卫、unlock spawn/env、message 含 -128 失败、stderr 执行错误取消、stderr 含 -128 但非 execution error 失败。

## 命令
`node --test scripts/dev-launch-env.test.mjs scripts/dev-app-unlock.test.mjs scripts/worktree-delivery.test.mjs`；`node --test plugins/omnimux/src/host/native-picker.test.js`；`pnpm --filter omnimux test`；`pnpm check:boundaries`；`git diff --check`。

## 代码风格
沿用可注入依赖与错误对象带 `code` 的既有模式；不新增依赖；插件脚本保持自包含（不 import 仓库根脚本）。

## 测试策略
静态守卫逐行检查带 options 的 `open`；deploy 文件纳入清单。unlock 用注入 spawn 断言 `open` 参数、stdio、env（父进程临时设置 `ELECTRON_RUN_AS_NODE=1`）。picker 取消识别新增三类用例并保留既有取消（空 stdout）与成功用例。

## 浏览器与 Electron 边界
不改 Client/Stage；Dev 物化后由 Agent/人工复核 picker 面板，不走原始 CDP 驱动。

## 边界与文档影响
始终：保持 picker 成功/取消/错误码与各域 HTTP 契约。先问：复活废弃 deploy 的同步逻辑、改启动契约、新增依赖。绝不：把非取消错误当取消、绕过 CI、直推 main。文档影响：仅任务 spec 与废弃脚本头注释。
