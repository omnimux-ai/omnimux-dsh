# 验收闭环：任务自定义功能旅程 + 验收边界契约（Issue #3090）

## 目标

让 Agent 在合并前就能在「完整应用影子实例」里跑任务自己的功能旅程验收，把「改 → 验 → 修」循环覆盖到用户真实使用面，消除「合并后由用户当测试员」的结构性断点。

- 用户故事：任务完成后，Agent 交付的不只是单测绿灯，而是「在完整应用里走过真实操作路径的截图与结构化证据」；发现 bug 时 Agent 自己修，不留给用户踩。

## 现状（2026-10-05 查明）

- `scripts/test-env-bootstrap.mjs` 的 `startTestEnvironment({root, mode})` 已能起独立完整应用：动态端口、隔离数据目录、任务插件经 `.materialize-snapshots` 软链装入、`ui` 模式 mock 上游、`live` 模式真实凭据。
- `pnpm verify:app`（`scripts/worktree-app-qa.mjs`）一条命令完成「起应用→同源登录→真实浏览器→截图+报告→自清理」，但只跑固定保底断言，不支持任务注入自己的功能旅程，也未被门禁强制。
- `docs/contracts/plugin-qa.md` 现状写「Dev 45120 真机验收归人工」，导致合并前完整应用验收无标准出口。

## 改动范围

1. `scripts/worktree-app-qa.mjs`：新增 `--journey <路径>` CLI 参数与 `runJourney(module, deps)` 机制。
   - journey 为 ESM 模块，默认导出 `async ({ send, sleep, evidenceDir, origin, assert }) => { assertions: [{name, pass, detail?}] }`，接收与保底断言同一 CDP `send`。
   - journey 在保底断言（应用就绪、可见几何）通过后执行；返回断言全部计入总判定，任一 `pass:false` 即整体 FAIL。
   - journey 模块抛错 → 记为 `journey-error` 断言 FAIL，不误报 PASS。
   - `--journey` 路径必须解析在工作树内，拒绝绝对路径跳出或 `..` 逃逸。
2. `package.json`：新增 `verify:app:live` = `node scripts/worktree-app-qa.mjs --mode live`（透传 live 模式，仅任务显式启用，真实凭据读 Dev 凭据库）。
   - `worktree-app-qa.mjs` 相应增加 `--mode ui|live` 参数，默认 `ui`；`live` 缺凭据时报 BLOCKED 而非静默失败。
3. `docs/contracts/plugin-qa.md`：验收边界修订——
   - UI/界面类任务：`ui` 模式影子实例 + 任务功能旅程截图 = 验收通过标准；
   - 真实生成类（图片/音频）：`live` 模式真实任务验证为可选加强；
   - 视频生成：`live` 真实验证恒需任务级特批。
4. `.workbuddy/qa-journeys/example.mjs`：示例 journey（空会话 → 进入素材库 → 断言 hub 面板可见 → 截图），供任务复制改写。

## 命令

- 本机验收（ui）：`pnpm verify:app -- --journey .workbuddy/qa-journeys/example.mjs`（在任务工作树根执行）。
- 单测：`node --test scripts/worktree-app-qa.test.mjs scripts/worktree-app-qa-journey.test.mjs`
- 文档：`pnpm doc:lint`、`node --test scripts/verify-agents-md.test.mjs`

## 结构

- 入口：`scripts/worktree-app-qa.mjs`（root 自推导，仅接受 `<repo>/.worktrees/<task>` 直接子级）。
- 测试：`scripts/worktree-app-qa-journey.test.mjs`（新）。
- journey 约定目录：`.workbuddy/qa-journeys/`（不进 git 白名单约束，属证据类产物；示例文件除外登记豁免）。

## 测试策略

- 新测试文件 `worktree-app-qa-journey.test.mjs` 用依赖注入（假 send / 假模块加载器）覆盖：
  1. journey 正常返回断言并入总报告；
  2. journey 断言 `pass:false` → 整体 FAIL；
  3. journey 抛错 → `journey-error` FAIL 而非 PASS；
  4. `--journey` 越出工作树 → 拒绝；
  5. `--mode live` 无凭据 → BLOCKED 状态而非静默。
- 真实链路验收：在本工作树用 example journey 实跑一次 `verify:app`，留 PNG + JSON 证据。

## 成功标准

- `pnpm verify:app -- --journey <示例>` 在本工作树产出真实截图与含 journey 断言的结构化报告；
- journey 断言失败/抛错均让整体非零退出；
- `--mode live` 缺凭据明确报 BLOCKED；
- 契约文字落盘且 `doc:lint` 绿；AGENTS.md 不超门禁预算。

## 边界

- 总是做：journey 失败整体 FAIL；证据落 `.workbuddy/evidence/app-qa/<runId>/`。
- 先问：无（本任务已含契约修订授权）。
- 绝不做：不自动跑视频生成真实任务；不在 live 模式复制用户凭据文件到仓外；不放开 Agent 重启开发版应用；不修改 CI 远端。
