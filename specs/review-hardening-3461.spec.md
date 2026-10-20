# 收尾评审硬化（Issue #3461）

## 目标与成功标准
把 #3455 / #3456 评审留下的两项低风险硬化补齐：受控重启统一复用 `launchApp`（仍保留可注入 runner 的测试语义）；`dev-app-unlock` 检查拉起返回值，失败不再谎报成功；`nativeFilePicker` 对非字符串 stdout 明确抛错，`picker-failed` 携带截断后的原始 stdout 便于诊断。成功标准：相关脚本单测与 hub 单测通过，行为契约（成功/取消/错误码/HTTP）不变。

## 新用户基线
仅开发交付脚本与 hub 内部诊断；不进入产品运行时、不改 HTTP/UI 契约；macOS 拉起失败时由调用方按返回值明确报错。

## 计划与项目结构
- `scripts/dev-launch-env.mjs`：`launchApp` 的 spawn JSDoc 放宽为可返回 `{ status }`。
- `scripts/reload-dev-app.mjs`：`open` 改经 `launchApp(DEV_APP_NAME, { spawn: run })`，保留 `devLaunchEnv` re-export。
- `scripts/dev-app-unlock.mjs`：`unlockDevApp(port, { launch = launchApp })` 注入；检查 `status !== 0` → `{ ok:false, error:'launch-failed' }`，不打印成功。
- `plugins/omnimux/src/host/native-picker.js`：`parsePickedPaths` 非 string 抛错；`pickNativePath` 失败时把截断 stdout 挂到 `PickerError.stdout`。
- 单测：`scripts/dev-launch-env.test.mjs` 静态守卫断言三入口都引用 `launchApp`；`scripts/dev-app-unlock.test.mjs` 覆盖 launch 成功/失败；`native-picker.test.js` 覆盖非字符串与非 JSON stdout 的失败与诊断。

## 命令
`node --test scripts/dev-launch-env.test.mjs scripts/dev-app-unlock.test.mjs scripts/worktree-delivery.test.mjs`；`node --test plugins/omnimux/src/host/native-picker.test.js`；`pnpm --filter omnimux test`；`pnpm check:boundaries`；`git diff --check`。

## 代码风格
沿用可注入依赖（run/spawn/launch）、纯函数与错误对象带 `code` 的既有模式；不新增依赖。

## 测试策略
脚本：launchApp 注入断言命令/参数/env；unlock 用不可达端口 + 注入 launch 覆盖失败/成功返回；静态守卫检查三处源码都引用共享 helper。hub：非字符串 stdout 抛非字符串错误；非法 JSON 输出映射 `picker-failed` 且 `error.stdout` 保留原文；既有取消/成功用例不变。

## 浏览器与 Electron 边界
不改 Client/Stage；Dev 物化后由 Agent/人工复核 picker 面板，不走原始 CDP 驱动。

## 边界与文档影响
始终：保持成功/取消/错误码与 HTTP 契约。先问：改面板交互、改状态码、新增依赖。绝不：把非法输出当取消、绕过 CI、直推 main。文档影响：仅任务 spec；hub seam 契约无需变更（诊断字段不属于对外契约）。
